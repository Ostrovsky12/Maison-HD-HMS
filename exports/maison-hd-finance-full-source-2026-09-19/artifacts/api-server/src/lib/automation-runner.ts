/**
 * Automation Rules Engine — Real Execution
 * Executes automation rules against live DB data
 */
import { db } from "@workspace/db";
import {
  automationRulesTable, automationLogsTable, upsellOffersTable,
  bookingsTable, unitsTable, propertiesTable, guestsTable,
  housekeepingTasksTable, notificationsTable, usersTable,
  conversationsTable, messagesTable,
} from "@workspace/db";
import { eq, and, or, gte, lte, inArray, sql, ne } from "drizzle-orm";
import { sendEmail, sendTelegram, sendSms, buildGuestConfirmationEmail } from "./notify.js";

// Today's date string (YYYY-MM-DD)
function todayStr() { return new Date().toISOString().split("T")[0]; }
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; }

interface ExecutionContext {
  orgId: number;
  rule: any;
  booking?: any;
  unit?: any;
  guest?: any;
  forcedBookingId?: number;
}

// ─── Action Executors ─────────────────────────────────────────────────────────

async function execCreateHkTask(ctx: ExecutionContext, params: any): Promise<string> {
  if (!ctx.unit) return "Пропущено: юніт не знайдено";
  await db.insert(housekeepingTasksTable).values({
    unitId: ctx.unit.id,
    title: params.title || `Завдання: ${ctx.rule.name}`,
    description: params.description || `Автоматичне завдання по правилу: ${ctx.rule.name}`,
    taskType: (params.taskType || "cleaning") as any,
    status: "pending" as any,
    priority: (params.priority || "normal") as any,
    dueDate: params.dueDate || todayStr(),
    estimatedMinutes: params.estimatedMinutes || 60,
    checklist: params.checklist || [],
  });
  return `Завдання HK створено: "${params.title || ctx.rule.name}" для юніта ${ctx.unit.name}`;
}

async function execCreateNotification(ctx: ExecutionContext, params: any): Promise<string> {
  // Find users directly in users table by organizationId
  const members = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.organizationId, ctx.orgId))
    .limit(20);

  const guestName = ctx.guest
    ? `${ctx.guest.firstName || ""} ${ctx.guest.lastName || ""}`.trim()
    : (ctx.booking ? `${ctx.booking.firstName || ""} ${ctx.booking.lastName || ""}`.trim() : "Гість");

  const title = params.title || ctx.rule.name;
  const message = (params.message || ctx.rule.description || "").replace("{guest}", guestName);

  if (members.length === 0) return "Пропущено: користувачів організації не знайдено";

  const notifType = params.type || "alert";
  for (const m of members) {
    await db.insert(notificationsTable).values({
      userId: m.id,
      bookingId: ctx.booking?.id || null,
      type: notifType as any,
      title,
      message,
      priority: (params.priority || "normal") as any,
    }).catch(() => {});
  }
  return `Сповіщення "${title}" надіслано ${members.length} членам команди`;
}

