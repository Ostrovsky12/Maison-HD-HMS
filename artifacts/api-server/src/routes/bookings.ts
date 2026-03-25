import { Router } from "express";
import { db } from "@workspace/db";
import { bookingsTable, guestsTable, unitsTable, propertiesTable, bookingAddonsTable, addonsTable, paymentsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, inArray, desc, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { generateLiqPayForm, verifyLiqPayCallback, parseLiqPayData } from "../lib/liqpay.js";
import { generateBookingQR } from "../lib/qr.js";
import { logger } from "../lib/logger.js";

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
