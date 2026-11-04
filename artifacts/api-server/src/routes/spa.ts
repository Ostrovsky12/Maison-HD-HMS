import { Router } from "express";
import { db } from "@workspace/db";
import {
  spaServicesTable, spaSpecialistsTable, spaResourcesTable,
  spaAppointmentsTable, spaMembershipsTable, spaDayPassesTable
} from "@workspace/db";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { calculatePaymentDelta, orchestrateFiscalization, isSubmissionEligible } from "../services/prro-orchestrator.js";
import { submitDocument } from "./prro.js";

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
    const appointmentId = parseInt(req.params.id);
    const client = await (db as any).$client.connect();
    let current: any;
    let appt: any;
    let paymentEvent: any;
    try {
      await client.query("BEGIN");
      const locked = await client.query(
        `SELECT a.*, s.name AS service_name
           FROM spa_appointments a
           LEFT JOIN spa_services s ON s.id = a.service_id
          WHERE a.id = $1 AND a.organization_id = $2 FOR UPDATE OF a`,
        [appointmentId, orgId],
      );
      current = locked.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Appointment not found" });
      }
      const previousPaid = Number(current.paid_amount || 0);
      const requestedPaid = paidAmount === undefined ? previousPaid : Number(paidAmount);
      if (!Number.isFinite(requestedPaid) || requestedPaid < previousPaid) {
        await client.query("ROLLBACK");
        return res.status(422).json({ error: "paidAmount must not decrease" });
      }
      const eventKey = `spa:${appointmentId}:paid-to:${requestedPaid.toFixed(2)}`;
      const inserted = await client.query(
        `INSERT INTO payment_events
           (organization_id, source_type, source_id, event_key, previous_amount, target_amount, delta_amount, currency, payload)
         VALUES ($1,'spa_booking',$2,$3,$4,$5,$6,'UAH',$7)
         ON CONFLICT (organization_id, event_key) DO NOTHING
         RETURNING *`,
        [orgId, `spa:${appointmentId}`, eventKey, previousPaid.toFixed(2), requestedPaid.toFixed(2),
         Math.max(0, requestedPaid - previousPaid).toFixed(2),
         JSON.stringify({ appointmentId, paymentMethod: req.body.method || null, requestId: String(req.id ?? "") })],
      );
      paymentEvent = inserted.rows[0];
      if (!paymentEvent) {
        const existingEvent = await client.query(
          `SELECT * FROM payment_events WHERE organization_id = $1 AND event_key = $2 FOR UPDATE`,
          [orgId, eventKey],
        );
        paymentEvent = existingEvent.rows[0];
      } else {
        const updates: any[] = [];
        const values: any[] = [];
        if (status) { values.push(status); updates.push(`status = $${values.length}`); }
        if (staffNotes !== undefined) { values.push(staffNotes); updates.push(`staff_notes = $${values.length}`); }
        if (paidAmount !== undefined) {
          values.push(requestedPaid.toFixed(2)); updates.push(`paid_amount = $${values.length}`);
        }
        values.push(appointmentId, orgId);
        await client.query(
          `UPDATE spa_appointments SET ${updates.length ? `${updates.join(", ")},` : ""}
             updated_at = NOW() WHERE id = $${values.length - 1} AND organization_id = $${values.length}`,
          values,
        );
      }
      const refreshed = await client.query(
        `SELECT * FROM spa_appointments WHERE id = $1 AND organization_id = $2`,
        [appointmentId, orgId],
      );
      appt = refreshed.rows[0];
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    let fiscalization: any = null;
    const paymentDelta = Number(paymentEvent?.delta_amount || 0);
    const paymentEventKey = `appointment:${appointmentId}:paid-to:${Number(paymentEvent?.target_amount || 0).toFixed(2)}`;
    if (paymentDelta > 0) {
      try {
        const raw = await (db as any).$client.query(
          `SELECT a.booking_id, COALESCE(b.legal_entity_id, p.legal_entity_id) AS legal_entity_id
             FROM spa_appointments a
             LEFT JOIN bookings b ON b.id = a.booking_id AND b.organization_id = $2
             LEFT JOIN units u ON u.id = b.unit_id
             LEFT JOIN properties p ON p.id = u.property_id AND p.organization_id = $2
            WHERE a.id = $1 AND a.organization_id = $2`,
          [appointmentId, orgId],
        );
        const legalEntityId = req.body.legalEntityId || raw.rows[0]?.legal_entity_id;
        const method = req.body.method === "cash" ? "cash"
          : req.body.method === "iban_transfer" ? "iban_transfer" : "online_card";
        const result = await orchestrateFiscalization({
          organizationId: orgId,
          sourceType: "spa_booking",
          sourceId: paymentEventKey,
          defaultLegalEntityId: legalEntityId,
          items: [{
            name: current.service_name || "SPA послуга",
            quantity: 1,
            unitPrice: paymentDelta,
            amount: paymentDelta,
            legalEntityId,
          }],
          totalAmount: paymentDelta,
          itemKind: "service",
          paymentChannel: method,
          exemptionAuthority: req.body.exemptionAuthority,
          exemptionReference: req.body.exemptionReference,
          idempotencyKey: `payment-event:${orgId}:${paymentEvent.id}`,
          createdBy: req.user?.userId,
          requestId: String(req.id ?? ""),
        });
        const documents = [];
        for (const document of result.documents) {
          documents.push(isSubmissionEligible(document.status)
            ? await submitDocument(orgId, Number(document.id), String(req.id ?? ""))
            : document);
        }
        fiscalization = { ...result, documents };
        await (db as any).$client.query(
          `UPDATE payment_events SET status = 'allocated', updated_at = NOW() WHERE id = $1 AND status = 'pending'`,
          [paymentEvent.id],
        );
      } catch (error: any) {
        fiscalization = { error: error instanceof Error ? error.message : "Фіскалізація не виконана" };
      }
    }
    res.json({ appointment: appt, fiscalization });
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

