import { Router } from "express";
import { db } from "@workspace/db";
import { bookingsTable, unitsTable, propertiesTable, paymentsTable, guestsTable, kpiHistoryTable, forecastsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, inArray, count, sum, sql, desc, asc } from "drizzle-orm";
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

router.get("/kpi", requireAuth, async (req, res) => {
  const { days } = req.query;
  const daysNum = parseInt(days as string) || 90;
  const fromDate = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const kpis = await db.select().from(kpiHistoryTable)
    .where(gte(kpiHistoryTable.date, fromDate))
    .orderBy(asc(kpiHistoryTable.date));

  res.json(kpis);
});

router.post("/kpi/generate", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const today = new Date().toISOString().split("T")[0];
  const from30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

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
          gte(bookingsTable.checkIn, from30),
          lte(bookingsTable.checkIn, today),
          sql`${bookingsTable.status} != 'cancelled'`
        ))
    : [];

  const totalRevenue = bookings.reduce((s, b) => s + Number(b.totalAmount), 0);
  const occupiedNights = bookings.reduce((s, b) => {
    return s + Math.max(1, Math.ceil((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / (1000 * 60 * 60 * 24)));
  }, 0);
  const availableNights = totalUnits * 30;
  const occupancyRate = availableNights > 0 ? (occupiedNights / availableNights) * 100 : 0;
  const adr = occupiedNights > 0 ? totalRevenue / occupiedNights : 0;
  const revpar = totalUnits > 0 ? totalRevenue / (totalUnits * 30) : 0;

  const checkins = bookings.filter(b => b.checkIn === today).length;
  const checkouts = bookings.filter(b => b.checkOut === today).length;
  const avgStay = bookings.length > 0
    ? bookings.reduce((s, b) => s + Math.max(1, Math.ceil((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / (1000 * 60 * 60 * 24))), 0) / bookings.length
    : 0;

  const [existing] = await db.select().from(kpiHistoryTable).where(eq(kpiHistoryTable.date, today)).limit(1);

  let kpi;
  if (existing) {
    [kpi] = await db.update(kpiHistoryTable).set({
      occupancyRate: Math.round(occupancyRate * 10) / 10,
      adr: Math.round(adr * 100) / 100,
      revpar: Math.round(revpar * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      checkins,
      checkouts,
      avgStay: Math.round(avgStay * 10) / 10,
      totalUnits,
      newBookings: bookings.length,
    }).where(eq(kpiHistoryTable.date, today)).returning();
  } else {
    [kpi] = await db.insert(kpiHistoryTable).values({
      date: today,
      occupancyRate: Math.round(occupancyRate * 10) / 10,
      adr: Math.round(adr * 100) / 100,
      revpar: Math.round(revpar * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      checkins,
      checkouts,
      avgStay: Math.round(avgStay * 10) / 10,
      totalUnits,
      newBookings: bookings.length,
    }).returning();
  }

  res.json(kpi);
});

router.get("/forecast", requireAuth, async (req, res) => {
  const { days } = req.query;
  const daysNum = parseInt(days as string) || 30;
  const today = new Date().toISOString().split("T")[0];
  const toDate = new Date(Date.now() + daysNum * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const forecasts = await db.select().from(forecastsTable)
    .where(and(gte(forecastsTable.forecastDate, today), lte(forecastsTable.forecastDate, toDate)))
    .orderBy(asc(forecastsTable.forecastDate));

  res.json(forecasts);
});

router.post("/forecast/generate", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { days } = req.query;
  const daysNum = parseInt(days as string) || 30;

  const history = await db.select().from(kpiHistoryTable)
    .orderBy(desc(kpiHistoryTable.date))
    .limit(90);

  const avgOccupancy = history.length > 0
    ? history.reduce((s, h) => s + h.occupancyRate, 0) / history.length
    : 65;
  const avgAdr = history.length > 0
    ? history.reduce((s, h) => s + h.adr, 0) / history.length
    : 1800;
  const stdDev = history.length > 1
    ? Math.sqrt(history.reduce((s, h) => s + Math.pow(h.occupancyRate - avgOccupancy, 2), 0) / history.length)
    : 10;

  const getSeasonFactor = (date: Date) => {
    const m = date.getMonth() + 1;
    if ([6, 7, 8].includes(m)) return 1.3;
    if ([5, 9].includes(m)) return 1.1;
    if ([11, 12, 1, 2, 3].includes(m)) return 0.85;
    return 1.0;
  };

  const generated: any[] = [];
  for (let i = 0; i < daysNum; i++) {
    const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split("T")[0];
    const seasonFactor = getSeasonFactor(d);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const weekdayFactor = isWeekend ? 1.2 : 1.0;

    const predicted = Math.min(100, Math.max(0, avgOccupancy * seasonFactor * weekdayFactor));
    const predictedAdr = avgAdr * seasonFactor * weekdayFactor;
    const ci = stdDev * 1.96;

    const existing = await db.select().from(forecastsTable).where(eq(forecastsTable.forecastDate, dateStr)).limit(1);
    let forecast;
    if (existing.length > 0) {
      [forecast] = await db.update(forecastsTable).set({
        predictedOccupancy: Math.round(predicted * 10) / 10,
        predictedAdr: Math.round(predictedAdr * 100) / 100,
        predictedRevenue: Math.round(predictedAdr * predicted * 0.01 * 10 * 100) / 100,
        confidenceLower: Math.round(Math.max(0, predicted - ci) * 10) / 10,
        confidenceUpper: Math.round(Math.min(100, predicted + ci) * 10) / 10,
        seasonFactor,
        generatedAt: new Date(),
      }).where(eq(forecastsTable.forecastDate, dateStr)).returning();
    } else {
      [forecast] = await db.insert(forecastsTable).values({
        forecastDate: dateStr,
        predictedOccupancy: Math.round(predicted * 10) / 10,
        predictedAdr: Math.round(predictedAdr * 100) / 100,
        predictedRevenue: Math.round(predictedAdr * predicted * 0.01 * 10 * 100) / 100,
        confidenceLower: Math.round(Math.max(0, predicted - ci) * 10) / 10,
        confidenceUpper: Math.round(Math.min(100, predicted + ci) * 10) / 10,
        seasonFactor,
        generatedAt: new Date(),
      }).returning();
    }
    generated.push(forecast);
  }

  res.json({ message: `Generated ${generated.length} days forecast`, forecasts: generated });
});

router.get("/summary", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const today = new Date().toISOString().split("T")[0];
  const thisMonth = today.slice(0, 7);

  const recentKpi = await db.select().from(kpiHistoryTable)
    .where(sql`${kpiHistoryTable.date} >= ${thisMonth + '-01'}`)
    .orderBy(desc(kpiHistoryTable.date));

  const avgOccupancy = recentKpi.length > 0
    ? recentKpi.reduce((s, k) => s + k.occupancyRate, 0) / recentKpi.length : 0;
  const avgAdr = recentKpi.length > 0
    ? recentKpi.reduce((s, k) => s + k.adr, 0) / recentKpi.length : 0;
  const avgRevpar = recentKpi.length > 0
    ? recentKpi.reduce((s, k) => s + k.revpar, 0) / recentKpi.length : 0;
  const totalRevenue = recentKpi.reduce((s, k) => s + k.totalRevenue, 0);

  const nextForecast = await db.select().from(forecastsTable)
    .where(gte(forecastsTable.forecastDate, today))
    .orderBy(asc(forecastsTable.forecastDate))
    .limit(7);

  res.json({
    currentMonth: thisMonth,
    avgOccupancy: Math.round(avgOccupancy * 10) / 10,
    avgAdr: Math.round(avgAdr * 100) / 100,
    avgRevpar: Math.round(avgRevpar * 100) / 100,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    kpiDays: recentKpi.length,
    nextForecast,
    recentKpi: recentKpi.slice(0, 14),
  });
});

// GET /analytics/channels — booking source breakdown + occupancy heatmap
router.get("/channels", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const days = parseInt(req.query.days as string) || 90;

    // Get org's property IDs
    const propRows = await db.select({ id: propertiesTable.id, totalUnits: sql<number>`count(${unitsTable.id})` })
      .from(propertiesTable)
      .leftJoin(unitsTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(propertiesTable.organizationId, user.organizationId))
      .groupBy(propertiesTable.id);

    if (propRows.length === 0) {
      return res.json({ channels: [], occupancyHeatmap: [], totalBookings: 0, totalRevenue: 0 });
    }

    const propIds = propRows.map(p => p.id);
    const unitRows = await db.select({ id: unitsTable.id }).from(unitsTable).where(inArray(unitsTable.propertyId, propIds));
    const unitIds = unitRows.map(u => u.id);
    const totalUnits = unitIds.length;

    if (unitIds.length === 0) return res.json({ channels: [], occupancyHeatmap: [], totalBookings: 0, totalRevenue: 0 });

    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days + 1);
    const fromStr = dateFrom.toISOString().slice(0, 10);
    const toStr = new Date().toISOString().slice(0, 10);

    // Fetch all bookings in range
    const bookings = await db.select({
      id: bookingsTable.id,
      source: bookingsTable.source,
      checkIn: bookingsTable.checkIn,
      checkOut: bookingsTable.checkOut,
      totalAmount: bookingsTable.totalAmount,
      status: bookingsTable.status,
      createdAt: bookingsTable.createdAt,
    }).from(bookingsTable)
      .where(and(
        inArray(bookingsTable.unitId, unitIds),
        gte(bookingsTable.checkIn, fromStr),
        lte(bookingsTable.checkIn, toStr),
      ));

    // Group by source
    const sourceMap: Record<string, { bookings: number; revenue: number }> = {};
    for (const b of bookings) {
      const src = (b.source as string) || "direct";
      if (!sourceMap[src]) sourceMap[src] = { bookings: 0, revenue: 0 };
      sourceMap[src].bookings++;
      sourceMap[src].revenue += parseFloat(b.totalAmount?.toString() || "0");
    }

    const totalBookings = bookings.length;
    const totalRevenue = bookings.reduce((s, b) => s + parseFloat(b.totalAmount?.toString() || "0"), 0);

    const SOURCE_LABELS: Record<string, string> = {
      direct: "Прямі бронювання",
      booking: "Booking.com",
      airbnb: "Airbnb",
      expedia: "Expedia",
      phone: "Телефон",
      other: "Інше",
    };
    const SOURCE_COLORS: Record<string, string> = {
      direct: "#4f46e5",
      booking: "#2563eb",
      airbnb: "#e11d48",
      expedia: "#d97706",
      phone: "#059669",
      other: "#6b7280",
    };

    const channels = Object.entries(sourceMap).map(([source, data]) => ({
      source,
      label: SOURCE_LABELS[source] || source,
      color: SOURCE_COLORS[source] || "#6b7280",
      bookings: data.bookings,
      revenue: Math.round(data.revenue),
      pct: totalBookings > 0 ? Math.round((data.bookings / totalBookings) * 100) : 0,
      revenuePct: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
    })).sort((a, b) => b.bookings - a.bookings);

    // Occupancy heatmap: last 35 days (5 weeks)
    const heatmapDays = 35;
    const heatmap: Array<{ date: string; occupancy: number; bookings: number }> = [];
    for (let i = heatmapDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);

      // Count bookings where checkIn <= date < checkOut
      const activeBookings = bookings.filter(b =>
        b.status !== "cancelled" &&
        b.checkIn <= dateStr && b.checkOut > dateStr
      );
      const occupancy = totalUnits > 0 ? Math.min(100, Math.round((activeBookings.length / totalUnits) * 100)) : 0;
      heatmap.push({ date: dateStr, occupancy, bookings: activeBookings.length });
    }

    res.json({
      channels,
      occupancyHeatmap: heatmap,
      totalBookings,
      totalRevenue: Math.round(totalRevenue),
      period: { from: fromStr, to: toStr, days },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/reports/monthly", requireAuth, async (req, res) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

  const data = await db.select().from(kpiHistoryTable)
    .where(and(gte(kpiHistoryTable.date, startDate), lte(kpiHistoryTable.date, endDate)))
    .orderBy(asc(kpiHistoryTable.date));

  const totalRevenue = data.reduce((s, d) => s + d.totalRevenue, 0);
  const avgOccupancy = data.length > 0 ? data.reduce((s, d) => s + d.occupancyRate, 0) / data.length : 0;
  const avgAdr = data.length > 0 ? data.reduce((s, d) => s + d.adr, 0) / data.length : 0;
  const avgRevpar = data.length > 0 ? data.reduce((s, d) => s + d.revpar, 0) / data.length : 0;
  const totalCheckins = data.reduce((s, d) => s + (d.checkins || 0), 0);
  const totalCheckouts = data.reduce((s, d) => s + (d.checkouts || 0), 0);
  const avgCancellationRate = data.length > 0 ? data.reduce((s, d) => s + (d.cancellationRate || 0), 0) / data.length : 0;
  const avgStay = data.length > 0 ? data.reduce((s, d) => s + (d.avgStay || 0), 0) / data.length : 0;
  const totalDirectBookings = data.reduce((s, d) => s + (d.directBookings || 0), 0);
  const totalOtaBookings = data.reduce((s, d) => s + (d.otaBookings || 0), 0);
  const totalNewBookings = data.reduce((s, d) => s + (d.newBookings || 0), 0);

  res.json({
    year,
    month,
    period: `${startDate} – ${endDate}`,
    summary: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgOccupancy: Math.round(avgOccupancy * 10) / 10,
      avgAdr: Math.round(avgAdr * 100) / 100,
      avgRevpar: Math.round(avgRevpar * 100) / 100,
      totalCheckins,
      totalCheckouts,
      avgCancellationRate: Math.round(avgCancellationRate * 10) / 10,
      avgStay: Math.round(avgStay * 10) / 10,
      totalDirectBookings,
      totalOtaBookings,
      totalNewBookings,
      days: data.length,
    },
    daily: data,
  });
});

export default router;
