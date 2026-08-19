import { Router } from "express";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

function getOrgId(req: any): number | null {
  return req.user?.organizationId ?? null;
}

/** Return 400 when org is missing from the JWT (shouldn't happen in prod, but guards every route). */
function assertOrg(orgId: number | null, res: any): orgId is number {
  if (orgId == null) {
    res.status(400).json({ error: "Organization context missing from token" });
    return false;
  }
  return true;
}

// ─── Stats / Overview ────────────────────────────────────────────────────────
router.get("/stats", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    if (!assertOrg(orgId, res)) return;
    const today = new Date().toISOString().slice(0, 10);

    const propertiesRaw = await db.execute<any>(sql`
      SELECT p.id, p.name, p.type, p.description,
        COUNT(u.id)::int AS unit_count,
        COUNT(u.id) FILTER(WHERE u.status='active')::int AS active_units,
        COALESCE(AVG(u.base_price)::numeric(10,2),0) AS avg_price
      FROM properties p
      LEFT JOIN units u ON u.property_id = p.id
      WHERE p.organization_id = ${orgId} AND p.is_active = true
        AND p.type NOT IN ('spa','pool')
      GROUP BY p.id, p.name, p.type, p.description
      ORDER BY p.name
    `);

    const todayRaw = await db.execute<any>(sql`
      SELECT 
        COUNT(*) FILTER(WHERE b.status='checked_in')::int AS checked_in,
        COUNT(*) FILTER(WHERE b.check_in::date=${today}::date AND b.status IN ('confirmed','pending'))::int AS arrivals_today,
        COUNT(*) FILTER(WHERE b.check_out::date=${today}::date AND b.status='checked_in')::int AS departures_today,
        COUNT(*) FILTER(WHERE b.status IN ('pending','confirmed'))::int AS upcoming
      FROM bookings b
      WHERE b.organization_id = ${orgId}
        AND EXISTS (
          SELECT 1 FROM units u
          JOIN properties p ON u.property_id = p.id
          WHERE u.id = b.unit_id
            AND p.organization_id = ${orgId}
            AND p.type NOT IN ('spa','pool')
        )
    `);

    const groupRaw = await db.execute<any>(sql`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER(WHERE status='arrived')::int AS active,
        COUNT(*) FILTER(WHERE status='confirmed')::int AS upcoming,
        COUNT(*) FILTER(WHERE check_in::date > ${today}::date AND status NOT IN ('cancelled','completed'))::int AS future
      FROM group_bookings WHERE organization_id = ${orgId}
    `);

    const occupancyRaw = await db.execute<any>(sql`
      SELECT p.type,
        COUNT(DISTINCT u.id)::int AS total_units,
        COUNT(DISTINCT b.unit_id) FILTER(WHERE b.status='checked_in')::int AS occupied
      FROM properties p
      JOIN units u ON u.property_id=p.id
      LEFT JOIN bookings b ON b.unit_id=u.id
        AND b.organization_id = ${orgId}
        AND b.check_in <= ${today}::date AND b.check_out > ${today}::date
      WHERE p.organization_id=${orgId} AND p.type NOT IN ('spa','pool') AND u.status='active'
      GROUP BY p.type
    `);

    const revenueRaw = await db.execute<any>(sql`
      SELECT COALESCE(SUM(b.total_amount),0)::float AS total,
        COUNT(*)::int AS bookings
      FROM bookings b
      JOIN units u ON b.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE p.organization_id=${orgId}
        AND b.organization_id=${orgId}
        AND p.type NOT IN ('spa','pool')
        AND b.status IN ('checked_out','checked_in')
        AND DATE_TRUNC('month', b.check_in) = DATE_TRUNC('month', ${today}::date)
    `);

    const blocksRaw = await db.execute<any>(sql`
      SELECT COUNT(*)::int AS active FROM accommodation_blocks
      WHERE organization_id=${orgId} AND is_active=true
        AND start_date <= ${today}::date + 90 AND end_date >= ${today}::date
    `);

    return res.json({
      properties: propertiesRaw.rows || [],
      today: todayRaw.rows[0] || {},
      groups: groupRaw.rows[0] || {},
      occupancy: occupancyRaw.rows || [],
      revenue: revenueRaw.rows[0] || {},
      blocks: blocksRaw.rows[0] || {},
    });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ─── Bookings (all accommodation bookings) ───────────────────────────────────
router.get("/bookings", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    if (!assertOrg(orgId, res)) return;
    const { status, source, type, term, search, from, to, limit: lim = "50", offset: off = "0" } = req.query as any;

    const rows = await db.execute<any>(sql`
      SELECT b.id, b.first_name, b.last_name, b.phone, b.email,
        b.check_in::text, b.check_out::text,
        (b.check_out - b.check_in) AS nights,
        b.status, b.payment_status, b.source,
        b.guests_count, b.adults, b.children_under_6, b.children_over_6,
        b.total_amount, b.paid_amount, b.notes, b.booking_ref,
        b.checkin_time, b.checkout_time, b.created_at,
        u.name AS unit_name, u.category AS unit_category,
        p.name AS property_name, p.type AS property_type
      FROM bookings b
      JOIN units u ON b.unit_id = u.id
      JOIN properties p ON u.property_id = p.id
      WHERE b.organization_id = ${orgId}
        AND p.organization_id = ${orgId}
        AND p.type NOT IN ('spa','pool')
        AND (${status}::text IS NULL OR b.status::text = ${status}::text)
        AND (${source}::text IS NULL OR b.source::text = ${source}::text)
        AND (${type}::text IS NULL OR p.type::text = ${type}::text)
        AND (${from}::text IS NULL OR b.check_in >= ${from}::date)
        AND (${to}::text IS NULL OR b.check_in <= ${to}::date)
        AND (${term}::text IS NULL OR (
          (${term}::text = 'long' AND (b.check_out - b.check_in) >= 28) OR
          (${term}::text = 'short' AND (b.check_out - b.check_in) < 28) OR
          (${term}::text = 'medium' AND (b.check_out - b.check_in) BETWEEN 7 AND 27)
        ))
        AND (${search}::text IS NULL OR
          b.first_name ILIKE '%' || ${search}::text || '%' OR
          b.last_name ILIKE '%' || ${search}::text || '%' OR
          b.phone ILIKE '%' || ${search}::text || '%' OR
          b.booking_ref ILIKE '%' || ${search}::text || '%' OR
          u.name ILIKE '%' || ${search}::text || '%'
        )
      ORDER BY b.check_in DESC
      LIMIT ${parseInt(lim)} OFFSET ${parseInt(off)}
    `);

    const countRaw = await db.execute<any>(sql`
      SELECT COUNT(*)::int AS total
      FROM bookings b
      JOIN units u ON b.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE b.organization_id=${orgId}
        AND p.organization_id=${orgId}
        AND p.type NOT IN ('spa','pool')
    `);

    return res.json({ bookings: rows.rows || [], total: countRaw.rows[0]?.total || 0 });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ─── Create booking ──────────────────────────────────────────────────────────
router.post("/bookings", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    if (!assertOrg(orgId, res)) return;
    const d = req.body;

    // Validate required dates
    if (!d.checkIn || !d.checkOut) {
      return res.status(400).json({ error: "checkIn and checkOut are required" });
    }
    const checkInDate = new Date(d.checkIn);
    const checkOutDate = new Date(d.checkOut);
    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      return res.status(400).json({ error: "Invalid date format for checkIn or checkOut" });
    }
    if (checkOutDate <= checkInDate) {
      return res.status(400).json({ error: "checkOut must be after checkIn" });
    }
    if (!d.unitId) {
      return res.status(400).json({ error: "unitId is required" });
    }

    // Validate unit belongs to caller's org (ownership check)
    const unitCheck = await db.execute<any>(sql`
      SELECT u.id, u.base_price
      FROM units u
      JOIN properties p ON u.property_id = p.id
      WHERE u.id = ${parseInt(d.unitId)}
        AND p.organization_id = ${orgId}
        AND u.status = 'active'
      LIMIT 1
    `);
    if (!unitCheck.rows.length) {
      return res.status(404).json({ error: "Unit not found or does not belong to your organization" });
    }

    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / 86400000);
    const basePrice = parseFloat(unitCheck.rows[0]?.base_price || "0");
    const totalAmount = d.totalAmount || (basePrice * nights);
    const ref = "BK-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const unitId = parseInt(d.unitId, 10);
    const client = await pool.connect();
    let booking: any;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(90421, $1)", [unitId]);

      const conflict = await client.query(
        `SELECT 1 FROM bookings
          WHERE unit_id = $1
            AND status::text <> 'cancelled'
            AND check_in < $3::date
            AND check_out > $2::date
          LIMIT 1`,
        [unitId, d.checkIn, d.checkOut],
      );
      if (conflict.rows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Unit is not available for the requested dates" });
      }

      const blockConflict = await client.query(
        `SELECT 1 FROM accommodation_blocks
          WHERE organization_id = $1
            AND is_active = true
            AND $2 = ANY(ARRAY(SELECT jsonb_array_elements_text(unit_ids))::int[])
            AND start_date < $4::date
            AND end_date > $3::date
          LIMIT 1`,
        [orgId, unitId, d.checkIn, d.checkOut],
      );
      if (blockConflict.rows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Unit is blocked for the requested dates" });
      }

      const inserted = await client.query(
        `INSERT INTO bookings (
           organization_id, unit_id, check_in, check_out, status, source, guests_count, adults,
           children_under_6, children_over_6, total_amount, paid_amount, first_name, last_name,
           phone, email, notes, checkin_time, checkout_time, booking_ref, payment_status,
           created_at, updated_at
         )
         VALUES (
           $1, $2, $3::date, $4::date, $5, $6, $7, $8,
           $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
           NOW(), NOW()
         )
         RETURNING id, booking_ref`,
        [
          orgId, unitId, d.checkIn, d.checkOut, d.status || "confirmed", d.source || "direct",
          d.guestsCount || 1, d.adults || 1, d.childrenUnder6 || 0, d.childrenOver6 || 0,
          totalAmount, d.paidAmount || 0, d.firstName || "", d.lastName || "",
          d.phone || "", d.email || "", d.notes || null, d.checkinTime || "14:00",
          d.checkoutTime || "12:00", ref, d.paymentStatus || "unpaid",
        ],
      );
      booking = inserted.rows[0];
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return res.status(201).json({ booking });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ─── Update booking ────────────────────────────────────────────────────────────
router.patch("/bookings/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    if (!assertOrg(orgId, res)) return;
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid booking id" });
    const d = req.body;

    // Build a single atomic UPDATE for all changed fields
    const sets: ReturnType<typeof sql>[] = [];
    if (d.status !== undefined)        sets.push(sql`status = ${d.status}::booking_status`);
    if (d.paymentStatus !== undefined) sets.push(sql`payment_status = ${d.paymentStatus}::payment_status`);
    if (d.paidAmount !== undefined)    sets.push(sql`paid_amount = ${d.paidAmount}`);
    if (d.notes !== undefined)         sets.push(sql`notes = ${d.notes}`);

    if (sets.length === 0) {
      return res.json({ ok: true });
    }

    sets.push(sql`updated_at = NOW()`);

    // Join all set clauses with commas
    const setClauses = sets.reduce((acc, curr, i) =>
      i === 0 ? curr : sql`${acc}, ${curr}`
    );

    const result = await db.execute<any>(sql`
      UPDATE bookings
      SET ${setClauses}
      WHERE id = ${id}
        AND organization_id = ${orgId}
    `);

    if ((result.rowCount ?? 0) === 0) {
      return res.status(404).json({ error: "Booking not found or access denied" });
    }
    return res.json({ ok: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ─── Units availability (for chess/new booking) ───────────────────────────────
router.get("/units", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    if (!assertOrg(orgId, res)) return;
    const { type, checkIn, checkOut } = req.query as any;
    const today = new Date().toISOString().slice(0, 10);
    const cin = checkIn || today;
    const cout = checkOut || new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const rows = await db.execute<any>(sql`
      SELECT u.id, u.name, u.category, u.capacity, u.max_capacity, u.base_price,
        u.square_meters, u.has_balcony, u.has_view, u.floor, u.status, u.housekeeping_status,
        p.name AS property_name, p.type AS property_type,
        NOT EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.unit_id = u.id
            AND b.organization_id = ${orgId}
            AND b.status NOT IN ('cancelled','checked_out')
            AND b.check_in < ${cout}::date AND b.check_out > ${cin}::date
        ) AND NOT EXISTS (
          SELECT 1 FROM accommodation_blocks ab
          WHERE ab.organization_id = ${orgId}
            AND ab.is_active = true
            AND u.id = ANY(ARRAY(SELECT jsonb_array_elements_text(ab.unit_ids))::int[])
            AND ab.start_date < ${cout}::date AND ab.end_date > ${cin}::date
        ) AS is_available
      FROM units u
      JOIN properties p ON u.property_id = p.id
      WHERE p.organization_id = ${orgId}
        AND p.type NOT IN ('spa','pool')
        AND u.status = 'active'
        AND (${type}::text IS NULL OR p.type::text = ${type}::text)
      ORDER BY p.name, u.name
    `);
    return res.json({ units: rows.rows || [] });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ─── Group Bookings ──────────────────────────────────────────────────────────
router.get("/group-bookings", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    if (!assertOrg(orgId, res)) return;
    const { status, search } = req.query as any;

    const rows = await db.execute<any>(sql`
      SELECT g.*,
        g.check_in::text, g.check_out::text,
        (g.check_out - g.check_in) AS nights,
        (SELECT json_agg(json_build_object('id',u.id,'name',u.name,'category',u.category,'property_name',p.name))
         FROM units u JOIN properties p ON u.property_id=p.id
         WHERE u.id = ANY(ARRAY(SELECT jsonb_array_elements_text(g.unit_ids))::int[])
           AND p.organization_id = ${orgId}
        ) AS units_detail
      FROM group_bookings g
      WHERE g.organization_id = ${orgId}
        AND (${status}::text IS NULL OR g.status::text = ${status}::text)
        AND (${search}::text IS NULL OR
          g.group_name ILIKE '%' || ${search}::text || '%' OR
          g.contact_name ILIKE '%' || ${search}::text || '%' OR
          g.company ILIKE '%' || ${search}::text || '%' OR
          g.booking_ref ILIKE '%' || ${search}::text || '%'
        )
      ORDER BY g.check_in ASC
    `);
    return res.json({ groups: rows.rows || [] });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.post("/group-bookings", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    if (!assertOrg(orgId, res)) return;
    const d = req.body;

    if (!d.checkIn || !d.checkOut) {
      return res.status(400).json({ error: "checkIn and checkOut are required" });
    }
    const groupCheckIn = new Date(d.checkIn);
    const groupCheckOut = new Date(d.checkOut);
    if (!Number.isFinite(groupCheckIn.getTime()) || !Number.isFinite(groupCheckOut.getTime()) || groupCheckOut <= groupCheckIn) {
      return res.status(400).json({ error: "checkOut must be after checkIn" });
    }

    const unitIds: number[] = Array.isArray(d.unitIds)
      ? Array.from(new Set(d.unitIds.map(Number)))
      : [];
    if (unitIds.some((unitId) => !Number.isInteger(unitId) || unitId <= 0)) {
      return res.status(400).json({ error: "unitIds must contain positive integers" });
    }

    // Validate all unitIds belong to the caller's org
    if (unitIds.length > 0) {
      const unitOwnerCheck = await db.execute<any>(sql`
        SELECT COUNT(*)::int AS matched
        FROM units u
        JOIN properties p ON u.property_id = p.id
        WHERE u.id = ANY(${sql`ARRAY[${sql.raw(unitIds.join(","))}]::int[]`})
          AND p.organization_id = ${orgId}
      `);
      if ((unitOwnerCheck.rows[0]?.matched ?? 0) !== unitIds.length) {
        return res.status(400).json({ error: "One or more unitIds do not belong to your organization" });
      }
    }

    const ref = "GRP-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const result = await db.execute<any>(sql`
      INSERT INTO group_bookings (organization_id, group_name, contact_name, contact_phone, contact_email,
        company, check_in, check_out, unit_ids, room_count, total_guests, adults, children,
        status, total_amount, paid_amount, source, notes, special_requests, booking_ref)
      VALUES (${orgId}, ${d.groupName}, ${d.contactName||null}, ${d.contactPhone||null}, ${d.contactEmail||null},
        ${d.company||null}, ${d.checkIn}::date, ${d.checkOut}::date,
        ${JSON.stringify(unitIds)}::jsonb, ${d.roomCount||1}, ${d.totalGuests||1},
        ${d.adults||1}, ${d.children||0}, ${d.status||'inquiry'}::group_booking_status,
        ${d.totalAmount||0}, ${d.paidAmount||0}, ${d.source||'direct'}, ${d.notes||null},
        ${d.specialRequests||null}, ${ref})
      RETURNING id, booking_ref
    `);
    return res.json({ group: result.rows[0] });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.patch("/group-bookings/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    if (!assertOrg(orgId, res)) return;
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid group booking id" });
    const d = req.body;

    const sets: ReturnType<typeof sql>[] = [];
    if (d.status !== undefined)     sets.push(sql`status = ${d.status}::group_booking_status`);
    if (d.paidAmount !== undefined) sets.push(sql`paid_amount = ${d.paidAmount}`);
    if (d.notes !== undefined)      sets.push(sql`notes = ${d.notes}`);

    if (sets.length === 0) {
      return res.json({ ok: true });
    }

    sets.push(sql`updated_at = NOW()`);

    const setClauses = sets.reduce((acc, curr, i) =>
      i === 0 ? curr : sql`${acc}, ${curr}`
    );

    const result = await db.execute<any>(sql`
      UPDATE group_bookings
      SET ${setClauses}
      WHERE id = ${id}
        AND organization_id = ${orgId}
    `);

    if ((result.rowCount ?? 0) === 0) {
      return res.status(404).json({ error: "Group booking not found or access denied" });
    }
    return res.json({ ok: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ─── Accommodation Blocks ─────────────────────────────────────────────────────
router.get("/blocks", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    if (!assertOrg(orgId, res)) return;
    const { active } = req.query as any;
    const today = new Date().toISOString().slice(0, 10);
    const activeFilter = active === "true" ? sql`AND ab.is_active = true`
                       : active === "false" ? sql`AND ab.is_active = false`
                       : sql``;

    const rows = await db.execute<any>(sql`
      SELECT ab.*,
        ab.start_date::text, ab.end_date::text,
        (ab.end_date - ab.start_date) AS days,
        (SELECT json_agg(json_build_object('id',u.id,'name',u.name,'category',u.category,'property_name',p.name))
         FROM units u JOIN properties p ON u.property_id=p.id
         WHERE u.id = ANY(ARRAY(SELECT jsonb_array_elements_text(ab.unit_ids))::int[])
           AND p.organization_id = ${orgId}
        ) AS units_detail
      FROM accommodation_blocks ab
      WHERE ab.organization_id = ${orgId}
        ${activeFilter}
        AND ab.end_date >= ${today}::date
      ORDER BY ab.start_date ASC
    `);
    return res.json({ blocks: rows.rows || [] });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.post("/blocks", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    if (!assertOrg(orgId, res)) return;
    const d = req.body;

    if (!d.startDate || !d.endDate) {
      return res.status(400).json({ error: "startDate and endDate are required" });
    }
    const blockStart = new Date(d.startDate);
    const blockEnd = new Date(d.endDate);
    if (!Number.isFinite(blockStart.getTime()) || !Number.isFinite(blockEnd.getTime()) || blockEnd <= blockStart) {
      return res.status(400).json({ error: "endDate must be after startDate" });
    }

    const unitIds: number[] = Array.isArray(d.unitIds)
      ? Array.from(new Set(d.unitIds.map(Number)))
      : [];
    if (unitIds.some((unitId) => !Number.isInteger(unitId) || unitId <= 0)) {
      return res.status(400).json({ error: "unitIds must contain positive integers" });
    }

    // Validate all unitIds belong to the caller's org
    if (unitIds.length > 0) {
      const unitOwnerCheck = await db.execute<any>(sql`
        SELECT COUNT(*)::int AS matched
        FROM units u
        JOIN properties p ON u.property_id = p.id
        WHERE u.id = ANY(${sql`ARRAY[${sql.raw(unitIds.join(","))}]::int[]`})
          AND p.organization_id = ${orgId}
      `);
      if ((unitOwnerCheck.rows[0]?.matched ?? 0) !== unitIds.length) {
        return res.status(400).json({ error: "One or more unitIds do not belong to your organization" });
      }
    }

    const result = await db.execute<any>(sql`
      INSERT INTO accommodation_blocks (organization_id, title, block_type, unit_ids, start_date, end_date, reason, notes)
      VALUES (${orgId}, ${d.title}, ${d.blockType||'other'}::accommodation_block_type,
        ${JSON.stringify(unitIds)}::jsonb, ${d.startDate}::date, ${d.endDate}::date,
        ${d.reason||null}, ${d.notes||null})
      RETURNING id
    `);
    return res.json({ block: result.rows[0] });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.delete("/blocks/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    if (!assertOrg(orgId, res)) return;
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid block id" });

    const result = await db.execute<any>(sql`
      UPDATE accommodation_blocks
      SET is_active = false, updated_at = NOW()
      WHERE id = ${id}
        AND organization_id = ${orgId}
    `);

    if ((result.rowCount ?? 0) === 0) {
      return res.status(404).json({ error: "Block not found or access denied" });
    }
    return res.json({ ok: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ─── Long-term bookings ───────────────────────────────────────────────────────
router.get("/long-term", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    if (!assertOrg(orgId, res)) return;
    const { status } = req.query as any;

    const rows = await db.execute<any>(sql`
      SELECT b.id, b.first_name, b.last_name, b.phone, b.email,
        b.check_in::text, b.check_out::text,
        (b.check_out - b.check_in) AS nights,
        b.status, b.payment_status, b.source,
        b.total_amount, b.paid_amount, b.notes, b.booking_ref,
        b.adults, b.children_under_6, b.children_over_6,
        u.name AS unit_name, u.category AS unit_category, u.base_price,
        p.name AS property_name, p.type AS property_type,
        ROUND((b.total_amount / NULLIF((b.check_out - b.check_in),0))::numeric,2) AS price_per_night
      FROM bookings b
      JOIN units u ON b.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE b.organization_id=${orgId}
        AND p.organization_id=${orgId}
        AND p.type NOT IN ('spa','pool')
        AND (b.check_out - b.check_in) >= 28
        AND (${status}::text IS NULL OR b.status::text = ${status}::text)
      ORDER BY b.check_in DESC
    `);
    return res.json({ bookings: rows.rows || [] });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ─── Analytics ────────────────────────────────────────────────────────────────
router.get("/analytics", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    if (!assertOrg(orgId, res)) return;
    const { from, to } = req.query as any;
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const toDate = to || today;

    const byTypeRaw = await db.execute<any>(sql`
      SELECT p.type, p.name,
        COUNT(b.id)::int AS bookings,
        COALESCE(SUM(b.total_amount),0)::float AS revenue,
        ROUND(AVG(b.check_out - b.check_in)::numeric,1)::float AS avg_nights
      FROM bookings b
      JOIN units u ON b.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE b.organization_id=${orgId}
        AND p.organization_id=${orgId}
        AND p.type NOT IN ('spa','pool')
        AND b.check_in BETWEEN ${fromDate}::date AND ${toDate}::date
        AND b.status IN ('checked_in','checked_out','confirmed')
      GROUP BY p.type, p.name ORDER BY revenue DESC
    `);

    const sourceRaw = await db.execute<any>(sql`
      SELECT b.source, COUNT(*)::int AS bookings, COALESCE(SUM(b.total_amount),0)::float AS revenue
      FROM bookings b JOIN units u ON b.unit_id=u.id JOIN properties p ON u.property_id=p.id
      WHERE b.organization_id=${orgId}
        AND p.organization_id=${orgId}
        AND p.type NOT IN ('spa','pool')
        AND b.check_in BETWEEN ${fromDate}::date AND ${toDate}::date
      GROUP BY b.source ORDER BY bookings DESC
    `);

    const dailyRaw = await db.execute<any>(sql`
      SELECT b.check_in::text AS date, COUNT(*)::int AS bookings, COALESCE(SUM(b.total_amount),0)::float AS revenue
      FROM bookings b JOIN units u ON b.unit_id=u.id JOIN properties p ON u.property_id=p.id
      WHERE b.organization_id=${orgId}
        AND p.organization_id=${orgId}
        AND p.type NOT IN ('spa','pool')
        AND b.check_in BETWEEN ${fromDate}::date AND ${toDate}::date
      GROUP BY b.check_in ORDER BY b.check_in
    `);

    const occupancyRaw = await db.execute<any>(sql`
      SELECT p.type,
        COUNT(DISTINCT u.id)::int AS total_units,
        COUNT(DISTINCT b.unit_id) FILTER(WHERE b.status IN ('checked_in','confirmed'))::int AS booked,
        ROUND(100.0 * COUNT(DISTINCT b.unit_id) FILTER(WHERE b.status IN ('checked_in','confirmed')) /
          NULLIF(COUNT(DISTINCT u.id),0),1)::float AS occupancy_pct
      FROM properties p
      JOIN units u ON u.property_id=p.id
      LEFT JOIN bookings b ON b.unit_id=u.id
        AND b.organization_id=${orgId}
        AND b.check_in BETWEEN ${fromDate}::date AND ${toDate}::date
      WHERE p.organization_id=${orgId} AND p.type NOT IN ('spa','pool') AND u.status='active'
      GROUP BY p.type ORDER BY occupancy_pct DESC
    `);

    const totalsRaw = await db.execute<any>(sql`
      SELECT COUNT(*)::int AS total, COALESCE(SUM(b.total_amount),0)::float AS revenue,
        COALESCE(SUM(b.paid_amount),0)::float AS paid,
        ROUND(AVG(b.check_out - b.check_in)::numeric,1)::float AS avg_nights,
        COUNT(*) FILTER(WHERE b.status='cancelled')::int AS cancelled,
        COUNT(*) FILTER(WHERE (b.check_out-b.check_in)>=28)::int AS long_term
      FROM bookings b JOIN units u ON b.unit_id=u.id JOIN properties p ON u.property_id=p.id
      WHERE b.organization_id=${orgId}
        AND p.organization_id=${orgId}
        AND p.type NOT IN ('spa','pool')
        AND b.check_in BETWEEN ${fromDate}::date AND ${toDate}::date
    `);

    return res.json({
      period: { from: fromDate, to: toDate },
      totals: totalsRaw.rows[0] || {},
      byType: byTypeRaw.rows || [],
      sources: sourceRaw.rows || [],
      daily: dailyRaw.rows || [],
      occupancy: occupancyRaw.rows || [],
    });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

export default router;
