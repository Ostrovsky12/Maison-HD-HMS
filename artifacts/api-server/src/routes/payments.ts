import { Router } from "express";
import { db } from "@workspace/db";
import { paymentsTable, bookingsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const { bookingId } = req.query;
  const payments = bookingId
    ? await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, parseInt(bookingId as string)))
    : await db.select().from(paymentsTable);

  res.json(payments.map(p => ({ ...p, amount: Number(p.amount) })));
});

router.post("/", requireAuth, async (req, res) => {
  const { bookingId, amount, method, notes } = req.body;

  const [payment] = await db.insert(paymentsTable).values({
    bookingId,
    amount: String(amount),
    method: method || "cash",
    status: "completed",
    notes,
  }).returning();

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (booking) {
    const newPaidAmount = Number(booking.paidAmount) + amount;
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
