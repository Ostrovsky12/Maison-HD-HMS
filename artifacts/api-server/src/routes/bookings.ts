import { Router } from "express";
import { db, pool } from "@workspace/db";
import { bookingsTable, guestsTable, unitsTable, propertiesTable, bookingAddonsTable, addonsTable, paymentsTable, notificationsTable, ratesTable, housekeepingTasksTable, guestServiceOrdersTable } from "@workspace/db/schema";
import { eq, and, gte, lte, inArray, desc, sql, or, ne } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { validateTransition, canCancel, type BookingStatus } from "../lib/bookingStateMachine.js";
import { generateLiqPayForm, verifyLiqPayCallback, parseLiqPayData } from "../lib/liqpay.js";
import { generateBookingQR } from "../lib/qr.js";
import { logger } from "../lib/logger.js";
import { notifyBookingCreated, notifyCheckIn } from "../lib/notify.js";
import { randomBytes } from "crypto";

function genGuestCode(): string {
  return randomBytes(5).toString("hex").toUpperCase();
}

async function requireBookingOwnership(req: any, res: any, next: any) {
  const user = req.user;
  if (!user || user.role === "super_admin") { next(); return; }
  const orgId = user.organizationId;
  // Non-super-admin with no org cannot own any booking — deny immediately
  if (!orgId) { res.status(403).json({ error: "Forbidden", message: "Access denied" }); return; }
  const bookingId = parseInt(req.params.bookingId);
  if (isNaN(bookingId)) { res.status(400).json({ error: "Invalid booking ID" }); return; }
  const [row] = await db
    .select({ propOrgId: propertiesTable.organizationId })
    .from(bookingsTable)
    .innerJoin(unitsTable, eq(unitsTable.id, bookingsTable.unitId))
    .innerJoin(propertiesTable, eq(propertiesTable.id, unitsTable.propertyId))
    .where(eq(bookingsTable.id, bookingId))
    .limit(1);
  if (!row || row.propOrgId !== orgId) {
    res.status(403).json({ error: "Forbidden", message: "Access denied" });
    return;
  }
  next();
}

const CALENDAR_COLORS = [
  "#4f86c6", "#e07b54", "#5cb85c", "#9b59b6",
  "#e67e22", "#16a085", "#c0392b", "#2980b9",
  "#8e44ad", "#27ae60", "#d35400", "#2471a3",
];

function bookingColor(id: number): string {
  return CALENDAR_COLORS[id % CALENDAR_COLORS.length];
}

function seasonFactor(month: number): number {
  if (month >= 6 && month <= 8) return 1.3;
  if (month === 5 || month === 9) return 1.1;
  if (month === 4 || month === 10) return 1.0;
  return 0.85;
}

function weekendFactor(dayOfWeek: number): number {
  return dayOfWeek === 5 || dayOfWeek === 6 ? 1.2 : 1.0;
}

function earlyBookingFactor(checkInDate: Date, bookingDate: Date): number {
  const daysAhead = Math.round((checkInDate.getTime() - bookingDate.getTime()) / 86400000);
  return daysAhead > 30 ? 0.9 : 1.0;
}

function calcNightPrice(base: number, date: Date, bookingDate: Date): number {
  const sf = seasonFactor(date.getMonth() + 1);
  const wf = weekendFactor(date.getDay());
  const ef = earlyBookingFactor(date, bookingDate);
  return Math.round(base * sf * wf * ef);
}

function labelForNight(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDay();
  const parts: string[] = [];
  if (m >= 6 && m <= 8) parts.push("Сезон");
  else if (m === 5 || m === 9) parts.push("Межсезон");
  else parts.push("Низький сезон");
  if (d === 5 || d === 6) parts.push("вихідний");
  return parts.join(", ");
}

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { unitId, guestId, status, dateFrom, dateTo, propertyId } = req.query;

  // ── Tenant isolation ───────────────────────────────────────────────────────
  // Users without an organizationId are only allowed through if they are
  // explicitly a super_admin. Any other role with null org gets nothing.
  if (!user.organizationId && user.role !== "super_admin") {
    res.json([]);
    return;
  }

  // ── Derive the authorised property/unit scope ──────────────────────────────
  //
  // For org-scoped users: authorised property IDs always come from the DB
  // (token org → properties). A requested ?propertyId or ?unitId is only
  // accepted when it falls within that authorised set — cross-tenant scope
  // injection via query params is therefore impossible.
  //
  // For super_admin (organizationId = null): trust explicit scope params as-is.

  let propIds: number[] = [];
  let unitIds: number[] = [];

  if (user.organizationId) {
    // Step 1: fetch all properties owned by this org
    const orgProps = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, user.organizationId));
    const authorisedPropIds = orgProps.map((p: { id: number }) => p.id);

    if (authorisedPropIds.length === 0) {
      res.json([]);
      return;
    }

    if (propertyId) {
      // Requested propertyId must belong to this org
      const reqPropId = parseInt(propertyId as string);
      if (!authorisedPropIds.includes(reqPropId)) {
        res.json([]);
        return;
      }
      propIds = [reqPropId];
    } else {
      propIds = authorisedPropIds;
    }

    if (unitId) {
      // Requested unitId must belong to one of the authorised properties
      const reqUnitId = parseInt(unitId as string);
      const validUnit = await db.select({ id: unitsTable.id }).from(unitsTable)
        .where(and(eq(unitsTable.id, reqUnitId), inArray(unitsTable.propertyId, propIds)));
      if (!validUnit.length) {
        res.json([]);
        return;
      }
      unitIds = [reqUnitId];
    } else {
      const units = await db.select({ id: unitsTable.id }).from(unitsTable)
        .where(inArray(unitsTable.propertyId, propIds));
      unitIds = units.map((u: { id: number }) => u.id);
      if (unitIds.length === 0) {
        res.json([]);
        return;
      }
    }
  } else {
    // super_admin — trust explicit scope params
    if (propertyId) propIds = [parseInt(propertyId as string)];
    if (unitId) {
      unitIds = [parseInt(unitId as string)];
    } else if (propIds.length > 0) {
      const units = await db.select({ id: unitsTable.id }).from(unitsTable)
        .where(inArray(unitsTable.propertyId, propIds));
      unitIds = units.map((u: { id: number }) => u.id);
    }
  }

  const conditions: any[] = [];
  if (unitIds.length > 0) conditions.push(inArray(bookingsTable.unitId, unitIds));
  if (guestId) conditions.push(eq(bookingsTable.guestId, parseInt(guestId as string)));
  if (status) conditions.push(eq(bookingsTable.status, status as any));
  if (dateFrom) conditions.push(gte(bookingsTable.checkIn, dateFrom as string));
  if (dateTo) conditions.push(lte(bookingsTable.checkOut, dateTo as string));

  const bookings = await db.select({
    id: bookingsTable.id,
    unitId: bookingsTable.unitId,
    guestId: bookingsTable.guestId,
    checkIn: bookingsTable.checkIn,
    checkOut: bookingsTable.checkOut,
    checkinTime: bookingsTable.checkinTime,
    checkoutTime: bookingsTable.checkoutTime,
    status: bookingsTable.status,
    paymentStatus: bookingsTable.paymentStatus,
    source: bookingsTable.source,
    guestsCount: bookingsTable.guestsCount,
    totalAmount: bookingsTable.totalAmount,
    paidAmount: bookingsTable.paidAmount,
    notes: bookingsTable.notes,
    createdAt: bookingsTable.createdAt,
    paymentLink: bookingsTable.paymentLink,
    legalEntityId: bookingsTable.legalEntityId,
    guestAccessCode: bookingsTable.guestAccessCode,
    checkinFormSubmitted: bookingsTable.checkinFormSubmitted,
    firstName: bookingsTable.firstName,
    lastName: bookingsTable.lastName,
    middleName: bookingsTable.middleName,
    phone: bookingsTable.phone,
    email: bookingsTable.email,
    bookingRef: bookingsTable.bookingRef,
    selectedAddons: bookingsTable.selectedAddons,
    adults: bookingsTable.adults,
    childrenUnder6: bookingsTable.childrenUnder6,
    childrenOver6: bookingsTable.childrenOver6,
    guestName: sql<string>`COALESCE(NULLIF(concat(${guestsTable.firstName}, ' ', ${guestsTable.lastName}), ' '), NULLIF(trim(concat(${bookingsTable.lastName}, ' ', ${bookingsTable.firstName})), ''), 'Гість')`,
    guestPhone: sql<string | null>`COALESCE(${guestsTable.phone}, ${bookingsTable.phone})`,
    guestEmail: sql<string | null>`COALESCE(${guestsTable.email}, ${bookingsTable.email})`,
    unitName: unitsTable.name,
  }).from(bookingsTable)
    .leftJoin(guestsTable, eq(bookingsTable.guestId, guestsTable.id))
    .leftJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bookingsTable.createdAt));

  res.json(bookings.map(b => ({
    ...b,
    totalAmount: Number(b.totalAmount),
    paidAmount: Number(b.paidAmount),
  })));
});

