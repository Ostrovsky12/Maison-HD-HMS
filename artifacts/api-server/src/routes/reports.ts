import { Router } from "express";
import { db } from "@workspace/db";
import { bookingsTable, unitsTable, propertiesTable, guestsTable, minibarChargesTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
const getOrg = (req: any) => req.user?.organizationId;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

// Helper: get unit IDs for an org
async function getOrgUnitIds(orgId: number): Promise<number[]> {
  const units = await db.select({ id: unitsTable.id })
    .from(unitsTable)
    .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
    .where(eq(propertiesTable.organizationId, orgId));
  return units.map(u => u.id);
}

// Helper: compute summary for a date range
async function computeSummary(unitIds: number[], from: string, to: string) {
  if (unitIds.length === 0) return null;
  const bookings = await db.select({
    status: bookingsTable.status,
    totalAmount: bookingsTable.totalAmount,
    paidAmount: bookingsTable.paidAmount,
    checkIn: bookingsTable.checkIn,
    checkOut: bookingsTable.checkOut,
    adults: bookingsTable.adults,
    childrenUnder6: bookingsTable.childrenUnder6,
    childrenOver6: bookingsTable.childrenOver6,
    source: bookingsTable.source,
  }).from(bookingsTable)
    .where(and(inArray(bookingsTable.unitId, unitIds), gte(bookingsTable.checkIn, from), lte(bookingsTable.checkIn, to)));

  const active = bookings.filter(b => b.status !== "cancelled");
  const periodDays = Math.max(1, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
  const totalRevenue = active.reduce((s, b) => s + parseFloat(b.totalAmount || "0"), 0);
  const paidRevenue = active.reduce((s, b) => s + parseFloat(b.paidAmount || "0"), 0);
  const totalNights = active.reduce((s, b) => s + Math.max(0, Math.floor((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / 86400000)), 0);
  const avgOccupancy = Math.min(100, Math.round((totalNights / (unitIds.length * periodDays)) * 100));
  const adr = totalNights > 0 ? Math.round(totalRevenue / totalNights) : 0;
  const revpar = unitIds.length > 0 ? Math.round(totalRevenue / (unitIds.length * periodDays)) : 0;
  const avgStay = active.length > 0 ? +(totalNights / active.length).toFixed(1) : 0;
  const totalGuests = active.reduce((s, b) => s + (b.adults || 1) + (b.childrenUnder6 || 0) + (b.childrenOver6 || 0), 0);

  const bySource: Record<string, number> = {};
  for (const b of active) { const src = b.source || "direct"; bySource[src] = (bySource[src] || 0) + parseFloat(b.totalAmount || "0"); }

  return {
    from, to, periodDays,
    bookings: active.length,
    cancelled: bookings.filter(b => b.status === "cancelled").length,
    revenue: totalRevenue,
    paid: paidRevenue,
    outstanding: totalRevenue - paidRevenue,
    nights: totalNights,
    occupancy: avgOccupancy,
    adr,
    revpar,
    avgStay,
    totalGuests,
    bySource: Object.entries(bySource).map(([source, amount]) => ({ source, amount })).sort((a, b) => b.amount - a.amount),
  };
}

// GET /reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/summary", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const from = (req.query.from as string) || monthStart();
    const to = (req.query.to as string) || today();
    const unitIds = await getOrgUnitIds(orgId);
    if (unitIds.length === 0) return res.json({ period: { from, to, days: 1 }, bookings: { total: 0, confirmed: 0, cancelled: 0 }, revenue: { total: 0, paid: 0, outstanding: 0 }, guests: { total: 0, avgStay: "0", totalNights: 0 }, occupancy: { avgPercent: 0, totalUnits: 0, totalNights: 0, periodDays: 1 }, kpis: { avgRevPerNight: 0, revPar: 0 }, bySource: [] });

    const s = await computeSummary(unitIds, from, to);
    if (!s) return res.json({});
    res.json({
      period: { from, to, days: s.periodDays },
      bookings: { total: s.bookings + s.cancelled, confirmed: s.bookings, cancelled: s.cancelled },
      revenue: { total: s.revenue, paid: s.paid, outstanding: s.outstanding },
      guests: { total: s.totalGuests, avgStay: String(s.avgStay), totalNights: s.nights },
      occupancy: { avgPercent: s.occupancy, totalUnits: unitIds.length, totalNights: s.nights, periodDays: s.periodDays },
      kpis: { avgRevPerNight: s.adr, revPar: s.revpar },
      bySource: s.bySource,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /reports/bookings?from=&to= — detailed list for print/export
router.get("/bookings", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const from = (req.query.from as string) || monthStart();
    const to = (req.query.to as string) || today();
    const unitIds = await getOrgUnitIds(orgId);
    if (unitIds.length === 0) return res.json({ bookings: [] });

    const rows = await db.select({
      id: bookingsTable.id, bookingRef: bookingsTable.bookingRef, status: bookingsTable.status,
      checkIn: bookingsTable.checkIn, checkOut: bookingsTable.checkOut, adults: bookingsTable.adults,
      totalAmount: bookingsTable.totalAmount, paidAmount: bookingsTable.paidAmount,
      paymentStatus: bookingsTable.paymentStatus, source: bookingsTable.source,
      firstName: bookingsTable.firstName, lastName: bookingsTable.lastName, phone: bookingsTable.phone,
      unitName: unitsTable.name,
    }).from(bookingsTable)
      .leftJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
      .where(and(inArray(bookingsTable.unitId, unitIds), gte(bookingsTable.checkIn, from), lte(bookingsTable.checkIn, to)))
      .orderBy(desc(bookingsTable.checkIn));

    res.json({ bookings: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /reports/housekeeping — current cleaning status
router.get("/housekeeping", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const units = await db.select({ id: unitsTable.id, name: unitsTable.name, housekeepingStatus: unitsTable.housekeepingStatus })
      .from(unitsTable)
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(propertiesTable.organizationId, orgId));

    const stats = { clean: 0, dirty: 0, in_progress: 0, inspected: 0 };
    for (const u of units) { const s = u.housekeepingStatus as keyof typeof stats; if (s in stats) stats[s]++; }
    res.json({ stats, units, total: units.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /reports/guests?from=&to= — guest analytics
router.get("/guests", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const from = (req.query.from as string) || monthStart();
    const to = (req.query.to as string) || today();
    const unitIds = await getOrgUnitIds(orgId);
    if (unitIds.length === 0) return res.json({ stats: {}, topGuests: [], repeatGuests: [] });

    const rows = await db.select({
      id: bookingsTable.id, firstName: bookingsTable.firstName, lastName: bookingsTable.lastName,
      phone: bookingsTable.phone, email: bookingsTable.email,
      checkIn: bookingsTable.checkIn, checkOut: bookingsTable.checkOut,
      totalAmount: bookingsTable.totalAmount, status: bookingsTable.status, source: bookingsTable.source,
      adults: bookingsTable.adults,
    }).from(bookingsTable)
      .where(and(inArray(bookingsTable.unitId, unitIds), gte(bookingsTable.checkIn, from), lte(bookingsTable.checkIn, to)))
      .orderBy(desc(bookingsTable.checkIn));

    const active = rows.filter(b => b.status !== "cancelled");
    const guestMap = new Map<string, { name: string; phone: string; email: string; bookings: number; revenue: number; nights: number; lastVisit: string }>();

    for (const b of active) {
      const key = b.phone || `${b.firstName}_${b.lastName}`;
      const nights = Math.max(0, Math.floor((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / 86400000));
      if (guestMap.has(key)) {
        const g = guestMap.get(key)!;
        g.bookings++; g.revenue += parseFloat(b.totalAmount || "0"); g.nights += nights;
        if (b.checkIn > g.lastVisit) g.lastVisit = b.checkIn;
      } else {
        guestMap.set(key, { name: `${b.firstName || ""} ${b.lastName || ""}`.trim() || "—", phone: b.phone || "—", email: b.email || "—", bookings: 1, revenue: parseFloat(b.totalAmount || "0"), nights, lastVisit: b.checkIn });
      }
    }

    const guests = Array.from(guestMap.values()).sort((a, b) => b.revenue - a.revenue);
    const repeatGuests = guests.filter(g => g.bookings > 1);
    const totalNights = active.reduce((s, b) => s + Math.max(0, Math.floor((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / 86400000)), 0);

    const bySource: Record<string, number> = {};
    for (const b of active) { const src = b.source || "direct"; bySource[src] = (bySource[src] || 0) + 1; }

    res.json({
      stats: {
        totalUnique: guests.length,
        repeatGuests: repeatGuests.length,
        returnRate: guests.length > 0 ? Math.round((repeatGuests.length / guests.length) * 100) : 0,
        avgStay: active.length > 0 ? (totalNights / active.length).toFixed(1) : "0",
        bySource: Object.entries(bySource).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
      },
      topGuests: guests.slice(0, 25),
      repeatGuests: repeatGuests.slice(0, 10),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /reports/financial?from=&to= — revenue breakdown by category & property
router.get("/financial", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const from = (req.query.from as string) || monthStart();
    const to = (req.query.to as string) || today();
    const unitIds = await getOrgUnitIds(orgId);
    if (unitIds.length === 0) return res.json({ revenue: {}, byProperty: [], byPaymentStatus: {} });

    const rows = await db.select({
      id: bookingsTable.id, totalAmount: bookingsTable.totalAmount, paidAmount: bookingsTable.paidAmount,
      paymentStatus: bookingsTable.paymentStatus, status: bookingsTable.status,
      checkIn: bookingsTable.checkIn, checkOut: bookingsTable.checkOut,
      propertyId: propertiesTable.id, propertyName: propertiesTable.name,
    }).from(bookingsTable)
      .leftJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
      .leftJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(and(inArray(bookingsTable.unitId, unitIds), gte(bookingsTable.checkIn, from), lte(bookingsTable.checkIn, to)));

    const active = rows.filter(b => b.status !== "cancelled");
    const accommodationRevenue = active.reduce((s, b) => s + parseFloat(b.totalAmount || "0"), 0);
    const paidAmount = active.reduce((s, b) => s + parseFloat(b.paidAmount || "0"), 0);

    // Minibar
    const bookingIds = active.map(b => b.id);
    let minibarRevenue = 0;
    if (bookingIds.length > 0) {
      const charges = await db.select({ totalAmount: minibarChargesTable.totalAmount })
        .from(minibarChargesTable).where(inArray(minibarChargesTable.bookingId, bookingIds));
      minibarRevenue = charges.reduce((s, c) => s + parseFloat(c.totalAmount || "0"), 0);
    }

    // By property
    const propMap = new Map<number, { name: string; revenue: number; bookings: number; nights: number }>();
    for (const b of active) {
      const pid = b.propertyId!;
      const nights = Math.max(0, Math.floor((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / 86400000));
      if (propMap.has(pid)) { const p = propMap.get(pid)!; p.revenue += parseFloat(b.totalAmount || "0"); p.bookings++; p.nights += nights; }
      else propMap.set(pid, { name: b.propertyName || "—", revenue: parseFloat(b.totalAmount || "0"), bookings: 1, nights });
    }

    // By payment status
    const byPayStatus: Record<string, number> = { paid: 0, partial: 0, unpaid: 0 };
    for (const b of active) { const ps = b.paymentStatus || "unpaid"; byPayStatus[ps] = (byPayStatus[ps] || 0) + parseFloat(b.totalAmount || "0"); }

    res.json({
      revenue: { accommodation: accommodationRevenue, minibar: minibarRevenue, total: accommodationRevenue + minibarRevenue, paid: paidAmount, outstanding: accommodationRevenue - paidAmount },
      byPaymentStatus: byPayStatus,
      byProperty: Array.from(propMap.values()).sort((a, b) => b.revenue - a.revenue),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /reports/units-perf?from=&to= — per-unit performance
router.get("/units-perf", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const from = (req.query.from as string) || monthStart();
    const to = (req.query.to as string) || today();
    const periodDays = Math.max(1, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);

    const units = await db.select({ id: unitsTable.id, name: unitsTable.name, propertyName: propertiesTable.name })
      .from(unitsTable).innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(propertiesTable.organizationId, orgId));

    const unitIds = units.map(u => u.id);
    if (unitIds.length === 0) return res.json({ units: [], periodDays });

    const bookings = await db.select({ unitId: bookingsTable.unitId, totalAmount: bookingsTable.totalAmount, checkIn: bookingsTable.checkIn, checkOut: bookingsTable.checkOut, status: bookingsTable.status })
      .from(bookingsTable)
      .where(and(inArray(bookingsTable.unitId, unitIds), gte(bookingsTable.checkIn, from), lte(bookingsTable.checkIn, to)));

    const unitMap = new Map<number, { revenue: number; bookings: number; nights: number }>();
    for (const u of units) unitMap.set(u.id, { revenue: 0, bookings: 0, nights: 0 });

    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      const nights = Math.max(0, Math.floor((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / 86400000));
      const u = unitMap.get(b.unitId!);
      if (u) { u.revenue += parseFloat(b.totalAmount || "0"); u.bookings++; u.nights += nights; }
    }

    const result = units.map(u => {
      const s = unitMap.get(u.id)!;
      return { id: u.id, name: u.name, propertyName: u.propertyName, revenue: s.revenue, bookings: s.bookings, nights: s.nights, occupancy: Math.min(100, Math.round((s.nights / periodDays) * 100)), adr: s.nights > 0 ? Math.round(s.revenue / s.nights) : 0 };
    }).sort((a, b) => b.revenue - a.revenue);

    res.json({ units: result, periodDays });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /reports/comparison?p1from=&p1to=&p2from=&p2to= — two-period comparison
router.get("/comparison", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { p1from, p1to, p2from, p2to } = req.query as Record<string, string>;
    if (!p1from || !p1to || !p2from || !p2to) return res.status(400).json({ error: "All 4 date params required" });

    const unitIds = await getOrgUnitIds(orgId);
    if (unitIds.length === 0) return res.json({ period1: null, period2: null });

    const [period1, period2] = await Promise.all([computeSummary(unitIds, p1from, p1to), computeSummary(unitIds, p2from, p2to)]);
    res.json({ period1, period2 });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /reports/owner?from=&to= — executive one-pager for owner
router.get("/owner", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const from = (req.query.from as string) || monthStart();
    const to = (req.query.to as string) || today();
    const unitIds = await getOrgUnitIds(orgId);
    if (unitIds.length === 0) return res.json({});

    // Prev period (same length)
    const periodDays = Math.max(1, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
    const prevTo = new Date(new Date(from).getTime() - 86400000).toISOString().slice(0, 10);
    const prevFrom = new Date(new Date(prevTo).getTime() - (periodDays - 1) * 86400000).toISOString().slice(0, 10);

    const [current, previous] = await Promise.all([computeSummary(unitIds, from, to), computeSummary(unitIds, prevFrom, prevTo)]);

    // Unpaid bookings
    const unpaid = await db.select({ id: bookingsTable.id, bookingRef: bookingsTable.bookingRef, firstName: bookingsTable.firstName, lastName: bookingsTable.lastName, totalAmount: bookingsTable.totalAmount, paidAmount: bookingsTable.paidAmount, checkIn: bookingsTable.checkIn, checkOut: bookingsTable.checkOut, unitName: unitsTable.name })
      .from(bookingsTable).leftJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
      .where(and(inArray(bookingsTable.unitId, unitIds), eq(bookingsTable.paymentStatus, "unpaid"), lte(bookingsTable.checkIn, to)))
      .orderBy(desc(bookingsTable.totalAmount)).limit(10);

    // Housekeeping snapshot
    const hkUnits = await db.select({ housekeepingStatus: unitsTable.housekeepingStatus }).from(unitsTable)
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(propertiesTable.organizationId, orgId));
    const hkStats = { clean: 0, dirty: 0, in_progress: 0, inspected: 0 };
    for (const u of hkUnits) { const s = u.housekeepingStatus as keyof typeof hkStats; if (s in hkStats) hkStats[s]++; }

    // Minibar revenue this period
    const bookingIds = (await db.select({ id: bookingsTable.id }).from(bookingsTable)
      .where(and(inArray(bookingsTable.unitId, unitIds), gte(bookingsTable.checkIn, from), lte(bookingsTable.checkIn, to), sql`${bookingsTable.status} != 'cancelled'`))).map(b => b.id);
    let minibarRevenue = 0;
    if (bookingIds.length > 0) {
      const charges = await db.select({ totalAmount: minibarChargesTable.totalAmount }).from(minibarChargesTable).where(inArray(minibarChargesTable.bookingId, bookingIds));
      minibarRevenue = charges.reduce((s, c) => s + parseFloat(c.totalAmount || "0"), 0);
    }

    res.json({ current, previous, minibarRevenue, unpaidBookings: unpaid, housekeeping: hkStats, totalUnits: unitIds.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
