import { Router } from "express";
import { db } from "@workspace/db";
import { bookingsTable, guestsTable, unitsTable, propertiesTable, bookingAddonsTable, addonsTable, paymentsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, inArray, desc, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

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

export default router;