router.post("/", requireAuth, async (req, res) => {
  try {
  const user = (req as any).user;

  // Non-super-admin with no org cannot create bookings
  if (!user.organizationId && user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden", message: "Access denied" });
    return;
  }

  const {
    unitId, checkIn, checkOut, status, source, totalAmount, notes,
    checkinTime, checkoutTime, rateId, rateName,
    adults, childrenUnder6, childrenOver6, extraBeds,
    firstName, lastName, middleName, phone,
    discountId, discountValue, discountType,
    selectedAddons, legalEntityId,
    payOnArrival, partialAmount, withPets,
  } = req.body;

  // Validate that the requested unit belongs to the caller's org (pre-transaction check)
  if (user.organizationId && unitId) {
    const orgProps = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, user.organizationId));
    const authorisedPropIds = orgProps.map((p: any) => p.id);
    if (authorisedPropIds.length === 0) {
      res.status(403).json({ error: "Forbidden", message: "No properties in your organization" });
      return;
    }
    const validUnit = await db.select({ id: unitsTable.id }).from(unitsTable)
      .where(and(eq(unitsTable.id, unitId), inArray(unitsTable.propertyId, authorisedPropIds)));
    if (!validUnit.length) {
      res.status(403).json({ error: "Forbidden", message: "Unit does not belong to your organization" });
      return;
    }
  }


  let { guestId } = req.body;

  // Validate supplied guestId belongs to the caller's org (prevents cross-tenant guest PII leak)
  if (guestId && user.organizationId) {
    const [guestCheck] = await db.select({ id: guestsTable.id })
      .from(guestsTable)
      .where(and(eq(guestsTable.id, guestId), eq(guestsTable.organizationId, user.organizationId)))
      .limit(1);
    if (!guestCheck) {
      res.status(403).json({ error: "Forbidden", message: "Guest does not belong to your organization" });
      return;
    }
  }

  // Auto-find or create guest from phone/name
  if (!guestId && (phone || firstName)) {
    if (phone) {
      const existing = await db.select().from(guestsTable)
        .where(and(eq(guestsTable.phone, phone), eq(guestsTable.organizationId, user.organizationId || 0)))
        .limit(1);
      if (existing.length > 0) guestId = existing[0].id;
    }
    if (!guestId && firstName) {
      const [newGuest] = await db.insert(guestsTable).values({
        organizationId: user.organizationId || 0,
        firstName: firstName || "Гість",
        lastName: lastName || "",
        middleName: middleName || null,
        phone: phone || null,
      }).returning();
      guestId = newGuest.id;
    }
  }

  // Validate dates
  if (checkIn && checkOut) {
    const ci = new Date(checkIn); const co = new Date(checkOut);
    if (isNaN(ci.getTime()) || isNaN(co.getTime())) {
      res.status(400).json({ error: "Validation", message: "Invalid date format" }); return;
    }
    if (ci >= co) {
      res.status(400).json({ error: "Validation", message: "checkOut must be after checkIn" }); return;
    }
  }

  const isDraft = status === "draft";
  const draftExpiresAt = isDraft ? new Date(Date.now() + 6 * 60 * 60 * 1000) : null;
  const guestsCount = (adults || 1) + (childrenUnder6 || 0) + (childrenOver6 || 0);

  // Determine payment fields
  const isPayOnArrival = Boolean(payOnArrival);
  const partial = partialAmount ? Number(partialAmount) : null;
  const total = Number(totalAmount || 0);
  // Validate totalAmount — must be a non-negative finite number
  if (!Number.isFinite(total) || total < 0) {
    res.status(400).json({ error: "Validation", message: "totalAmount must be a non-negative number" });
    return;
  }
  let initialPaid = "0";
  let initialPaymentStatus = "unpaid";
  if (partial !== null && partial > 0 && partial < total) {
    initialPaid = String(partial);
    initialPaymentStatus = "partial";
  }
  const arrivalNote = isPayOnArrival ? "Оплата при заїзді" : null;

  // ── Atomic availability check + insert inside a transaction ─────────────
  // Uses FOR UPDATE lock on the unit row to prevent concurrent double-booking.
  const client = await pool.connect();
  let booking: any;
  try {
    await client.query("BEGIN");

    // Validate unit belongs to caller's org (prevents booking units from other tenants)
    if (user.organizationId) {
      const orgCheck = await client.query(
        `SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id
         WHERE u.id = $1 AND p.organization_id = $2 LIMIT 1`,
        [unitId, user.organizationId],
      );
      if (!orgCheck.rows.length) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "Forbidden", message: "Unit not in your organization" });
        return;
      }
    }

    // Lock the unit row to serialize concurrent booking attempts
    await client.query("SELECT id FROM units WHERE id = $1 FOR UPDATE", [unitId]);

    // Check for overlapping active bookings [checkIn, checkOut)
    const overlapResult = await client.query(
      `SELECT id FROM bookings
       WHERE unit_id = $1
         AND status IN ('pending','confirmed','checked_in')
         AND check_in  < $3
         AND check_out > $2
       LIMIT 1`,
      [unitId, checkIn, checkOut],
    );

    if (overlapResult.rows.length > 0 && !isDraft) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Conflict", message: "Номер вже зайнятий на ці дати" });
      return;
    }

    const inserted = await client.query(
      `INSERT INTO bookings (
        unit_id, guest_id, organization_id, check_in, check_out,
        checkin_time, checkout_time, status, source,
        rate_id, rate_name, adults, children_under6, children_over6,
        extra_beds, guests_count, with_pets,
        first_name, last_name, middle_name, phone,
        total_amount, paid_amount, payment_status, pay_on_arrival,
        discount_id, discount_value, discount_type,
        selected_addons, legal_entity_id, notes, internal_notes, draft_expires_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
        $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33
      ) RETURNING *`,
      [
        unitId, guestId || null, user.organizationId || null, checkIn, checkOut,
        checkinTime || "14:00", checkoutTime || "12:00", status || "confirmed", source || "direct",
        rateId || null, rateName || null, adults || 1, childrenUnder6 || 0, childrenOver6 || 0,
        extraBeds || 0, guestsCount, Boolean(withPets),
        firstName || null, lastName || null, middleName || null, phone || null,
        String(total), initialPaid, initialPaymentStatus, isPayOnArrival,
        discountId || null, discountValue ? String(discountValue) : null, discountType || null,
        JSON.stringify(selectedAddons || {}), legalEntityId || null, notes || null, arrivalNote, draftExpiresAt,
      ],
    );

    await client.query("COMMIT");
    booking = inserted.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  if (guestId && !isDraft) {
    await db.update(guestsTable).set({
      bookingCount: sql`${guestsTable.bookingCount} + 1`,
      ltv: sql`${guestsTable.ltv} + ${String(totalAmount || 0)}`,
      updatedAt: new Date(),
    }).where(eq(guestsTable.id, guestId));
  }

  const [g] = guestId ? await db.select().from(guestsTable).where(eq(guestsTable.id, guestId)).limit(1) : [null];
  const [u] = await db.select().from(unitsTable).where(eq(unitsTable.id, unitId)).limit(1);

  const guestName = g ? `${g.firstName} ${g.lastName}` : (lastName ? `${lastName} ${firstName || ""}`.trim() : "Гість");

  // Raw SQL returns snake_case — map to camelCase for API consistency
  const bookingId2 = booking.id;
  const normalizedBooking = {
    id: booking.id,
    unitId: booking.unit_id,
    guestId: booking.guest_id,
    organizationId: booking.organization_id,
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    checkinTime: booking.checkin_time,
    checkoutTime: booking.checkout_time,
    status: booking.status,
    source: booking.source,
    totalAmount: Number(booking.total_amount),
    paidAmount: Number(booking.paid_amount),
    paymentStatus: booking.payment_status,
    guestsCount: booking.guests_count,
    adults: booking.adults,
    firstName: booking.first_name,
    lastName: booking.last_name,
    phone: booking.phone,
    notes: booking.notes,
    guestAccessCode: booking.guest_access_code,
    createdAt: booking.created_at,
  };

  // Auto-generate guest access code for confirmed/checked_in bookings
  let guestAccessCode = normalizedBooking.guestAccessCode;
  if (!isDraft && !guestAccessCode) {
    guestAccessCode = genGuestCode();
    await db.update(bookingsTable).set({ guestAccessCode, updatedAt: new Date() }).where(eq(bookingsTable.id, bookingId2));
  }

  res.status(201).json({
    ...normalizedBooking,
    guestName,
    unitName: u?.name || null,
    guestAccessCode,
  });

  // Fire-and-forget notifications (don't block response)
  if (!isDraft && user.organizationId) {
    notifyBookingCreated(user.organizationId, {
      id: normalizedBooking.id,
      guestName,
      unitName: u?.name,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      totalAmount: booking.totalAmount,
    }).catch(() => {});
  }
  } catch (e: any) {
    const msg = e?.message || "Помилка при створенні бронювання";
    res.status(500).json({ error: msg });
  }
});