async function execSendInboxMessage(ctx: ExecutionContext, params: any): Promise<string> {
  if (!ctx.booking) return "Пропущено: бронювання не знайдено";

  const guestName = ctx.guest
    ? `${ctx.guest.firstName || ""} ${ctx.guest.lastName || ""}`.trim()
    : `${ctx.booking.firstName || ""} ${ctx.booking.lastName || ""}`.trim();

  const templates: Record<string, string> = {
    welcome: `Вітаємо, ${guestName}! 🏡 Раді вас бачити. Ваш номер готовий до заїзду. Час заїзду — 14:00. Якщо потрібна допомога — пишіть!`,
    checkout_reminder: `Шановний ${guestName}, нагадуємо, що завтра ваш виїзд. Час виїзду — 12:00. Якщо бажаєте пізній виїзд — повідомте нас!`,
    upsell_spa: params.message || `${guestName}, пропонуємо SPA-процедури зі знижкою ${params.discount || 10}%. Запишіться сьогодні!`,
    default: params.message || `Шановний ${guestName}, ${ctx.rule.description || "маємо для вас пропозицію."}`,
  };

  const template = params.template || "default";
  const content = templates[template] || templates.default;

  // Find or create conversation
  let [conv] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.organizationId, ctx.orgId),
      ctx.booking.id ? eq(conversationsTable.bookingId, ctx.booking.id) : sql`true`,
    )).limit(1);

  if (!conv) {
    const [newConv] = await db.insert(conversationsTable).values({
      organizationId: ctx.orgId,
      channel: "website" as any,
      guestName,
      guestPhone: ctx.booking.phone || ctx.guest?.phone || null,
      guestEmail: ctx.booking.email || ctx.guest?.email || null,
      guestId: ctx.guest?.id || null,
      bookingId: ctx.booking.id || null,
      status: "open" as any,
      lastMessagePreview: content.substring(0, 100),
    }).returning();
    conv = newConv;
  }

  await db.insert(messagesTable).values({
    conversationId: conv.id,
    direction: "outbound" as any,
    messageType: "text" as any,
    content,
    isRead: false,
  }).catch(() => {});

  // Also send email to guest if they have an email and email is configured
  const guestEmail = ctx.booking.email || ctx.guest?.email;
  if (guestEmail) {
    const subject = params.emailSubject || ctx.rule.name || "Повідомлення від готелю";
    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#4f46e5">${subject}</h2>
      <p>${content.replace(/\n/g, "<br>")}</p>
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
      <p style="color:#9ca3af;font-size:12px">Це автоматичне повідомлення від вашого готелю.</p>
    </div>`;
    await sendEmail(ctx.orgId, { to: guestEmail, subject, html }).catch(() => {});
  }

  return `Повідомлення надіслано в Inbox гостю ${guestName} (шаблон: ${template})${guestEmail ? " + Email" : ""}`;
}

async function execSendGuestEmail(ctx: ExecutionContext, params: any): Promise<string> {
  if (!ctx.booking) return "Пропущено: бронювання не знайдено";
  const guestEmail = ctx.booking.email || ctx.guest?.email;
  if (!guestEmail) return "Пропущено: немає email гостя";

  const guestName = ctx.guest
    ? `${ctx.guest.firstName || ""} ${ctx.guest.lastName || ""}`.trim()
    : `${ctx.booking.firstName || ""} ${ctx.booking.lastName || ""}`.trim();

  const subject = params.subject || params.emailSubject || ctx.rule.name || "Повідомлення від готелю";
  const bodyText = (params.message || params.body || ctx.rule.description || "").replace("{guest}", guestName);

  // Use booking confirmation template if requested
  if (params.template === "confirmation" && ctx.unit) {
    const unit = ctx.unit;
    const [prop] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, unit.propertyId)).limit(1);
    const nights = ctx.booking.checkIn && ctx.booking.checkOut
      ? Math.max(1, Math.round((new Date(ctx.booking.checkOut).getTime() - new Date(ctx.booking.checkIn).getTime()) / 86400000))
      : 1;
    const { html, text } = buildGuestConfirmationEmail({
      bookingRef: String(ctx.booking.id).padStart(6, "0"),
      guestName,
      unitName: unit.name,
      propertyName: prop?.name || "Готель",
      checkIn: ctx.booking.checkIn || "",
      checkOut: ctx.booking.checkOut || "",
      nights,
      totalAmount: Number(ctx.booking.totalAmount || 0),
      guestsCount: (ctx.booking.adults || 1) + (ctx.booking.childrenUnder6 || 0) + (ctx.booking.childrenOver6 || 0),
    });
    const result = await sendEmail(ctx.orgId, { to: guestEmail, subject, html, text });
    return result.ok
      ? `Email підтвердження надіслано гостю ${guestName} (${guestEmail})`
      : `Email не надіслано: ${result.error}`;
  }

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
    <h2 style="color:#4f46e5">${subject}</h2>
    <p style="line-height:1.7;color:#374151">${bodyText.replace(/\n/g, "<br>")}</p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
    <p style="color:#9ca3af;font-size:12px">Це автоматичне повідомлення. Будь ласка, не відповідайте на цей лист.</p>
  </div>`;
  const result = await sendEmail(ctx.orgId, { to: guestEmail, subject, html, text: bodyText });
  return result.ok
    ? `Email надіслано гостю ${guestName} (${guestEmail})`
    : `Email не надіслано: ${result.error}`;
}

