import { Router } from "express";
import { db } from "@workspace/db";
import {
  spaServicesTable, spaSpecialistsTable, spaResourcesTable,
  spaAppointmentsTable, spaMembershipsTable, spaDayPassesTable
} from "@workspace/db";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

function getOrgId(req: any) {
  return req.user?.organizationId;
}

// ─── Auto-seed demo data ───────────────────────────────────────────────────────
async function seedDemoSpa(organizationId: number) {
  const existing = await db.select({ id: spaServicesTable.id })
    .from(spaServicesTable)
    .where(eq(spaServicesTable.organizationId, organizationId))
    .limit(1);
  if (existing.length > 0) return;

  const services = await db.insert(spaServicesTable).values([
    { organizationId, name: "Класичний масаж", category: "massage", durationMinutes: 60, price: "900", description: "Розслаблюючий класичний масаж тіла", tags: ["популярне"], sortOrder: 1 },
    { organizationId, name: "Гарячі камені", category: "massage", durationMinutes: 90, price: "1400", description: "Масаж гарячими вулканічними каменями", tags: ["преміум"], sortOrder: 2 },
    { organizationId, name: "Ароматерапія", category: "body", durationMinutes: 60, price: "1100", description: "Масаж з ефірними оліями лаванди та евкаліпту", tags: [], sortOrder: 3 },
    { organizationId, name: "Джакузі (1 год)", category: "jacuzzi", durationMinutes: 60, price: "500", description: "Приватне джакузі для 1-2 осіб", requiresSpecialist: false, tags: [], sortOrder: 4 },
    { organizationId, name: "Фінська сауна", category: "sauna", durationMinutes: 120, price: "800", description: "Сауна для компанії до 8 осіб", requiresSpecialist: false, maxGuests: 8, tags: [], sortOrder: 5 },
    { organizationId, name: "Обгортання тіла", category: "body", durationMinutes: 60, price: "1200", description: "Детокс обгортання з морськими водоростями", tags: ["детокс"], sortOrder: 6 },
    { organizationId, name: "Масаж обличчя", category: "face", durationMinutes: 45, price: "700", description: "Відновлюючий масаж та догляд за шкірою обличчя", tags: [], sortOrder: 7 },
    { organizationId, name: "Спортивний масаж", category: "massage", durationMinutes: 60, price: "1000", description: "Глибокий масаж для відновлення після навантажень", tags: ["активний"], sortOrder: 8 },
  ]).returning();

  const specialists = await db.insert(spaSpecialistsTable).values([
    { organizationId, firstName: "Олена", lastName: "Коваль", phone: "+380501234567", bio: "Сертифікований масажист, 8 років досвіду", specializations: ["класичний масаж", "ароматерапія", "масаж обличчя"], workDays: [1,2,3,4,5,6], color: "#8b5cf6" },
    { organizationId, firstName: "Марія", lastName: "Ткаченко", phone: "+380671234568", bio: "Спеціаліст з тайського та спортивного масажу", specializations: ["спортивний масаж", "гарячі камені", "обгортання"], workDays: [1,2,3,4,5], color: "#ec4899" },
    { organizationId, firstName: "Іван", lastName: "Шевченко", phone: "+380931234569", bio: "Майстер релаксаційних технік та SPA процедур", specializations: ["класичний масаж", "гарячі камені", "спортивний масаж"], workDays: [2,3,4,5,6,0], color: "#06b6d4" },
  ]).returning();

  const resources = await db.insert(spaResourcesTable).values([
    { organizationId, name: "Кабінет 1", resourceType: "room", capacity: 1 },
    { organizationId, name: "Кабінет 2", resourceType: "room", capacity: 1 },
    { organizationId, name: "Кабінет пар (VIP)", resourceType: "room", capacity: 2 },
    { organizationId, name: "Джакузі №1", resourceType: "jacuzzi", capacity: 2 },
    { organizationId, name: "Джакузі №2", resourceType: "jacuzzi", capacity: 2 },
    { organizationId, name: "Фінська сауна", resourceType: "sauna", capacity: 8 },
  ]).returning();

  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  await db.insert(spaAppointmentsTable).values([
    { organizationId, serviceId: services[0].id, specialistId: specialists[0].id, resourceId: resources[0].id, guestName: "Оксана Мельник", guestPhone: "+380501111111", appointmentDate: fmt(today), startTime: "10:00", endTime: "11:00", durationMinutes: 60, price: "900", status: "confirmed", isHotelGuest: true },
    { organizationId, serviceId: services[1].id, specialistId: specialists[1].id, resourceId: resources[2].id, guestName: "Андрій Бойко", guestPhone: "+380672222222", appointmentDate: fmt(today), startTime: "12:00", endTime: "13:30", durationMinutes: 90, price: "1400", status: "confirmed", isHotelGuest: true },
    { organizationId, serviceId: services[3].id, resourceId: resources[3].id, guestName: "Наталія Павленко", guestPhone: "+380933333333", appointmentDate: fmt(today), startTime: "14:00", endTime: "15:00", durationMinutes: 60, price: "500", status: "pending", requiresSpecialist: false } as any,
    { organizationId, serviceId: services[4].id, resourceId: resources[5].id, guestName: "Родина Коваленко", guestPhone: "+380504444444", appointmentDate: fmt(today), startTime: "16:00", endTime: "18:00", durationMinutes: 120, price: "800", status: "pending" } as any,
    { organizationId, serviceId: services[0].id, specialistId: specialists[2].id, resourceId: resources[1].id, guestName: "Тетяна Гриценко", guestPhone: "+380675555555", appointmentDate: fmt(addDays(today, 1)), startTime: "11:00", endTime: "12:00", durationMinutes: 60, price: "900", status: "pending" },
    { organizationId, serviceId: services[7].id, specialistId: specialists[1].id, resourceId: resources[0].id, guestName: "Сергій Мороз", guestPhone: "+380936666666", appointmentDate: fmt(addDays(today, 1)), startTime: "09:00", endTime: "10:00", durationMinutes: 60, price: "1000", status: "pending", isHotelGuest: true },
  ]);

  await db.insert(spaMembershipsTable).values([
    { organizationId, guestName: "Ірина Захаренко", guestPhone: "+380507777777", membershipType: "sessions", name: "Абонемент масаж 10 сеансів", sessionsTotal: 10, sessionsUsed: 3, pricePaid: "7500", startsAt: fmt(addDays(today, -30)), expiresAt: fmt(addDays(today, 60)), status: "active", services: [services[0].id] },
    { organizationId, guestName: "Владислав Петренко", guestPhone: "+380678888888", membershipType: "monthly", name: "Місячний абонемент SPA", sessionsTotal: 20, sessionsUsed: 8, pricePaid: "9000", startsAt: fmt(addDays(today, -15)), expiresAt: fmt(addDays(today, 15)), status: "active" },
    { organizationId, guestName: "Людмила Харченко", guestPhone: "+380939999999", membershipType: "sessions", name: "Абонемент сауна 5 сеансів", sessionsTotal: 5, sessionsUsed: 5, pricePaid: "3200", startsAt: fmt(addDays(today, -60)), expiresAt: fmt(addDays(today, -1)), status: "expired" },
  ]);

  await db.insert(spaDayPassesTable).values([
    { organizationId, guestName: "Катерина Савченко", guestPhone: "+380501010101", guestCount: 2, passDate: fmt(today), price: "600", includes: ["сауна", "джакузі", "басейн"], isActive: true },
    { organizationId, guestName: "Максим Кравченко", guestPhone: "+380672020202", guestCount: 1, passDate: fmt(addDays(today, 1)), price: "300", includes: ["сауна", "джакузі"], isActive: true },
  ]);
}

