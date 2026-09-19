import { Router } from "express";
import { db } from "@workspace/db";
import { nightAuditsTable, auditLogsTable, bookingsTable, unitsTable, propertiesTable, usersTable } from "@workspace/db/schema";
import { eq, and, gte, lte, inArray, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/night", requireAuth, async (req, res) => {
  const limit = parseInt((req.query.limit as string) || "30");

  const audits = await db.select().from(nightAuditsTable)
    .orderBy(desc(nightAuditsTable.auditDate))
    .limit(limit);

  res.json(audits);
});

router.post("/night", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { auditDate } = req.body || {};
  const targetDate = auditDate || new Date().toISOString().split("T")[0];

  const errors: string[] = [];
  const warnings: string[] = [];

  let totalUnits = 0;
  let occupiedUnits = 0;
  let totalGuests = 0;
  let newCheckins = 0;
  let checkouts = 0;
  let newBookings = 0;
  let cancellations = 0;
  let accommodationRevenue = 0;

  try {
    let propIds: number[] = [];
    if (user.organizationId) {
      const props = await db.select({ id: propertiesTable.id }).from(propertiesTable)
        .where(eq(propertiesTable.organizationId, user.organizationId));
      propIds = props.map(p => p.id);
    }

    const units = await db.select({ id: unitsTable.id }).from(unitsTable)
      .where(propIds.length > 0 ? inArray(unitsTable.propertyId, propIds) : undefined);
    totalUnits = units.length;
    const unitIds = units.map(u => u.id);

    if (unitIds.length > 0) {
      const occupiedBookings = await db.select({
        id: bookingsTable.id,
        guestsCount: bookingsTable.guestsCount,
        totalAmount: bookingsTable.totalAmount,
        status: bookingsTable.status,
        checkIn: bookingsTable.checkIn,
        checkOut: bookingsTable.checkOut,
        createdAt: bookingsTable.createdAt,
      }).from(bookingsTable)
        .where(and(
          inArray(bookingsTable.unitId, unitIds),
          lte(bookingsTable.checkIn, targetDate),
          gte(bookingsTable.checkOut, targetDate)
        ));

      occupiedUnits = occupiedBookings.filter(b => ["checked_in", "confirmed"].includes(b.status)).length;
      totalGuests = occupiedBookings.reduce((sum, b) => sum + (b.guestsCount || 0), 0);
      accommodationRevenue = occupiedBookings
        .filter(b => b.status === "checked_in")
        .reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);

      const checkinsToday = await db.select({ id: bookingsTable.id }).from(bookingsTable)
        .where(and(
          inArray(bookingsTable.unitId, unitIds),
          eq(bookingsTable.checkIn, targetDate),
          eq(bookingsTable.status, "checked_in")
        ));
      newCheckins = checkinsToday.length;

      const checkoutsToday = await db.select({ id: bookingsTable.id }).from(bookingsTable)
        .where(and(
          inArray(bookingsTable.unitId, unitIds),
          eq(bookingsTable.checkOut, targetDate)
        ));
      checkouts = checkoutsToday.length;

      const newBookingsToday = await db.select({ id: bookingsTable.id }).from(bookingsTable)
        .where(and(
          inArray(bookingsTable.unitId, unitIds),
          gte(bookingsTable.createdAt, new Date(targetDate + "T00:00:00")),
          lte(bookingsTable.createdAt, new Date(targetDate + "T23:59:59"))
        ));
      newBookings = newBookingsToday.length;

      const cancelledToday = await db.select({ id: bookingsTable.id }).from(bookingsTable)
        .where(and(
          inArray(bookingsTable.unitId, unitIds),
          eq(bookingsTable.status, "cancelled"),
          gte(bookingsTable.updatedAt, new Date(targetDate + "T00:00:00")),
          lte(bookingsTable.updatedAt, new Date(targetDate + "T23:59:59"))
        ));
      cancellations = cancelledToday.length;
    }
  } catch (err: any) {
    errors.push(`Audit error: ${err.message}`);
  }

  const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

  const [audit] = await db.insert(nightAuditsTable).values({
    auditDate: targetDate,
    totalUnits,
    occupiedUnits,
    occupancyRate,
    totalRevenue: accommodationRevenue,
    accommodationRevenue,
    servicesRevenue: 0,
    totalGuests,
    newCheckins,
    checkouts,
    newBookings,
    cancellations,
    status: errors.length > 0 ? "failed" : "completed",
    performedById: user.id,
    performedAt: new Date(),
    errors,
    warnings,
  }).returning();

  res.status(201).json(audit);
});

router.get("/logs", requireAuth, async (req, res) => {
  const { entityType, entityId, limit } = req.query;
  const maxLimit = parseInt((limit as string) || "50");

  const conditions: any[] = [];
  if (entityType) conditions.push(eq(auditLogsTable.entityType, entityType as string));
  if (entityId) conditions.push(eq(auditLogsTable.entityId, parseInt(entityId as string)));

  const logs = await db.select().from(auditLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(maxLimit);

  res.json(logs);
});

export default router;