// POST /api/bookings/group — create multiple units as one group booking
router.post("/group", requireAuth, async (req, res) => {
  const user = (req as any).user;

  // Non-super-admin with no org cannot create bookings
  if (!user.organizationId && user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden", message: "Access denied" });
    return;
  }

  const {
    units, // array of { unitId, adults, childrenUnder6, childrenOver6, extraBeds }
    checkIn, checkOut, checkinTime, checkoutTime,
    status, source, rateId, rateName,
    firstName, lastName, middleName, phone,
    discountId, discountValue, discountType,
    selectedAddons, legalEntityId, notes,
    payOnArrival, partialAmount,
  } = req.body;

  if (!Array.isArray(units) || units.length === 0) {
    res.status(400).json({ error: "units array required" });
    return;
  }

  // Validate all supplied unit IDs belong to the caller's org (pre-transaction check)
  if (user.organizationId) {
    const orgProps = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, user.organizationId));
    const authorisedPropIds = orgProps.map((p: any) => p.id);
    if (authorisedPropIds.length === 0) {
      res.status(403).json({ error: "Forbidden", message: "No properties in your organization" });
      return;
    }
    const requestedUnitIds = units.map((u: any) => u.unitId).filter(Boolean);
    if (requestedUnitIds.length > 0) {
      const validUnits = await db.select({ id: unitsTable.id }).from(unitsTable)
        .where(and(inArray(unitsTable.id, requestedUnitIds), inArray(unitsTable.propertyId, authorisedPropIds)));
      if (validUnits.length !== requestedUnitIds.length) {
        res.status(403).json({ error: "Forbidden", message: "One or more units do not belong to your organization" });
        return;
      }
    }
  }


  let { guestId } = req.body;

  // Validate supplied guestId belongs to the caller's org (prevents cross-tenant guest PII leak)
  if (guestId && user.organizationId) {
    const [guestCheck] = await db.select({ id: guestsTable.id })
      .from(guestsTable)
      .where(and(eq(guestsTable.id, guestId), eq(guestsTable.organizationId, user.organizationId)))
      .limit(1);
    if (!guestCheck) {
      res.status(403).json({ error: "Forbidden", message: "Guest does not belong to your organization" });
      return;
    }
  }

  // Auto-find or create guest
  if (!guestId && (phone || firstName)) {
    if (phone) {
      const existing = await db.select().from(guestsTable)
        .where(and(eq(guestsTable.phone, phone), eq(guestsTable.organizationId, user.organizationId || 0)))
        .limit(1);
      if (existing.length > 0) guestId = existing[0].id;
    }
    if (!guestId && firstName) {
      const [newGuest] = await db.insert(guestsTable).values({
        organizationId: user.organizationId || 0,
        firstName: firstName || "Гість",
        lastName: lastName || "",
        middleName: middleName || null,
        phone: phone || null,
      }).returning();
      guestId = newGuest.id;
    }
  }

  const groupBookingId = crypto.randomUUID();
  const isDraft = status === "draft";
  const draftExpiresAt = isDraft ? new Date(Date.now() + 6 * 60 * 60 * 1000) : null;
  const bookingStatus = status || "confirmed";
  const isPayOnArrival = Boolean(payOnArrival);
  const partial = partialAmount ? Number(partialAmount) : null;
  const totalAllUnits = units.reduce((s: number, u: any) => s + Number(u.totalAmount || 0), 0);

  let initialPaid = "0";
  let initialPaymentStatus = "unpaid";
  if (partial !== null && partial > 0 && partial < totalAllUnits) {
    initialPaid = String(partial);
    initialPaymentStatus = "partial";
  }

  // ── Atomic group booking: single transaction with per-unit lock + overlap check ──
  const client = await pool.connect();
  const created: any[] = [];
  try {
    await client.query("BEGIN");

    for (const unit of units) {
      const unitId = unit.unitId;

      // Verify unit belongs to caller's org
      if (user.organizationId) {
        const orgCheck = await client.query(
          `SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id
           WHERE u.id = $1 AND p.organization_id = $2 LIMIT 1`,
          [unitId, user.organizationId],
        );
        if (!orgCheck.rows.length) {
          await client.query("ROLLBACK");
          res.status(403).json({ error: "Forbidden", message: `Unit ${unitId} not in your organization` });
          return;
        }
      }

      // Lock unit row to prevent concurrent double-booking
      await client.query("SELECT id FROM units WHERE id = $1 FOR UPDATE", [unitId]);

      // Check overlap for non-draft bookings
      if (!isDraft) {
        const overlap = await client.query(
          `SELECT id FROM bookings WHERE unit_id = $1 AND status IN ('pending','confirmed','checked_in')
           AND check_in < $3 AND check_out > $2 LIMIT 1`,
          [unitId, checkIn, checkOut],
        );
        if (overlap.rows.length) {
          await client.query("ROLLBACK");
          res.status(409).json({ error: "Conflict", message: `Номер ${unitId} вже зайнятий на ці дати` });
          return;
        }
      }

      const guestsCount = (unit.adults || 1) + (unit.childrenUnder6 || 0) + (unit.childrenOver6 || 0);
      const unitTotal = Number(unit.totalAmount || 0);
      const ins = await client.query(
        `INSERT INTO bookings (
          unit_id, guest_id, organization_id, check_in, check_out,
          checkin_time, checkout_time, status, source,
          rate_id, rate_name, adults, children_under6, children_over6,
          extra_beds, guests_count, first_name, last_name, middle_name, phone,
          total_amount, paid_amount, payment_status, pay_on_arrival,
          discount_id, discount_value, discount_type, selected_addons,
          legal_entity_id, notes, internal_notes, group_booking_id, draft_expires_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
          $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33
        ) RETURNING *`,
        [
          unitId, guestId || null, user.organizationId || null, checkIn, checkOut,
          checkinTime || "14:00", checkoutTime || "12:00", bookingStatus, source || "direct",
          rateId || null, rateName || null, unit.adults || 1, unit.childrenUnder6 || 0, unit.childrenOver6 || 0,
          unit.extraBeds || 0, guestsCount, firstName || null, lastName || null, middleName || null, phone || null,
          String(unitTotal), initialPaid, initialPaymentStatus, isPayOnArrival,
          discountId || null, discountValue ? String(discountValue) : null, discountType || null,
          JSON.stringify(selectedAddons || {}), legalEntityId || null, notes || null,
          isPayOnArrival ? "Оплата при заїзді" : null, groupBookingId, draftExpiresAt,
        ],
      );
      const booking = ins.rows[0];

      // Auto-generate guest access code
      let guestAccessCode = booking.guest_access_code;
      if (!isDraft && !guestAccessCode) {
        guestAccessCode = genGuestCode();
        await client.query(
          "UPDATE bookings SET guest_access_code = $1, updated_at = NOW() WHERE id = $2",
          [guestAccessCode, booking.id],
        );
      }

      // Fetch unit name
      const uRow = await client.query("SELECT name FROM units WHERE id = $1 LIMIT 1", [unitId]);
      created.push({
        id: booking.id,
        unitId: booking.unit_id,
        organizationId: booking.organization_id,
        checkIn: booking.check_in,
        checkOut: booking.check_out,
        status: booking.status,
        totalAmount: Number(booking.total_amount),
        paidAmount: Number(booking.paid_amount),
        unitName: uRow.rows[0]?.name || null,
        guestAccessCode,
      });
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  // Update guest stats
  if (guestId && !isDraft) {
    await db.update(guestsTable).set({
      bookingCount: sql`${guestsTable.bookingCount} + ${units.length}`,
      ltv: sql`${guestsTable.ltv} + ${String(totalAllUnits)}`,
      updatedAt: new Date(),
    }).where(eq(guestsTable.id, guestId));
  }

  res.status(201).json({ groupBookingId, bookings: created, totalAmount: totalAllUnits });
});