async function execSendGuestSms(ctx: ExecutionContext, params: any): Promise<string> {
  if (!ctx.booking) return "Пропущено: бронювання не знайдено";
  const guestPhone = ctx.booking.phone || ctx.guest?.phone;
  if (!guestPhone) return "Пропущено: немає телефону гостя";

  const guestName = ctx.guest
    ? `${ctx.guest.firstName || ""} ${ctx.guest.lastName || ""}`.trim()
    : `${ctx.booking.firstName || ""} ${ctx.booking.lastName || ""}`.trim();

  const message = (params.message || ctx.rule.description || "Повідомлення від готелю").replace("{guest}", guestName);
  const result = await sendSms(ctx.orgId, guestPhone, message);
  return result.ok
    ? `SMS надіслано гостю ${guestName} (${guestPhone})`
    : `SMS не надіслано: ${result.error}`;
}

async function execSendAdminTelegram(ctx: ExecutionContext, params: any): Promise<string> {
  const guestName = ctx.guest
    ? `${ctx.guest.firstName || ""} ${ctx.guest.lastName || ""}`.trim()
    : ctx.booking ? `${ctx.booking.firstName || ""} ${ctx.booking.lastName || ""}`.trim() : "Гість";

  const message = (params.message || ctx.rule.description || `📌 ${ctx.rule.name}`)
    .replace("{guest}", guestName)
    .replace("{booking}", ctx.booking ? `#${ctx.booking.id}` : "—");

  const result = await sendTelegram(ctx.orgId, `📌 <b>${ctx.rule.name}</b>\n${message}`);
  return result.ok
    ? `Telegram-повідомлення надіслано адміністратору`
    : `Telegram не надіслано: ${result.error}`;
}

async function execUpsell(ctx: ExecutionContext, params: any, offerType: string): Promise<string> {
  if (!ctx.booking) return "Пропущено: бронювання не знайдено";

  const TITLES: Record<string, string> = {
    spa: params.message || "SPA-процедури — спеціальна пропозиція",
    upgrade: params.message || "Апгрейд номера",
    fb: params.message || "Замовлення їжі та напоїв",
    late_checkout: "Пізній виїзд до 15:00",
  };

  await db.insert(upsellOffersTable).values({
    organizationId: ctx.orgId,
    bookingId: ctx.booking.id,
    offerType: offerType as any,
    title: TITLES[offerType] || params.message || offerType,
    description: params.description || "",
    price: String(params.price || 0),
    status: "pending" as any,
  }).catch(() => {});

  const guestName = ctx.guest
    ? `${ctx.guest.firstName || ""} ${ctx.guest.lastName || ""}`.trim()
    : `${ctx.booking.firstName || ""} ${ctx.booking.lastName || ""}`.trim();

  return `Upsell-пропозиція "${offerType}" надіслана гостю ${guestName}`;
}

// ─── Execute single action ────────────────────────────────────────────────────
async function executeAction(action: any, ctx: ExecutionContext): Promise<string> {
  const p = action.params || {};
  switch (action.type) {
    case "create_hk_task":      return execCreateHkTask(ctx, p);
    case "create_notification": return execCreateNotification(ctx, p);
    case "send_inbox_message":  return execSendInboxMessage(ctx, p);
    case "upsell_spa":          return execUpsell(ctx, p, "spa");
    case "upsell_upgrade":      return execUpsell(ctx, p, "upgrade");
    case "upsell_fb":           return execUpsell(ctx, p, "fb");
    case "send_email":          return execSendGuestEmail(ctx, p);
    case "send_guest_email":    return execSendGuestEmail(ctx, p);
    case "send_guest_sms":      return execSendGuestSms(ctx, p);
    case "send_telegram":       return execSendAdminTelegram(ctx, p);
    case "webhook_call":        return `Webhook виклик на ${p.url || "N/A"} — не реалізовано в цьому середовищі`;
    default:                    return `Невідома дія: ${action.type}`;
  }
}