// ─── SPA Stats ────────────────────────────────────────────────────────────────
router.get("/stats", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    await seedDemoSpa(orgId);
    const today = new Date().toISOString().slice(0, 10);

    const [todayAppts, allActive, memberships, dayPasses, revenue] = await Promise.all([
      db.select({ id: spaAppointmentsTable.id, status: spaAppointmentsTable.status, price: spaAppointmentsTable.price })
        .from(spaAppointmentsTable)
        .where(and(eq(spaAppointmentsTable.organizationId, orgId), eq(spaAppointmentsTable.appointmentDate, today))),
      db.select({ id: spaAppointmentsTable.id, status: spaAppointmentsTable.status, price: spaAppointmentsTable.price })
        .from(spaAppointmentsTable)
        .where(eq(spaAppointmentsTable.organizationId, orgId)),
      db.select({ id: spaMembershipsTable.id, status: spaMembershipsTable.status })
        .from(spaMembershipsTable).where(eq(spaMembershipsTable.organizationId, orgId)),
      db.select({ id: spaDayPassesTable.id, price: spaDayPassesTable.price })
        .from(spaDayPassesTable)
        .where(and(eq(spaDayPassesTable.organizationId, orgId), eq(spaDayPassesTable.passDate, today))),
      db.select({ total: sql<string>`SUM(paid_amount)` })
        .from(spaAppointmentsTable)
        .where(and(eq(spaAppointmentsTable.organizationId, orgId), eq(spaAppointmentsTable.appointmentDate, today))),
    ]);

    res.json({
      today: {
        total: todayAppts.length,
        confirmed: todayAppts.filter(a => a.status === "confirmed").length,
        pending: todayAppts.filter(a => a.status === "pending").length,
        completed: todayAppts.filter(a => a.status === "completed").length,
        revenue: parseFloat(revenue[0]?.total || "0"),
        dayPasses: dayPasses.length,
        dayPassRevenue: dayPasses.reduce((s, p) => s + parseFloat(p.price || "0"), 0),
      },
      memberships: {
        total: memberships.length,
        active: memberships.filter(m => m.status === "active").length,
        expired: memberships.filter(m => m.status === "expired").length,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Services ─────────────────────────────────────────────────────────────────
router.get("/services", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    await seedDemoSpa(orgId);
    const services = await db.select().from(spaServicesTable)
      .where(eq(spaServicesTable.organizationId, orgId))
      .orderBy(asc(spaServicesTable.sortOrder), asc(spaServicesTable.id));
    res.json({ services });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/services", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const [svc] = await db.insert(spaServicesTable).values({ ...req.body, organizationId: orgId }).returning();
    res.json({ service: svc });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/services/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const [svc] = await db.update(spaServicesTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(spaServicesTable.id, parseInt(req.params.id)), eq(spaServicesTable.organizationId, orgId)))
      .returning();
    res.json({ service: svc });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/spa/services/:id/slots?date=YYYY-MM-DD&specialistId=
router.get("/services/:id/slots", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const serviceId = parseInt(req.params.id);
    const date = req.query.date as string || new Date().toISOString().slice(0, 10);
    const specialistId = req.query.specialistId ? parseInt(req.query.specialistId as string) : null;

    const [service] = await db.select().from(spaServicesTable)
      .where(and(eq(spaServicesTable.id, serviceId), eq(spaServicesTable.organizationId, orgId)));
    if (!service) return res.status(404).json({ error: "Service not found" });

    const specialists = specialistId
      ? await db.select().from(spaSpecialistsTable).where(and(eq(spaSpecialistsTable.id, specialistId), eq(spaSpecialistsTable.organizationId, orgId)))
      : await db.select().from(spaSpecialistsTable).where(and(eq(spaSpecialistsTable.organizationId, orgId), eq(spaSpecialistsTable.isActive, true)));

    const existing = await db.select({
      specialistId: spaAppointmentsTable.specialistId,
      startTime: spaAppointmentsTable.startTime,
      endTime: spaAppointmentsTable.endTime,
      status: spaAppointmentsTable.status,
    }).from(spaAppointmentsTable)
      .where(and(eq(spaAppointmentsTable.organizationId, orgId), eq(spaAppointmentsTable.appointmentDate, date)));

    const slots: any[] = [];
    const dur = service.durationMinutes;
    const dayOfWeek = new Date(date + "T12:00:00Z").getDay();

    for (const sp of specialists) {
      const workDays = sp.workDays as number[];
      if (!workDays.includes(dayOfWeek)) continue;

      const start = sp.workStart || "09:00";
      const end = sp.workEnd || "18:00";
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      let current = sh * 60 + sm;
      const endMin = eh * 60 + em;

      const busySlots = existing.filter(e => e.specialistId === sp.id && !["cancelled", "no_show"].includes(e.status));

      while (current + dur <= endMin) {
        const timeStr = `${String(Math.floor(current / 60)).padStart(2, "0")}:${String(current % 60).padStart(2, "0")}`;
        const endStr = `${String(Math.floor((current + dur) / 60)).padStart(2, "0")}:${String((current + dur) % 60).padStart(2, "0")}`;
        const busy = busySlots.some(b => {
          const bs = parseInt(b.startTime.replace(":", ""));
          const be = parseInt(b.endTime.replace(":", ""));
          const cs = parseInt(timeStr.replace(":", ""));
          const ce = parseInt(endStr.replace(":", ""));
          return !(ce <= bs || cs >= be);
        });
        slots.push({ time: timeStr, endTime: endStr, specialistId: sp.id, specialistName: `${sp.firstName} ${sp.lastName}`, available: !busy });
        current += dur;
      }
    }

    res.json({ slots, date, serviceId, durationMinutes: dur });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Specialists ──────────────────────────────────────────────────────────────
router.get("/specialists", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const specialists = await db.select().from(spaSpecialistsTable)
      .where(eq(spaSpecialistsTable.organizationId, orgId))
      .orderBy(asc(spaSpecialistsTable.firstName));
    res.json({ specialists });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/specialists", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const [sp] = await db.insert(spaSpecialistsTable).values({ ...req.body, organizationId: orgId }).returning();
    res.json({ specialist: sp });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/specialists/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const [sp] = await db.update(spaSpecialistsTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(spaSpecialistsTable.id, parseInt(req.params.id)), eq(spaSpecialistsTable.organizationId, orgId)))
      .returning();
    res.json({ specialist: sp });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Resources ────────────────────────────────────────────────────────────────
router.get("/resources", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const resources = await db.select().from(spaResourcesTable)
      .where(eq(spaResourcesTable.organizationId, orgId))
      .orderBy(asc(spaResourcesTable.id));
    res.json({ resources });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Appointments ─────────────────────────────────────────────────────────────
router.get("/appointments", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const { date, status, from, to } = req.query;

    let conditions: any[] = [eq(spaAppointmentsTable.organizationId, orgId)];
    if (date) conditions.push(eq(spaAppointmentsTable.appointmentDate, date as string));
    if (status && status !== "all") conditions.push(eq(spaAppointmentsTable.status, status as any));
    if (from) conditions.push(gte(spaAppointmentsTable.appointmentDate, from as string));
    if (to) conditions.push(lte(spaAppointmentsTable.appointmentDate, to as string));

    const appointments = await db.select({
      id: spaAppointmentsTable.id,
      serviceId: spaAppointmentsTable.serviceId,
      specialistId: spaAppointmentsTable.specialistId,
      resourceId: spaAppointmentsTable.resourceId,
      guestName: spaAppointmentsTable.guestName,
      guestPhone: spaAppointmentsTable.guestPhone,
      appointmentDate: spaAppointmentsTable.appointmentDate,
      startTime: spaAppointmentsTable.startTime,
      endTime: spaAppointmentsTable.endTime,
      durationMinutes: spaAppointmentsTable.durationMinutes,
      price: spaAppointmentsTable.price,
      paidAmount: spaAppointmentsTable.paidAmount,
      status: spaAppointmentsTable.status,
      isHotelGuest: spaAppointmentsTable.isHotelGuest,
      isDayPass: spaAppointmentsTable.isDayPass,
      notes: spaAppointmentsTable.notes,
      staffNotes: spaAppointmentsTable.staffNotes,
      createdAt: spaAppointmentsTable.createdAt,
      serviceName: spaServicesTable.name,
      serviceCategory: spaServicesTable.category,
      specialistFirst: spaSpecialistsTable.firstName,
      specialistLast: spaSpecialistsTable.lastName,
      specialistColor: spaSpecialistsTable.color,
      resourceName: spaResourcesTable.name,
    })
      .from(spaAppointmentsTable)
      .leftJoin(spaServicesTable, eq(spaAppointmentsTable.serviceId, spaServicesTable.id))
      .leftJoin(spaSpecialistsTable, eq(spaAppointmentsTable.specialistId, spaSpecialistsTable.id))
      .leftJoin(spaResourcesTable, eq(spaAppointmentsTable.resourceId, spaResourcesTable.id))
      .where(and(...conditions))
      .orderBy(asc(spaAppointmentsTable.appointmentDate), asc(spaAppointmentsTable.startTime));

    const mapped = appointments.map(a => ({
      ...a,
      specialistName: a.specialistFirst ? `${a.specialistFirst} ${a.specialistLast}` : null,
    }));

    res.json({ appointments: mapped });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/appointments", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const { serviceId, specialistId, resourceId, guestName, guestPhone, appointmentDate, startTime, durationMinutes, price, notes, isHotelGuest, bookingId } = req.body;

    const dur = durationMinutes || 60;
    const [sh, sm] = startTime.split(":").map(Number);
    const endMin = sh * 60 + sm + dur;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

    const [appt] = await db.insert(spaAppointmentsTable).values({
      organizationId: orgId, serviceId, specialistId, resourceId,
      guestName, guestPhone, appointmentDate, startTime, endTime, durationMinutes: dur,
      price: price || "0", status: "pending", isHotelGuest: !!isHotelGuest, notes, bookingId,
    }).returning();
    res.json({ appointment: appt });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/appointments/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const { status, staffNotes, paidAmount } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (staffNotes !== undefined) updates.staffNotes = staffNotes;
    if (paidAmount !== undefined) updates.paidAmount = paidAmount;

    const [appt] = await db.update(spaAppointmentsTable)
      .set(updates)
      .where(and(eq(spaAppointmentsTable.id, parseInt(req.params.id)), eq(spaAppointmentsTable.organizationId, orgId)))
      .returning();
    res.json({ appointment: appt });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Memberships ──────────────────────────────────────────────────────────────
router.get("/memberships", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const { status } = req.query;
    let conditions: any[] = [eq(spaMembershipsTable.organizationId, orgId)];
    if (status && status !== "all") conditions.push(eq(spaMembershipsTable.status, status as any));

    const memberships = await db.select().from(spaMembershipsTable)
      .where(and(...conditions))
      .orderBy(desc(spaMembershipsTable.createdAt));
    res.json({ memberships });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/memberships", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const [m] = await db.insert(spaMembershipsTable).values({ ...req.body, organizationId: orgId }).returning();
    res.json({ membership: m });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/memberships/:id/use", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const [membership] = await db.select().from(spaMembershipsTable)
      .where(and(eq(spaMembershipsTable.id, parseInt(req.params.id)), eq(spaMembershipsTable.organizationId, orgId)));
    if (!membership) return res.status(404).json({ error: "Not found" });
    if (membership.status !== "active") return res.status(400).json({ error: "Membership is not active" });
    const sessionsUsed = membership.sessionsUsed + 1;
    const newStatus = (membership.sessionsTotal && sessionsUsed >= membership.sessionsTotal) ? "expired" : "active";

    const [updated] = await db.update(spaMembershipsTable)
      .set({ sessionsUsed, status: newStatus as any, updatedAt: new Date() })
      .where(eq(spaMembershipsTable.id, parseInt(req.params.id)))
      .returning();
    res.json({ membership: updated });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/memberships/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const [m] = await db.update(spaMembershipsTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(spaMembershipsTable.id, parseInt(req.params.id)), eq(spaMembershipsTable.organizationId, orgId)))
      .returning();
    res.json({ membership: m });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Day Passes ───────────────────────────────────────────────────────────────
router.get("/day-passes", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const { date } = req.query;
    let conditions: any[] = [eq(spaDayPassesTable.organizationId, orgId)];
    if (date) conditions.push(eq(spaDayPassesTable.passDate, date as string));

    const passes = await db.select().from(spaDayPassesTable)
      .where(and(...conditions))
      .orderBy(desc(spaDayPassesTable.createdAt));
    res.json({ passes });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/day-passes", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const [pass] = await db.insert(spaDayPassesTable).values({ ...req.body, organizationId: orgId }).returning();
    res.json({ pass });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
