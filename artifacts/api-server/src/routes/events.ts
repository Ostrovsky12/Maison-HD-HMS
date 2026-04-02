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

// ─── Update event fees (banquet min, service fee, cork fee) ───────────────────
router.patch("/:id/fees", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const eventId = parseInt(req.params.id);
    const { banquetMinimum, serviceFeeP, corkFeePerBottle, corkFeeBottles } = req.body;

    const evRes = await db.execute(sql`SELECT * FROM events WHERE id = ${eventId} AND organization_id = ${orgId}`);
    const ev = evRes.rows[0] as any;
    if (!ev) return res.status(404).json({ error: "Not found" });

    const banqMin = banquetMinimum !== undefined ? parseFloat(banquetMinimum) : parseFloat(ev.banquet_minimum || "0");
    const svcPct = serviceFeeP !== undefined ? parseFloat(serviceFeeP) : parseFloat(ev.service_fee_pct || "0");
    const corkPer = corkFeePerBottle !== undefined ? parseFloat(corkFeePerBottle) : parseFloat(ev.cork_fee_per_bottle || "0");
    const corkBtl = corkFeeBottles !== undefined ? parseInt(corkFeeBottles) : parseInt(ev.cork_fee_bottles || "0");

    const subtotal = parseFloat(ev.total_price || "0");
    const svcAmt = Math.round(subtotal * svcPct / 100 * 100) / 100;
    const corkTotal = Math.round(corkPer * corkBtl * 100) / 100;
    const grandTotal = subtotal + svcAmt + corkTotal;
    const balanceDue = grandTotal - parseFloat(ev.deposit_amount || "0");

    await db.execute(sql`UPDATE events SET
      banquet_minimum = ${banqMin}, service_fee_pct = ${svcPct}, service_fee_amount = ${svcAmt},
      cork_fee_per_bottle = ${corkPer}, cork_fee_bottles = ${corkBtl}, cork_fee_total = ${corkTotal},
      subtotal = ${subtotal}, grand_total = ${grandTotal}, balance_due = ${balanceDue},
      updated_at = NOW()
      WHERE id = ${eventId} AND organization_id = ${orgId}`);

    res.json({ success: true, grandTotal, balanceDue, svcAmt, corkTotal });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Event timings (run-of-show) ──────────────────────────────────────────────
router.get("/:id/timings", requireAuth, async (req: any, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const timings = await db.execute(sql`
      SELECT * FROM event_timings WHERE event_id = ${eventId}
      ORDER BY sort_order ASC, time_start ASC
    `);
    res.json({ timings: timings.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/:id/timings", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const eventId = parseInt(req.params.id);
    const { timeStart, timeEnd, title, description, category = "general", assignedTo, sortOrder = 99 } = req.body;

    const res2 = await db.execute(sql`
      INSERT INTO event_timings (event_id, organization_id, time_start, time_end, title, description, category, assigned_to, sort_order, created_at)
      VALUES (${eventId}, ${orgId}, ${timeStart}, ${timeEnd ?? null}, ${title}, ${description ?? null}, ${category}, ${assignedTo ?? null}, ${sortOrder}, NOW())
      RETURNING *
    `);
    res.status(201).json({ timing: res2.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/timings/:tid", requireAuth, async (req: any, res) => {
  try {
    const tid = parseInt(req.params.tid);
    const { isConfirmed, assignedTo, timeStart, timeEnd } = req.body;
    const updates: string[] = [];
    if (isConfirmed !== undefined) updates.push(`is_confirmed = ${isConfirmed}`);
    if (assignedTo !== undefined) updates.push(`assigned_to = '${(assignedTo||"").replace(/'/g,"''")}'`);
    if (timeStart) updates.push(`time_start = '${timeStart}'`);
    if (timeEnd !== undefined) updates.push(`time_end = ${timeEnd ? `'${timeEnd}'` : "NULL"}`);
    if (!updates.length) return res.json({ success: true });

    const r = await db.execute(sql.raw(`UPDATE event_timings SET ${updates.join(", ")} WHERE id = ${tid} RETURNING *`));
    res.json({ timing: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/timings/:tid", requireAuth, async (req: any, res) => {
  try {
    await db.execute(sql`DELETE FROM event_timings WHERE id = ${parseInt(req.params.tid)}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Group check-ins ──────────────────────────────────────────────────────────
router.get("/:id/group-checkins", requireAuth, async (req: any, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const groups = await db.execute(sql`
      SELECT gc.*,
        (SELECT COUNT(*) FROM event_guest_allocations WHERE group_checkin_id = gc.id) as allocated_count,
        (SELECT COUNT(*) FROM event_guest_allocations WHERE group_checkin_id = gc.id AND status = 'checked_in') as checked_in_count
      FROM event_group_checkins gc
      WHERE gc.event_id = ${eventId}
      ORDER BY gc.arrival_date ASC, gc.arrival_time ASC
    `);
    res.json({ groups: groups.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/:id/group-checkins", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const eventId = parseInt(req.params.id);
    const { groupName, arrivalDate, arrivalTime = "14:00", departureDate, departureTime = "12:00", totalGuests = 1, notes } = req.body;

    const r = await db.execute(sql`
      INSERT INTO event_group_checkins (event_id, organization_id, group_name, arrival_date, arrival_time, departure_date, departure_time, total_guests, notes, status, created_at, updated_at)
      VALUES (${eventId}, ${orgId}, ${groupName}, ${arrivalDate}, ${arrivalTime}, ${departureDate ?? null}, ${departureTime}, ${totalGuests}, ${notes ?? null}, 'pending', NOW(), NOW())
      RETURNING *
    `);
    res.status(201).json({ group: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/group-checkins/:gid", requireAuth, async (req: any, res) => {
  try {
    const gid = parseInt(req.params.gid);
    const { status, notes, arrivalTime, totalGuests } = req.body;
    const updates: string[] = ["updated_at = NOW()"];
    if (status) updates.push(`status = '${status}'`);
    if (notes !== undefined) updates.push(`notes = '${(notes||"").replace(/'/g,"''")}'`);
    if (arrivalTime) updates.push(`arrival_time = '${arrivalTime}'`);
    if (totalGuests) updates.push(`total_guests = ${totalGuests}`);

    const r = await db.execute(sql.raw(`UPDATE event_group_checkins SET ${updates.join(", ")} WHERE id = ${gid} RETURNING *`));
    res.json({ group: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Guest allocations ────────────────────────────────────────────────────────
router.get("/:id/allocations", requireAuth, async (req: any, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const allocs = await db.execute(sql`
      SELECT ga.*, u.name as unit_name, u.category as unit_type,
        gc.group_name, gc.arrival_date, gc.arrival_time
      FROM event_guest_allocations ga
      LEFT JOIN units u ON u.id = ga.unit_id
      LEFT JOIN event_group_checkins gc ON gc.id = ga.group_checkin_id
      WHERE ga.event_id = ${eventId}
      ORDER BY ga.check_in_date ASC NULLS LAST, ga.guest_name ASC
    `);

    const summaryRes = await db.execute(sql`
      SELECT
        COUNT(*)::int as total,
        COALESCE(SUM(guests_count),0)::int as total_guests,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END)::int as confirmed,
        SUM(CASE WHEN status = 'checked_in' THEN 1 ELSE 0 END)::int as checked_in,
        SUM(CASE WHEN unit_id IS NOT NULL THEN 1 ELSE 0 END)::int as allocated
      FROM event_guest_allocations WHERE event_id = ${eventId}
    `);

    res.json({ allocations: allocs.rows, summary: summaryRes.rows[0] });
  } catch (e: any) { res.status(500).json({ error: "Failed query: " + e.message }); }
});

router.post("/:id/allocations", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const eventId = parseInt(req.params.id);
    const { groupCheckinId, unitId, guestName, guestPhone, guestEmail, guestsCount = 1, relationToEvent, checkInDate, checkOutDate, checkInTime = "14:00", checkOutTime = "12:00", notes } = req.body;

    const unitIdVal = unitId ? parseInt(unitId) : null;
    const groupIdVal = groupCheckinId ? parseInt(groupCheckinId) : null;

    const r = await db.execute(sql`
      INSERT INTO event_guest_allocations (event_id, group_checkin_id, organization_id, unit_id, guest_name, guest_phone, guest_email, guests_count, relation_to_event, check_in_date, check_out_date, check_in_time, check_out_time, notes, status, created_at, updated_at)
      VALUES (${eventId}, ${groupIdVal}, ${orgId}, ${unitIdVal}, ${guestName}, ${guestPhone ?? null}, ${guestEmail ?? null}, ${guestsCount}, ${relationToEvent ?? null}, ${checkInDate ?? null}, ${checkOutDate ?? null}, ${checkInTime}, ${checkOutTime}, ${notes ?? null}, 'pending', NOW(), NOW())
      RETURNING *
    `);
    res.status(201).json({ allocation: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/allocations/:aid", requireAuth, async (req: any, res) => {
  try {
    const aid = parseInt(req.params.aid);
    const { status, unitId, notes } = req.body;
    const updates: string[] = ["updated_at = NOW()"];
    if (status) {
      updates.push(`status = '${status}'`);
      if (status === "checked_in") updates.push("checked_in_at = NOW()");
    }
    if (unitId !== undefined) updates.push(`unit_id = ${unitId || "NULL"}`);
    if (notes !== undefined) updates.push(`notes = '${(notes||"").replace(/'/g,"''")}'`);

    const r = await db.execute(sql.raw(`UPDATE event_guest_allocations SET ${updates.join(", ")} WHERE id = ${aid} RETURNING *`));
    res.json({ allocation: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Available units for allocation ──────────────────────────────────────────
router.get("/:id/available-units", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const eventId = parseInt(req.params.id);

    const units = await db.execute(sql`
      SELECT u.id, u.name, u.category as unit_type, u.base_price, u.capacity,
        p.name as property_name,
        (SELECT COUNT(*) FROM event_guest_allocations WHERE unit_id = u.id AND event_id = ${eventId}) as already_allocated
      FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE p.organization_id = ${orgId}
        AND p.is_active = TRUE
      ORDER BY p.name ASC, u.name ASC
      LIMIT 60
    `);
    res.json({ units: units.rows });
  } catch (e: any) { res.status(500).json({ error: "Failed units: " + e.message }); }
});

export default router;