// GET /api/bookings/calendar?startDate=&days=&propertyId= — chessboard data
router.get("/calendar", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const startDate = req.query.startDate as string;
  const days = Math.min(parseInt(req.query.days as string || "30"), 90);
  const propertyId = req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined;
  const categoryFilter = req.query.category as string | undefined;

  if (!startDate) {
    res.status(400).json({ error: "startDate required" });
    return;
  }

  const start = new Date(startDate);
  const end = new Date(startDate);
  end.setDate(end.getDate() + days);

  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }

  // ── Tenant isolation ───────────────────────────────────────────────────────
  if (!user.organizationId && user.role !== "super_admin") {
    res.json({ units: [], bookings: [], dates, startDate, days });
    return;
  }

  let propIds: number[] = [];
  if (user.organizationId) {
    // Always derive authorised property IDs from the token org
    const orgProps = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, user.organizationId));
    const authorisedPropIds = orgProps.map((p: any) => p.id);

    // Org with no properties → return empty immediately (prevent full unit scan)
    if (authorisedPropIds.length === 0) {
      res.json({ units: [], bookings: [], dates, startDate, days });
      return;
    }

    if (propertyId !== undefined) {
      // Requested propertyId must belong to this org
      if (!authorisedPropIds.includes(propertyId)) {
        res.json({ units: [], bookings: [], dates, startDate, days });
        return;
      }
      propIds = [propertyId];
    } else {
      propIds = authorisedPropIds;
    }
  } else {
    // super_admin — trust explicit propertyId
    if (propertyId !== undefined) propIds = [propertyId];
  }

  const propertiesRaw = propIds.length > 0
    ? await db.execute<any>(sql`SELECT id, name, COALESCE(sort_order, 0) as sort_order FROM properties WHERE id IN (${sql.join(propIds.map(id => sql`${id}`), sql`, `)}) ORDER BY COALESCE(sort_order, 0), id`)
    : { rows: [] };
  const propertiesData = propertiesRaw.rows;
  const propNameMap = new Map(propertiesData.map((p: any) => [p.id, p.name]));
  const propSortMap = new Map(propertiesData.map((p: any) => [p.id, p.sort_order ?? 0]));

  // Build WHERE conditions as raw SQL strings to avoid Drizzle alias conflicts
  const whereClauses: string[] = ["COALESCE(u.is_hidden, false) = false"];
  const queryParams: any[] = [];

  if (propIds.length > 0) {
    const placeholders = propIds.map((_, i) => `$${queryParams.length + i + 1}`).join(", ");
    whereClauses.push(`u.property_id IN (${placeholders})`);
    queryParams.push(...propIds);
  }
  if (categoryFilter) {
    queryParams.push(categoryFilter);
    whereClauses.push(`u.category = $${queryParams.length}`);
  }

  const whereStr = whereClauses.join(" AND ");
  const { rows: unitRawRows } = await pool.query(
    `SELECT u.*,
            COALESCE(u.sort_order, 0) as unit_sort_order,
            ug.id   as ug_id,
            ug.name as ug_name,
            COALESCE(ug.sort_order, 0) as ug_sort_order
     FROM units u
     LEFT JOIN unit_groups ug ON ug.id = u.unit_group_id
     WHERE ${whereStr}
     ORDER BY COALESCE(ug.sort_order, 9999), COALESCE(u.sort_order, 0), u.name`,
    queryParams
  );
  const unitRows = { rows: unitRawRows };

  const units = unitRows.rows.map((u: any) => ({
    id: u.id,
    name: u.name,
    category: u.category || "Без категорії",
    propertyId: u.property_id,
    propertyName: propNameMap.get(u.property_id) || "",
    propertySortOrder: propSortMap.get(u.property_id) ?? 0,
    unitSortOrder: u.unit_sort_order ?? 0,
    unitGroupId: u.ug_id ?? null,
    unitGroupName: u.ug_name ?? null,
    unitGroupSortOrder: u.ug_sort_order ?? 9999,
    hasView: u.has_view ?? false,
    hasBalcony: u.has_balcony ?? false,
    squareMeters: u.square_meters ? Number(u.square_meters) : null,
    maxCapacity: u.max_capacity ?? null,
  })).sort((a: any, b: any) => {
    if (a.propertySortOrder !== b.propertySortOrder) return a.propertySortOrder - b.propertySortOrder;
    if (a.propertyId !== b.propertyId) return a.propertyId - b.propertyId;
    // within a property: ungrouped units go LAST (9999), grouped units sorted by group sort_order
    if (a.unitGroupSortOrder !== b.unitGroupSortOrder) return a.unitGroupSortOrder - b.unitGroupSortOrder;
    if (a.unitGroupId !== b.unitGroupId) return (a.unitGroupId ?? 999999) - (b.unitGroupId ?? 999999);
    if (a.unitSortOrder !== b.unitSortOrder) return a.unitSortOrder - b.unitSortOrder;
    return a.name.localeCompare(b.name);
  });

  const unitIds = units.map((u: any) => u.id);
  if (unitIds.length === 0) {
    res.json({ units: [], bookings: [], dates, startDate, days });
    return;
  }

  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];

  const now = new Date();
  const bookingRows = await db.select({
    id: bookingsTable.id,
    unitId: bookingsTable.unitId,
    guestId: bookingsTable.guestId,
    checkIn: bookingsTable.checkIn,
    checkOut: bookingsTable.checkOut,
    status: bookingsTable.status,
    guestsCount: bookingsTable.guestsCount,
    totalAmount: bookingsTable.totalAmount,
    paidAmount: bookingsTable.paidAmount,
    paymentStatus: bookingsTable.paymentStatus,
    payOnArrival: bookingsTable.payOnArrival,
    firstName: bookingsTable.firstName,
    lastName: bookingsTable.lastName,
    phone: bookingsTable.phone,
    notes: bookingsTable.notes,
    internalNotes: bookingsTable.internalNotes,
    draftExpiresAt: bookingsTable.draftExpiresAt,
    adults: bookingsTable.adults,
    checkinTime: bookingsTable.checkinTime,
    checkoutTime: bookingsTable.checkoutTime,
    paymentLink: bookingsTable.paymentLink,
  }).from(bookingsTable).where(
    and(
      inArray(bookingsTable.unitId, unitIds),
      ne(bookingsTable.status, "cancelled"),
      lte(bookingsTable.checkIn, endStr),
      gte(bookingsTable.checkOut, startStr),
      or(
        ne(bookingsTable.status, "draft" as any),
        gte(bookingsTable.draftExpiresAt, now),
      ),
    )
  );

  const guestIds = [...new Set(bookingRows.map((b: any) => b.guestId).filter(Boolean))];
  const guestRows = guestIds.length > 0
    ? await db.select({ id: guestsTable.id, firstName: guestsTable.firstName, lastName: guestsTable.lastName })
        .from(guestsTable).where(inArray(guestsTable.id, guestIds))
    : [];
  const guestMap = new Map(guestRows.map((g: any) => [g.id, `${g.firstName} ${g.lastName}`]));

  const bookings = bookingRows.map((b: any) => {
    const ci = new Date(b.checkIn);
    const co = new Date(b.checkOut);
    const nights = Math.round((co.getTime() - ci.getTime()) / 86400000);
    const isDraft = b.status === "draft";
    const guestFromMap = guestMap.get(b.guestId);
    const guestFromBooking = b.lastName ? `${b.lastName} ${b.firstName || ""}`.trim() : null;
    return {
      id: b.id,
      unitId: b.unitId,
      guestName: guestFromMap || guestFromBooking || "Гість",
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      status: b.status,
      nights,
      guestsCount: b.guestsCount || 1,
      totalAmount: Number(b.totalAmount || 0),
      paidAmount: Number(b.paidAmount || 0),
      paymentStatus: b.paymentStatus || "unpaid",
      payOnArrival: Boolean(b.payOnArrival),
      phone: b.phone,
      notes: b.notes,
      internalNotes: b.internalNotes,
      checkinTime: b.checkinTime,
      checkoutTime: b.checkoutTime,
      adults: b.adults,
      color: isDraft ? "#a0aec0" : bookingColor(b.id),
      isDraft,
      draftExpiresAt: b.draftExpiresAt,
      paymentLink: b.paymentLink || null,
    };
  });

  res.json({ units, bookings, dates, startDate, days });
});

// GET /api/bookings/payment-summary — unpaid/partial booking stats for dashboard
router.get("/payment-summary", requireAuth, async (req, res) => {
  const user = (req as any).user;
  let unitIds: number[] = [];
  if (user.organizationId) {
    const props = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, user.organizationId));
    const propIds = props.map((p: any) => p.id);
    if (propIds.length > 0) {
      const units = await db.select({ id: unitsTable.id }).from(unitsTable)
        .where(inArray(unitsTable.propertyId, propIds));
      unitIds = units.map((u: any) => u.id);
    }
  }
  if (unitIds.length === 0) { res.json({ count: 0, totalDebt: 0, payOnArrivalCount: 0 }); return; }

  const bookings = await db.select({
    id: bookingsTable.id,
    totalAmount: bookingsTable.totalAmount,
    paidAmount: bookingsTable.paidAmount,
    paymentStatus: bookingsTable.paymentStatus,
    status: bookingsTable.status,
  }).from(bookingsTable).where(
    and(
      inArray(bookingsTable.unitId, unitIds),
      ne(bookingsTable.status, "cancelled" as any),
      ne(bookingsTable.status, "checked_out" as any),
      ne(bookingsTable.paymentStatus, "paid"),
    )
  );

  // Count bookings with pay_on_arrival flag
  const poaResult = await db.execute<any>(sql`
    SELECT COUNT(*) AS cnt FROM bookings
    WHERE id = ANY(ARRAY[${sql.join(bookings.map((b: any) => sql`${b.id}`), sql`, `)}]::int[])
      AND pay_on_arrival = TRUE
  `);
  const payOnArrivalCount = bookings.length > 0 ? Number(poaResult.rows[0]?.cnt || 0) : 0;

  const count = bookings.length;
  const totalDebt = bookings.reduce((s: number, b: any) => s + Math.max(0, Number(b.totalAmount || 0) - Number(b.paidAmount || 0)), 0);

  res.json({ count, totalDebt: Math.round(totalDebt * 100) / 100, payOnArrivalCount });
});

