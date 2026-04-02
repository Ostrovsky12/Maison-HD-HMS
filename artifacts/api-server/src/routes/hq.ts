import { Router } from "express";
import { db } from "@workspace/db";
import {
  bookingsTable, unitsTable, propertiesTable,
  housekeepingTasksTable,
  spaAppointmentsTable, spaServicesTable,
  eventsTable, eventSpacesTable,
  fbOrdersTable, fbTablesTable,
  conversationsTable,
  monthlyBudgetsTable,
} from "@workspace/db";
import { eq, and, sql, gte, lte, lt, ne, desc, asc, inArray, or } from "drizzle-orm";
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
    const next30Days = new Date(today); next30Days.setDate(next30Days.getDate() + 30);
    const next30Str = next30Days.toISOString().split("T")[0];
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const yearStart = new Date(today.getFullYear(), 0, 1);

    // Get all properties for this org
    const orgProperties = await db.select({ id: propertiesTable.id, name: propertiesTable.name })
      .from(propertiesTable).where(eq(propertiesTable.organizationId, orgId));

    const propIds = orgProperties.map(p => p.id);

    // Get all units for these properties
    const orgUnitsWithProp = propIds.length > 0
      ? await db.select({ id: unitsTable.id, propertyId: unitsTable.propertyId })
          .from(unitsTable).where(inArray(unitsTable.propertyId, propIds))
      : [];

    const unitIds = orgUnitsWithProp.map(u => u.id);

    if (unitIds.length === 0) {
      return res.json({
        kpi: { occupancy: 0, totalUnits: 0, inHouseCount: 0, arrivalsToday: 0, departuresToday: 0, revenueToday: 0, revenueThisMonth: 0, revenueLastMonth: 0, fbRevenueToday: 0, spaRevenueToday: 0, fbOpenOrders: 0, spaTodayCount: 0, eventsThisWeek: 0, hkPending: 0, hkInProgress: 0, inboxUnread: 0, adr: 0, totalDebt: 0, paidThisMonth: 0, revenueYTD: 0 },
        arrivals: [], departures: [], inHouse: [], hk: { pending: 0, inProgress: 0, high: 0 },
        spaToday: [], eventsUpcoming: [], fbOpenOrders: [], fbTables: { total: 0, free: 0, occupied: 0 },
        inbox: [], sevenDayRevenue: [], byProperty: [], byDepartment: {}, financials: {}, debtors: [], forecast: [], budget: null,
      });
    }

    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;

    // Parallel fetches - existing + new
    const [
      allBookings,
      hkTasks,
      spaTodayAppts,
      spaRevToday,
      eventsUpcoming,
      fbOpenOrders,
      fbStats,
      inboxData,
      revenueThisMonth,
      revenueLastMonth,
      fbRevenueToday,
      // NEW: extended data
      allMonthBookings,
      fbMonthRevenue,
      spaMonthRevenue,
      eventsMonthRevenue,
      allYearBookings,
      spaRevMonth,
      eventsRevMonth,
      debtorBookings,
      forecast30,
      budgetRow,
    ] = await Promise.all([
      // Bookings: active/upcoming
      db.select({
        id: bookingsTable.id, checkIn: bookingsTable.checkIn, checkOut: bookingsTable.checkOut,
        status: bookingsTable.status, totalAmount: bookingsTable.totalAmount,
        paidAmount: bookingsTable.paidAmount, paymentStatus: bookingsTable.paymentStatus,
        firstName: bookingsTable.firstName, lastName: bookingsTable.lastName,
        guestCount: bookingsTable.guestsCount, unitId: bookingsTable.unitId,
        bookingRef: bookingsTable.bookingRef,
      }).from(bookingsTable).where(and(
        inArray(bookingsTable.unitId, unitIds),
        gte(bookingsTable.checkOut, todayStr as any),
        ne(bookingsTable.status, "cancelled" as any),
      )),

      // HK tasks
      db.select({ id: housekeepingTasksTable.id, status: housekeepingTasksTable.status, priority: housekeepingTasksTable.priority })
        .from(housekeepingTasksTable)
        .where(and(
          inArray(housekeepingTasksTable.unitId, unitIds),
          ne(housekeepingTasksTable.status, "completed" as any),
          ne(housekeepingTasksTable.status, "verified" as any),
          ne(housekeepingTasksTable.status, "cancelled" as any),
        )),

      // SPA today
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

      // F&B tables
      db.select({ status: fbTablesTable.status }).from(fbTablesTable)
        .where(and(eq(fbTablesTable.organizationId, orgId), eq(fbTablesTable.isActive, true))),

      // Inbox unread
      db.select({
        id: conversationsTable.id, unreadCount: conversationsTable.unreadCount,
        subject: conversationsTable.subject, channel: conversationsTable.channel,
        guestName: conversationsTable.guestName, updatedAt: conversationsTable.updatedAt,
      }).from(conversationsTable)
        .where(and(eq(conversationsTable.organizationId, orgId), gte(conversationsTable.unreadCount, 1)))
        .orderBy(desc(conversationsTable.updatedAt)).limit(5),

      // Rooms revenue this month
      db.select({ total: sql<string>`COALESCE(SUM(total_amount), 0)` })
        .from(bookingsTable).where(and(
          inArray(bookingsTable.unitId, unitIds),
          gte(bookingsTable.createdAt, monthStart),
          ne(bookingsTable.status, "cancelled" as any),
        )),

      // Rooms revenue last month
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

      // NEW: All bookings this month (for per-property breakdown)
      db.select({
        id: bookingsTable.id, unitId: bookingsTable.unitId,
        checkIn: bookingsTable.checkIn, checkOut: bookingsTable.checkOut,
        totalAmount: bookingsTable.totalAmount, paidAmount: bookingsTable.paidAmount,
        paymentStatus: bookingsTable.paymentStatus, status: bookingsTable.status,
        firstName: bookingsTable.firstName, lastName: bookingsTable.lastName,
        bookingRef: bookingsTable.bookingRef,
      }).from(bookingsTable).where(and(
        inArray(bookingsTable.unitId, unitIds),
        gte(bookingsTable.createdAt, monthStart),
        ne(bookingsTable.status, "cancelled" as any),
      )),

      // F&B revenue this month
      db.execute(
        sql`SELECT COALESCE(SUM(total_amount), 0) as total FROM fb_orders WHERE organization_id = ${orgId} AND status = 'billed' AND created_at >= ${monthStart}`
      ),

      // SPA revenue this month
      db.execute(
        sql`SELECT COALESCE(SUM(price), 0) as total FROM spa_appointments WHERE organization_id = ${orgId} AND status = 'completed' AND appointment_date >= ${todayStr}::date - 30`
      ),

      // Events revenue this month
      db.execute(
        sql`SELECT COALESCE(SUM(total_price), 0) as total FROM events WHERE organization_id = ${orgId} AND status IN ('confirmed','deposit_paid','completed') AND event_date >= ${monthStart.toISOString().split("T")[0]}::date`
      ),

      // YTD rooms revenue
      db.select({ total: sql<string>`COALESCE(SUM(total_amount), 0)` })
        .from(bookingsTable).where(and(
          inArray(bookingsTable.unitId, unitIds),
          gte(bookingsTable.createdAt, yearStart),
          ne(bookingsTable.status, "cancelled" as any),
        )),

      // SPA revenue this month (exact)
      db.execute(
        sql`SELECT COALESCE(SUM(price), 0) as total FROM spa_appointments WHERE organization_id = ${orgId} AND status = 'completed' AND appointment_date >= ${monthStart.toISOString().split("T")[0]}::date`
      ),

      // Events revenue this month (exact)
      db.execute(
        sql`SELECT COALESCE(SUM(total_price), 0) as total FROM events WHERE organization_id = ${orgId} AND status IN ('confirmed','deposit_paid','completed') AND event_date >= ${monthStart.toISOString().split("T")[0]}::date`
      ),

      // Debtors — bookings with outstanding balance (not paid, not cancelled)
      db.select({
        id: bookingsTable.id, bookingRef: bookingsTable.bookingRef,
        firstName: bookingsTable.firstName, lastName: bookingsTable.lastName,
        checkIn: bookingsTable.checkIn, checkOut: bookingsTable.checkOut,
        totalAmount: bookingsTable.totalAmount, paidAmount: bookingsTable.paidAmount,
        paymentStatus: bookingsTable.paymentStatus,
      }).from(bookingsTable).where(and(
        inArray(bookingsTable.unitId, unitIds),
        ne(bookingsTable.paymentStatus, "paid" as any),
        ne(bookingsTable.status, "cancelled" as any),
        ne(bookingsTable.status, "checked_out" as any),
      )).orderBy(desc(bookingsTable.checkOut)).limit(20),

      // Forecast: upcoming bookings next 30 days
      db.select({
        checkIn: bookingsTable.checkIn,
        cnt: sql<string>`COUNT(*)`,
        guests: sql<string>`SUM(guests_count)`,
      }).from(bookingsTable).where(and(
        inArray(bookingsTable.unitId, unitIds),
        gte(bookingsTable.checkIn, todayStr as any),
        lte(bookingsTable.checkIn, next30Str as any),
        ne(bookingsTable.status, "cancelled" as any),
      )).groupBy(bookingsTable.checkIn).orderBy(asc(bookingsTable.checkIn)),

      // Budget for current month
      db.select().from(monthlyBudgetsTable).where(and(
        eq(monthlyBudgetsTable.organizationId, orgId),
        eq(monthlyBudgetsTable.year, currentYear),
        eq(monthlyBudgetsTable.month, currentMonth),
      )).limit(1),
    ]);

    // --- Process existing data ---
    const arrivalsToday = allBookings.filter(b => b.checkIn === todayStr);
    const departuresToday = allBookings.filter(b => b.checkOut === todayStr);
    const inHouse = allBookings.filter(b =>
      b.checkIn <= todayStr && b.checkOut > todayStr &&
      ["confirmed", "checked_in", "pending"].includes(b.status)
    );
    const occupancy = unitIds.length > 0 ? Math.round((inHouse.length / unitIds.length) * 100) : 0;
    const revenueToday = allBookings.filter(b => b.checkOut === todayStr).reduce((s, b) => s + parseFloat(b.totalAmount), 0);

    // 7-day revenue
    const sevenDayRevenue = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dStr = d.toISOString().split("T")[0];
      const dayRev = allMonthBookings.filter(b => b.checkOut === dStr).reduce((s, b) => s + parseFloat(b.totalAmount), 0);
      sevenDayRevenue.push({ date: dStr, label: d.toLocaleDateString("uk", { weekday: "short" }), rooms: dayRev });
    }

    const hkPending = hkTasks.filter(t => t.status === "pending").length;
    const hkInProgress = hkTasks.filter(t => t.status === "in_progress").length;
    const hkHigh = hkTasks.filter(t => t.priority === "high").length;
    const totalUnread = inboxData.reduce((s, c) => s + (c.unreadCount || 0), 0);
    const revMonth = Math.round(parseFloat(revenueThisMonth[0]?.total || "0"));
    const revLastMonth = Math.round(parseFloat(revenueLastMonth[0]?.total || "0"));
    const fbRevToday = Math.round(parseFloat(fbRevenueToday[0]?.total || "0"));
    const spaRevTodayVal = Math.round(parseFloat(spaRevToday[0]?.total || "0"));

    // --- NEW: Department breakdown ---
    const fbMonthRev = Math.round(parseFloat((fbMonthRevenue.rows[0] as any)?.total || "0"));
    const spaMonthRev = Math.round(parseFloat((spaRevMonth.rows[0] as any)?.total || "0"));
    const eventsMonthRev = Math.round(parseFloat((eventsRevMonth.rows[0] as any)?.total || "0"));
    const totalMonthRevenue = revMonth + fbMonthRev + spaMonthRev + eventsMonthRev;

    const byDepartment = {
      accommodation: {
        revenue: revMonth,
        share: totalMonthRevenue > 0 ? Math.round((revMonth / totalMonthRevenue) * 100) : 0,
        bookings: allMonthBookings.length,
        label: "Проживання",
        color: "blue",
      },
      fb: {
        revenue: fbMonthRev,
        share: totalMonthRevenue > 0 ? Math.round((fbMonthRev / totalMonthRevenue) * 100) : 0,
        label: "F&B",
        color: "orange",
      },
      spa: {
        revenue: spaMonthRev,
        share: totalMonthRevenue > 0 ? Math.round((spaMonthRev / totalMonthRevenue) * 100) : 0,
        label: "SPA & Велнес",
        color: "teal",
      },
      events: {
        revenue: eventsMonthRev,
        share: totalMonthRevenue > 0 ? Math.round((eventsMonthRev / totalMonthRevenue) * 100) : 0,
        label: "Events",
        color: "pink",
      },
    };

    // --- By Property breakdown ---
    const propMap = new Map<number, { name: string; unitIds: number[] }>();
    for (const prop of orgProperties) {
      propMap.set(prop.id, { name: prop.name, unitIds: [] });
    }
    for (const u of orgUnitsWithProp) {
      if (propMap.has(u.propertyId)) {
        propMap.get(u.propertyId)!.unitIds.push(u.id);
      }
    }

    const byProperty = Array.from(propMap.entries()).map(([propId, prop]) => {
      const propUnitIds = prop.unitIds;
      const propInHouse = inHouse.filter(b => propUnitIds.includes(b.unitId));
      const propMonthBookings = allMonthBookings.filter(b => propUnitIds.includes(b.unitId));
      const propRevMonth = propMonthBookings.reduce((s, b) => s + parseFloat(b.totalAmount), 0);
      const propOccupancy = propUnitIds.length > 0 ? Math.round((propInHouse.length / propUnitIds.length) * 100) : 0;
      const propArrivals = arrivalsToday.filter(b => propUnitIds.includes(b.unitId)).length;
      const propDepartures = departuresToday.filter(b => propUnitIds.includes(b.unitId)).length;

      // ADR (Average Daily Rate) for this month
      const occupiedNights = propMonthBookings.reduce((s, b) => {
        const ci = new Date(b.checkIn); const co = new Date(b.checkOut);
        const nights = Math.max(0, Math.round((co.getTime() - ci.getTime()) / 86400000));
        return s + nights;
      }, 0);
      const adr = occupiedNights > 0 ? Math.round(propRevMonth / occupiedNights) : 0;

      return {
        id: propId,
        name: prop.name,
        totalUnits: propUnitIds.length,
        inHouse: propInHouse.length,
        occupancy: propOccupancy,
        revenueMonth: Math.round(propRevMonth),
        bookingsMonth: propMonthBookings.length,
        arrivalsToday: propArrivals,
        departuresToday: propDepartures,
        adr,
      };
    });

    // --- Financials: ADR, Payments, Debts ---
    const totalOccupiedNights = allMonthBookings.reduce((s, b) => {
      const ci = new Date(b.checkIn); const co = new Date(b.checkOut);
      const nights = Math.max(0, Math.round((co.getTime() - ci.getTime()) / 86400000));
      return s + nights;
    }, 0);
    const adr = totalOccupiedNights > 0 ? Math.round(revMonth / totalOccupiedNights) : 0;

    const paidBookings = allMonthBookings.filter(b => b.paymentStatus === "paid");
    const partialBookings = allMonthBookings.filter(b => b.paymentStatus === "partial");
    const unpaidBookings = allMonthBookings.filter(b => b.paymentStatus === "unpaid");

    const paidAmount = paidBookings.reduce((s, b) => s + parseFloat(b.paidAmount || "0"), 0);
    const partialPaidAmount = partialBookings.reduce((s, b) => s + parseFloat(b.paidAmount || "0"), 0);
    const totalDebt = debtorBookings.reduce((s, b) => {
      const debt = parseFloat(b.totalAmount) - parseFloat(b.paidAmount || "0");
      return s + Math.max(0, debt);
    }, 0);

    const ytdRev = Math.round(parseFloat(allYearBookings[0]?.total || "0"));

    const financials = {
      adr,
      totalDebt: Math.round(totalDebt),
      paidThisMonth: Math.round(paidAmount + partialPaidAmount),
      unpaidCount: unpaidBookings.length,
      partialCount: partialBookings.length,
      paidCount: paidBookings.length,
      revenueYTD: ytdRev,
      totalMonthRevenue,
      fbMonthRevenue: fbMonthRev,
      spaMonthRevenue: spaMonthRev,
      eventsMonthRevenue: eventsMonthRev,
    };

    // --- Budget/Plan vs Actual ---
    const budgetData = budgetRow[0] || null;
    let budget = null;
    if (budgetData) {
      const totalActual = totalMonthRevenue;
      const totalTarget = parseFloat(budgetData.totalTarget as string);
      const accTarget = parseFloat(budgetData.accommodationTarget as string);
      const fbTarget = parseFloat(budgetData.fbTarget as string);
      const spaTarget = parseFloat(budgetData.spaTarget as string);
      const evTarget = parseFloat(budgetData.eventsTarget as string);
      const occTarget = parseFloat(budgetData.occupancyTarget as string);
      const adrTarget = parseFloat(budgetData.adrTarget as string);

      budget = {
        year: budgetData.year,
        month: budgetData.month,
        targets: {
          total: Math.round(totalTarget),
          accommodation: Math.round(accTarget),
          fb: Math.round(fbTarget),
          spa: Math.round(spaTarget),
          events: Math.round(evTarget),
          occupancy: occTarget,
          adr: Math.round(adrTarget),
        },
        actuals: {
          total: totalActual,
          accommodation: revMonth,
          fb: fbMonthRev,
          spa: spaMonthRev,
          events: eventsMonthRev,
          occupancy,
          adr,
        },
        pct: {
          total: totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0,
          accommodation: accTarget > 0 ? Math.round((revMonth / accTarget) * 100) : 0,
          fb: fbTarget > 0 ? Math.round((fbMonthRev / fbTarget) * 100) : 0,
          spa: spaTarget > 0 ? Math.round((spaMonthRev / spaTarget) * 100) : 0,
          events: evTarget > 0 ? Math.round((eventsMonthRev / evTarget) * 100) : 0,
          occupancy: occTarget > 0 ? Math.round((occupancy / occTarget) * 100) : 0,
          adr: adrTarget > 0 ? Math.round((adr / adrTarget) * 100) : 0,
        },
      };
    }

    // --- Forecast 30 days ---
    const forecastMap = new Map<string, { arrivals: number; guests: number }>();
    for (const row of forecast30 as any[]) {
      forecastMap.set(row.checkIn, { arrivals: parseInt(row.cnt || "0"), guests: parseInt(row.guests || "0") });
    }
    const forecast = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const dStr = d.toISOString().split("T")[0];
      const f = forecastMap.get(dStr);
      // Count in-house for that date (simplified: check bookings that span that date)
      const inHouseOnDay = allBookings.filter(b =>
        b.checkIn <= dStr && b.checkOut > dStr && !["cancelled"].includes(b.status)
      ).length;
      const projectedOcc = unitIds.length > 0 ? Math.round((inHouseOnDay / unitIds.length) * 100) : 0;
      forecast.push({
        date: dStr,
        label: d.toLocaleDateString("uk", { day: "numeric", month: "short" }),
        weekday: d.toLocaleDateString("uk", { weekday: "short" }),
        arrivals: f?.arrivals || 0,
        inHouse: inHouseOnDay,
        occupancy: projectedOcc,
        isToday: dStr === todayStr,
        isWeekend: [0, 6].includes(d.getDay()),
      });
    }

    // --- Debtors list ---
    const debtorsList = debtorBookings.map(b => ({
      id: b.id,
      bookingRef: b.bookingRef,
      name: [b.firstName, b.lastName].filter(Boolean).join(" ") || "Гість",
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      totalAmount: parseFloat(b.totalAmount),
      paidAmount: parseFloat(b.paidAmount || "0"),
      debt: Math.max(0, parseFloat(b.totalAmount) - parseFloat(b.paidAmount || "0")),
      paymentStatus: b.paymentStatus,
    })).filter(d => d.debt > 0);

    res.json({
      kpi: {
        occupancy,
        totalUnits: unitIds.length,
        inHouseCount: inHouse.length,
        arrivalsToday: arrivalsToday.length,
        departuresToday: departuresToday.length,
        revenueToday: Math.round(revenueToday),
        revenueThisMonth: revMonth,
        revenueLastMonth: revLastMonth,
        fbRevenueToday: fbRevToday,
        spaRevenueToday: spaRevTodayVal,
        fbOpenOrders: fbOpenOrders.length,
        spaTodayCount: spaTodayAppts.length,
        eventsThisWeek: eventsUpcoming.length,
        hkPending,
        hkInProgress,
        inboxUnread: totalUnread,
        adr,
        totalDebt: Math.round(totalDebt),
        paidThisMonth: Math.round(paidAmount + partialPaidAmount),
        revenueYTD: ytdRev,
        totalMonthRevenue,
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
      // New
      byProperty,
      byDepartment,
      financials,
      debtors: debtorsList,
      forecast,
      budget,
    });
  } catch (e: any) {
    console.error("HQ overview error:", e.message, e.stack?.slice(0, 500));
    res.status(500).json({ error: e.message });
  }
});

