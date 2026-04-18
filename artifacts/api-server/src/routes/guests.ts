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

// GET /api/guests/export — CSV export of all guests
router.get("/export", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  if (!orgId) { res.status(400).json({ error: "No organization" }); return; }

  const guests = await db
    .select({
      id: guestsTable.id,
      lastName: guestsTable.lastName,
      firstName: guestsTable.firstName,
      middleName: guestsTable.middleName,
      birthDate: guestsTable.birthDate,
      phone: guestsTable.phone,
      email: guestsTable.email,
      nationality: guestsTable.nationality,
      passportNumber: guestsTable.passportNumber,
      bookingCount: guestsTable.bookingCount,
      totalNights: guestsTable.totalNights,
      totalSpent: guestsTable.totalSpent,
      ltv: guestsTable.ltv,
      loyaltyLevel: guestsTable.loyaltyLevel,
      lastVisit: guestsTable.lastVisit,
      notes: guestsTable.notes,
      createdAt: guestsTable.createdAt,
    })
    .from(guestsTable)
    .where(eq(guestsTable.organizationId, orgId))
    .orderBy(desc(guestsTable.createdAt));

  const headers = [
    "ID", "Прізвище", "Ім'я", "По батькові",
    "Дата народження", "Телефон", "Email",
    "Громадянство", "Документ",
    "Відвідувань", "Ночей", "Витрачено (грн)", "LTV (грн)",
    "Рівень лояльності", "Останній візит", "Нотатки", "Дата реєстрації",
  ];

  const loyaltyLabels: Record<string, string> = {
    bronze: "Бронза", silver: "Срібло", gold: "Золото", platinum: "Платина",
  };

  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = guests.map(g => [
    g.id,
    g.lastName,
    g.firstName,
    g.middleName || "",
    g.birthDate || "",
    g.phone || "",
    g.email || "",
    g.nationality || "",
    g.passportNumber || "",
    g.bookingCount ?? 0,
    g.totalNights ?? 0,
    g.totalSpent ? Number(g.totalSpent).toFixed(0) : "0",
    g.ltv ? Number(g.ltv).toFixed(0) : "0",
    g.loyaltyLevel ? (loyaltyLabels[g.loyaltyLevel] || g.loyaltyLevel) : "",
    g.lastVisit ? new Date(g.lastVisit).toLocaleDateString("uk-UA") : "",
    g.notes || "",
    g.createdAt ? new Date(g.createdAt).toLocaleDateString("uk-UA") : "",
  ].map(escape).join(","));

  const csv = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="guests_${date}.csv"`);
  res.send(csv);
});

// GET /api/guests/search?q= — quick autocomplete search
router.get("/search", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const q = (req.query.q as string || "").trim();
  const limit = Math.min(parseInt(req.query.limit as string || "10"), 30);

  if (q.length < 1) {
    res.json({ guests: [] });
    return;
  }

  const conditions: any[] = [];
  if (user.organizationId) conditions.push(eq(guestsTable.organizationId, user.organizationId));
  conditions.push(
    or(
      ilike(guestsTable.firstName, `%${q}%`),
      ilike(guestsTable.lastName, `%${q}%`),
      ilike(guestsTable.email, `%${q}%`),
      ilike(guestsTable.phone, `%${q}%`),
    )
  );

  const guests = await db.select({
    id: guestsTable.id,
    firstName: guestsTable.firstName,
    lastName: guestsTable.lastName,
    middleName: guestsTable.middleName,
    phone: guestsTable.phone,
    email: guestsTable.email,
    loyaltyLevel: guestsTable.loyaltyLevel,
    totalNights: guestsTable.totalNights,
  }).from(guestsTable)
    .where(and(...conditions))
    .orderBy(desc(guestsTable.totalNights))
    .limit(limit);

  res.json({ guests });
});

router.get("/:guestId", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const guestId = parseInt(req.params.guestId);
  const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, guestId)).limit(1);
  if (!guest) {
    res.status(404).json({ error: "Not Found", message: "Guest not found" });
    return;
  }
  if (user.role !== "super_admin" && user.organizationId && guest.organizationId !== user.organizationId) {
    res.status(403).json({ error: "Forbidden", message: "Access denied" });
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
    propertyId: unitsTable.propertyId,
    propertyName: propertiesTable.name,
  }).from(bookingsTable)
    .leftJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
    .leftJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
    .where(eq(bookingsTable.guestId, guestId))
    .orderBy(desc(bookingsTable.checkIn));

  // Recalculate live stats from actual bookings
  const completedBookings = bookings.filter(b => b.status !== "cancelled");
  const totalNightsCalc = completedBookings.reduce((acc, b) => {
    if (!b.checkIn || !b.checkOut) return acc;
    const nights = Math.round((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / 86400000);
    return acc + Math.max(0, nights);
  }, 0);
  const totalSpentCalc = completedBookings.reduce((acc, b) => acc + Number(b.totalAmount || 0), 0);
  const lastVisitCalc = completedBookings.length > 0
    ? completedBookings.reduce((latest, b) => b.checkOut > latest ? b.checkOut : latest, completedBookings[0].checkOut)
    : null;

  res.json({
    ...formatGuest(guest),
    totalBookings: completedBookings.length,
    totalRevenue: totalSpentCalc,
    totalNightsCalc,
    lastVisitCalc,
    bookings: bookings.map(b => {
      const nights = (b.checkIn && b.checkOut)
        ? Math.round((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / 86400000)
        : 0;
      return {
        ...b,
        nights: Math.max(0, nights),
        totalAmount: Number(b.totalAmount),
        paidAmount: Number(b.paidAmount),
        guestName: `${guest.firstName} ${guest.lastName}`,
      };
    }),
  });
});

router.put("/:guestId", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const guestId = parseInt(req.params.guestId);
  if (user.role !== "super_admin" && user.organizationId) {
    const [existing] = await db.select({ orgId: guestsTable.organizationId })
      .from(guestsTable).where(eq(guestsTable.id, guestId)).limit(1);
    if (!existing || existing.orgId !== user.organizationId) {
      res.status(403).json({ error: "Forbidden", message: "Access denied" });
      return;
    }
  }
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