// GET /api/bookings/pricing-preview?checkIn=&checkOut=&unitId= — dynamic price breakdown
router.get("/pricing-preview", requireAuth, async (req, res) => {
  const user = (req as any).user;

  // Tenant isolation: non-super-admin with no org cannot access any unit data
  if (!user.organizationId && user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden", message: "Access denied" });
    return;
  }

  const { checkIn, checkOut, unitId } = req.query;
  if (!checkIn || !checkOut || !unitId) {
    res.status(400).json({ error: "checkIn, checkOut, unitId required" });
    return;
  }

  // Validate the requested unit belongs to the caller's org before returning its data
  if (user.organizationId) {
    const orgProps = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, user.organizationId));
    const authorisedPropIds = orgProps.map((p: any) => p.id);
    if (authorisedPropIds.length === 0) {
      res.status(403).json({ error: "Forbidden", message: "No properties in your organization" });
      return;
    }
    const validUnit = await db.select({ id: unitsTable.id }).from(unitsTable)
      .where(and(eq(unitsTable.id, parseInt(unitId as string)), inArray(unitsTable.propertyId, authorisedPropIds)));
    if (!validUnit.length) {
      res.status(403).json({ error: "Forbidden", message: "Unit does not belong to your organization" });
      return;
    }
  }

  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, parseInt(unitId as string))).limit(1);
  if (!unit) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }
  // Use unit.basePrice; fall back to the applicable rate when it is 0
  let base = Number(unit.basePrice || 0);
  if (base === 0) {
    const rates = await db.select().from(ratesTable)
      .where(eq(ratesTable.propertyId, unit.propertyId));
    const rate = rates.find(r => !r.unitCategory || r.unitCategory === unit.category) || rates[0];
    if (rate) base = Number(rate.pricePerNight || 0);
  }
  const start = new Date(checkIn as string);
  const end = new Date(checkOut as string);
  const nights = Math.round((end.getTime() - start.getTime()) / 86400000);
  const today = new Date();

  // Same-day booking (SPA / pool / jacuzzi slot): treat as 1 session at base price
  if (nights === 0) {
    return res.json({
      unitId: unit.id,
      unitName: unit.name,
      basePrice: base,
      checkIn: checkIn as string,
      checkOut: checkOut as string,
      nights: 0,
      totalAmount: base,       // 1 session = base price
      avgNightPrice: 0,
      breakdown: [],
      isSameDay: true,
    });
  }

  const breakdown = [];
  let total = 0;
  for (let i = 0; i < nights; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const sf = seasonFactor(d.getMonth() + 1);
    const wf = weekendFactor(d.getDay());
    const ef = earlyBookingFactor(start, today);
    const price = Math.round(base * sf * wf * ef);
    total += price;
    breakdown.push({
      date: d.toISOString().split("T")[0],
      basePrice: base,
      seasonFactor: sf,
      weekendFactor: wf,
      earlyBookingFactor: ef,
      finalPrice: price,
      label: labelForNight(d),
    });
  }
  res.json({
    unitId: unit.id,
    unitName: unit.name,
    basePrice: base,
    checkIn: checkIn as string,
    checkOut: checkOut as string,
    nights,
    totalAmount: total,
    avgNightPrice: nights > 0 ? Math.round(total / nights) : 0,
    breakdown,
  });
});

// GET /api/bookings/check-draft (MUST be before /:bookingId)
router.get("/check-draft", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;

    // Tenant isolation: non-super-admin with no org cannot read any unit draft data
    if (!user.organizationId && user.role !== "super_admin") {
      res.json({ hasDraft: false });
      return;
    }

    const { unitId, checkIn, checkOut } = req.query;
    if (!unitId || !checkIn || !checkOut) return res.json({ hasDraft: false });

    // Validate the unitId belongs to the caller's org before querying drafts
    if (user.organizationId) {
      const orgProps = await db.select({ id: propertiesTable.id }).from(propertiesTable)
        .where(eq(propertiesTable.organizationId, user.organizationId));
      const authorisedPropIds = orgProps.map((p: any) => p.id);
      if (authorisedPropIds.length > 0) {
        const validUnit = await db.select({ id: unitsTable.id }).from(unitsTable)
          .where(and(eq(unitsTable.id, parseInt(unitId as string)), inArray(unitsTable.propertyId, authorisedPropIds)));
        if (!validUnit.length) {
          res.json({ hasDraft: false });
          return;
        }
      } else {
        res.json({ hasDraft: false });
        return;
      }
    }
    const now = new Date();
    const drafts = await db.select({
      id: bookingsTable.id, checkIn: bookingsTable.checkIn, checkOut: bookingsTable.checkOut,
      firstName: bookingsTable.firstName, lastName: bookingsTable.lastName,
      phone: bookingsTable.phone, draftExpiresAt: bookingsTable.draftExpiresAt, guestId: bookingsTable.guestId,
    }).from(bookingsTable).where(
      and(
        eq(bookingsTable.unitId, parseInt(unitId as string)),
        eq(bookingsTable.status, "draft" as any),
        gte(bookingsTable.draftExpiresAt, now),
        lte(bookingsTable.checkIn, checkOut as string),
        gte(bookingsTable.checkOut, checkIn as string),
      )
    ).limit(1);
    if (drafts.length === 0) return res.json({ hasDraft: false });
    const draft = drafts[0];
    let guestName = draft.lastName ? `${draft.lastName} ${draft.firstName || ""}`.trim() : null;
    if (!guestName && draft.guestId) {
      const [g] = await db.select({ firstName: guestsTable.firstName, lastName: guestsTable.lastName })
        .from(guestsTable).where(eq(guestsTable.id, draft.guestId)).limit(1);
      if (g) guestName = `${g.firstName} ${g.lastName}`;
    }
    res.json({ hasDraft: true, draft: { id: draft.id, checkIn: draft.checkIn, checkOut: draft.checkOut, guestName: guestName || "Гість", phone: draft.phone, draftExpiresAt: draft.draftExpiresAt } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/:bookingId", requireAuth, requireBookingOwnership, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) {
    res.status(404).json({ error: "Not Found", message: "Booking not found" });
    return;
  }
  const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, booking.guestId)).limit(1);
  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, booking.unitId)).limit(1);

  const addons = await db.select({
    id: bookingAddonsTable.id,
    bookingId: bookingAddonsTable.bookingId,
    addonId: bookingAddonsTable.addonId,
    quantity: bookingAddonsTable.quantity,
    priceEach: bookingAddonsTable.priceEach,
    totalPrice: bookingAddonsTable.totalPrice,
    addonName: addonsTable.name,
  }).from(bookingAddonsTable)
    .leftJoin(addonsTable, eq(bookingAddonsTable.addonId, addonsTable.id))
    .where(eq(bookingAddonsTable.bookingId, bookingId));

  const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, bookingId));

  res.json({
    ...booking,
    totalAmount: Number(booking.totalAmount),
    paidAmount: Number(booking.paidAmount),
    guestName: guest ? `${guest.firstName} ${guest.lastName}` : null,
    unitName: unit?.name || null,
    guest: guest ? { ...guest, ltv: Number(guest.ltv) } : null,
    unit: unit ? { ...unit, basePrice: unit.basePrice ? Number(unit.basePrice) : null } : null,
    addons: addons.map(a => ({
      ...a,
      priceEach: Number(a.priceEach),
      totalPrice: Number(a.totalPrice),
    })),
    payments: payments.map(p => ({ ...p, amount: Number(p.amount) })),
  });
});

router.put("/:bookingId", requireAuth, requireBookingOwnership, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const user = (req as any).user;
  const {
    checkIn, checkOut, status, paymentStatus, source, totalAmount, notes,
    checkinTime, checkoutTime, rateId, rateName,
    adults, childrenUnder6, childrenOver6, extraBeds,
    firstName, lastName, middleName, phone,
    discountId, discountValue, discountType,
    selectedAddons, legalEntityId,
    payOnArrival, partialAmount, withPets,
  } = req.body;

  // Validate dates if supplied — checkIn must be before checkOut
  if (checkIn !== undefined || checkOut !== undefined) {
    const ci = new Date(checkIn ?? ""); const co = new Date(checkOut ?? "");
    // If both are present, validate order
    if (checkIn && checkOut) {
      if (isNaN(ci.getTime()) || isNaN(co.getTime())) {
        res.status(400).json({ error: "Validation", message: "Invalid date format" }); return;
      }
      if (ci >= co) {
        res.status(400).json({ error: "Validation", message: "checkOut must be after checkIn" }); return;
      }
    } else if (checkIn && isNaN(ci.getTime())) {
      res.status(400).json({ error: "Validation", message: "Invalid checkIn date" }); return;
    } else if (checkOut && isNaN(co.getTime())) {
      res.status(400).json({ error: "Validation", message: "Invalid checkOut date" }); return;
    }
  }

  // Validate status transition if status is being changed
  if (status !== undefined) {
    const [current] = await db.select({ status: bookingsTable.status }).from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId)).limit(1);
    if (current && current.status !== status) {
      const check = validateTransition(current.status as BookingStatus, status as BookingStatus, user.role);
      if (!check.ok) {
        res.status(check.httpStatus ?? 422).json({ error: check.error });
        return;
      }
    }
  }

  const guestsCount = (adults ?? undefined) !== undefined
    ? (adults || 1) + (childrenUnder6 || 0) + (childrenOver6 || 0)
    : undefined;

  const isDraft = status === "draft";
  const draftExpiresAt = isDraft ? new Date(Date.now() + 6 * 60 * 60 * 1000) : undefined;

  const [booking] = await db.update(bookingsTable).set({
    ...(checkIn !== undefined && { checkIn }),
    ...(checkOut !== undefined && { checkOut }),
    ...(checkinTime !== undefined && { checkinTime }),
    ...(checkoutTime !== undefined && { checkoutTime }),
    ...(status !== undefined && { status }),
    ...(paymentStatus !== undefined && { paymentStatus }),
    ...(source !== undefined && { source }),
    ...(rateId !== undefined && { rateId }),
    ...(rateName !== undefined && { rateName }),
    ...(adults !== undefined && { adults }),
    ...(childrenUnder6 !== undefined && { childrenUnder6 }),
    ...(childrenOver6 !== undefined && { childrenOver6 }),
    ...(extraBeds !== undefined && { extraBeds }),
    ...(guestsCount !== undefined && { guestsCount }),
    ...(firstName !== undefined && { firstName }),
    ...(lastName !== undefined && { lastName }),
    ...(middleName !== undefined && { middleName }),
    ...(phone !== undefined && { phone }),
    // totalAmount: validate it's a non-negative finite number; NaN/negative/non-finite rejected with 400
    ...(totalAmount !== undefined && (() => {
      const n = Number(totalAmount);
      if (!Number.isFinite(n) || n < 0) {
        res.status(400).json({ error: "Validation", message: "totalAmount must be a non-negative number" });
        return null; // signal to caller
      }
      return { totalAmount: n.toFixed(2) };
    })() || {}),
    ...(discountId !== undefined && { discountId }),
    ...(discountValue !== undefined && { discountValue: String(discountValue) }),
    ...(discountType !== undefined && { discountType }),
    ...(selectedAddons !== undefined && { selectedAddons }),
    ...(legalEntityId !== undefined && { legalEntityId }),
    ...(notes !== undefined && { notes }),
    ...(payOnArrival !== undefined && { payOnArrival: Boolean(payOnArrival) }),
    ...(withPets !== undefined && { withPets: Boolean(withPets) }),
    ...(draftExpiresAt && { draftExpiresAt }),
    updatedAt: new Date(),
  }).where(eq(bookingsTable.id, bookingId)).returning();
  if (!booking) {
    res.status(404).json({ error: "Not Found", message: "Booking not found" });
    return;
  }
  res.json({ ...booking, totalAmount: Number(booking.totalAmount), paidAmount: Number(booking.paidAmount) });
});

