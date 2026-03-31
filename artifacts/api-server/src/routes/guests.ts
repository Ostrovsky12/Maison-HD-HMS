import { Router } from "express";
import { db } from "@workspace/db";
import { guestsTable, bookingsTable, unitsTable, propertiesTable } from "@workspace/db/schema";
import { eq, and, ilike, or, sql, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

const formatGuest = (g: any) => ({
  ...g,
  ltv: Number(g.ltv),
  totalSpent: g.totalSpent ? Number(g.totalSpent) : 0,
});

router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const search = req.query.search as string | undefined;
  const page = parseInt(req.query.page as string || "1");
  const limit = parseInt(req.query.limit as string || "50");
  const offset = (page - 1) * limit;

  let conditions: any[] = [];
  if (orgId) conditions.push(eq(guestsTable.organizationId, orgId));
  if (search) {
    conditions.push(or(
      ilike(guestsTable.firstName, `%${search}%`),
      ilike(guestsTable.lastName, `%${search}%`),
      ilike(guestsTable.email, `%${search}%`),
      ilike(guestsTable.phone, `%${search}%`),
      ilike(guestsTable.passportNumber, `%${search}%`),
    )!);
  }

  const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(guestsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  const guests = await db.select().from(guestsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(limit).offset(offset)
    .orderBy(desc(guestsTable.createdAt));

  res.json({
    guests: guests.map(formatGuest),
    total: Number(countRow?.count || 0),
    page,
    limit,
  });
});

router.post("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  if (!orgId) {
    res.status(400).json({ error: "Bad Request", message: "No organization" });
    return;
  }
  const {
    firstName, lastName, middleName,
    email, phone, passportNumber, nationality, birthDate, address, notes,
    loyaltyLevel, preferences, tags,
  } = req.body;

  const [guest] = await db.insert(guestsTable).values({
    organizationId: orgId,
    firstName,
    lastName,
    middleName: middleName || null,
    email,
    phone,
    passportNumber: passportNumber || null,
    nationality: nationality || null,
    birthDate: birthDate || null,
    address: address || null,
    notes,
    loyaltyLevel: loyaltyLevel || "bronze",
    preferences: preferences || [],
    tags: tags || [],
  }).returning();
  res.status(201).json(formatGuest(guest));
});

router.get("/:guestId", requireAuth, async (req, res) => {
  const guestId = parseInt(req.params.guestId);
  const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, guestId)).limit(1);
  if (!guest) {
    res.status(404).json({ error: "Not Found", message: "Guest not found" });
    return;
  }
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
    unitName: unitsTable.name,
  }).from(bookingsTable)
    .leftJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
    .where(eq(bookingsTable.guestId, guestId))
    .orderBy(desc(bookingsTable.checkIn));

  res.json({
    ...formatGuest(guest),
    bookings: bookings.map(b => ({
      ...b,
      totalAmount: Number(b.totalAmount),
      paidAmount: Number(b.paidAmount),
      guestName: `${guest.firstName} ${guest.lastName}`,
    })),
  });
});

router.put("/:guestId", requireAuth, async (req, res) => {
  const guestId = parseInt(req.params.guestId);
  const {
    firstName, lastName, middleName,
    email, phone, passportNumber, nationality, birthDate, address, notes,
    loyaltyLevel, loyaltyPoints, totalNights, totalSpent, preferences, tags,
  } = req.body;

  const [guest] = await db.update(guestsTable).set({
    ...(firstName !== undefined && { firstName }),
    ...(lastName !== undefined && { lastName }),
    ...(middleName !== undefined && { middleName }),
    ...(email !== undefined && { email }),
    ...(phone !== undefined && { phone }),
    ...(passportNumber !== undefined && { passportNumber }),
    ...(nationality !== undefined && { nationality }),
    ...(birthDate !== undefined && { birthDate }),
    ...(address !== undefined && { address }),
    ...(notes !== undefined && { notes }),
    ...(loyaltyLevel !== undefined && { loyaltyLevel }),
    ...(loyaltyPoints !== undefined && { loyaltyPoints }),
    ...(totalNights !== undefined && { totalNights }),
    ...(totalSpent !== undefined && { totalSpent: String(totalSpent) }),
    ...(preferences !== undefined && { preferences }),
    ...(tags !== undefined && { tags }),
    updatedAt: new Date(),
  }).where(eq(guestsTable.id, guestId)).returning();
  if (!guest) {
    res.status(404).json({ error: "Not Found", message: "Guest not found" });
    return;
  }
  res.json(formatGuest(guest));
});

export default router;
