import { Router } from "express";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { lockAndAssertUnitAvailability } from "../lib/accommodation-availability.js";
import { validateTransition, type BookingStatus } from "../lib/bookingStateMachine.js";

const router = Router();
const orgId = (req: any) => req.user?.organizationId;

// ─── Master Dashboard — все в одному запиті ──────────────────────────────────
router.get("/dashboard", requireAuth, async (req: any, res) => {
  try {
    const oid = orgId(req);
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    // KPIs — arrivals, departures, in-house, free units
    const kpis = await db.execute<any>(sql`
      SELECT
        COUNT(*) FILTER(WHERE b.status='checked_in')::int AS in_house,
        COUNT(*) FILTER(WHERE b.check_in::date=${today}::date AND b.status IN ('confirmed','pending'))::int AS arrivals_today,
        COUNT(*) FILTER(WHERE b.check_out::date=${today}::date AND b.status='checked_in')::int AS departures_today,
        COUNT(*) FILTER(WHERE b.status='pending')::int AS pending_confirm,
        COUNT(*) FILTER(WHERE b.payment_status='unpaid' AND b.status NOT IN ('cancelled'))::int AS unpaid,
        COALESCE(SUM(b.paid_amount) FILTER(WHERE b.check_in::date=${today}::date),0)::float AS revenue_today,
        COUNT(*) FILTER(WHERE b.check_in::date >= ${today}::date AND b.check_in::date <= (${today}::date+7) AND b.status NOT IN ('cancelled'))::int AS bookings_next7
      FROM bookings b
      JOIN units u ON b.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE p.organization_id=${oid}
    `);

    // Available units today
    const freeUnits = await db.execute<any>(sql`
      SELECT COUNT(*)::int AS free
      FROM units u
      JOIN properties p ON u.property_id=p.id
      WHERE p.organization_id=${oid} AND u.status='active'
        AND u.id NOT IN (
          SELECT unit_id FROM bookings WHERE status NOT IN ('cancelled','checked_out')
            AND check_in <= ${today}::date AND check_out > ${today}::date
        )
    `);

    // Today arrivals detail
    const arrivals = await db.execute<any>(sql`
      SELECT b.id, b.first_name, b.last_name, b.phone, b.email,
        b.check_in::text, b.check_out::text, b.status, b.payment_status,
        b.checkin_time, b.guests_count, b.adults, b.total_amount, b.paid_amount,
        b.booking_ref, b.notes, b.source,
        u.name AS unit_name, u.category,
        p.name AS property_name, p.type AS property_type
      FROM bookings b
      JOIN units u ON b.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE p.organization_id=${oid}
        AND b.check_in::date=${today}::date
        AND b.status IN ('confirmed','pending')
      ORDER BY b.checkin_time, b.check_in
    `);

    // Today departures detail
    const departures = await db.execute<any>(sql`
      SELECT b.id, b.first_name, b.last_name, b.phone,
        b.check_out::text, b.status, b.payment_status,
        b.checkout_time, b.total_amount, b.paid_amount, b.booking_ref,
        u.name AS unit_name, p.name AS property_name
      FROM bookings b
      JOIN units u ON b.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE p.organization_id=${oid}
        AND b.check_out::date=${today}::date
        AND b.status='checked_in'
      ORDER BY b.checkout_time
    `);

    // Currently in-house
    const inHouse = await db.execute<any>(sql`
      SELECT b.id, b.first_name, b.last_name, b.phone,
        b.check_in::text, b.check_out::text, b.status, b.payment_status,
        b.total_amount, b.paid_amount, b.booking_ref, b.adults,
        u.name AS unit_name, u.category,
        p.name AS property_name, p.type AS property_type,
        (b.check_out - ${today}::date) AS nights_remaining
      FROM bookings b
      JOIN units u ON b.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE p.organization_id=${oid} AND b.status='checked_in'
      ORDER BY b.check_out ASC
    `);

    // Pending confirm — need action
    const pending = await db.execute<any>(sql`
      SELECT b.id, b.first_name, b.last_name, b.phone,
        b.check_in::text, b.check_out::text, b.payment_status,
        b.total_amount, b.paid_amount, b.booking_ref, b.source, b.created_at,
        u.name AS unit_name, p.name AS property_name
      FROM bookings b
      JOIN units u ON b.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE p.organization_id=${oid} AND b.status='pending'
      ORDER BY b.created_at DESC
      LIMIT 20
    `);

    // Alerts — overdue payments in-house, long pending
    const alerts = await db.execute<any>(sql`
      SELECT 'unpaid_checkedin' AS type,
        CONCAT(b.first_name,' ',b.last_name) AS guest,
        b.booking_ref AS ref,
        u.name AS unit_name,
        (b.total_amount - b.paid_amount)::float AS amount_due,
        b.id
      FROM bookings b JOIN units u ON b.unit_id=u.id JOIN properties p ON u.property_id=p.id
      WHERE p.organization_id=${oid} AND b.status='checked_in'
        AND b.payment_status='unpaid' AND b.total_amount > 0
      UNION ALL
      SELECT 'overdue_checkout' AS type,
        CONCAT(b.first_name,' ',b.last_name) AS guest,
        b.booking_ref AS ref,
        u.name AS unit_name,
        0 AS amount_due,
        b.id
      FROM bookings b JOIN units u ON b.unit_id=u.id JOIN properties p ON u.property_id=p.id
      WHERE p.organization_id=${oid} AND b.status='checked_in'
        AND b.check_out < ${today}::date
      ORDER BY amount_due DESC LIMIT 10
    `);

    // Housekeeping summary
    const hk = await db.execute<any>(sql`
      SELECT u.housekeeping_status, COUNT(*)::int AS count
      FROM units u JOIN properties p ON u.property_id=p.id
      WHERE p.organization_id=${oid} AND u.status='active'
      GROUP BY u.housekeeping_status
    `);

    // Revenue last 7 days for sparkline
    const revWeek = await db.execute<any>(sql`
      SELECT b.check_in::text AS date, COALESCE(SUM(b.paid_amount),0)::float AS paid
      FROM bookings b JOIN units u ON b.unit_id=u.id JOIN properties p ON u.property_id=p.id
      WHERE p.organization_id=${oid}
        AND b.check_in BETWEEN (${today}::date-6) AND ${today}::date
      GROUP BY b.check_in ORDER BY b.check_in
    `);

    // Next 7 days arrivals count
    const upcoming = await db.execute<any>(sql`
      SELECT b.check_in::text AS date, COUNT(*)::int AS count
      FROM bookings b JOIN units u ON b.unit_id=u.id JOIN properties p ON u.property_id=p.id
      WHERE p.organization_id=${oid}
        AND b.check_in BETWEEN ${today}::date AND (${today}::date+7)
        AND b.status NOT IN ('cancelled')
      GROUP BY b.check_in ORDER BY b.check_in
    `);

    res.json({
      kpis: { ...(kpis.rows[0] || {}), free_units: freeUnits.rows[0]?.free || 0 },
      arrivals: arrivals.rows || [],
      departures: departures.rows || [],
      inHouse: inHouse.rows || [],
      pending: pending.rows || [],
      alerts: alerts.rows || [],
      housekeeping: hk.rows || [],
      revWeek: revWeek.rows || [],
      upcoming: upcoming.rows || [],
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Live activity feed ──────────────────────────────────────────────────────
router.get("/activity", requireAuth, async (req: any, res) => {
  try {
    const oid = orgId(req);
    const events = await db.execute<any>(sql`
      SELECT 'booking' AS type, b.id,
        CONCAT(b.first_name,' ',b.last_name) AS actor,
        CONCAT('Нове бронювання ',b.booking_ref,' — ',u.name) AS description,
        b.status AS sub_status,
        b.created_at AS ts
      FROM bookings b JOIN units u ON b.unit_id=u.id JOIN properties p ON u.property_id=p.id
      WHERE p.organization_id=${oid} AND b.created_at > NOW()-INTERVAL '24 hours'
      UNION ALL
      SELECT 'checkin' AS type, b.id,
        CONCAT(b.first_name,' ',b.last_name) AS actor,
        CONCAT('Заїзд: ',u.name,' — ',b.first_name,' ',b.last_name) AS description,
        'checked_in' AS sub_status,
        b.updated_at AS ts
      FROM bookings b JOIN units u ON b.unit_id=u.id JOIN properties p ON u.property_id=p.id
      WHERE p.organization_id=${oid} AND b.status='checked_in' AND b.updated_at > NOW()-INTERVAL '24 hours'
      ORDER BY ts DESC LIMIT 20
    `);
    res.json({ events: events.rows || [] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Availability for quick booking ─────────────────────────────────────────
router.get("/availability", requireAuth, async (req: any, res) => {
  try {
    const oid = orgId(req);
    const { checkIn, checkOut } = req.query as any;
    const today = new Date().toISOString().slice(0, 10);
    const cin = checkIn || today;
    const cout = checkOut || new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const units = await db.execute<any>(sql`
      SELECT u.id, u.name, u.category, u.capacity, u.base_price, u.housekeeping_status,
        p.name AS property_name, p.type AS property_type,
        NOT EXISTS (
          SELECT 1 FROM bookings b WHERE b.unit_id=u.id
            AND b.status NOT IN ('cancelled','checked_out')
            AND b.check_in < ${cout}::date AND b.check_out > ${cin}::date
        ) AS is_available
      FROM units u
      JOIN properties p ON u.property_id=p.id
      WHERE p.organization_id=${oid} AND u.status='active'
        AND p.type NOT IN ('spa','pool')
      ORDER BY is_available DESC, p.name, u.base_price
    `);
    res.json({ units: units.rows || [], checkIn: cin, checkOut: cout });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Quick booking ───────────────────────────────────────────────────────────
router.post("/quick-booking", requireAuth, async (req: any, res) => {
  const d = req.body;
  const oid = orgId(req);
  if (!oid) return res.status(400).json({ error: "Organization context missing from token" });
  const unitId = Number(d.unitId);
  const checkIn = String(d.checkIn || "");
  const checkOut = String(d.checkOut || "");
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  if (!Number.isInteger(unitId) || unitId <= 0 || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return res.status(400).json({ error: "A valid unitId, checkIn, and checkOut are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const unitR = await client.query(
      `SELECT u.id, u.base_price, u.name
       FROM units u JOIN properties p ON p.id = u.property_id
       WHERE u.id = $1 AND p.organization_id = $2
       FOR UPDATE`,
      [unitId, oid],
    );
    if (!unitR.rows.length) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Unit does not belong to your organization" });
    }
    const ref = "BK-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const nights = Math.ceil((end.getTime() - start.getTime()) / 86400000);
    const basePrice = parseFloat(unitR.rows[0]?.base_price || "0");
    const totalAmount = d.totalAmount || (basePrice * nights);
    const bookingStatus = d.status || "confirmed";
    if (["pending", "confirmed", "checked_in"].includes(bookingStatus)) {
      const availability = await lockAndAssertUnitAvailability(client, unitId, checkIn, checkOut);
      if (!availability.ok) {
        await client.query("ROLLBACK");
        return res.status(availability.status).json({ error: availability.message });
      }
    }

    const r = await client.query(
      `
      INSERT INTO bookings (unit_id, check_in, check_out, status, source, guests_count,
        adults, children_under_6, children_over_6, total_amount, paid_amount, organization_id,
        first_name, last_name, phone, email, notes, checkin_time, checkout_time,
        booking_ref, payment_status)
      VALUES ($1, $2::date, $3::date, $4::booking_status, $5::booking_source, $6, $7, $8, 0, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19, $20::payment_status)
      RETURNING id, booking_ref, total_amount`,
      [
        unitId, checkIn, checkOut, bookingStatus, d.source || "direct",
        (d.adults || 1) + (d.children || 0), d.adults || 1, d.children || 0, totalAmount, d.paidAmount || 0, oid,
        d.firstName || "", d.lastName || "", d.phone || "", d.email || null, d.notes || null,
        d.checkinTime || "14:00", d.checkoutTime || "12:00", ref, d.paymentStatus || "unpaid",
      ],
    );
    await client.query("COMMIT");
    res.json({ booking: r.rows[0], unitName: unitR.rows[0]?.name });
  } catch (e: any) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ─── Quick status change ─────────────────────────────────────────────────────
router.patch("/booking/:id/status", requireAuth, async (req: any, res) => {
  const bookingId = Number(req.params.id);
  const nextStatus = req.body.status as BookingStatus;
  const oid = orgId(req);
  if (!oid || !Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Organization context and valid booking id are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT b.id, b.unit_id, b.check_in, b.check_out, b.status
       FROM bookings b
       JOIN units u ON u.id = b.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE b.id = $1 AND p.organization_id = $2
       FOR UPDATE`,
      [bookingId, oid],
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found" });
    }
    const transition = validateTransition(current.status as BookingStatus, nextStatus, req.user.role);
    if (!transition.ok) {
      await client.query("ROLLBACK");
      return res.status(transition.httpStatus ?? 422).json({ error: transition.error });
    }
    if (["pending", "confirmed", "checked_in"].includes(nextStatus)) {
      const availability = await lockAndAssertUnitAvailability(client, current.unit_id, current.check_in, current.check_out, bookingId);
      if (!availability.ok) {
        await client.query("ROLLBACK");
        return res.status(availability.status).json({ error: availability.message });
      }
    }
    await client.query("UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2", [nextStatus, bookingId]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e: any) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// ─── Quick payment registration ───────────────────────────────────────────────
router.post("/booking/:id/payment", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { amount, method = "cash", viaRegister = false } = req.body;
    const bookingId = parseInt(id);
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { res.status(400).json({ error: "Невірна сума" }); return; }

    // Update booking paid_amount
    await db.execute<any>(sql`
      UPDATE bookings
      SET paid_amount = paid_amount + ${amt},
        payment_status = CASE
          WHEN paid_amount + ${amt} >= total_amount THEN 'paid'::payment_status
          ELSE 'partial'::payment_status
        END,
        updated_at = NOW()
      WHERE id = ${bookingId}
    `);

    // Record in payments table (method must be a valid payment_method enum value)
    const pmMethod = ["cash", "card", "liqpay", "stripe", "bank_transfer"].includes(method) ? method : "cash";
    await db.execute<any>(sql`
      INSERT INTO payments (booking_id, amount, currency, method, via_register, status, payment_type, processed_at, created_at)
      VALUES (${bookingId}, ${String(amt)}, 'UAH', ${pmMethod}::payment_method, ${Boolean(viaRegister)}, 'completed'::payment_tx_status, 'payment'::payment_type, NOW(), NOW())
    `);

    res.json({ ok: true, method, viaRegister });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