router.delete("/:bookingId", requireAuth, requireBookingOwnership, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const [current] = await db.select({ status: bookingsTable.status }).from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!current) {
    res.status(404).json({ error: "Not Found", message: "Booking not found" });
    return;
  }
  if (!canCancel(current.status as BookingStatus)) {
    res.status(409).json({ error: `Cannot cancel a booking with status "${current.status}"` });
    return;
  }
  const [booking] = await db.update(bookingsTable).set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(bookingsTable.id, bookingId)).returning();
  if (!booking) {
    res.status(404).json({ error: "Not Found", message: "Booking not found" });
    return;
  }
  res.json({ success: true, message: "Booking cancelled" });
});

router.patch("/:bookingId/status", requireAuth, requireBookingOwnership, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const { status: newStatus } = req.body;
  const user = (req as any).user;

  const [current] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!current) { res.status(404).json({ error: "Not Found", message: "Booking not found" }); return; }

  const check = validateTransition(current.status as BookingStatus, newStatus as BookingStatus, user.role);
  if (!check.ok) { res.status(check.httpStatus ?? 422).json({ error: check.error }); return; }

  const [booking] = await db.update(bookingsTable)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(bookingsTable.id, bookingId)).returning();
  res.json({ ...booking, totalAmount: Number(booking.totalAmount), paidAmount: Number(booking.paidAmount) });
});

// POST /api/bookings/:bookingId/checkin — check in a guest
router.post("/:bookingId/checkin", requireAuth, requireBookingOwnership, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const user = (req as any).user;
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) {
    res.status(404).json({ error: "Not Found", message: "Booking not found" });
    return;
  }

  const check = validateTransition(booking.status as BookingStatus, "checked_in", user.role);
  if (!check.ok) { res.status(check.httpStatus ?? 422).json({ error: check.error }); return; }

  const [updated] = await db.update(bookingsTable)
    .set({ status: "checked_in", updatedAt: new Date() })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, booking.guestId)).limit(1);
  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, booking.unitId)).limit(1);
  const guestName = guest ? `${guest.firstName} ${guest.lastName}` : "Гість";

  await db.insert(notificationsTable).values({
    userId: user.id,
    bookingId,
    type: "checkin",
    title: "Check-in виконано",
    message: `${guestName} заселився в ${unit?.name || "номер"} (${booking.checkIn} → ${booking.checkOut})`,
    priority: "normal",
  }).catch(() => {});

  res.json({ ...updated, totalAmount: Number(updated.totalAmount), paidAmount: Number(updated.paidAmount) });

  // Fire-and-forget external notification
  if (user.organizationId) {
    notifyCheckIn(user.organizationId, guestName, unit?.name || "номер", bookingId).catch(() => {});
  }
});

// POST /api/bookings/:bookingId/checkout — check out a guest
router.post("/:bookingId/checkout", requireAuth, requireBookingOwnership, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const user = (req as any).user;
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) {
    res.status(404).json({ error: "Not Found", message: "Booking not found" });
    return;
  }

  const check = validateTransition(booking.status as BookingStatus, "checked_out", user.role);
  if (!check.ok) { res.status(check.httpStatus ?? 422).json({ error: check.error }); return; }
  const [updated] = await db.update(bookingsTable)
    .set({ status: "checked_out", updatedAt: new Date() })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, booking.guestId)).limit(1);
  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, booking.unitId)).limit(1);
  const guestName = guest ? `${guest.firstName} ${guest.lastName}` : "Гість";

  if (guest) {
    const nights = Math.round((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / 86400000);
    await db.update(guestsTable).set({
      totalNights: (guest.totalNights || 0) + nights,
      totalSpent: String(Number(guest.totalSpent || 0) + Number(booking.totalAmount || 0)),
      lastVisit: new Date(),
      updatedAt: new Date(),
    }).where(eq(guestsTable.id, guest.id)).catch(() => {});
  }

  await db.insert(notificationsTable).values({
    userId: user.id,
    bookingId,
    type: "checkout",
    title: "Check-out виконано",
    message: `${guestName} виселився з ${unit?.name || "номера"} (${booking.checkOut})`,
    priority: "normal",
  }).catch(() => {});

  // Auto-create housekeeping cleaning task after checkout
  if (unit) {
    await db.insert(housekeepingTasksTable).values({
      unitId: unit.id,
      title: `Прибирання після виїзду — ${unit.name}`,
      description: `Гість: ${guestName}. Виїзд: ${new Date().toLocaleDateString("uk-UA")}. Стандартне прибирання після виїзду.`,
      taskType: "cleaning",
      status: "pending",
      priority: "high",
      dueDate: new Date().toISOString().split("T")[0],
      estimatedMinutes: 60,
      checklist: [
        { id: "1", text: "Змінити постільну білизну", checked: false },
        { id: "2", text: "Прибрати і помити ванну кімнату", checked: false },
        { id: "3", text: "Пропилосос і миття підлоги", checked: false },
        { id: "4", text: "Протерти всі поверхні", checked: false },
        { id: "5", text: "Поповнити витратні матеріали", checked: false },
        { id: "6", text: "Перевірити наявність забутих речей", checked: false },
        { id: "7", text: "Провітрити приміщення", checked: false },
      ],
    }).catch(() => {});
  }

  res.json({ ...updated, totalAmount: Number(updated.totalAmount), paidAmount: Number(updated.paidAmount) });
});

// POST /api/bookings/:bookingId/cancel — cancel a booking
router.post("/:bookingId/cancel", requireAuth, requireBookingOwnership, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const user = (req as any).user;
  const { reason } = req.body;
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) {
    res.status(404).json({ error: "Not Found", message: "Booking not found" });
    return;
  }

  if (!canCancel(booking.status as BookingStatus)) {
    res.status(409).json({ error: `Не можна скасувати бронювання зі статусом "${booking.status}"` });
    return;
  }

  const [updated] = await db.update(bookingsTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, booking.guestId)).limit(1);
  const guestName = guest ? `${guest.firstName} ${guest.lastName}` : "Гість";

  await db.insert(notificationsTable).values({
    userId: user.id,
    bookingId,
    type: "cancellation",
    title: "Бронювання скасовано",
    message: reason
      ? `Бронювання #${bookingId} (${guestName}) скасовано. Причина: ${reason}`
      : `Бронювання #${bookingId} (${guestName}) скасовано`,
    priority: "high",
  }).catch(() => {});

  res.json({ ...updated, totalAmount: Number(updated.totalAmount), paidAmount: Number(updated.paidAmount) });
});

// GET /api/bookings/:bookingId/qr — generate QR code data URL for check-in
router.get("/:bookingId/qr", requireAuth, requireBookingOwnership, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) {
    res.status(404).json({ error: "Not Found", message: "Booking not found" });
    return;
  }
  const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, booking.guestId)).limit(1);
  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, booking.unitId)).limit(1);

  const qrDataUrl = await generateBookingQR(
    booking.id,
    guest ? `${guest.firstName} ${guest.lastName}` : "Гість",
    booking.checkIn,
    booking.checkOut,
    unit?.name || "—",
  );

  res.json({ qr: qrDataUrl, bookingId: booking.id });
});

