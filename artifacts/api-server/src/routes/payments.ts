import { Router } from "express";
import { db } from "@workspace/db";
import { paymentsTable, bookingsTable, unitsTable, propertiesTable } from "@workspace/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// Helper: verify booking belongs to the caller's org (returns booking or null)
async function getBookingForOrg(bookingId: number, orgId: number) {
  const [booking] = await db
    .select({
      id: bookingsTable.id,
      unitId: bookingsTable.unitId,
      totalAmount: bookingsTable.totalAmount,
      paidAmount: bookingsTable.paidAmount,
      paymentStatus: bookingsTable.paymentStatus,
      organizationId: bookingsTable.organizationId,
    })
    .from(bookingsTable)
    .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
    .innerJoin(propertiesTable, and(
      eq(unitsTable.propertyId, propertiesTable.id),
      eq(propertiesTable.organizationId, orgId),
    ))
    .where(eq(bookingsTable.id, bookingId))
    .limit(1);
  return booking ?? null;
}

router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { bookingId } = req.query;

  if (bookingId) {
    // Verify booking belongs to caller's org before returning its payments
    if (user.organizationId) {
      const booking = await getBookingForOrg(parseInt(bookingId as string), user.organizationId);
      if (!booking) {
        res.status(403).json({ error: "Forbidden", message: "Booking not found in your organization" });
        return;
      }
    }
    const payments = await db.select().from(paymentsTable)
      .where(eq(paymentsTable.bookingId, parseInt(bookingId as string)));
    res.json(payments.map(p => ({ ...p, amount: Number(p.amount) })));
    return;
  }

  // List all payments scoped to org via booking→unit→property join
  if (!user.organizationId && user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const payments = user.role === "super_admin"
    ? await db.select().from(paymentsTable)
    : await db.select({
        id: paymentsTable.id,
        bookingId: paymentsTable.bookingId,
        amount: paymentsTable.amount,
        method: paymentsTable.method,
        status: paymentsTable.status,
        notes: paymentsTable.notes,
        createdAt: paymentsTable.createdAt,
      }).from(paymentsTable)
        .innerJoin(bookingsTable, eq(paymentsTable.bookingId, bookingsTable.id))
        .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
        .innerJoin(propertiesTable, and(
          eq(unitsTable.propertyId, propertiesTable.id),
          eq(propertiesTable.organizationId, user.organizationId),
        ));

  res.json(payments.map(p => ({ ...p, amount: Number(p.amount) })));
});

router.post("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { bookingId, amount, method, notes } = req.body;

  if (!bookingId || amount === undefined) {
    res.status(400).json({ error: "bookingId and amount are required" });
    return;
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    res.status(422).json({ error: "amount must be a positive number" });
    return;
  }

  // Verify booking belongs to caller's org before accepting payment
  if (user.organizationId) {
    const booking = await getBookingForOrg(bookingId, user.organizationId);
    if (!booking) {
      res.status(403).json({ error: "Forbidden", message: "Booking not found in your organization" });
      return;
    }
  }

  const [payment] = await db.insert(paymentsTable).values({
    bookingId,
    amount: String(numAmount),
    method: method || "cash",
    status: "completed",
    notes,
  }).returning();

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (booking) {
    const newPaidAmount = Number(booking.paidAmount) + numAmount;
    const totalAmount = Number(booking.totalAmount);
    let paymentStatus: "unpaid" | "partial" | "paid" = "unpaid";
    if (newPaidAmount >= totalAmount) paymentStatus = "paid";
    else if (newPaidAmount > 0) paymentStatus = "partial";

    await db.update(bookingsTable).set({
      paidAmount: String(newPaidAmount),
      paymentStatus,
      updatedAt: new Date(),
    }).where(eq(bookingsTable.id, bookingId));
  }

  res.status(201).json({ ...payment, amount: Number(payment.amount) });
});

export default router;
