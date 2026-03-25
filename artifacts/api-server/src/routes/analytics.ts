import { Router } from "express";
import { db } from "@workspace/db";
import { bookingsTable, unitsTable, propertiesTable, paymentsTable, guestsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, inArray, count, sum, sql, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/dashboard", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { dateFrom, dateTo } = req.query;
  const from = (dateFrom as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const to = (dateTo as string) || new Date().toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  let propIds: number[] = [];
  if (user.organizationId) {
    const props = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, user.organizationId));
    propIds = props.map(p => p.id);
  }

  let unitIds: number[] = [];
  if (propIds.length > 0) {
    const units = await db.select({ id: unitsTable.id }).from(unitsTable)
      .where(inArray(unitsTable.propertyId, propIds));
    unitIds = units.map(u => u.id);
  }

  const baseConditions: any[] = [];
  if (unitIds.length > 0) baseConditions.push(inArray(bookingsTable.unitId, unitIds));
  baseConditions.push(gte(bookingsTable.checkIn, from));
  baseConditions.push(lte(bookingsTable.checkIn, to));

  const allBookings = await db.select().from(bookingsTable)
    .where(baseConditions.length > 0 ? and(...baseConditions) : undefined);

  const activeBookings = allBookings.filter(b => b.status !== "cancelled");
  const totalRevenue = activeBookings.reduce((s, b) => s + Number(b.totalAmount), 0);
  const totalBookings = activeBookings.length;

  const nights = Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)));
  const totalUnitNights = unitIds.length * nights;
  const occupiedNights = activeBookings.reduce((s, b) => {
    const ci = new Date(b.checkIn);
    const co = new Date(b.checkOut);
    return s + Math.ceil((co.getTime() - ci.getTime()) / (1000 * 60 * 60 * 24));
  }, 0);
  const occupancyRate = totalUnitNights > 0 ? Math.min(100, (occupiedNights / totalUnitNights) * 100) : 0;
  const adr = occupiedNights > 0 ? totalRevenue / occupiedNights : 0;

  const checkedInToday = await db.select({ count: count() }).from(bookingsTable)
    .where(and(
      unitIds.length > 0 ? inArray(bookingsTable.unitId, unitIds) : sql`true`,
      eq(bookingsTable.checkIn, today),
      inArray(bookingsTable.status, ["confirmed", "checked_in"])
    ));

  const checkingOutToday = await db.select({ count: count() }).from(bookingsTable)
    .where(and(
      unitIds.length > 0 ? inArray(bookingsTable.unitId, unitIds) : sql`true`,
      eq(bookingsTable.checkOut, today),
      inArray(bookingsTable.status, ["checked_in", "confirmed"])
    ));

  const pendingBookings = allBookings.filter(b => b.status === "pending").length;

  const revenueByProperty = await Promise.all(propIds.map(async (pid) => {
    const propUnits = await db.select({ id: unitsTable.id }).from(unitsTable).where(eq(unitsTable.propertyId, pid));
    const pUnitIds = propUnits.map(u => u.id);
    const [prop] = await db.select({ name: propertiesTable.name }).from(propertiesTable).where(eq(propertiesTable.id, pid)).limit(1);
    if (pUnitIds.length === 0) return { propertyId: pid, propertyName: prop?.name || "", revenue: 0, bookings: 0 };
    const bks = activeBookings.filter(b => pUnitIds.includes(b.unitId));
    return {
      propertyId: pid,
      propertyName: prop?.name || "",
      revenue: bks.reduce((s, b) => s + Number(b.totalAmount), 0),
      bookings: bks.length,
    };
  }));

  const sourceMap: Record<string, number> = {};
  activeBookings.forEach(b => { sourceMap[b.source] = (sourceMap[b.source] || 0) + 1; });
  const bookingsBySource = Object.entries(sourceMap).map(([source, c]) => ({
    source,
    count: c,
    percentage: totalBookings > 0 ? (c / totalBookings) * 100 : 0,
  }));

  const recentBookings = await db.select({
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
    .where(unitIds.length > 0 ? inArray(bookingsTable.unitId, unitIds) : undefined)
    .orderBy(desc(bookingsTable.createdAt))
    .limit(10);

  res.json({
    occupancyRate: Math.round(occupancyRate * 10) / 10,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalBookings,
    adr: Math.round(adr * 100) / 100,
    checkedInToday: Number(checkedInToday[0]?.count || 0),
    checkingOutToday: Number(checkingOutToday[0]?.count || 0),
    pendingBookings,
    revenueByProperty,
    bookingsBySource,
    recentBookings: recentBookings.map(b => ({
      ...b,
      totalAmount: Number(b.totalAmount),
      paidAmount: Number(b.paidAmount),
    })),
  });
});

router.get("/occupancy", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { dateFrom, dateTo } = req.query;
  const from = (dateFrom as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const to = (dateTo as string) || new Date().toISOString().split("T")[0];

  let propIds: number[] = [];
  if (user.organizationId) {
    const props = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, user.organizationId));
    propIds = props.map(p => p.id);
  }
  const units = propIds.length > 0
    ? await db.select({ id: unitsTable.id }).from(unitsTable).where(inArray(unitsTable.propertyId, propIds))
    : await db.select({ id: unitsTable.id }).from(unitsTable);
  const unitIds = units.map(u => u.id);
  const totalUnits = unitIds.length;

  const bookings = unitIds.length > 0
    ? await db.select().from(bookingsTable)
        .where(and(
          inArray(bookingsTable.unitId, unitIds),
          gte(bookingsTable.checkIn, from),
          lte(bookingsTable.checkOut, to),
          sql`${bookingsTable.status} != 'cancelled'`
        ))
    : [];

  const result: any[] = [];
  const current = new Date(from);
  const end = new Date(to);
  while (current <= end) {
    const dateStr = current.toISOString().split("T")[0];
    const occupied = bookings.filter(b => b.checkIn <= dateStr && b.checkOut > dateStr).length;
    const revenue = bookings
      .filter(b => b.checkIn <= dateStr && b.checkOut > dateStr)
      .reduce((s, b) => {
        const nights = Math.ceil((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / (1000 * 60 * 60 * 24));
        return s + Number(b.totalAmount) / Math.max(1, nights);
      }, 0);

    result.push({
      date: dateStr,
      occupiedUnits: occupied,
      totalUnits,
      occupancyRate: totalUnits > 0 ? Math.round((occupied / totalUnits) * 1000) / 10 : 0,
      revenue: Math.round(revenue * 100) / 100,
    });
    current.setDate(current.getDate() + 1);
  }

  res.json(result);
});

export default router;