// POST /api/bookings/:bookingId/liqpay — create a LiqPay payment link
router.post("/:bookingId/liqpay", requireAuth, requireBookingOwnership, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) {
    res.status(404).json({ error: "Not Found", message: "Booking not found" });
    return;
  }
  const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, booking.guestId)).limit(1);
  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, booking.unitId)).limit(1);

  const remaining = Number(booking.totalAmount) - Number(booking.paidAmount);
  if (remaining <= 0) {
    res.status(400).json({ error: "Бронювання вже повністю оплачено" });
    return;
  }

  if (!process.env.LIQPAY_PUBLIC_KEY || !process.env.LIQPAY_PRIVATE_KEY) {
    res.status(503).json({
      error: "liqpay_not_configured",
      message: "LiqPay ключі не налаштовані. Додайте LIQPAY_PUBLIC_KEY і LIQPAY_PRIVATE_KEY.",
    });
    return;
  }

  const baseUrl = process.env.APP_URL || req.headers.origin || "https://dogoda.me";
  const guestName = guest ? `${guest.firstName} ${guest.lastName}` : "Гість";
  const description = `Оплата бронювання #${bookingId} — ${unit?.name || "номер"} (${booking.checkIn} – ${booking.checkOut}), ${guestName}`;

  const { data, signature, url } = generateLiqPayForm({
    action: "pay",
    amount: remaining,
    currency: "UAH",
    description,
    orderId: `booking-${bookingId}-${Date.now()}`,
    resultUrl: `${baseUrl}/bookings`,
    serverUrl: `${baseUrl}/api/bookings/liqpay/callback`,
  });

  res.json({ url, data, signature, amount: remaining });
});

// POST /api/bookings/liqpay/callback — LiqPay webhook (no auth required)
router.post("/liqpay/callback", async (req, res) => {
  try {
    const { data, signature } = req.body;
    if (!data || !signature) {
      res.status(400).json({ error: "Missing data or signature" });
      return;
    }

    // Parse first to get booking id, then verify with the correct key
    let parsed: Record<string, any>;
    try {
      parsed = parseLiqPayData(data);
    } catch {
      res.status(400).json({ error: "Invalid data payload" });
      return;
    }

    logger.info({ parsed }, "LiqPay callback received");

    const orderId: string = parsed.order_id || "";
    const match = orderId.match(/^booking-(\d+)/);
    if (!match) {
      res.status(400).json({ error: "Invalid order_id" });
      return;
    }

    const bookingId = parseInt(match[1]);

    // Look up the legal entity private key used for this booking
    const { legalEntitiesTable } = await import("@workspace/db/schema");
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);

    let verificationKey = process.env.LIQPAY_PRIVATE_KEY || "";
    if (booking?.legalEntityId) {
      const [entity] = await db.select().from(legalEntitiesTable).where(eq(legalEntitiesTable.id, booking.legalEntityId)).limit(1);
      if (entity?.liqpayPrivateKey) verificationKey = entity.liqpayPrivateKey;
    }

    // Verify signature with the correct key
    const crypto = await import("crypto");
    const expectedSig = crypto.default
      .createHash("sha1")
      .update(verificationKey + data + verificationKey)
      .digest("base64");

    if (expectedSig !== signature) {
      logger.warn({ orderId }, "LiqPay callback signature mismatch");
      res.status(403).json({ error: "Invalid signature" });
      return;
    }

    const liqStatus = parsed.status;
    const amount = Number(parsed.amount || 0);

    if (liqStatus === "success" || liqStatus === "sandbox") {
      if (booking) {
        const newPaid = Number(booking.paidAmount) + amount;
        const total = Number(booking.totalAmount);
        const paymentStatus = newPaid >= total ? "paid" : "partial";

        // Auto-confirm pending bookings when payment arrives
        const newBookingStatus =
          (booking.status === "pending" || booking.status === "confirmed")
            ? "confirmed"
            : booking.status;

        await db.update(bookingsTable).set({
          paidAmount: String(newPaid),
          paymentStatus,
          status: newBookingStatus,
          updatedAt: new Date(),
        }).where(eq(bookingsTable.id, bookingId));

        await db.insert(paymentsTable).values({
          bookingId,
          amount: String(amount),
          method: "liqpay",
          status: "completed",
          paymentType: "payment",
          legalEntityId: booking.legalEntityId || null,
          liqpayOrderId: orderId,
          liqpayStatus: liqStatus,
          externalId: parsed.payment_id ? String(parsed.payment_id) : null,
          reference: parsed.payment_id ? String(parsed.payment_id) : null,
          notes: `LiqPay: ${parsed.description || ""}`,
          processedAt: new Date(),
        });

        logger.info({ bookingId, amount, paymentStatus, newPaid }, "LiqPay payment recorded");
      }
    } else if (liqStatus === "failure" || liqStatus === "error") {
      logger.warn({ bookingId, liqStatus, parsed }, "LiqPay payment failed");
      await db.insert(paymentsTable).values({
        bookingId,
        amount: String(amount),
        method: "liqpay",
        status: "failed",
        paymentType: "payment",
        legalEntityId: booking?.legalEntityId || null,
        liqpayOrderId: orderId,
        liqpayStatus: liqStatus,
        externalId: parsed.payment_id ? String(parsed.payment_id) : null,
        notes: `LiqPay FAILED: ${parsed.err_description || liqStatus}`,
        processedAt: new Date(),
      }).catch(() => {});
    }

    res.json({ result: "ok" });
  } catch (err) {
    logger.error({ err }, "LiqPay callback error");
    res.status(500).json({ error: "callback_error" });
  }
});