// ─── Analytics ────────────────────────────────────────────────────────────────
router.get("/analytics", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const { from, to } = req.query as Record<string, string>;
    const fromDate = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);

    // Revenue by category
    const byCategoryRaw = await db.execute<any>(sql`
      SELECT s.category, COUNT(a.id)::int AS bookings, COALESCE(SUM(a.price::numeric),0)::float AS revenue
      FROM spa_appointments a
      JOIN spa_services s ON a.service_id = s.id
      WHERE a.organization_id = ${orgId}
        AND a.appointment_date BETWEEN ${fromDate}::date AND ${toDate}::date
        AND a.status IN ('completed','in_progress')
      GROUP BY s.category ORDER BY revenue DESC
    `);

    // Top services
    const topServicesRaw = await db.execute<any>(sql`
      SELECT s.name, s.category, COUNT(a.id)::int AS bookings, COALESCE(SUM(a.price::numeric),0)::float AS revenue
      FROM spa_appointments a
      JOIN spa_services s ON a.service_id = s.id
      WHERE a.organization_id = ${orgId}
        AND a.appointment_date BETWEEN ${fromDate}::date AND ${toDate}::date
        AND a.status IN ('completed','in_progress','confirmed')
      GROUP BY s.id, s.name, s.category ORDER BY revenue DESC LIMIT 8
    `);

    // Daily revenue (last 30 days)
    const dailyRaw = await db.execute<any>(sql`
      SELECT appointment_date::text AS date,
        COUNT(id)::int AS bookings,
        COALESCE(SUM(price::numeric) FILTER(WHERE status IN ('completed','in_progress')),0)::float AS revenue
      FROM spa_appointments
      WHERE organization_id = ${orgId}
        AND appointment_date BETWEEN ${fromDate}::date AND ${toDate}::date
      GROUP BY appointment_date ORDER BY appointment_date ASC
    `);

    // Day pass revenue
    const dayPassRaw = await db.execute<any>(sql`
      SELECT SUM(price::numeric)::float AS revenue, COUNT(*)::int AS passes, SUM(guest_count)::int AS guests
      FROM spa_day_passes
      WHERE organization_id = ${orgId}
        AND pass_date BETWEEN ${fromDate}::date AND ${toDate}::date
        AND is_active = true
    `);

    // Specialist performance
    const specialistRaw = await db.execute<any>(sql`
      SELECT sp.first_name || ' ' || sp.last_name AS name, sp.color,
        COUNT(a.id)::int AS bookings,
        COALESCE(SUM(a.price::numeric) FILTER(WHERE a.status IN ('completed','in_progress')),0)::float AS revenue,
        COUNT(a.id) FILTER(WHERE a.status = 'completed')::int AS completed
      FROM spa_specialists sp
      LEFT JOIN spa_appointments a ON a.specialist_id = sp.id AND a.appointment_date BETWEEN ${fromDate}::date AND ${toDate}::date
      WHERE sp.organization_id = ${orgId}
      GROUP BY sp.id, sp.first_name, sp.last_name, sp.color ORDER BY revenue DESC
    `);

    // Overall totals
    const totalsRaw = await db.execute<any>(sql`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER(WHERE status='completed')::int AS completed,
        COUNT(*) FILTER(WHERE status='cancelled')::int AS cancelled,
        COUNT(*) FILTER(WHERE status='no_show')::int AS no_show,
        COALESCE(SUM(price::numeric) FILTER(WHERE status IN ('completed','in_progress')),0)::float AS revenue
      FROM spa_appointments
      WHERE organization_id = ${orgId}
        AND appointment_date BETWEEN ${fromDate}::date AND ${toDate}::date
    `);

    res.json({
      period: { from: fromDate, to: toDate },
      totals: totalsRaw.rows[0] || {},
      dayPass: dayPassRaw.rows[0] || {},
      byCategory: byCategoryRaw.rows || [],
      topServices: topServicesRaw.rows || [],
      dailyRevenue: dailyRaw.rows || [],
      specialists: specialistRaw.rows || [],
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