// Budget CRUD
router.get("/budget", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const rows = await db.select().from(monthlyBudgetsTable)
      .where(eq(monthlyBudgetsTable.organizationId, orgId))
      .orderBy(desc(monthlyBudgetsTable.year), desc(monthlyBudgetsTable.month))
      .limit(12);
    res.json({ budgets: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/budget", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { year, month, accommodationTarget, fbTarget, spaTarget, eventsTarget, totalTarget, occupancyTarget, adrTarget, notes } = req.body;
    const inserted = await db.insert(monthlyBudgetsTable).values({
      organizationId: orgId, year, month,
      accommodationTarget: accommodationTarget?.toString() || "0",
      fbTarget: fbTarget?.toString() || "0",
      spaTarget: spaTarget?.toString() || "0",
      eventsTarget: eventsTarget?.toString() || "0",
      totalTarget: totalTarget?.toString() || "0",
      occupancyTarget: occupancyTarget?.toString() || "0",
      adrTarget: adrTarget?.toString() || "0",
      notes,
    }).returning();
    res.json({ budget: inserted[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/budget/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const id = parseInt(req.params.id);
    const { accommodationTarget, fbTarget, spaTarget, eventsTarget, totalTarget, occupancyTarget, adrTarget, notes } = req.body;
    const updated = await db.update(monthlyBudgetsTable)
      .set({
        accommodationTarget: accommodationTarget?.toString(),
        fbTarget: fbTarget?.toString(),
        spaTarget: spaTarget?.toString(),
        eventsTarget: eventsTarget?.toString(),
        totalTarget: totalTarget?.toString(),
        occupancyTarget: occupancyTarget?.toString(),
        adrTarget: adrTarget?.toString(),
        notes,
      })
      .where(and(eq(monthlyBudgetsTable.id, id), eq(monthlyBudgetsTable.organizationId, orgId)))
      .returning();
    res.json({ budget: updated[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── OWNER DASHBOARD — Premium comprehensive analytics ───────────────────────
router.get("/owner-dashboard", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const DB = (db as any).$client;
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const yearStart  = `${now.getFullYear()}-01-01`;
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
    const lastYearStart  = `${now.getFullYear() - 1}-01-01`;
    const lastYearEnd    = `${now.getFullYear() - 1}-12-31`;
    const next30         = new Date(now.getTime() + 30 * 86400000).toISOString().split("T")[0];
    const next90         = new Date(now.getTime() + 90 * 86400000).toISOString().split("T")[0];

    // Unit IDs for the org
    const { rows: props } = await DB.query(`SELECT id FROM properties WHERE organization_id = $1`, [orgId]);
    const propIds = props.map((p: any) => p.id);
    const { rows: units } = propIds.length > 0
      ? await DB.query(`SELECT id, property_id FROM units WHERE property_id = ANY($1)`, [propIds])
      : { rows: [] };
    const unitIds = units.map((u: any) => u.id);
    const totalUnits = unitIds.length;
    if (totalUnits === 0) return res.json({ error: "No units configured" });

    const uids = unitIds;

    // ── Run all queries in parallel ─────────────────────────────────────────
    const [
      // Revenue (payments linked via bookings -> units -> properties)
      mtdRev, ytdRev, lastMonthRev, lastYearRev,
      // Bookings for occupancy
      occupiedNow, arrivalsToday, departuresToday,
      // Monthly trend (last 12 months)
      monthlyTrend,
      // By source
      sourcePerf,
      // Outstanding balances
      balanceSummary, topDebtors,
      // Reservations pipeline 90 days
      pipeline,
      // Staff performance
      staffPerf,
      // Property comparison
      propComparison,
      // SPA revenue
      spaRevMTD,
      // Events revenue
      eventsRevMTD,
      // F&B revenue
      fbRevMTD,
      // Rental revenue
      rentalRevMTD,
      // Folio breakdown by category
      folioByCategory,
      // ADR & RevPAR
      adrData,
      // Forecast 30 days
      forecastData,
      // Payment session stats
      paymentStats,
      // Alerts: overdue payments
      overduePayments, lowOccupancyProps,
    ] = await Promise.all([
      // MTD Revenue from payments (join via bookings -> unit_id)
      DB.query(`SELECT COALESCE(SUM(p.amount),0) total FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE b.unit_id=ANY($1) AND p.status='completed' AND p.created_at>=$2`, [uids, monthStart]),
      // YTD Revenue
      DB.query(`SELECT COALESCE(SUM(p.amount),0) total FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE b.unit_id=ANY($1) AND p.status='completed' AND p.created_at>=$2`, [uids, yearStart]),
      // Last month Revenue
      DB.query(`SELECT COALESCE(SUM(p.amount),0) total FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE b.unit_id=ANY($1) AND p.status='completed' AND p.created_at BETWEEN $2 AND $3`, [uids, lastMonthStart, lastMonthEnd]),
      // Last year Revenue
      DB.query(`SELECT COALESCE(SUM(p.amount),0) total FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE b.unit_id=ANY($1) AND p.status='completed' AND p.created_at BETWEEN $2 AND $3`, [uids, lastYearStart, lastYearEnd]),
      // In-house now
      DB.query(`SELECT COUNT(*) c FROM bookings WHERE unit_id=ANY($1) AND status='checked_in'`, [uids]),
      // Arrivals today
      DB.query(`SELECT COUNT(*) c FROM bookings WHERE unit_id=ANY($1) AND check_in=$2 AND status IN ('confirmed','pending')`, [uids, todayStr]),
      // Departures today
      DB.query(`SELECT COUNT(*) c FROM bookings WHERE unit_id=ANY($1) AND check_out=$2 AND status='checked_in'`, [uids, todayStr]),
      // Monthly revenue trend 12M (payments via bookings)
      DB.query(`
        SELECT TO_CHAR(DATE_TRUNC('month',p.created_at),'YYYY-MM') AS month,
               COALESCE(SUM(p.amount),0) AS total,
               COUNT(DISTINCT b.id) AS bookings
        FROM payments p
        JOIN bookings b ON b.id = p.booking_id
        WHERE b.unit_id=ANY($1) AND p.status='completed'
          AND p.created_at >= NOW() - INTERVAL '12 months'
        GROUP BY 1 ORDER BY 1`, [uids]),
      // Source performance
      DB.query(`
        SELECT COALESCE(source,'direct') AS source,
               COUNT(*) AS bookings,
               COALESCE(SUM(total_amount),0) AS revenue,
               COALESCE(AVG(total_amount),0) AS avg_value
        FROM bookings WHERE unit_id=ANY($1)
          AND check_in >= NOW() - INTERVAL '6 months'
        GROUP BY 1 ORDER BY revenue DESC`, [uids]),
      // Balance summary
      DB.query(`
        SELECT
          SUM(CASE WHEN payment_status='paid' THEN total_amount ELSE 0 END) AS paid,
          SUM(CASE WHEN payment_status!='paid' THEN total_amount ELSE 0 END) AS unpaid,
          COUNT(CASE WHEN payment_status!='paid' THEN 1 END) AS unpaid_count,
          SUM(CASE WHEN payment_status!='paid' AND check_in < NOW() THEN total_amount ELSE 0 END) AS overdue
        FROM bookings WHERE unit_id=ANY($1) AND status NOT IN ('cancelled')`, [uids]),
      // Top debtors
      DB.query(`
        SELECT CONCAT(first_name,' ',last_name) AS guest_name,
               COALESCE(total_amount,0)-COALESCE(paid_amount,0) AS owed,
               check_in, check_out, booking_ref
        FROM bookings WHERE unit_id=ANY($1)
          AND payment_status!='paid' AND status NOT IN ('cancelled')
          AND total_amount > 0
        ORDER BY owed DESC LIMIT 10`, [uids]),
      // Pipeline — next 90 days by date
      DB.query(`
        SELECT check_in AS date,
               COUNT(*) AS arrivals,
               COALESCE(SUM(total_amount),0) AS revenue,
               COALESCE(SUM(total_amount / GREATEST(check_out::date - check_in::date,1)),0) AS daily_rev
        FROM bookings WHERE unit_id=ANY($1)
          AND check_in BETWEEN $2 AND $3
          AND status IN ('confirmed','pending')
        GROUP BY 1 ORDER BY 1 LIMIT 90`, [uids, todayStr, next90]),
      // Staff performance (payments by staff, HK by assigned_to_id)
      DB.query(`
        SELECT u.name, u.role,
               COUNT(DISTINCT p.id) AS bookings_handled,
               COALESCE(SUM(p.amount),0) AS revenue_processed,
               COUNT(DISTINCT ht.id) AS hk_tasks
        FROM users u
        LEFT JOIN payments p ON p.staff_id = u.id AND p.created_at >= $2
        LEFT JOIN housekeeping_tasks ht ON ht.assigned_to_id = u.id AND ht.status='completed' AND ht.updated_at >= $2
        WHERE u.organization_id=$1 AND u.is_active=true
        GROUP BY u.id, u.name, u.role
        ORDER BY revenue_processed DESC LIMIT 15`, [orgId, monthStart]),
      // Property comparison (payments via bookings)
      DB.query(`
        SELECT p.id, p.name, p.type,
               COUNT(DISTINCT u.id) AS total_units,
               COUNT(DISTINCT CASE WHEN b.status='checked_in' THEN b.id END) AS in_house,
               COALESCE(SUM(CASE WHEN py.created_at>=$2 THEN py.amount ELSE 0 END),0) AS rev_mtd,
               COALESCE(SUM(CASE WHEN py.created_at>=$3 THEN py.amount ELSE 0 END),0) AS rev_ytd,
               COALESCE(AVG(CASE WHEN b.check_in>=$2 THEN b.total_amount/GREATEST(b.check_out::date-b.check_in::date,1) END),0) AS adr
        FROM properties p
        JOIN units u ON u.property_id = p.id
        LEFT JOIN bookings b ON b.unit_id = u.id AND b.status NOT IN ('cancelled')
        LEFT JOIN payments py ON py.booking_id = b.id AND py.status='completed'
        WHERE p.organization_id=$1
        GROUP BY p.id, p.name, p.type ORDER BY rev_ytd DESC`, [orgId, monthStart, yearStart]),
      // SPA revenue MTD/YTD
      DB.query(`SELECT COALESCE(SUM(CASE WHEN sa.appointment_date>=$2 THEN ss.price ELSE 0 END),0) mtd, COALESCE(SUM(CASE WHEN sa.appointment_date>=$3 THEN ss.price ELSE 0 END),0) ytd FROM spa_appointments sa JOIN spa_services ss ON ss.id=sa.service_id WHERE sa.organization_id=$1 AND sa.status='completed'`, [orgId, monthStart, yearStart]),
      // Events revenue MTD/YTD
      DB.query(`SELECT COALESCE(SUM(CASE WHEN event_date>=$2 THEN grand_total ELSE 0 END),0) mtd, COALESCE(SUM(CASE WHEN event_date>=$3 THEN grand_total ELSE 0 END),0) ytd FROM events WHERE organization_id=$1 AND status IN ('confirmed','deposit_paid','completed')`, [orgId, monthStart, yearStart]),
      // F&B revenue (orders)
      DB.query(`SELECT COALESCE(SUM(CASE WHEN fo.created_at>=$2 THEN fo.total_amount ELSE 0 END),0) mtd, COALESCE(SUM(CASE WHEN fo.created_at>=$3 THEN fo.total_amount ELSE 0 END),0) ytd FROM fb_orders fo WHERE fo.organization_id=$1 AND fo.status IN ('served','billed')`, [orgId, monthStart, yearStart]),
      // Rental revenue (folio entries tagged as rental)
      DB.query(`SELECT COALESCE(SUM(fe.total_amount),0) mtd FROM folio_entries fe WHERE fe.organization_id=$1 AND fe.entry_type='charge' AND fe.description ILIKE '%рент%' AND fe.created_at>=$2`, [orgId, monthStart]),
      // Folio entries by category
      DB.query(`SELECT rc.name AS category, rc.type, COALESCE(SUM(fe.total_amount),0) AS total FROM folio_entries fe LEFT JOIN revenue_categories rc ON rc.id=fe.revenue_category_id WHERE fe.organization_id=$1 AND fe.created_at>=$2 AND fe.entry_type='charge' GROUP BY rc.name, rc.type ORDER BY total DESC LIMIT 10`, [orgId, monthStart]),
      // ADR (avg daily rate from confirmed/checked-in bookings this month)
      DB.query(`SELECT COALESCE(AVG(total_amount/GREATEST(check_out::date-check_in::date,1)),0) adr, COALESCE(SUM(total_amount),0) total FROM bookings WHERE unit_id=ANY($1) AND check_in>=$2 AND status NOT IN ('cancelled')`, [uids, monthStart]),
      // Forecast: next 30 days arrivals + booked revenue
      DB.query(`
        SELECT b.check_in::date AS date,
               COUNT(*) AS arrivals,
               COALESCE(SUM(b.total_amount/GREATEST(b.check_out::date-b.check_in::date,1)),0) AS projected_rev,
               COUNT(*) * 100.0 / GREATEST($3,1) AS occ_pct
        FROM bookings b
        WHERE b.unit_id=ANY($1) AND b.check_in::date BETWEEN $2::date AND ($2::date + INTERVAL '30 days')::date
          AND b.status IN ('confirmed','pending')
        GROUP BY 1 ORDER BY 1`, [uids, todayStr, totalUnits]),
      // Payment session overview
      DB.query(`SELECT status, COUNT(*) cnt, COALESCE(SUM(amount),0) total FROM payment_sessions WHERE organization_id=$1 GROUP BY status`, [orgId]),
      // Overdue payments (bookings with outstanding balance + past check-out)
      DB.query(`SELECT CONCAT(first_name,' ',last_name) AS guest_name, booking_ref, check_out, COALESCE(total_amount,0)-COALESCE(paid_amount,0) owed FROM bookings WHERE unit_id=ANY($1) AND payment_status!='paid' AND check_out<$2 AND status NOT IN ('cancelled') ORDER BY owed DESC LIMIT 5`, [uids, todayStr]),
      // Low occupancy properties
      DB.query(`SELECT p.name, COUNT(DISTINCT u.id) total, COUNT(DISTINCT CASE WHEN b.status='checked_in' THEN b.unit_id END) occ FROM properties p JOIN units u ON u.property_id=p.id LEFT JOIN bookings b ON b.unit_id=u.id WHERE p.organization_id=$1 GROUP BY p.id, p.name HAVING COUNT(DISTINCT CASE WHEN b.status='checked_in' THEN b.unit_id END)*100.0/GREATEST(COUNT(DISTINCT u.id),1) < 20 LIMIT 5`, [orgId]),
    ]);

    // ── Compute derived KPIs ─────────────────────────────────────────────────
    const revenueTotal = parseFloat(mtdRev.rows[0]?.total || 0);
    const revenueYTD   = parseFloat(ytdRev.rows[0]?.total || 0);
    const revenueLM    = parseFloat(lastMonthRev.rows[0]?.total || 0);
    const revenueLY    = parseFloat(lastYearRev.rows[0]?.total || 0);
    const occupiedCount = parseInt(occupiedNow.rows[0]?.c || 0);
    const occupancyPct  = totalUnits > 0 ? Math.round((occupiedCount / totalUnits) * 100) : 0;
    const adr           = parseFloat(adrData.rows[0]?.adr || 0);
    const revpar        = totalUnits > 0 ? (adr * occupancyPct) / 100 : 0;
    const spaMtd    = parseFloat(spaRevMTD.rows[0]?.mtd || 0);
    const spaYtd    = parseFloat(spaRevMTD.rows[0]?.ytd || 0);
    const eventsMtd = parseFloat(eventsRevMTD.rows[0]?.mtd || 0);
    const eventsYtd = parseFloat(eventsRevMTD.rows[0]?.ytd || 0);
    const fbMtd     = parseFloat(fbRevMTD.rows[0]?.mtd || 0);
    const fbYtd     = parseFloat(fbRevMTD.rows[0]?.ytd || 0);
    const rentalMtd = parseFloat(rentalRevMTD.rows[0]?.mtd || 0);
    const accMtd    = Math.max(0, revenueTotal - spaMtd - eventsMtd - fbMtd - rentalMtd);

    const totalRevAllUnits = accMtd + spaMtd + eventsMtd + fbMtd + rentalMtd;

    const byUnit = {
      accommodation: { revenue: accMtd,    ytd: 0,        share: totalRevAllUnits > 0 ? Math.round(accMtd/totalRevAllUnits*100) : 0,    label: "Проживання",    color: "#4F46E5" },
      spa:           { revenue: spaMtd,    ytd: spaYtd,   share: totalRevAllUnits > 0 ? Math.round(spaMtd/totalRevAllUnits*100) : 0,    label: "SPA & Велнес", color: "#0EA5E9" },
      restaurant:    { revenue: fbMtd,     ytd: fbYtd,    share: totalRevAllUnits > 0 ? Math.round(fbMtd/totalRevAllUnits*100) : 0,     label: "Ресторан",      color: "#F97316" },
      events:        { revenue: eventsMtd, ytd: eventsYtd,share: totalRevAllUnits > 0 ? Math.round(eventsMtd/totalRevAllUnits*100) : 0, label: "Events",        color: "#EC4899" },
      rental:        { revenue: rentalMtd, ytd: 0,        share: totalRevAllUnits > 0 ? Math.round(rentalMtd/totalRevAllUnits*100) : 0, label: "Оренда",        color: "#10B981" },
    };

    // Balances
    const bal = balanceSummary.rows[0] || {};
    const balances = {
      paid:       parseFloat(bal.paid   || 0),
      unpaid:     parseFloat(bal.unpaid || 0),
      overdue:    parseFloat(bal.overdue || 0),
      unpaidCount: parseInt(bal.unpaid_count || 0),
      topDebtors:  topDebtors.rows.map((d: any) => ({ ...d, owed: parseFloat(d.owed || 0) })),
    };

    // Monthly trend: fill months with 0 if missing
    const trend12 = monthlyTrend.rows.map((r: any) => ({
      month: r.month, revenue: parseFloat(r.total), bookings: parseInt(r.bookings)
    }));

    // Sources
    const totalBookings = sourcePerf.rows.reduce((acc: number, r: any) => acc + parseInt(r.bookings), 0);
    const sources = sourcePerf.rows.map((r: any) => ({
      source:   r.source,
      bookings: parseInt(r.bookings),
      revenue:  parseFloat(r.revenue),
      avgValue: parseFloat(r.avg_value),
      share:    totalBookings > 0 ? Math.round(parseInt(r.bookings)/totalBookings*100) : 0,
      label:    ({ airbnb: "Airbnb", booking: "Booking.com", direct: "Прямий", walk_in: "Walk-in", expedia: "Expedia", other: "Інше" } as any)[r.source] || r.source,
    }));

    // Pipeline grouped by week
    const pipelineByDay = pipeline.rows.map((r: any) => ({
      date:     r.date, arrivals: parseInt(r.arrivals),
      revenue:  parseFloat(r.revenue), dailyRev: parseFloat(r.daily_rev),
    }));

    // Property comparison
    const properties = propComparison.rows.map((r: any) => {
      const revpar = r.total_units > 0 ? parseFloat(r.rev_mtd) / parseInt(r.total_units) : 0;
      const occ = parseInt(r.total_units) > 0 ? Math.round(parseInt(r.in_house)/parseInt(r.total_units)*100) : 0;
      return { id: r.id, name: r.name, type: r.type, totalUnits: parseInt(r.total_units), inHouse: parseInt(r.in_house), occupancy: occ, revMTD: parseFloat(r.rev_mtd), revYTD: parseFloat(r.rev_ytd), adr: parseFloat(r.adr), revpar };
    });

    // Staff
    const staff = staffPerf.rows.map((r: any) => ({
      name: r.name, role: r.role,
      bookings: parseInt(r.bookings_handled || 0),
      revenue:  parseFloat(r.revenue_processed || 0),
      hkTasks:  parseInt(r.hk_tasks || 0),
    }));

    // Forecast
    const forecast = forecastData.rows.map((r: any) => ({
      date: r.date, arrivals: parseInt(r.arrivals),
      projectedRev: parseFloat(r.projected_rev),
      occupancyPct: parseFloat(r.occ_pct),
    }));

    // Alerts
    const alerts: any[] = [];
    overduePayments.rows.forEach((d: any) => {
      if (parseFloat(d.owed) > 0) alerts.push({ type: "payment", severity: "high", message: `Прострочений баланс ${Math.round(parseFloat(d.owed)).toLocaleString()} ₴ — ${d.guest_name || d.booking_ref}`, action: "/finance" });
    });
    lowOccupancyProps.rows.forEach((p: any) => {
      alerts.push({ type: "occupancy", severity: "medium", message: `Низька завантаженість у "${p.name}": ${Math.round(parseInt(p.occ)/Math.max(parseInt(p.total),1)*100)}%`, action: "/chess" });
    });
    if (occupancyPct < 30) alerts.push({ type: "occupancy", severity: "medium", message: `Загальна завантаженість ${occupancyPct}% — нижче норми`, action: "/chess" });
    if (balances.unpaid > 50000) alerts.push({ type: "payment", severity: "high", message: `Неоплачені рахунки на ${Math.round(balances.unpaid).toLocaleString()} ₴`, action: "/finance" });

    // Payment session stats
    const sessionsByStatus: Record<string,any> = {};
    paymentStats.rows.forEach((r: any) => { sessionsByStatus[r.status] = { count: parseInt(r.cnt), total: parseFloat(r.total) }; });

    // Period comparison
    const mtdPct = revenueLM > 0 ? Math.round(((revenueTotal - revenueLM) / revenueLM) * 100) : 0;
    const ytdPct = revenueLY > 0 ? Math.round(((revenueYTD - revenueLY) / revenueLY) * 100) : 0;

    // Folio breakdown
    const folio = folioByCategory.rows.map((r: any) => ({ category: r.category || "Інше", type: r.type, total: parseFloat(r.total) }));

    // AI Summary — generate health score and text
    const healthScore = Math.min(100, Math.max(0,
      (occupancyPct > 60 ? 30 : occupancyPct > 30 ? 15 : 5) +
      (mtdPct > 0 ? 25 : mtdPct > -10 ? 15 : 5) +
      (alerts.filter((a:any) => a.severity==="high").length === 0 ? 20 : 10) +
      (balances.unpaid / Math.max(revenueTotal,1) < 0.2 ? 15 : 8) +
      (sources.length > 2 ? 10 : 5)
    ));

    const aiSummary = {
      healthScore,
      headline: healthScore >= 80 ? "Бізнес у чудовому стані 🟢" : healthScore >= 60 ? "Бізнес стабільний, є зони росту 🟡" : "Потрібна увага власника 🔴",
      bullets: [
        `Доходи MTD: ${Math.round(revenueTotal).toLocaleString()} ₴ (${mtdPct >= 0 ? "+" : ""}${mtdPct}% vs минулого місяця)`,
        `Завантаженість: ${occupancyPct}%, ADR: ${Math.round(adr).toLocaleString()} ₴, RevPAR: ${Math.round(revpar).toLocaleString()} ₴`,
        `Неоплачені баланси: ${Math.round(balances.unpaid).toLocaleString()} ₴ (${balances.unpaidCount} бронювань)`,
        sources.length > 0 ? `Топ-канал: ${sources[0]?.label} — ${sources[0]?.share}% бронювань` : "Немає даних по каналах",
        alerts.length === 0 ? "Активних тривог немає" : `${alerts.length} активних тривог потребують уваги`,
      ],
      recommendations: [
        occupancyPct < 40 ? "🎯 Запустіть промо-кампанію або знизьте ціни на вільні номери" : null,
        balances.unpaid > 30000 ? "💳 Надішліть нагадування про оплату невирішеним гостям" : null,
        sources.length < 3 ? "🌐 Диверсифікуйте канали продажів — підключіть Booking.com або Airbnb" : null,
        spaMtd < 5000 ? "💆 SPA-виручка низька — розгляньте акції на пакети" : null,
      ].filter(Boolean),
    };

    res.json({
      meta: { generatedAt: new Date(), orgId, period: { mtd: monthStart, ytd: yearStart } },
      kpi: {
        totalRevenueMTD: revenueTotal, revenueYTD, revenueLM, revenueLY,
        mtdPct, ytdPct, occupancy: occupancyPct, occupiedUnits: occupiedCount, totalUnits,
        adr: Math.round(adr), revpar: Math.round(revpar), arrivalsToday: parseInt(arrivalsToday.rows[0]?.c||0), departuresToday: parseInt(departuresToday.rows[0]?.c||0),
        avgCheck: revenueTotal > 0 && staff.length > 0 ? Math.round(revenueTotal / Math.max(totalBookings,1)) : 0,
      },
      byUnit,
      balances,
      monthlyTrend: trend12,
      sources,
      pipeline: pipelineByDay,
      forecast,
      staff,
      properties,
      folio,
      paymentSessions: sessionsByStatus,
      alerts,
      aiSummary,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