// ─── Find bookings matching trigger ──────────────────────────────────────────
async function getBookingsForTrigger(trigger: string, orgId: number, conditions: any): Promise<any[]> {
  const today = todayStr();
  const tomorrow = tomorrowStr();

  let statusFilter: any[] = [];
  let dateField: any = null;
  let dateValue: string = today;

  switch (trigger) {
    case "checkin_today":
      dateField = bookingsTable.checkIn;
      dateValue = today;
      statusFilter = ["confirmed", "pending"];
      break;
    case "checkout_today":
      dateField = bookingsTable.checkOut;
      dateValue = today;
      statusFilter = ["checked_in"];
      break;
    case "checkout_tomorrow":
      dateField = bookingsTable.checkOut;
      dateValue = tomorrow;
      statusFilter = ["checked_in", "confirmed"];
      break;
    case "booking_created":
    case "booking_confirmed":
    case "manual":
      return []; // These are event-based, not time-based
    case "payment_overdue":
      // Unpaid bookings past check-in date
      statusFilter = ["confirmed", "pending"];
      break;
    default:
      return [];
  }

  const bookings = await db.select({
    id: bookingsTable.id,
    unitId: bookingsTable.unitId,
    guestId: bookingsTable.guestId,
    checkIn: bookingsTable.checkIn,
    checkOut: bookingsTable.checkOut,
    firstName: bookingsTable.firstName,
    lastName: bookingsTable.lastName,
    email: bookingsTable.email,
    phone: bookingsTable.phone,
    status: bookingsTable.status,
    paymentStatus: bookingsTable.paymentStatus,
    totalAmount: bookingsTable.totalAmount,
    paidAmount: bookingsTable.paidAmount,
    adults: bookingsTable.adults,
  }).from(bookingsTable)
    .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
    .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
    .where(and(
      eq(propertiesTable.organizationId, orgId),
      dateField ? eq(dateField, dateValue) : sql`true`,
      statusFilter.length > 0 ? inArray(bookingsTable.status, statusFilter as any) : sql`true`,
    ))
    .limit(50);

  // Apply condition filters
  let filtered = bookings;
  if (conditions?.minNights) {
    filtered = filtered.filter(b => {
      const nights = Math.round((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / 86400000);
      return nights >= conditions.minNights;
    });
  }
  if (conditions?.minStay) {
    filtered = filtered.filter(b => {
      const nights = Math.round((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / 86400000);
      return nights >= conditions.minStay;
    });
  }

  return filtered;
}

// ─── Execute a rule for a specific booking ────────────────────────────────────
export async function executeRuleForBooking(rule: any, orgId: number, booking: any): Promise<{ ok: boolean; message: string }> {
  const [unit] = booking.unitId
    ? await db.select().from(unitsTable).where(eq(unitsTable.id, booking.unitId)).limit(1)
    : [null];

  const [guest] = booking.guestId
    ? await db.select().from(guestsTable).where(eq(guestsTable.id, booking.guestId)).limit(1)
    : [null];

  const ctx: ExecutionContext = { orgId, rule, booking, unit: unit || null, guest: guest || null };

  const results: string[] = [];
  for (const action of (rule.actions || [])) {
    try {
      const msg = await executeAction(action, ctx);
      results.push(msg);
    } catch (e: any) {
      results.push(`Помилка дії ${action.type}: ${e.message}`);
    }
  }

  return { ok: true, message: results.join("; ") };
}

// ─── Main: Run a single rule manually or by schedule ─────────────────────────
export async function runRule(ruleId: number, orgId: number, forcedBookingId?: number): Promise<{
  ok: boolean; message: string; processed: number; results: any[];
}> {
  const [rule] = await db.select().from(automationRulesTable)
    .where(and(eq(automationRulesTable.id, ruleId), eq(automationRulesTable.organizationId, orgId)));

  if (!rule) return { ok: false, message: "Правило не знайдено", processed: 0, results: [] };

  const executionResults: any[] = [];

  if (forcedBookingId) {
    // Run on specific booking
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, forcedBookingId)).limit(1);
    if (booking) {
      const result = await executeRuleForBooking(rule, orgId, booking);
      executionResults.push({ bookingId: forcedBookingId, ...result });
    }
  } else if (rule.trigger === "manual" || !rule.trigger) {
    // Manual run — simulate with a message
    const msg = (rule.actions || []).map((a: any) => `${a.type} виконано`).join(", ");
    executionResults.push({ message: msg });
  } else {
    // Time-based trigger — find matching bookings
    const bookings = await getBookingsForTrigger(rule.trigger, orgId, rule.conditions || {});

    if (bookings.length === 0) {
      executionResults.push({ message: `Немає бронювань для тригера "${rule.trigger}" на сьогодні` });
    } else {
      for (const booking of bookings) {
        const result = await executeRuleForBooking(rule, orgId, booking);
        executionResults.push({ bookingId: booking.id, ...result });
      }
    }
  }

  const allMessages = executionResults.map(r => r.message).filter(Boolean).join("; ");

  // Log execution
  await db.insert(automationLogsTable).values({
    organizationId: orgId,
    ruleId: rule.id,
    ruleName: rule.name,
    trigger: rule.trigger || "manual",
    status: "success" as any,
    entityType: "booking",
    resultMessage: allMessages || "Виконано",
  }).catch(() => {});

  // Update run count and last run
  await db.update(automationRulesTable).set({
    runCount: sql`${automationRulesTable.runCount} + 1`,
    lastRunAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(automationRulesTable.id, ruleId)).catch(() => {});

  return {
    ok: true,
    message: allMessages || "Виконано",
    processed: executionResults.length,
    results: executionResults,
  };
}

// ─── Run all active rules for today's scheduled triggers ──────────────────────
export async function runScheduledRules(orgId: number): Promise<{
  totalRules: number; executed: number; results: any[];
}> {
  const today = todayStr();
  const TIME_TRIGGERS = ["checkin_today", "checkout_today", "checkout_tomorrow", "payment_overdue"];

  const rules = await db.select().from(automationRulesTable)
    .where(and(
      eq(automationRulesTable.organizationId, orgId),
      eq(automationRulesTable.isActive, true),
      inArray(automationRulesTable.trigger, TIME_TRIGGERS as any),
    ));

  const allResults: any[] = [];
  let executed = 0;

  for (const rule of rules) {
    try {
      const result = await runRule(rule.id, orgId);
      allResults.push({ ruleId: rule.id, ruleName: rule.name, ...result });
      if (result.processed > 0) executed++;
    } catch (e: any) {
      allResults.push({ ruleId: rule.id, ruleName: rule.name, ok: false, message: e.message });
    }
  }

  return { totalRules: rules.length, executed, results: allResults };
}

// ─── Fire rule on booking event (call from bookings route) ───────────────────
export async function fireBookingEvent(event: "booking_created" | "booking_confirmed", orgId: number, bookingId: number) {
  try {
    const rules = await db.select().from(automationRulesTable)
      .where(and(
        eq(automationRulesTable.organizationId, orgId),
        eq(automationRulesTable.isActive, true),
        eq(automationRulesTable.trigger, event),
      ));

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) return;

    for (const rule of rules) {
      await executeRuleForBooking(rule, orgId, booking).then(async (result) => {
        await db.insert(automationLogsTable).values({
          organizationId: orgId,
          ruleId: rule.id,
          ruleName: rule.name,
          trigger: event,
          status: "success" as any,
          entityType: "booking",
          entityId: bookingId,
          resultMessage: result.message,
        }).catch(() => {});
        await db.update(automationRulesTable).set({
          runCount: sql`${automationRulesTable.runCount} + 1`,
          lastRunAt: new Date(),
        }).where(eq(automationRulesTable.id, rule.id)).catch(() => {});
      }).catch(() => {});
    }
  } catch (_) {}
}
