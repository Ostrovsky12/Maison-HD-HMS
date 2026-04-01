import { Router } from "express";
import { db } from "@workspace/db";
import {
  eventSpacesTable, eventsTable, eventServicesTable, eventTasksTable
} from "@workspace/db";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
const getOrg = (req: any) => req.user?.organizationId;

// ─── Demo seed ────────────────────────────────────────────────────────────────
async function seedDemoEvents(orgId: number) {
  const existing = await db.select({ id: eventSpacesTable.id }).from(eventSpacesTable)
    .where(eq(eventSpacesTable.organizationId, orgId)).limit(1);
  if (existing.length > 0) return;

  const spaces = await db.insert(eventSpacesTable).values([
    { organizationId: orgId, name: "Великий банкетний зал", description: "Просторий зал з панорамними вікнами та сценою", capacityMin: 30, capacityMax: 250, areaSqm: 450, pricePerHour: 3000, pricePerDay: 18000, amenities: ["сцена", "сценічне освітлення", "мікрофони", "проектор", "кондиціонер", "фуршетна зона"], color: "#8b5cf6" },
    { organizationId: orgId, name: "VIP зал «Перлина»", description: "Камерний зал преміум-класу з каміном", capacityMin: 8, capacityMax: 40, areaSqm: 120, pricePerHour: 2000, pricePerDay: 12000, amenities: ["камін", "панорамні вікна", "звукова система", "міні-бар", "тераса"], color: "#ec4899" },
    { organizationId: orgId, name: "Конференц-зал", description: "Сучасний зал для ділових заходів", capacityMin: 10, capacityMax: 80, areaSqm: 180, pricePerHour: 1500, pricePerDay: 9000, amenities: ["проектор 4K", "фліп-чарт", "відеоконференція", "Wi-Fi", "кондиціонер"], color: "#06b6d4" },
    { organizationId: orgId, name: "Літня тераса", description: "Відкрита тераса з видом на озеро, навіс", capacityMin: 20, capacityMax: 120, areaSqm: 300, pricePerHour: 1200, pricePerDay: 7000, amenities: ["навіс", "освітлення", "барбекю", "вид на озеро"], color: "#10b981" },
  ]).returning();

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const add = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const today = new Date();

  const events = await db.insert(eventsTable).values([
    { organizationId: orgId, eventSpaceId: spaces[0].id, eventType: "wedding", name: "Весілля Олексія та Анни", clientName: "Олексій Мороз", clientPhone: "+380501111111", clientEmail: "mrooz@gmail.com", eventDate: fmt(add(today, 14)), startTime: "14:00", endTime: "23:00", guestCount: 120, status: "deposit_paid", venuePrice: "18000", servicesPrice: "45000", totalPrice: "63000", depositAmount: "15000", depositPaid: true, notes: "Тематика: лавандовий прованс. Торт 3 яруси.", tags: ["весілля", "преміум"] },
    { organizationId: orgId, eventSpaceId: spaces[2].id, eventType: "corporate", name: "Конференція TechUA 2026", clientName: "Тетяна Власенко", clientPhone: "+380672222222", clientEmail: "t.vlasenko@techua.com", eventDate: fmt(add(today, 3)), startTime: "09:00", endTime: "18:00", guestCount: 60, status: "confirmed", venuePrice: "9000", servicesPrice: "12000", totalPrice: "21000", depositAmount: "5000", depositPaid: true, notes: "Потрібна трансляція онлайн. Кава-паузи двічі.", tags: ["корпоратив"] },
    { organizationId: orgId, eventSpaceId: spaces[1].id, eventType: "birthday", name: "День народження Іванни (50 років)", clientName: "Іванна Захаренко", clientPhone: "+380933333333", eventDate: fmt(add(today, 7)), startTime: "19:00", endTime: "24:00", guestCount: 30, status: "confirmed", venuePrice: "12000", servicesPrice: "18000", totalPrice: "30000", depositAmount: "7500", depositPaid: false, notes: "Декор: золото + бургунді. Торт з фото.", tags: ["день народження"] },
    { organizationId: orgId, eventSpaceId: spaces[3].id, eventType: "gala", name: "Літній гала-вечір Dogoda Resort", clientName: "Адміністрація Dogoda", clientPhone: "+380501234567", eventDate: fmt(add(today, 30)), startTime: "18:00", endTime: "23:00", guestCount: 100, status: "offer_sent", venuePrice: "7000", servicesPrice: "20000", totalPrice: "27000", depositAmount: "0", depositPaid: false, notes: "Щорічний гала-вечір для постійних гостей.", tags: ["гала", "внутрішній"] },
    { organizationId: orgId, eventSpaceId: spaces[0].id, eventType: "wedding", name: "Весілля Дмитра та Катерини", clientName: "Дмитро Павленко", clientPhone: "+380674444444", eventDate: fmt(add(today, -10)), startTime: "15:00", endTime: "23:00", guestCount: 85, status: "completed", venuePrice: "18000", servicesPrice: "32000", totalPrice: "50000", depositAmount: "12500", depositPaid: true, notes: "", tags: ["весілля"] },
  ]).returning();

  await db.insert(eventServicesTable).values([
    { eventId: events[0].id, organizationId: orgId, category: "catering", name: "Банкетне меню (3 страви)", quantity: 120, unitPrice: "250", totalPrice: "30000", isConfirmed: true, vendorName: "ШефCatering", vendorPhone: "+380501010101" },
    { eventId: events[0].id, organizationId: orgId, category: "decoration", name: "Флористика та декор залу", quantity: 1, unitPrice: "8000", totalPrice: "8000", isConfirmed: true, vendorName: "FlowerArt Studio" },
    { eventId: events[0].id, organizationId: orgId, category: "music", name: "DJ + жива музика (3 год)", quantity: 1, unitPrice: "5000", totalPrice: "5000", isConfirmed: false, vendorName: "DJ Максим" },
    { eventId: events[0].id, organizationId: orgId, category: "photo_video", name: "Фото + відео", quantity: 1, unitPrice: "2000", totalPrice: "2000", isConfirmed: true },
    { eventId: events[1].id, organizationId: orgId, category: "catering", name: "Кава-паузи (2 рази × 60 осіб)", quantity: 2, unitPrice: "4500", totalPrice: "9000", isConfirmed: true, vendorName: "CoffeePro" },
    { eventId: events[1].id, organizationId: orgId, category: "equipment", name: "Онлайн-трансляція", quantity: 1, unitPrice: "3000", totalPrice: "3000", isConfirmed: true },
    { eventId: events[2].id, organizationId: orgId, category: "catering", name: "Фуршет (30 осіб)", quantity: 30, unitPrice: "400", totalPrice: "12000", isConfirmed: true },
    { eventId: events[2].id, organizationId: orgId, category: "decoration", name: "Декор + торт", quantity: 1, unitPrice: "6000", totalPrice: "6000", isConfirmed: false },
  ]);

  const addDue = (d: Date, n: number) => fmt(add(d, n));
  const ev0date = new Date(events[0].eventDate + "T12:00:00");
  await db.insert(eventTasksTable).values([
    { eventId: events[0].id, organizationId: orgId, title: "Підтвердити меню з кейтерингом", status: "done", dueDate: addDue(ev0date, -14), sortOrder: 1 },
    { eventId: events[0].id, organizationId: orgId, title: "Погодити макет флористики", status: "done", dueDate: addDue(ev0date, -10), sortOrder: 2 },
    { eventId: events[0].id, organizationId: orgId, title: "Підтвердити DJ та плейлист", status: "pending", dueDate: addDue(ev0date, -5), sortOrder: 3 },
    { eventId: events[0].id, organizationId: orgId, title: "Розставити столи та стільці", status: "pending", dueDate: addDue(ev0date, -1), sortOrder: 4 },
    { eventId: events[0].id, organizationId: orgId, title: "Декорування залу", status: "pending", dueDate: addDue(ev0date, 0), sortOrder: 5 },
    { eventId: events[0].id, organizationId: orgId, title: "Прибирання після заходу", status: "pending", dueDate: addDue(ev0date, 1), sortOrder: 6 },
    { eventId: events[1].id, organizationId: orgId, title: "Налаштувати проектор та трансляцію", status: "in_progress", dueDate: addDue(new Date(events[1].eventDate + "T12:00:00"), -1), sortOrder: 1 },
    { eventId: events[1].id, organizationId: orgId, title: "Підготувати матеріали для учасників", status: "done", dueDate: addDue(new Date(events[1].eventDate + "T12:00:00"), -3), sortOrder: 2 },
    { eventId: events[1].id, organizationId: orgId, title: "Зарезервувати парковку", status: "pending", dueDate: addDue(new Date(events[1].eventDate + "T12:00:00"), -1), sortOrder: 3 },
  ]);
}

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get("/stats", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedDemoEvents(orgId);
    const today = new Date().toISOString().slice(0, 10);
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
    const monthEnd = new Date(); monthEnd.setDate(monthEnd.getDate() + 30);

    const all = await db.select({
      id: eventsTable.id, status: eventsTable.status, eventDate: eventsTable.eventDate,
      totalPrice: eventsTable.totalPrice, guestCount: eventsTable.guestCount,
    }).from(eventsTable).where(eq(eventsTable.organizationId, orgId));

    const upcoming = all.filter(e => e.eventDate >= today && !["cancelled", "completed"].includes(e.status));
    const thisWeek = upcoming.filter(e => e.eventDate <= weekEnd.toISOString().slice(0, 10));
    const thisMonth = upcoming.filter(e => e.eventDate <= monthEnd.toISOString().slice(0, 10));
    const revenue = all.filter(e => e.status === "completed").reduce((s, e) => s + parseFloat(e.totalPrice || "0"), 0);

    res.json({
      total: all.length,
      upcoming: upcoming.length,
      thisWeek: thisWeek.length,
      thisMonth: thisMonth.length,
      confirmed: all.filter(e => ["confirmed", "deposit_paid"].includes(e.status)).length,
      completed: all.filter(e => e.status === "completed").length,
      totalRevenue: revenue,
      upcomingRevenue: upcoming.reduce((s, e) => s + parseFloat(e.totalPrice || "0"), 0),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Spaces ───────────────────────────────────────────────────────────────────
router.get("/spaces", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedDemoEvents(orgId);
    const spaces = await db.select().from(eventSpacesTable)
      .where(eq(eventSpacesTable.organizationId, orgId))
      .orderBy(asc(eventSpacesTable.id));
    res.json({ spaces });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/spaces", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const [space] = await db.insert(eventSpacesTable).values({ ...req.body, organizationId: orgId }).returning();
    res.json({ space });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/spaces/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const [space] = await db.update(eventSpacesTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(eventSpacesTable.id, parseInt(req.params.id)), eq(eventSpacesTable.organizationId, orgId)))
      .returning();
    res.json({ space });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Events list ──────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { status, from, to, type } = req.query;

    let conditions: any[] = [eq(eventsTable.organizationId, orgId)];
    if (status && status !== "all") conditions.push(eq(eventsTable.status, status as any));
    if (type && type !== "all") conditions.push(eq(eventsTable.eventType, type as any));
    if (from) conditions.push(gte(eventsTable.eventDate, from as string));
    if (to) conditions.push(lte(eventsTable.eventDate, to as string));

    const events = await db.select({
      id: eventsTable.id, eventType: eventsTable.eventType, name: eventsTable.name,
      clientName: eventsTable.clientName, clientPhone: eventsTable.clientPhone,
      eventDate: eventsTable.eventDate, startTime: eventsTable.startTime, endTime: eventsTable.endTime,
      guestCount: eventsTable.guestCount, status: eventsTable.status,
      venuePrice: eventsTable.venuePrice, servicesPrice: eventsTable.servicesPrice,
      totalPrice: eventsTable.totalPrice, depositAmount: eventsTable.depositAmount,
      depositPaid: eventsTable.depositPaid, notes: eventsTable.notes, tags: eventsTable.tags,
      createdAt: eventsTable.createdAt, updatedAt: eventsTable.updatedAt,
      spaceName: eventSpacesTable.name, spaceColor: eventSpacesTable.color,
      spaceCapacityMax: eventSpacesTable.capacityMax,
    })
      .from(eventsTable)
      .leftJoin(eventSpacesTable, eq(eventsTable.eventSpaceId, eventSpacesTable.id))
      .where(and(...conditions))
      .orderBy(asc(eventsTable.eventDate), asc(eventsTable.startTime));

    res.json({ events });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Single event ─────────────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const eventId = parseInt(req.params.id);

    const [event] = await db.select({
      id: eventsTable.id, eventType: eventsTable.eventType, name: eventsTable.name,
      clientName: eventsTable.clientName, clientPhone: eventsTable.clientPhone, clientEmail: eventsTable.clientEmail,
      eventDate: eventsTable.eventDate, startTime: eventsTable.startTime, endTime: eventsTable.endTime,
      guestCount: eventsTable.guestCount, status: eventsTable.status,
      venuePrice: eventsTable.venuePrice, servicesPrice: eventsTable.servicesPrice,
      totalPrice: eventsTable.totalPrice, depositAmount: eventsTable.depositAmount,
      depositPaid: eventsTable.depositPaid, notes: eventsTable.notes, staffNotes: eventsTable.staffNotes,
      tags: eventsTable.tags, eventSpaceId: eventsTable.eventSpaceId,
      spaceName: eventSpacesTable.name, spaceColor: eventSpacesTable.color,
      spaceCapacityMax: eventSpacesTable.capacityMax, areaSqm: eventSpacesTable.areaSqm,
    })
      .from(eventsTable)
      .leftJoin(eventSpacesTable, eq(eventsTable.eventSpaceId, eventSpacesTable.id))
      .where(and(eq(eventsTable.id, eventId), eq(eventsTable.organizationId, orgId)));

    if (!event) return res.status(404).json({ error: "Not found" });

    const [services, tasks] = await Promise.all([
      db.select().from(eventServicesTable).where(eq(eventServicesTable.eventId, eventId)).orderBy(asc(eventServicesTable.createdAt)),
      db.select().from(eventTasksTable).where(eq(eventTasksTable.eventId, eventId)).orderBy(asc(eventTasksTable.sortOrder)),
    ]);

    res.json({ event, services, tasks });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Create event ─────────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { name, clientName, clientPhone, clientEmail, eventType, eventSpaceId, eventDate, startTime, endTime, guestCount, venuePrice, notes, tags } = req.body;
    const [event] = await db.insert(eventsTable).values({
      organizationId: orgId, name, clientName, clientPhone, clientEmail,
      eventType, eventSpaceId, eventDate, startTime, endTime,
      guestCount: parseInt(guestCount) || 1, venuePrice: venuePrice || "0",
      totalPrice: venuePrice || "0", notes, tags: tags || [],
    }).returning();

    // Auto-create standard tasks
    const stdTasks = [
      "Підтвердити договір з клієнтом",
      "Отримати депозит",
      "Скласти детальний план заходу",
      "Підтвердити всіх підрядників",
      "Підготовка залу (за 1 день)",
      "Проведення заходу",
      "Прибирання та закриття",
    ];
    await db.insert(eventTasksTable).values(stdTasks.map((title, i) => ({
      eventId: event.id, organizationId: orgId, title, sortOrder: i + 1,
    })));

    res.json({ event });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Update event ─────────────────────────────────────────────────────────────
router.patch("/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const allowed = ["status", "staffNotes", "notes", "depositPaid", "depositAmount", "totalPrice", "venuePrice", "servicesPrice", "guestCount", "startTime", "endTime", "eventSpaceId", "tags"];
    const updates: any = { updatedAt: new Date() };
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

    const [event] = await db.update(eventsTable).set(updates)
      .where(and(eq(eventsTable.id, parseInt(req.params.id)), eq(eventsTable.organizationId, orgId)))
      .returning();
    res.json({ event });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Event services ───────────────────────────────────────────────────────────
router.post("/:id/services", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const eventId = parseInt(req.params.id);
    const { category, name, quantity, unitPrice, vendorName, vendorPhone, notes } = req.body;
    const total = (parseFloat(unitPrice) || 0) * (parseInt(quantity) || 1);

    const [svc] = await db.insert(eventServicesTable).values({
      eventId, organizationId: orgId, category, name,
      quantity: parseInt(quantity) || 1, unitPrice: unitPrice || "0", totalPrice: String(total),
      vendorName, vendorPhone, notes,
    }).returning();

    // Recalculate event servicesPrice & totalPrice
    const allSvc = await db.select({ total: eventServicesTable.totalPrice }).from(eventServicesTable).where(eq(eventServicesTable.eventId, eventId));
    const servicesTotal = allSvc.reduce((s, v) => s + parseFloat(v.total || "0"), 0);
    const [ev] = await db.select({ venuePrice: eventsTable.venuePrice }).from(eventsTable).where(eq(eventsTable.id, eventId));
    const newTotal = servicesTotal + parseFloat(ev?.venuePrice || "0");
    await db.update(eventsTable).set({ servicesPrice: String(servicesTotal), totalPrice: String(newTotal), updatedAt: new Date() }).where(eq(eventsTable.id, eventId));

    res.json({ service: svc });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/services/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const updates: any = {};
    if (req.body.isConfirmed !== undefined) updates.isConfirmed = req.body.isConfirmed;
    if (req.body.notes !== undefined) updates.notes = req.body.notes;
    const [svc] = await db.update(eventServicesTable).set(updates)
      .where(and(eq(eventServicesTable.id, parseInt(req.params.id)), eq(eventServicesTable.organizationId, orgId)))
      .returning();
    res.json({ service: svc });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Event tasks ──────────────────────────────────────────────────────────────
router.patch("/tasks/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const updates: any = {};
    if (req.body.status) updates.status = req.body.status;
    if (req.body.assignedTo !== undefined) updates.assignedTo = req.body.assignedTo;
    if (req.body.dueDate !== undefined) updates.dueDate = req.body.dueDate;
    if (req.body.status === "done") updates.completedAt = new Date();
    else updates.completedAt = null;

    const [task] = await db.update(eventTasksTable).set(updates)
      .where(and(eq(eventTasksTable.id, parseInt(req.params.id)), eq(eventTasksTable.organizationId, orgId)))
      .returning();
    res.json({ task });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/:id/tasks", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const eventId = parseInt(req.params.id);
    const [task] = await db.insert(eventTasksTable).values({ ...req.body, eventId, organizationId: orgId }).returning();
    res.json({ task });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
