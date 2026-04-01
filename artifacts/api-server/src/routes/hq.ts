import { Router } from "express";
import { db } from "@workspace/db";
import {
  bookingsTable, unitsTable, propertiesTable,
  housekeepingTasksTable,
  spaAppointmentsTable, spaServicesTable,
  eventsTable, eventSpacesTable,
  fbOrdersTable, fbTablesTable,
  conversationsTable,
} from "@workspace/db";
import { eq, and, sql, gte, lte, lt, ne, desc, asc, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
const getOrg = (req: any) => req.user?.organizationId;

router.get("/overview", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 14);
    const nextWeekStr = nextWeek.toISOString().split("T")[0];
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    // Step 1: get unit IDs for this org (units → properties → org)
    const orgUnits = await db.select({ id: unitsTable.id })
      .from(unitsTable)
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(propertiesTable.organizationId, orgId));
    const unitIds = orgUnits.map(u => u.id);

    if (unitIds.length === 0) {
      return res.json({
        kpi: { occupancy: 0, totalUnits: 0, inHouseCount: 0, arrivalsToday: 0, departuresToday: 0, revenueToday: 0, revenueThisMonth: 0, revenueLastMonth: 0, fbRevenueToday: 0, spaRevenueToday: 0, fbOpenOrders: 0, spaTodayCount: 0, eventsThisWeek: 0, hkPending: 0, hkInProgress: 0, inboxUnread: 0 },
        arrivals: [], departures: [], inHouse: [], hk: { pending: 0, inProgress: 0, high: 0 },
        spaToday: [], eventsUpcoming: [], fbOpenOrders: [], fbTables: { total: 0, free: 0, occupied: 0 },
        inbox: [], sevenDayRevenue: [],
      });
    }

    // Step 2: parallel fetches
    const [
      allBookings, hkTasks, spaTodayAppts, spaRevToday,
      eventsUpcoming, fbOpenOrders, fbStats, inboxData,
      revenueThisMonth, revenueLastMonth, fbRevenueToday,
    ] = await Promise.all([
      // Bookings: upcoming and current
      db.select({
        id: bookingsTable.id, checkIn: bookingsTable.checkIn, checkOut: bookingsTable.checkOut,
        status: bookingsTable.status, totalAmount: bookingsTable.totalAmount,
        firstName: bookingsTable.firstName, lastName: bookingsTable.lastName,
        guestCount: bookingsTable.guestsCount,
      }).from(bookingsTable).where(and(
        inArray(bookingsTable.unitId, unitIds),
        gte(bookingsTable.checkOut, todayStr as any),
        ne(bookingsTable.status, "cancelled" as any),
      )),

      // Housekeeping tasks (via unit join)
      db.select({ id: housekeepingTasksTable.id, status: housekeepingTasksTable.status, priority: housekeepingTasksTable.priority })
        .from(housekeepingTasksTable)
        .where(and(
          inArray(housekeepingTasksTable.unitId, unitIds),
          ne(housekeepingTasksTable.status, "completed" as any),
          ne(housekeepingTasksTable.status, "verified" as any),
          ne(housekeepingTasksTable.status, "cancelled" as any),
        )),

      // SPA appointments today
      db.select({
        id: spaAppointmentsTable.id, status: spaAppointmentsTable.status,
        guestName: spaAppointmentsTable.guestName, startTime: spaAppointmentsTable.startTime,
        endTime: spaAppointmentsTable.endTime, totalPrice: spaAppointmentsTable.price,
        serviceName: spaServicesTable.name,
      }).from(spaAppointmentsTable)
        .leftJoin(spaServicesTable, eq(spaAppointmentsTable.serviceId, spaServicesTable.id))
        .where(and(
          eq(spaAppointmentsTable.organizationId, orgId),
          eq(spaAppointmentsTable.appointmentDate, todayStr as any),
          ne(spaAppointmentsTable.status, "cancelled" as any),
        )).orderBy(asc(spaAppointmentsTable.startTime)),

      // SPA revenue today
      db.select({ total: sql<string>`COALESCE(SUM(price), 0)` })
        .from(spaAppointmentsTable)
        .where(and(
          eq(spaAppointmentsTable.organizationId, orgId),
          eq(spaAppointmentsTable.appointmentDate, todayStr as any),
          eq(spaAppointmentsTable.status, "completed" as any),
        )),

      // Events upcoming (next 14 days)
      db.select({
        id: eventsTable.id, name: eventsTable.name, eventType: eventsTable.eventType,
        eventDate: eventsTable.eventDate, startTime: eventsTable.startTime,
        guestCount: eventsTable.guestCount, status: eventsTable.status, totalPrice: eventsTable.totalPrice,
        clientName: eventsTable.clientName, spaceName: eventSpacesTable.name,
      }).from(eventsTable)
        .leftJoin(eventSpacesTable, eq(eventsTable.eventSpaceId, eventSpacesTable.id))
        .where(and(
          eq(eventsTable.organizationId, orgId),
          gte(eventsTable.eventDate, todayStr as any),
          lte(eventsTable.eventDate, nextWeekStr as any),
          ne(eventsTable.status, "cancelled" as any),
        )).orderBy(asc(eventsTable.eventDate)).limit(5),

      // F&B open orders
      db.select({
        id: fbOrdersTable.id, status: fbOrdersTable.status, orderType: fbOrdersTable.orderType,
        guestName: fbOrdersTable.guestName, totalAmount: fbOrdersTable.totalAmount,
        tableNumber: fbTablesTable.number, roomNumber: fbOrdersTable.roomNumber,
        openedAt: fbOrdersTable.openedAt,
      }).from(fbOrdersTable)
        .leftJoin(fbTablesTable, eq(fbOrdersTable.tableId, fbTablesTable.id))
        .where(and(
          eq(fbOrdersTable.organizationId, orgId),
          ne(fbOrdersTable.status, "billed" as any),
          ne(fbOrdersTable.status, "cancelled" as any),
        )).orderBy(asc(fbOrdersTable.openedAt)),

      // F&B tables summary
      db.select({ status: fbTablesTable.status }).from(fbTablesTable)
        .where(and(eq(fbTablesTable.organizationId, orgId), eq(fbTablesTable.isActive, true))),

      // Inbox unread conversations
      db.select({
        id: conversationsTable.id, unreadCount: conversationsTable.unreadCount,
        subject: conversationsTable.subject, channel: conversationsTable.channel,
        guestName: conversationsTable.guestName, updatedAt: conversationsTable.updatedAt,
      }).from(conversationsTable)
        .where(and(eq(conversationsTable.organizationId, orgId), gte(conversationsTable.unreadCount, 1)))
        .orderBy(desc(conversationsTable.updatedAt)).limit(5),

      // Revenue this month (via unit IDs)
      db.select({ total: sql<string>`COALESCE(SUM(total_amount), 0)` })
        .from(bookingsTable).where(and(
          inArray(bookingsTable.unitId, unitIds),
          gte(bookingsTable.createdAt, monthStart),
          ne(bookingsTable.status, "cancelled" as any),
        )),

      // Revenue last month
      db.select({ total: sql<string>`COALESCE(SUM(total_amount), 0)` })
        .from(bookingsTable).where(and(
          inArray(bookingsTable.unitId, unitIds),
          gte(bookingsTable.createdAt, lastMonthStart),
          lt(bookingsTable.createdAt, monthStart),
          ne(bookingsTable.status, "cancelled" as any),
        )),

      // F&B revenue today
      db.select({ total: sql<string>`COALESCE(SUM(total_amount), 0)` })
        .from(fbOrdersTable).where(and(
          eq(fbOrdersTable.organizationId, orgId),
          eq(fbOrdersTable.status, "billed" as any),
          gte(fbOrdersTable.createdAt, today),
        )),
    ]);

    // Process bookings
    const arrivalsToday = allBookings.filter(b => b.checkIn === todayStr);
    const departuresToday = allBookings.filter(b => b.checkOut === todayStr);
    const inHouse = allBookings.filter(b => {
      return b.checkIn <= todayStr && b.checkOut > todayStr &&
        ["confirmed", "checked_in", "pending"].includes(b.status);
    });
    const occupancy = orgUnits.length > 0 ? Math.round((inHouse.length / orgUnits.length) * 100) : 0;
    const revenueToday = allBookings.filter(b => b.checkOut === todayStr).reduce((s, b) => s + parseFloat(b.totalAmount), 0);

    // 7-day revenue trend
    const sevenDayRevenue = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dStr = d.toISOString().split("T")[0];
      const dayRev = allBookings.filter(b => b.checkOut === dStr).reduce((s, b) => s + parseFloat(b.totalAmount), 0);
      sevenDayRevenue.push({
        date: dStr,
        label: d.toLocaleDateString("uk", { weekday: "short" }),
        rooms: dayRev,
      });
    }

    // HK summary
    const hkPending = hkTasks.filter(t => t.status === "pending").length;
    const hkInProgress = hkTasks.filter(t => t.status === "in_progress").length;
    const hkHigh = hkTasks.filter(t => t.priority === "high").length;

    const totalUnread = inboxData.reduce((s, c) => s + (c.unreadCount || 0), 0);
    const revMonth = Math.round(parseFloat(revenueThisMonth[0]?.total || "0"));
    const revLastMonth = Math.round(parseFloat(revenueLastMonth[0]?.total || "0"));

    res.json({
      kpi: {
        occupancy,
        totalUnits: orgUnits.length,
        inHouseCount: inHouse.length,
        arrivalsToday: arrivalsToday.length,
        departuresToday: departuresToday.length,
        revenueToday: Math.round(revenueToday),
        revenueThisMonth: revMonth,
        revenueLastMonth: revLastMonth,
        fbRevenueToday: Math.round(parseFloat(fbRevenueToday[0]?.total || "0")),
        spaRevenueToday: Math.round(parseFloat(spaRevToday[0]?.total || "0")),
        fbOpenOrders: fbOpenOrders.length,
        spaTodayCount: spaTodayAppts.length,
        eventsThisWeek: eventsUpcoming.length,
        hkPending,
        hkInProgress,
        inboxUnread: totalUnread,
      },
      arrivals: arrivalsToday.slice(0, 6).map(b => ({
        id: b.id, name: [b.firstName, b.lastName].filter(Boolean).join(" ") || "Гість",
        guestCount: b.guestCount, checkIn: b.checkIn, checkOut: b.checkOut,
      })),
      departures: departuresToday.slice(0, 6).map(b => ({
        id: b.id, name: [b.firstName, b.lastName].filter(Boolean).join(" ") || "Гість",
        guestCount: b.guestCount, checkOut: b.checkOut,
      })),
      inHouse: inHouse.slice(0, 8).map(b => ({
        id: b.id, name: [b.firstName, b.lastName].filter(Boolean).join(" ") || "Гість",
        checkOut: b.checkOut, guestCount: b.guestCount,
      })),
      hk: { pending: hkPending, inProgress: hkInProgress, high: hkHigh },
      spaToday: spaTodayAppts.slice(0, 5),
      eventsUpcoming,
      fbOpenOrders: fbOpenOrders.slice(0, 6),
      fbTables: {
        total: fbStats.length,
        free: fbStats.filter(t => t.status === "free").length,
        occupied: fbStats.filter(t => t.status === "occupied").length,
      },
      inbox: inboxData,
      sevenDayRevenue,
    });
  } catch (e: any) {
    console.error("HQ overview error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