// POST /api/bookings/:bookingId/payment-link
router.post("/:bookingId/payment-link", requireAuth, requireBookingOwnership, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const { legalEntityId } = req.body;

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, booking.unitId)).limit(1);

    let publicKey = process.env.LIQPAY_PUBLIC_KEY || "";
    let privateKey = process.env.LIQPAY_PRIVATE_KEY || "";
    let entityName = "Maison HD";

    // Always try to find a legal entity with LiqPay keys (from request body or org default)
    const { legalEntitiesTable } = await import("@workspace/db/schema");
    const user = (req as any).user;
    const orgId = user?.organizationId;

    if (legalEntityId) {
      const [entity] = await db.select().from(legalEntitiesTable).where(eq(legalEntitiesTable.id, legalEntityId)).limit(1);
      if (entity) {
        if (entity.liqpayPublicKey) publicKey = entity.liqpayPublicKey;
        if (entity.liqpayPrivateKey) privateKey = entity.liqpayPrivateKey;
        entityName = entity.name;
      }
    } else if (orgId) {
      // Auto-find: first legal entity with LiqPay keys (prefer default, else first available)
      const entities = await db.select().from(legalEntitiesTable)
        .where(eq(legalEntitiesTable.organizationId, orgId));
      const withKeys = entities.filter(e => e.liqpayPublicKey && e.liqpayPrivateKey);
      const entity = withKeys.find(e => e.isDefault) || withKeys[0];
      if (entity) {
        publicKey = entity.liqpayPublicKey!;
        privateKey = entity.liqpayPrivateKey!;
        entityName = entity.name;
      }
    }

    if (!publicKey || !privateKey) {
      return res.status(503).json({ error: "liqpay_not_configured", message: "Додайте LiqPay ключі у Налаштування → Юридичні особи" });
    }

    const amount = Number(booking.totalAmount) - Number(booking.paidAmount || 0);
    if (amount <= 0) {
      return res.status(400).json({ error: "Сума оплати має бути більше 0" });
    }

    const orderId = `booking-${bookingId}-${Date.now()}`;
    const description = `Бронювання #${bookingId} — ${unit?.name || "Номер"}`;

    const liqpayData = generateLiqPayForm({
      action: "pay",
      publicKey,
      privateKey,
      amount,
      currency: "UAH",
      description,
      orderId,
      serverUrl: `${process.env.APP_URL || "https://dogoda.me"}/api/bookings/liqpay/callback`,
      resultUrl: `${process.env.APP_URL || "https://dogoda.me"}/maison-hd/bookings/${bookingId}`,
    });

    await db.update(bookingsTable).set({ paymentLink: liqpayData.url, legalEntityId: legalEntityId || null, updatedAt: new Date() })
      .where(eq(bookingsTable.id, bookingId));

    res.json({ paymentLink: liqpayData.url, entityName, amount, orderId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/bookings/:bookingId/invoice — save invoice to DB
router.post("/:bookingId/invoice", requireAuth, requireBookingOwnership, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const user = (req as any).user;
    const { invoicesTable, legalEntitiesTable } = await import("@workspace/db/schema");
    const {
      invoiceNumber, date, dueDate, legalEntityId,
      buyer, items, seller, bookingData,
    } = req.body;

    const total = (items || []).reduce((s: number, it: any) => s + Number(it.amount), 0);

    // Check if invoice already exists for this booking
    const existing = await db.select({ id: invoicesTable.id })
      .from(invoicesTable)
      .where(eq(invoicesTable.bookingId, bookingId))
      .limit(1);

    const payload: any = {
      organizationId: user.organizationId ?? null,
      invoiceNumber,
      bookingId,
      legalEntityId: legalEntityId || null,
      counterpartyName: buyer?.name || null,
      counterpartyEdrpou: buyer?.taxCode || null,
      buyerAddress: buyer?.address || null,
      buyerVatNumber: buyer?.vatNumber || null,
      invoiceItems: items || [],
      sellerSnapshot: seller || null,
      amount: total.toFixed(2),
      status: "pending",
      dueDate: dueDate ? new Date(dueDate) : null,
      createdById: user.id,
      updatedAt: new Date(),
    };

    let saved;
    if (existing.length > 0) {
      const [upd] = await db.update(invoicesTable).set(payload)
        .where(eq(invoicesTable.id, existing[0].id)).returning();
      saved = upd;
    } else {
      const [ins] = await db.insert(invoicesTable).values(payload).returning();
      saved = ins;
    }

    res.json({ id: saved.id, invoiceNumber: saved.invoiceNumber, status: saved.status });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/bookings/:bookingId/invoice
router.get("/:bookingId/invoice", requireAuth, requireBookingOwnership, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const { legalEntityId } = req.query;
    const user = (req as any).user;
    const orgId = user?.organizationId;

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, booking.unitId)).limit(1);
    let unitPropertyType: string | null = null;
    if (unit?.propertyId) {
      const [prop] = await db.select({ type: propertiesTable.type }).from(propertiesTable).where(eq(propertiesTable.id, unit.propertyId)).limit(1);
      unitPropertyType = prop?.type ?? null;
    }
    let guestName = booking.lastName ? `${booking.lastName} ${booking.firstName || ""}`.trim() : null;
    if (!guestName && booking.guestId) {
      const [g] = await db.select({ firstName: guestsTable.firstName, lastName: guestsTable.lastName })
        .from(guestsTable).where(eq(guestsTable.id, booking.guestId)).limit(1);
      if (g) guestName = `${g.firstName} ${g.lastName}`;
    }

    const { legalEntitiesTable } = await import("@workspace/db/schema");
    let seller: any = null;

    if (legalEntityId) {
      const [entity] = await db.select().from(legalEntitiesTable)
        .where(eq(legalEntitiesTable.id, parseInt(legalEntityId as string))).limit(1);
      if (entity) seller = entity;
    }

    if (!seller && orgId) {
      // Auto-detect: prefer default entity, else first active entity for this org
      const entities = await db.select().from(legalEntitiesTable)
        .where(eq(legalEntitiesTable.organizationId, orgId));
      seller = entities.find((e: any) => e.isDefault) || entities.find((e: any) => e.isActive) || entities[0] || null;
    }

    // Fetch all legal entities for selector
    const allEntities = orgId
      ? await db.select({ id: legalEntitiesTable.id, name: legalEntitiesTable.name, isDefault: legalEntitiesTable.isDefault })
          .from(legalEntitiesTable).where(eq(legalEntitiesTable.organizationId, orgId))
      : [];

    const total = Number(booking.totalAmount);
    const paid = Number(booking.paidAmount);
    const due = total - paid;
    const nights = Math.round((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / 86400000);

    // ── Fetch tourist tax rate from property ────────────────────────────────
    const propertyId = unit?.propertyId ?? null;
    let touristTaxRate = 0;
    if (propertyId) {
      const [prop] = await db.select({ touristTaxRate: propertiesTable.touristTaxRate })
        .from(propertiesTable).where(eq(propertiesTable.id, propertyId)).limit(1);
      touristTaxRate = prop ? Number(prop.touristTaxRate || 0) : 0;
    }
    const adults = booking.adults || 1;
    const touristTaxTotal = touristTaxRate > 0
      ? Math.round(touristTaxRate * adults * nights * 100) / 100
      : 0;

    // ── Fetch booking addons (bookingAddonsTable) ───────────────────────────
    const bookingAddons = await db.select({
      qty: bookingAddonsTable.quantity,
      addonId: bookingAddonsTable.addonId,
      name: addonsTable.name,
      unit: addonsTable.unit,
      price: addonsTable.price,
    })
      .from(bookingAddonsTable)
      .leftJoin(addonsTable, eq(bookingAddonsTable.addonId, addonsTable.id))
      .where(eq(bookingAddonsTable.bookingId, bookingId));

    const addonsTotal = bookingAddons.reduce((s, a) => s + Number(a.price || 0) * Number(a.qty || 1), 0);

    // ── Fetch guest service orders ──────────────────────────────────────────
    const serviceOrders = await db.select()
      .from(guestServiceOrdersTable)
      .where(eq(guestServiceOrdersTable.bookingId, bookingId));

    const serviceOrdersTotal = serviceOrders.reduce((s, o) => s + Number(o.totalPrice || 0), 0);

    // ── Accommodation base (strip addons, service orders, tourist tax) ──────
    const accommodationTotal = Math.max(0,
      Math.round((total - addonsTotal - serviceOrdersTotal - touristTaxTotal) * 100) / 100
    );
    const pricePerNight = nights > 0
      ? Math.round((accommodationTotal / nights) * 100) / 100
      : accommodationTotal;

    // ── Build line items ────────────────────────────────────────────────────
    const NON_ACCOMMODATION_TYPES = ["spa", "pool"];
    const isAccommodation = !unitPropertyType || !NON_ACCOMMODATION_TYPES.includes(unitPropertyType);
    const unitLabel = unit?.name || `Номер ${booking.unitId}`;
    const accommodationLineDesc = isAccommodation
      ? `Послуга проживання — ${unitLabel}`
      : `Послуга — ${unitLabel}`;

    // Compute discount amount for accommodation line
    const discountValue = Number(booking.discountValue || 0);
    const discountType  = booking.discountType || null;
    let accommodationDiscount = 0;
    let pricePerNightPreDiscount = pricePerNight;
    if (discountValue > 0 && discountType) {
      if (discountType === "percent") {
        // total was reduced by discountValue %; reverse to get pre-discount accommodation
        const preDiscount = accommodationTotal / (1 - discountValue / 100);
        accommodationDiscount = Math.round((preDiscount - accommodationTotal) * 100) / 100;
        pricePerNightPreDiscount = nights > 0
          ? Math.round((preDiscount / nights) * 100) / 100
          : preDiscount;
      } else {
        // flat amount discount
        accommodationDiscount = Math.round(discountValue * 100) / 100;
        const preDiscount = accommodationTotal + accommodationDiscount;
        pricePerNightPreDiscount = nights > 0
          ? Math.round((preDiscount / nights) * 100) / 100
          : preDiscount;
      }
    }

    const isSameDay = nights === 0 && booking.checkIn === booking.checkOut;
    const items: any[] = [];
    if (accommodationTotal > 0 || nights > 0) {
      const lineDetail = isSameDay
        ? `${booking.checkIn}${booking.checkinTime ? ` · ${booking.checkinTime}–${booking.checkoutTime || ""}` : ""}`
        : `${booking.checkIn} → ${booking.checkOut} · ${nights} ніч`;
      const lineUnit = isSameDay ? "сеанс" : (isAccommodation ? "ніч" : "шт");
      items.push({
        description: accommodationLineDesc,
        detail: lineDetail,
        qty: nights || 1,
        unit: lineUnit,
        price: pricePerNightPreDiscount,
        discount: accommodationDiscount > 0 ? accommodationDiscount : undefined,
        amount: accommodationTotal,
      });
    }

    // Addons
    for (const a of bookingAddons) {
      const qty = Number(a.qty || 1);
      const price = Number(a.price || 0);
      const amount = Math.round(qty * price * 100) / 100;
      if (amount <= 0) continue;
      items.push({
        description: a.name || "Додаткова послуга",
        qty,
        unit: a.unit || "шт",
        price,
        amount,
      });
    }

    // Guest service orders (SPA, minibar, room service…)
    for (const o of serviceOrders) {
      const qty = Number(o.quantity || 1);
      const price = Number(o.pricePerUnit || 0);
      const amount = Number(o.totalPrice || 0);
      if (amount <= 0) continue;
      items.push({
        description: o.serviceName || "Замовлена послуга",
        detail: o.serviceDescription || undefined,
        qty,
        unit: "шт",
        price: price || Math.round((amount / qty) * 100) / 100,
        amount,
      });
    }

    // Tourist tax
    if (touristTaxTotal > 0) {
      items.push({
        description: "Туристичний збір",
        detail: `${touristTaxRate} ₴ × ${adults} гост. × ${nights} ніч`,
        qty: adults * nights,
        unit: "ос./ніч",
        price: touristTaxRate,
        amount: touristTaxTotal,
      });
    }

    // Generate invoice number: Р-YYYY-BKID
    const year = new Date().getFullYear();
    const invoiceNumber = `Р-${year}-${String(bookingId).padStart(4, "0")}`;

    res.json({
      invoiceNumber,
      date: new Date().toISOString().split("T")[0],
      dueDate: booking.checkIn,
      booking: {
        id: bookingId,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        checkinTime: booking.checkinTime,
        checkoutTime: booking.checkoutTime,
        nights,
        unitName: unit?.name || `Номер ${booking.unitId}`,
        guestName: guestName || "Гість",
        phone: booking.phone,
        adults: booking.adults,
        totalAmount: total,
        paidAmount: paid,
        dueAmount: due,
      },
      seller: seller ? {
        name:          seller.name,
        type:          seller.type,
        taxCode:       seller.type === "fop" ? (seller.ipn || seller.edrpou || seller.taxNumber || "") : (seller.edrpou || seller.taxNumber || ""),
        vatNumber:     seller.vatNumber,
        iban:          seller.iban,
        bankName:      seller.bank,
        mfo:           seller.mfo,
        address:       seller.address || seller.legalAddress || seller.actualAddress || "",
        directorName:  seller.director,
        accountantName: seller.accountant,
        logoUrl:       (seller as any).logoUrl,
        stamp:         (seller as any).stamp,
        signature:     (seller as any).signature,
      } : null,
      buyer: { name: guestName || "", taxCode: "", vatNumber: "", address: "" },
      items,
      legalEntities: allEntities,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
