import { Router } from "express";
import { db } from "@workspace/db";
import { bookingsTable, guestsTable, unitsTable, propertiesTable, bookingAddonsTable, addonsTable, paymentsTable, notificationsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, inArray, desc, sql, or, ne } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { generateLiqPayForm, verifyLiqPayCallback, parseLiqPayData } from "../lib/liqpay.js";
import { generateBookingQR } from "../lib/qr.js";
import { logger } from "../lib/logger.js";

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
    guestName: sql<string>`concat(${guestsTable.firstName}, ' ', ${guestsTable.lastName})`,
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
  const { unitId, guestId, checkIn, checkOut, status, source, guestsCount, totalAmount, notes } = req.body;
  const [booking] = await db.insert(bookingsTable).values({
    unitId,
    guestId,
    checkIn,
    checkOut,
    status: status || "confirmed",
    source: source || "direct",
    guestsCount: guestsCount || 1,
    totalAmount: String(totalAmount || 0),
    notes,
  }).returning();

  await db.update(guestsTable).set({
    bookingCount: sql`${guestsTable.bookingCount} + 1`,
    ltv: sql`${guestsTable.ltv} + ${String(totalAmount || 0)}`,
    updatedAt: new Date(),
  }).where(eq(guestsTable.id, guestId));

  const [g] = await db.select().from(guestsTable).where(eq(guestsTable.id, guestId)).limit(1);
  const [u] = await db.select().from(unitsTable).where(eq(unitsTable.id, unitId)).limit(1);

  res.status(201).json({
    ...booking,
    totalAmount: Number(booking.totalAmount),
    paidAmount: Number(booking.paidAmount),
    guestName: g ? `${g.firstName} ${g.lastName}` : null,
    unitName: u?.name || null,
  });
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

  const propertiesData = propIds.length > 0
    ? await db.select({ id: propertiesTable.id, name: propertiesTable.name })
        .from(propertiesTable).where(inArray(propertiesTable.id, propIds))
    : [];
  const propNameMap = new Map(propertiesData.map((p: any) => [p.id, p.name]));

  let unitConditions: any[] = [];
  if (propIds.length > 0) unitConditions.push(inArray(unitsTable.propertyId, propIds));
  if (categoryFilter) unitConditions.push(sql`${unitsTable.category} = ${categoryFilter}`);

  const unitRows = await db.select().from(unitsTable)
    .where(unitConditions.length > 0 ? and(...unitConditions) : undefined);

  const units = unitRows.map((u: any) => ({
    id: u.id,
    name: u.name,
    category: u.category || "Без категорії",
    propertyId: u.propertyId,
    propertyName: propNameMap.get(u.propertyId) || "",
    hasView: u.hasView ?? false,
    hasBalcony: u.hasBalcony ?? false,
    squareMeters: u.squareMeters ? Number(u.squareMeters) : null,
    maxCapacity: u.maxCapacity ?? null,
  }));

  const unitIds = units.map((u: any) => u.id);
  if (unitIds.length === 0) {
    res.json({ units: [], bookings: [], dates, startDate, days });
    return;
  }

  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];

  const bookingRows = await db.select({
    id: bookingsTable.id,
    unitId: bookingsTable.unitId,
    guestId: bookingsTable.guestId,
    checkIn: bookingsTable.checkIn,
    checkOut: bookingsTable.checkOut,
    status: bookingsTable.status,
    guestsCount: bookingsTable.guestsCount,
    totalAmount: bookingsTable.totalAmount,
  }).from(bookingsTable).where(
    and(
      inArray(bookingsTable.unitId, unitIds),
      ne(bookingsTable.status, "cancelled"),
      lte(bookingsTable.checkIn, endStr),
      gte(bookingsTable.checkOut, startStr),
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
    return {
      id: b.id,
      unitId: b.unitId,
      guestName: guestMap.get(b.guestId) || "Гість",
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      status: b.status,
      nights,
      guestsCount: b.guestsCount || 1,
      totalAmount: Number(b.totalAmount || 0),
      color: bookingColor(b.id),
    };
  });

  res.json({ units, bookings, dates, startDate, days });
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
  const base = Number(unit.basePrice || 0);
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
  const { checkIn, checkOut, status, paymentStatus, source, guestsCount, totalAmount, notes } = req.body;
  const [booking] = await db.update(bookingsTable).set({
    ...(checkIn !== undefined && { checkIn }),
    ...(checkOut !== undefined && { checkOut }),
    ...(status !== undefined && { status }),
    ...(paymentStatus !== undefined && { paymentStatus }),
    ...(source !== undefined && { source }),
    ...(guestsCount !== undefined && { guestsCount }),
    ...(totalAmount !== undefined && { totalAmount: String(totalAmount) }),
    ...(notes !== undefined && { notes }),
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

export default router;
