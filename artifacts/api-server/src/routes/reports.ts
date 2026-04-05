import { Router } from "express";
import { db } from "@workspace/db";
import { bookingsTable, unitsTable, propertiesTable, guestsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
const getOrg = (req: any) => req.user?.organizationId;

// Helper: get unit IDs for an org
async function getOrgUnitIds(orgId: number): Promise<number[]> {
  const units = await db.select({ id: unitsTable.id })
    .from(unitsTable)
    .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
    .where(eq(propertiesTable.organizationId, orgId));
  return units.map(u => u.id);
}

// GET /reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/summary", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const from = (req.query.from as string) || (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); })();
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);

    const unitIds = await getOrgUnitIds(orgId);
    if (unitIds.length === 0) {
      return res.json({ period: { from, to, days: 1 }, bookings: { total: 0, confirmed: 0, cancelled: 0 }, revenue: { total: 0, paid: 0, outstanding: 0 }, guests: { total: 0, avgStay: "0", totalNights: 0 }, occupancy: { avgPercent: 0, totalUnits: 0, totalNights: 0, periodDays: 1 }, kpis: { avgRevPerNight: 0, revPar: 0 }, bySource: [] });
    }

    const bookings = await db.select({
      id: bookingsTable.id,
      status: bookingsTable.status,
      totalAmount: bookingsTable.totalAmount,
      paidAmount: bookingsTable.paidAmount,
      source: bookingsTable.source,
      checkIn: bookingsTable.checkIn,
      checkOut: bookingsTable.checkOut,
      adults: bookingsTable.adults,
      childrenUnder6: bookingsTable.childrenUnder6,
      childrenOver6: bookingsTable.childrenOver6,
    }).from(bookingsTable)
      .where(and(
        inArray(bookingsTable.unitId, unitIds),
        gte(bookingsTable.checkIn, from),
        lte(bookingsTable.checkIn, to),
      ))
      .orderBy(desc(bookingsTable.checkIn));

    const active = bookings.filter(b => b.status !== "cancelled");
    const totalRevenue = active.reduce((s, b) => s + parseFloat(b.totalAmount || "0"), 0);
    const paidRevenue = active.reduce((s, b) => s + parseFloat(b.paidAmount || "0"), 0);
    const totalGuests = active.reduce((s, b) => s + (b.adults || 1) + (b.childrenUnder6 || 0) + (b.childrenOver6 || 0), 0);
    const cancelled = bookings.filter(b => b.status === "cancelled").length;
    const confirmed = active.length;

    const totalNights = active.reduce((s, b) => {
      const nights = Math.max(0, Math.floor((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / 86400000));
      return s + nights;
    }, 0);
    const avgStay = confirmed > 0 ? (totalNights / confirmed).toFixed(1) : "0";

    const bySource: Record<string, number> = {};
    for (const b of active) {
      const src = b.source || "direct";
      bySource[src] = (bySource[src] || 0) + parseFloat(b.totalAmount || "0");
    }

    const totalUnits = unitIds.length;
    const periodDays = Math.max(1, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
    const avgOccupancy = Math.min(100, Math.round((totalNights / (totalUnits * periodDays)) * 100));
    const avgRevPerNight = totalNights > 0 ? Math.round(totalRevenue / totalNights) : 0;
    const revPar = totalUnits > 0 ? Math.round(totalRevenue / (totalUnits * periodDays)) : 0;

    res.json({
      period: { from, to, days: periodDays },
      bookings: { total: bookings.length, confirmed, cancelled },
      revenue: { total: totalRevenue, paid: paidRevenue, outstanding: totalRevenue - paidRevenue },
      guests: { total: totalGuests, avgStay, totalNights },
      occupancy: { avgPercent: avgOccupancy, totalUnits, totalNights, periodDays },
      kpis: { avgRevPerNight, revPar },
      bySource: Object.entries(bySource).map(([source, amount]) => ({ source, amount })).sort((a, b) => b.amount - a.amount),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /reports/bookings?from=&to= — detailed list for print/export
router.get("/bookings", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const from = (req.query.from as string) || (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); })();
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);

    const unitIds = await getOrgUnitIds(orgId);
    if (unitIds.length === 0) return res.json({ bookings: [] });

    const rows = await db.select({
      id: bookingsTable.id,
      bookingRef: bookingsTable.bookingRef,
      status: bookingsTable.status,
      checkIn: bookingsTable.checkIn,
      checkOut: bookingsTable.checkOut,
      adults: bookingsTable.adults,
      totalAmount: bookingsTable.totalAmount,
      paidAmount: bookingsTable.paidAmount,
      paymentStatus: bookingsTable.paymentStatus,
      source: bookingsTable.source,
      firstName: bookingsTable.firstName,
      lastName: bookingsTable.lastName,
      phone: bookingsTable.phone,
      unitName: unitsTable.name,
    }).from(bookingsTable)
      .leftJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
      .where(and(
        inArray(bookingsTable.unitId, unitIds),
        gte(bookingsTable.checkIn, from),
        lte(bookingsTable.checkIn, to),
      ))
      .orderBy(desc(bookingsTable.checkIn));

    res.json({ bookings: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /reports/housekeeping — cleaning stats
router.get("/housekeeping", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const units = await db.select({
      id: unitsTable.id, name: unitsTable.name, housekeepingStatus: unitsTable.housekeepingStatus,
    }).from(unitsTable)
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(propertiesTable.organizationId, orgId));

    const stats = { clean: 0, dirty: 0, in_progress: 0, inspected: 0 };
    for (const u of units) {
      const s = u.housekeepingStatus as keyof typeof stats;
      if (s in stats) stats[s]++;
    }
    res.json({ stats, units, total: units.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
