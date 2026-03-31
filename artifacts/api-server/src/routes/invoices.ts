import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable, bookingsTable, guestsTable, usersTable, propertiesTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `INV-${year}${month}${day}-${rand}`;
}

async function fetchInvoiceWithJoins(invoiceId: number) {
  const [invoice] = await db.select({
    id: invoicesTable.id,
    invoiceNumber: invoicesTable.invoiceNumber,
    bookingId: invoicesTable.bookingId,
    guestId: invoicesTable.guestId,
    invoiceType: invoicesTable.invoiceType,
    status: invoicesTable.status,
    amount: invoicesTable.amount,
    taxAmount: invoicesTable.taxAmount,
    paidAmount: invoicesTable.paidAmount,
    currency: invoicesTable.currency,
    paymentMethod: invoicesTable.paymentMethod,
    description: invoicesTable.description,
    dueDate: invoicesTable.dueDate,
    paidAt: invoicesTable.paidAt,
    createdAt: invoicesTable.createdAt,
    guestFirstName: guestsTable.firstName,
    guestLastName: guestsTable.lastName,
  }).from(invoicesTable)
    .leftJoin(guestsTable, eq(invoicesTable.guestId, guestsTable.id))
    .where(eq(invoicesTable.id, invoiceId))
    .limit(1);

  if (!invoice) return null;

  const guestName = invoice.guestFirstName
    ? `${invoice.guestFirstName} ${invoice.guestLastName || ""}`.trim()
    : null;

  return { ...invoice, guestName };
}

router.get("/", requireAuth, async (req, res) => {
  const { bookingId, status, guestId } = req.query;

  const conditions: any[] = [];
  if (bookingId) conditions.push(eq(invoicesTable.bookingId, parseInt(bookingId as string)));
  if (status) conditions.push(eq(invoicesTable.status, status as any));
  if (guestId) conditions.push(eq(invoicesTable.guestId, parseInt(guestId as string)));

  const invoices = await db.select({
    id: invoicesTable.id,
    invoiceNumber: invoicesTable.invoiceNumber,
    bookingId: invoicesTable.bookingId,
    guestId: invoicesTable.guestId,
    invoiceType: invoicesTable.invoiceType,
    status: invoicesTable.status,
    amount: invoicesTable.amount,
    taxAmount: invoicesTable.taxAmount,
    paidAmount: invoicesTable.paidAmount,
    currency: invoicesTable.currency,
    paymentMethod: invoicesTable.paymentMethod,
    description: invoicesTable.description,
    dueDate: invoicesTable.dueDate,
    paidAt: invoicesTable.paidAt,
    createdAt: invoicesTable.createdAt,
    guestFirstName: guestsTable.firstName,
    guestLastName: guestsTable.lastName,
  }).from(invoicesTable)
    .leftJoin(guestsTable, eq(invoicesTable.guestId, guestsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(invoicesTable.createdAt));

  const result = invoices.map(inv => ({
    ...inv,
    guestName: inv.guestFirstName
      ? `${inv.guestFirstName} ${inv.guestLastName || ""}`.trim()
      : null,
  }));

  res.json(result);
});

router.post("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { bookingId, guestId, invoiceType, amount, taxAmount, currency, description, dueDate } = req.body;

  const [invoice] = await db.insert(invoicesTable).values({
    invoiceNumber: generateInvoiceNumber(),
    bookingId,
    guestId,
    invoiceType: invoiceType || "accommodation",
    amount: String(amount),
    taxAmount: String(taxAmount || 0),
    paidAmount: "0",
    currency: currency || "UAH",
    description,
    dueDate: dueDate ? new Date(dueDate) : null,
    createdById: user.id,
  }).returning();

  const result = await fetchInvoiceWithJoins(invoice.id);
  res.status(201).json(result || invoice);
});

router.get("/:invoiceId", requireAuth, async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId);
  const result = await fetchInvoiceWithJoins(invoiceId);
  if (!result) {
    res.status(404).json({ error: "Not Found", message: "Invoice not found" });
    return;
  }
  res.json(result);
});

router.put("/:invoiceId", requireAuth, async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId);
  const { invoiceType, status, amount, description, dueDate } = req.body;

  const [invoice] = await db.update(invoicesTable).set({
    ...(invoiceType !== undefined && { invoiceType }),
    ...(status !== undefined && { status }),
    ...(amount !== undefined && { amount: String(amount) }),
    ...(description !== undefined && { description }),
    ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
    updatedAt: new Date(),
  }).where(eq(invoicesTable.id, invoiceId)).returning();

  if (!invoice) {
    res.status(404).json({ error: "Not Found", message: "Invoice not found" });
    return;
  }
  const result = await fetchInvoiceWithJoins(invoiceId);
  res.json(result || invoice);
});

router.post("/:invoiceId/pay", requireAuth, async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId);
  const { paymentMethod, paidAmount } = req.body;

  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Not Found", message: "Invoice not found" });
    return;
  }

  const finalPaidAmount = paidAmount !== undefined ? String(paidAmount) : existing.amount;

  const [invoice] = await db.update(invoicesTable).set({
    status: "paid",
    paymentMethod,
    paidAmount: finalPaidAmount,
    paidAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(invoicesTable.id, invoiceId)).returning();

  const result = await fetchInvoiceWithJoins(invoiceId);
  res.json(result || invoice);
});

export default router;
