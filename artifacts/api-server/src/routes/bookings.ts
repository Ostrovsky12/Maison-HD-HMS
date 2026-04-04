import { Router } from "express";
import { db } from "@workspace/db";
import { bookingsTable, guestsTable, unitsTable, propertiesTable, bookingAddonsTable, addonsTable, paymentsTable, notificationsTable, ratesTable, housekeepingTasksTable } from "@workspace/db/schema";
import { eq, and, gte, lte, inArray, desc, sql, or, ne } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { generateLiqPayForm, verifyLiqPayCallback, parseLiqPayData } from "../lib/liqpay.js";
import { generateBookingQR } from "../lib/qr.js";
import { logger } from "../lib/logger.js";
import { notifyBookingCreated, notifyCheckIn } from "../lib/notify.js";

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

  let propIds: number[] = [];
  if (propertyId) {
    propIds = [parseInt(propertyId as string)];
  } else if (user.organizationId) {
    const props = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, user.organizationId));
    propIds = props.map(p => p.id);
  }

  let unitIds: number[] = [];
  if (unitId) {
    unitIds = [parseInt(unitId as string)];
  } else if (propIds.length > 0) {
    const units = await db.select({ id: unitsTable.id }).from(unitsTable)
      .where(inArray(unitsTable.propertyId, propIds));
    unitIds = units.map(u => u.id);
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
    status: bookingsTable.status,
    paymentStatus: bookingsTable.paymentStatus,
    source: bookingsTable.source,
    guestsCount: bookingsTable.guestsCount,
    totalAmount: bookingsTable.totalAmount,
    paidAmount: bookingsTable.paidAmount,
    notes: bookingsTable.notes,
    createdAt: bookingsTable.createdAt,
    guestName: sql<string>`COALESCE(NULLIF(concat(${guestsTable.firstName}, ' ', ${guestsTable.lastName}), ' '), NULLIF(trim(concat(${bookingsTable.lastName}, ' ', ${bookingsTable.firstName})), ''), 'Гість')`,
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
  const user = (req as any).user;
  const {
    unitId, checkIn, checkOut, status, source, totalAmount, notes,
    checkinTime, checkoutTime, rateId, rateName,
    adults, childrenUnder6, childrenOver6, extraBeds,
    firstName, lastName, middleName, phone,
    discountId, discountValue, discountType,
    selectedAddons, legalEntityId,
    payOnArrival, partialAmount,
  } = req.body;

  let { guestId } = req.body;

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

  const isDraft = status === "draft";
  const draftExpiresAt = isDraft ? new Date(Date.now() + 6 * 60 * 60 * 1000) : null;
  const guestsCount = (adults || 1) + (childrenUnder6 || 0) + (childrenOver6 || 0);

  // Determine payment fields
  const isPayOnArrival = Boolean(payOnArrival);
  const partial = partialAmount ? Number(partialAmount) : null;
  const total = Number(totalAmount || 0);
  let initialPaid = "0";
  let initialPaymentStatus = "unpaid";
  if (partial !== null && partial > 0 && partial < total) {
    initialPaid = String(partial);
    initialPaymentStatus = "partial";
  }
  const arrivalNote = isPayOnArrival ? "Оплата при заїзді" : null;

  const [booking] = await db.insert(bookingsTable).values({
    unitId,
    guestId: guestId || null,
    checkIn,
    checkOut,
    checkinTime: checkinTime || "14:00",
    checkoutTime: checkoutTime || "12:00",
    status: status || "confirmed",
    source: source || "direct",
    rateId: rateId || null,
    rateName: rateName || null,
    adults: adults || 1,
    childrenUnder6: childrenUnder6 || 0,
    childrenOver6: childrenOver6 || 0,
    extraBeds: extraBeds || 0,
    guestsCount,
    firstName: firstName || null,
    lastName: lastName || null,
    middleName: middleName || null,
    phone: phone || null,
    totalAmount: String(total),
    paidAmount: initialPaid,
    paymentStatus: initialPaymentStatus,
    payOnArrival: isPayOnArrival,
    discountId: discountId || null,
    discountValue: discountValue ? String(discountValue) : null,
    discountType: discountType || null,
    selectedAddons: selectedAddons || {},
    legalEntityId: legalEntityId || null,
    notes,
    internalNotes: arrivalNote,
    draftExpiresAt,
  }).returning();

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

  res.status(201).json({
    ...booking,
    totalAmount: Number(booking.totalAmount),
    paidAmount: Number(booking.paidAmount),
    guestName,
    unitName: u?.name || null,
  });

  // Fire-and-forget notifications (don't block response)
  if (!isDraft && user.organizationId) {
    notifyBookingCreated(user.organizationId, {
      id: booking.id,
      guestName,
      unitName: u?.name,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      totalAmount: booking.totalAmount,
    }).catch(() => {});
  }
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

  let propIds: number[] = [];
  if (propertyId) {
    propIds = [propertyId];
  } else if (user.organizationId) {
    const props = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, user.organizationId));
    propIds = props.map((p: any) => p.id);
  }

  const propertiesRaw = propIds.length > 0
    ? await db.execute<any>(sql`SELECT id, name, COALESCE(sort_order, 0) as sort_order FROM properties WHERE id = ANY(${propIds}) ORDER BY COALESCE(sort_order, 0), id`)
    : { rows: [] };
  const propertiesData = propertiesRaw.rows;
  const propNameMap = new Map(propertiesData.map((p: any) => [p.id, p.name]));
  const propSortMap = new Map(propertiesData.map((p: any) => [p.id, p.sort_order ?? 0]));

  let unitConditions: any[] = [];
  if (propIds.length > 0) unitConditions.push(inArray(unitsTable.propertyId, propIds));
  if (categoryFilter) unitConditions.push(sql`${unitsTable.category} = ${categoryFilter}`);

  const unitRows = await db.execute<any>(
    unitConditions.length > 0
      ? sql`SELECT *, COALESCE(sort_order, 0) as unit_sort_order FROM units WHERE ${and(...unitConditions)} ORDER BY COALESCE(sort_order, 0), name`
      : sql`SELECT *, COALESCE(sort_order, 0) as unit_sort_order FROM units ORDER BY COALESCE(sort_order, 0), name`
  );

  const units = unitRows.rows.map((u: any) => ({
    id: u.id,
    name: u.name,
    category: u.category || "Без категорії",
    propertyId: u.property_id,
    propertyName: propNameMap.get(u.property_id) || "",
    propertySortOrder: propSortMap.get(u.property_id) ?? 0,
    unitSortOrder: u.unit_sort_order ?? 0,
    hasView: u.has_view ?? false,
    hasBalcony: u.has_balcony ?? false,
    squareMeters: u.square_meters ? Number(u.square_meters) : null,
    maxCapacity: u.max_capacity ?? null,
  })).sort((a: any, b: any) =>
    a.propertySortOrder !== b.propertySortOrder
      ? a.propertySortOrder - b.propertySortOrder
      : a.unitSortOrder !== b.unitSortOrder
      ? a.unitSortOrder - b.unitSortOrder
      : a.name.localeCompare(b.name)
  );

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

  // Get pay_on_arrival counts via raw SQL (new column, not in schema yet)
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
  const { checkIn, checkOut, unitId } = req.query;
  if (!checkIn || !checkOut || !unitId) {
    res.status(400).json({ error: "checkIn, checkOut, unitId required" });
    return;
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
    const { unitId, checkIn, checkOut } = req.query;
    if (!unitId || !checkIn || !checkOut) return res.json({ hasDraft: false });
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

router.get("/:bookingId", requireAuth, async (req, res) => {
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

router.put("/:bookingId", requireAuth, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const {
    checkIn, checkOut, status, paymentStatus, source, totalAmount, notes,
    checkinTime, checkoutTime, rateId, rateName,
    adults, childrenUnder6, childrenOver6, extraBeds,
    firstName, lastName, middleName, phone,
    discountId, discountValue, discountType,
    selectedAddons, legalEntityId,
    payOnArrival, partialAmount,
  } = req.body;

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
    ...(totalAmount !== undefined && { totalAmount: String(totalAmount) }),
    ...(discountId !== undefined && { discountId }),
    ...(discountValue !== undefined && { discountValue: String(discountValue) }),
    ...(discountType !== undefined && { discountType }),
    ...(selectedAddons !== undefined && { selectedAddons }),
    ...(legalEntityId !== undefined && { legalEntityId }),
    ...(notes !== undefined && { notes }),
    ...(payOnArrival !== undefined && { payOnArrival: Boolean(payOnArrival) }),
    ...(draftExpiresAt && { draftExpiresAt }),
    updatedAt: new Date(),
  }).where(eq(bookingsTable.id, bookingId)).returning();
  if (!booking) {
    res.status(404).json({ error: "Not Found", message: "Booking not found" });
    return;
  }
  res.json({ ...booking, totalAmount: Number(booking.totalAmount), paidAmount: Number(booking.paidAmount) });
});

