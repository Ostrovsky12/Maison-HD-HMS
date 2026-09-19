import { Router } from "express";
import { db } from "@workspace/db";
import {
  automationRulesTable, automationLogsTable, upsellOffersTable,
  bookingsTable, unitsTable, propertiesTable,
  fbOrdersTable, fbTablesTable, spaAppointmentsTable,
} from "@workspace/db";
import { eq, and, desc, asc, ne, gte, lte, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { runRule, runScheduledRules } from "../lib/automation-runner.js";

const router = Router();
const getOrg = (req: any) => req.user?.organizationId;

// ─── Trigger labels ───────────────────────────────────────────────────────────
const TRIGGER_LABELS: Record<string, string> = {
  booking_created: "Нове бронювання",
  booking_confirmed: "Підтвердження бронювання",
  checkin_today: "Заїзд сьогодні",
  checkout_today: "Виїзд сьогодні",
  checkout_tomorrow: "Виїзд завтра",
  guest_birthday: "День народження гостя",
  payment_overdue: "Прострочена оплата",
  low_occupancy: "Низька завантаженість (<50%)",
  hk_task_pending: "Завдання HK очікує >2год",
  fb_order_ready: "Замовлення F&B готово",
  spa_appointment_today: "Запис SPA сьогодні",
  manual: "Ручний запуск",
};

const ACTION_LABELS: Record<string, string> = {
  send_inbox_message: "Повідомлення гостю (Inbox + Email)",
  send_guest_email:   "Email гостю (окремий лист)",
  send_guest_sms:     "SMS гостю",
  send_telegram:      "Telegram адміністратору",
  create_hk_task:     "Створити завдання Housekeeping",
  create_notification: "Сповіщення персоналу",
  upsell_spa:         "Пропозиція: SPA",
  upsell_fb:          "Пропозиція: F&B / доставка",
  upsell_upgrade:     "Пропозиція: апгрейд номера",
  send_email:         "Email гостю (застарілий синонім)",
  webhook_call:       "Webhook виклик",
};

// ─── Seed demo rules ─────────────────────────────────────────────────────────
async function seedDemoRules(orgId: number) {
  const ex = await db.select({ id: automationRulesTable.id })
    .from(automationRulesTable).where(eq(automationRulesTable.organizationId, orgId)).limit(1);
  if (ex.length > 0) return;

  await db.insert(automationRulesTable).values([
    {
      organizationId: orgId,
      name: "Привітання при заїзді",
      description: "Автоматично надсилати привітальне повідомлення гостю в день заїзду",
      trigger: "checkin_today",
      conditions: { minStay: 1 },
      actions: [{ type: "send_inbox_message", params: { template: "welcome", channel: "whatsapp" } }],
      isActive: true, runCount: 47,
    },
    {
      organizationId: orgId,
      name: "Нагадування про виїзд",
      description: "Нагадати гостю про виїзд та пропонувати пізній виїзд за +500 ₴",
      trigger: "checkout_tomorrow",
      conditions: {},
      actions: [
        { type: "send_inbox_message", params: { template: "checkout_reminder" } },
        { type: "upsell_upgrade", params: { offer: "late_checkout", price: 500 } },
      ],
      isActive: true, runCount: 31,
    },
    {
      organizationId: orgId,
      name: "SPA апсел для нових гостей",
      description: "Пропонувати SPA-процедури при заїзді, якщо гість ще не заброньовував SPA",
      trigger: "checkin_today",
      conditions: { noSpaBooking: true },
      actions: [{ type: "upsell_spa", params: { discount: 10, message: "Ласкаво просимо! -10% на SPA сьогодні" } }],
      isActive: true, runCount: 23,
    },
    {
      organizationId: orgId,
      name: "Сніданок у номер (рум-сервіс)",
      description: "Пропозиція сніданку в номер для довгих заїздів (3+ ночі)",
      trigger: "checkin_today",
      conditions: { minNights: 3 },
      actions: [{ type: "upsell_fb", params: { category: "breakfast", message: "Замовте сніданок у номер!" } }],
      isActive: false, runCount: 8,
    },
    {
      organizationId: orgId,
      name: "Сповіщення при новому бронюванні",
      description: "Сповістити reception при кожному новому бронюванні",
      trigger: "booking_created",
      conditions: {},
      actions: [{ type: "create_notification", params: { role: "reception", message: "Нове бронювання отримано" } }],
      isActive: true, runCount: 89,
    },
    {
      organizationId: orgId,
      name: "Прибирання після виїзду",
      description: "Автоматично створювати завдання прибирання при виїзді гостя",
      trigger: "checkout_today",
      conditions: {},
      actions: [{ type: "create_hk_task", params: { taskType: "cleaning", priority: "high", title: "Прибирання після виїзду" } }],
      isActive: true, runCount: 56,
    },
    {
      organizationId: orgId,
      name: "Апгрейд при низькій завантаженості",
      description: "Якщо завантаженість <40%, автоматично пропонувати апгрейди наявним гостям",
      trigger: "low_occupancy",
      conditions: { threshold: 40 },
      actions: [{ type: "upsell_upgrade", params: { freeUpgrade: true, message: "Вітаємо! Для вас доступний безкоштовний апгрейд" } }],
      isActive: false, runCount: 3,
    },
    {
      organizationId: orgId,
      name: "Нагадування F&B готово",
      description: "Сповістити офіціанта коли замовлення готове до подачі",
      trigger: "fb_order_ready",
      conditions: {},
      actions: [{ type: "create_notification", params: { role: "waiter", message: "Замовлення готово до подачі" } }],
      isActive: true, runCount: 114,
    },
  ]);

  // Seed demo logs
  await db.insert(automationLogsTable).values([
    { organizationId: orgId, ruleName: "Привітання при заїзді", trigger: "checkin_today", status: "success", entityType: "booking", entityId: 1, resultMessage: "Повідомлення надіслано в WhatsApp гостю Ковальський А." },
    { organizationId: orgId, ruleName: "Прибирання після виїзду", trigger: "checkout_today", status: "success", entityType: "booking", entityId: 2, resultMessage: "Завдання housekeeping #47 створено для номера 201" },
    { organizationId: orgId, ruleName: "SPA апсел для нових гостей", trigger: "checkin_today", status: "success", entityType: "booking", entityId: 3, resultMessage: "Пропозиція SPA -10% надіслана через Inbox" },
    { organizationId: orgId, ruleName: "Нагадування при виїзді", trigger: "checkout_tomorrow", status: "success", entityType: "booking", entityId: 1, resultMessage: "Нагадування та пропозиція пізнього виїзду надіслані" },
    { organizationId: orgId, ruleName: "Сповіщення при новому бронюванні", trigger: "booking_created", status: "success", entityType: "booking", entityId: 4, resultMessage: "Reception сповіщено: нове бронювання на 5 квітня" },
    { organizationId: orgId, ruleName: "Привітання при заїзді", trigger: "checkin_today", status: "failed", entityType: "booking", entityId: 5, resultMessage: "Помилка: гість не має номера телефону" },
    { organizationId: orgId, ruleName: "Нагадування F&B готово", trigger: "fb_order_ready", status: "success", entityType: "order", entityId: 2, resultMessage: "Офіціанта сповіщено: замовлення стіл 2 готово" },
    { organizationId: orgId, ruleName: "Сніданок у номер (рум-сервіс)", trigger: "checkin_today", status: "skipped", entityType: "booking", entityId: 6, resultMessage: "Пропущено: гість заїхав на 1 ніч (умова: 3+ ночі)" },
  ]);

  // Seed upsell offers
  const bookings = await db.select({ id: bookingsTable.id }).from(bookingsTable)
    .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
    .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
    .where(and(eq(propertiesTable.organizationId, orgId), ne(bookingsTable.status, "cancelled" as any)))
    .limit(3);

  if (bookings.length > 0) {
    await db.insert(upsellOffersTable).values([
      { organizationId: orgId, bookingId: bookings[0]?.id, offerType: "spa", title: "Масаж спини — 60 хв", description: "-10% для нових клієнтів SPA. Спеціальна пропозиція лише сьогодні!", price: "720", status: "pending" },
      { organizationId: orgId, bookingId: bookings[0]?.id, offerType: "upgrade", title: "Апгрейд до номера з видом на озеро", description: "Номер класу Делюкс з панорамним видом. Доплата за весь термін.", price: "1200", status: "accepted" },
      { organizationId: orgId, bookingId: bookings[1]?.id, offerType: "fb", title: "Сніданок у номер — Англійський", description: "Класичний англійський сніданок + кава у зручний час", price: "320", status: "pending" },
      { organizationId: orgId, bookingId: bookings[1]?.id, offerType: "late_checkout", title: "Пізній виїзд до 15:00", description: "Залишайтеся довше і насолоджуйтесь відпочинком", price: "500", status: "declined" },
      { organizationId: orgId, bookingId: bookings[2]?.id, offerType: "spa", title: "Ароматерапія + лікувальна ванна", description: "Релаксаційна програма 90 хв для двох", price: "1800", status: "pending" },
    ]);
  }
}

// ─── GET /rules ───────────────────────────────────────────────────────────────
router.get("/rules", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedDemoRules(orgId);
    const rules = await db.select().from(automationRulesTable)
      .where(eq(automationRulesTable.organizationId, orgId))
      .orderBy(desc(automationRulesTable.isActive), asc(automationRulesTable.createdAt));
    res.json({ rules, triggerLabels: TRIGGER_LABELS, actionLabels: ACTION_LABELS });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── POST /rules ──────────────────────────────────────────────────────────────
router.post("/rules", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { name, description, trigger, conditions, actions } = req.body;
    const [rule] = await db.insert(automationRulesTable).values({
      organizationId: orgId, name, description, trigger, conditions, actions, isActive: true,
    }).returning();
    res.json({ rule });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /rules/:id ─────────────────────────────────────────────────────────
router.patch("/rules/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const updates: any = { ...req.body, updatedAt: new Date() };
    const [rule] = await db.update(automationRulesTable).set(updates)
      .where(and(eq(automationRulesTable.id, parseInt(req.params.id)), eq(automationRulesTable.organizationId, orgId)))
      .returning();
    res.json({ rule });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── DELETE /rules/:id ────────────────────────────────────────────────────────
router.delete("/rules/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await db.delete(automationRulesTable)
      .where(and(eq(automationRulesTable.id, parseInt(req.params.id)), eq(automationRulesTable.organizationId, orgId)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── POST /rules/:id/run — execute rule (real) ────────────────────────────────
router.post("/rules/:id/run", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const ruleId = parseInt(req.params.id);
    const { bookingId } = req.body || {};
    const result = await runRule(ruleId, orgId, bookingId ? parseInt(bookingId) : undefined);
    if (!result.ok && result.message === "Правило не знайдено") return res.status(404).json({ error: result.message });
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── POST /run-scheduled — run all active time-based rules for today ─────────
router.post("/run-scheduled", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const result = await runScheduledRules(orgId);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /logs ────────────────────────────────────────────────────────────────
router.get("/logs", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { limit = 50, status } = req.query;
    let conditions: any[] = [eq(automationLogsTable.organizationId, orgId)];
    if (status && status !== "all") conditions.push(eq(automationLogsTable.status, status as any));
    const logs = await db.select().from(automationLogsTable)
      .where(and(...conditions))
      .orderBy(desc(automationLogsTable.triggeredAt))
      .limit(parseInt(limit as string));
    res.json({ logs });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /stats ───────────────────────────────────────────────────────────────
router.get("/stats", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedDemoRules(orgId);
    const [rules, logs, upsells] = await Promise.all([
      db.select({ id: automationRulesTable.id, isActive: automationRulesTable.isActive, runCount: automationRulesTable.runCount })
        .from(automationRulesTable).where(eq(automationRulesTable.organizationId, orgId)),
      db.select({ status: automationLogsTable.status })
        .from(automationLogsTable).where(eq(automationLogsTable.organizationId, orgId)),
      db.select({ status: upsellOffersTable.status })
        .from(upsellOffersTable).where(eq(upsellOffersTable.organizationId, orgId)),
    ]);
    res.json({
      totalRules: rules.length,
      activeRules: rules.filter(r => r.isActive).length,
      totalRuns: rules.reduce((s, r) => s + (r.runCount || 0), 0),
      logsSuccess: logs.filter(l => l.status === "success").length,
      logsFailed: logs.filter(l => l.status === "failed").length,
      logsSkipped: logs.filter(l => l.status === "skipped").length,
      upsellPending: upsells.filter(u => u.status === "pending").length,
      upsellAccepted: upsells.filter(u => u.status === "accepted").length,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /upsells ─────────────────────────────────────────────────────────────
router.get("/upsells", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const upsells = await db.select().from(upsellOffersTable)
      .where(eq(upsellOffersTable.organizationId, orgId))
      .orderBy(desc(upsellOffersTable.createdAt));
    res.json({ upsells });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /upsells/:id ───────────────────────────────────────────────────────
router.patch("/upsells/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { status } = req.body;
    const [upsell] = await db.update(upsellOffersTable)
      .set({ status, respondedAt: new Date() })
      .where(and(eq(upsellOffersTable.id, parseInt(req.params.id)), eq(upsellOffersTable.organizationId, orgId)))
      .returning();
    res.json({ upsell });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