router.delete("/:bookingId", requireAuth, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const [booking] = await db.update(bookingsTable).set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(bookingsTable.id, bookingId)).returning();
  if (!booking) {
    res.status(404).json({ error: "Not Found", message: "Booking not found" });
    return;
  }
  res.json({ success: true, message: "Booking cancelled" });
});

router.patch("/:bookingId/status", requireAuth, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const { status } = req.body;
  const [booking] = await db.update(bookingsTable).set({ status, updatedAt: new Date() })
    .where(eq(bookingsTable.id, bookingId)).returning();
  if (!booking) {
    res.status(404).json({ error: "Not Found", message: "Booking not found" });
    return;
  }
  res.json({ ...booking, totalAmount: Number(booking.totalAmount), paidAmount: Number(booking.paidAmount) });
});

// POST /api/bookings/:bookingId/checkin — check in a guest
router.post("/:bookingId/checkin", requireAuth, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const user = (req as any).user;
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) {
    res.status(404).json({ error: "Not Found", message: "Booking not found" });
    return;
  }
  if (booking.status === "checked_in") {
    res.status(400).json({ error: "Гість вже заселений" });
    return;
  }
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
router.post("/:bookingId/checkout", requireAuth, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const user = (req as any).user;
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) {
    res.status(404).json({ error: "Not Found", message: "Booking not found" });
    return;
  }
  if (booking.status === "checked_out") {
    res.status(400).json({ error: "Гість вже виселений" });
    return;
  }
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
      lastVisit: new Date().toISOString().split("T")[0],
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
router.post("/:bookingId/cancel", requireAuth, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const user = (req as any).user;
  const { reason } = req.body;
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) {
    res.status(404).json({ error: "Not Found", message: "Booking not found" });
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
router.get("/:bookingId/qr", requireAuth, async (req, res) => {
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
router.post("/:bookingId/liqpay", requireAuth, async (req, res) => {
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

    if (!verifyLiqPayCallback(data, signature)) {
      logger.warn("LiqPay callback signature mismatch");
      res.status(403).json({ error: "Invalid signature" });
      return;
    }

    const parsed = parseLiqPayData(data);
    logger.info({ parsed }, "LiqPay callback received");

    const orderId: string = parsed.order_id || "";
    const match = orderId.match(/^booking-(\d+)/);
    if (!match) {
      res.status(400).json({ error: "Invalid order_id" });
      return;
    }

    const bookingId = parseInt(match[1]);
    const status = parsed.status;
    const amount = Number(parsed.amount || 0);

    if (status === "success" || status === "sandbox") {
      const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
      if (booking) {
        const newPaid = Number(booking.paidAmount) + amount;
        const total = Number(booking.totalAmount);
        const paymentStatus = newPaid >= total ? "paid" : "partial";

        await db.update(bookingsTable).set({
          paidAmount: String(newPaid),
          paymentStatus,
          updatedAt: new Date(),
        }).where(eq(bookingsTable.id, bookingId));

        await db.insert(paymentsTable).values({
          bookingId,
          amount: String(amount),
          method: "liqpay",
          status: "completed",
          reference: parsed.payment_id ? String(parsed.payment_id) : null,
          notes: `LiqPay: ${parsed.description || ""}`,
        });
      }
    }

    res.json({ result: "ok" });
  } catch (err) {
    logger.error({ err }, "LiqPay callback error");
    res.status(500).json({ error: "callback_error" });
  }
});

// POST /api/bookings/:bookingId/payment-link
router.post("/:bookingId/payment-link", requireAuth, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const { legalEntityId } = req.body;

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, booking.unitId)).limit(1);

    let publicKey = process.env.LIQPAY_PUBLIC_KEY || "sandbox_public_key";
    let privateKey = process.env.LIQPAY_PRIVATE_KEY || "sandbox_private_key";
    let entityName = "Maison HD";
    const isSandbox = !process.env.LIQPAY_PUBLIC_KEY;

    if (legalEntityId) {
      const { legalEntitiesTable } = await import("@workspace/db/schema");
      const [entity] = await db.select().from(legalEntitiesTable).where(eq(legalEntitiesTable.id, legalEntityId)).limit(1);
      if (entity) {
        if (entity.liqpayPublicKey) publicKey = entity.liqpayPublicKey;
        if (entity.liqpayPrivateKey) privateKey = entity.liqpayPrivateKey;
        entityName = entity.name;
      }
    }

    const amount = Number(booking.totalAmount) - Number(booking.paidAmount);
    const orderId = `booking-${bookingId}-${Date.now()}`;
    const description = `Бронювання #${bookingId} — ${unit?.name || "Номер"}`;

    const liqpayData = generateLiqPayForm({
      publicKey,
      privateKey,
      amount,
      currency: "UAH",
      description,
      orderId,
      serverUrl: `${process.env.APP_URL || ""}/api/bookings/liqpay-callback`,
      resultUrl: `${process.env.APP_URL || ""}/maison-hd/bookings/${bookingId}`,
    });

    const paymentLink = `https://www.liqpay.ua/api/3/checkout?data=${encodeURIComponent(liqpayData.data)}&signature=${encodeURIComponent(liqpayData.signature)}`;

    await db.update(bookingsTable).set({ paymentLink, legalEntityId: legalEntityId || null, updatedAt: new Date() })
      .where(eq(bookingsTable.id, bookingId));

    res.json({ paymentLink, isSandbox, entityName, amount, orderId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/bookings/:bookingId/invoice
router.get("/:bookingId/invoice", requireAuth, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const { legalEntityId, payerDetails } = req.query;

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, booking.unitId)).limit(1);
    let guestName = booking.lastName ? `${booking.lastName} ${booking.firstName || ""}`.trim() : null;
    if (!guestName && booking.guestId) {
      const [g] = await db.select({ firstName: guestsTable.firstName, lastName: guestsTable.lastName })
        .from(guestsTable).where(eq(guestsTable.id, booking.guestId)).limit(1);
      if (g) guestName = `${g.firstName} ${g.lastName}`;
    }

    let seller: any = { name: "Maison HD", address: "", edrpou: "", iban: "", bank: "" };
    if (legalEntityId) {
      const { legalEntitiesTable } = await import("@workspace/db/schema");
      const [entity] = await db.select().from(legalEntitiesTable).where(eq(legalEntitiesTable.id, parseInt(legalEntityId as string))).limit(1);
      if (entity) seller = entity;
    }

    const total = Number(booking.totalAmount);
    const paid = Number(booking.paidAmount);
    const due = total - paid;
    const nights = Math.round((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / 86400000);

    res.json({
      invoiceNumber: `INV-${bookingId}-${Date.now().toString(36).toUpperCase()}`,
      date: new Date().toISOString().split("T")[0],
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
      seller,
      buyer: payerDetails ? JSON.parse(payerDetails as string) : null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
