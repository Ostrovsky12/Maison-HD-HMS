import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import {
  conversationsTable, messagesTable, channelConfigsTable,
  bookingsTable, guestsTable, unitsTable, propertiesTable,
  aiKnowledgeArticlesTable, aiConciergeSettingsTable, aiConciergeAuditLogsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger.js";
import { dispatchInboxChannelMessage } from "../lib/inbox-channel-dispatch.js";
import { faqAutoBlocker } from "../lib/faq-auto-reply.js";

const router = Router();
router.use(requireAuth);
router.use((req: any, res, next) => {
  if (!Number.isInteger(req.user?.organizationId)) {
    res.status(400).json({
      error: "Оберіть організацію перед роботою з Comm Hub.",
      code: "ORGANIZATION_CONTEXT_REQUIRED",
    });
    return;
  }
  next();
});

const TELEGRAM_ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "business_connection",
  "business_message",
  "edited_business_message",
  "deleted_business_messages",
];

function telegramWebhookUrl(orgId: number) {
  const baseUrl = process.env.PUBLIC_API_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
  if (!baseUrl) throw new Error("PUBLIC_API_URL не налаштований");
  return `${baseUrl.replace(/\/$/, "")}/api/inbox/webhooks/telegram/${orgId}`;
}

async function registerTelegramWebhook(botToken: string, webhookUrl: string, secretToken: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secretToken,
      allowed_updates: TELEGRAM_ALLOWED_UPDATES,
      drop_pending_updates: true,
    }),
  });
  const result = await response.json() as any;
  if (!result.ok) throw new Error(`Webhook error: ${result.description || response.status}`);
}

function businessConnections(config: Record<string, unknown> | undefined) {
  const raw = config?.business_connections;
  if (typeof raw !== "string") return {} as Record<string, { isEnabled?: boolean; canReply?: boolean }>;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function rankedKnowledgeArticles(articles: any[], text: string) {
  const terms = [...new Set(text.toLowerCase().match(/[а-яіїєa-z0-9]{3,}/gi) || [])].slice(0, 16);
  return articles
    .map((article) => {
      const haystack = `${article.title} ${article.tags || ""} ${article.content}`.toLowerCase();
      return { article, score: terms.filter((term) => haystack.includes(term)).length };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.article.updatedAt.getTime() - a.article.updatedAt.getTime())
    .slice(0, 4)
    .map(({ article }) => article);
}

function bookingIntakeFromMessage(message: string) {
  const dateRange = message.match(/\b(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\s*(?:[-–]|до)\s*(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)/i);
  const adults = message.match(/(\d+)\s*(?:доросл\w*|гост\w*)/i)?.[1] ?? null;
  const children = message.match(/(\d+)\s*(?:дит\w*)/i)?.[1] ?? null;
  const bookingIntent = /(брон|вільн|заїзд|проживан|будин|номер)/i.test(message);
  return {
    detected: bookingIntent,
    checkIn: dateRange?.[1] ?? null,
    checkOut: dateRange?.[2] ?? null,
    adults: adults ? Number(adults) : null,
    children: children ? Number(children) : null,
    needsManagerReview: bookingIntent,
  };
}

// ── Demo data seed ─────────────────────────────────────────────────────────
const DEMO_CONVERSATIONS = [
  {
    channel: "telegram" as const,
    guestName: "Олег Марченко",
    guestPhone: "+380671234567",
    subject: "Цікавить домик на вихідні",
    lastMessagePreview: "Добрий день! Чи є вільні будинки на 12-14 квітня?",
    status: "open" as const,
    unreadCount: 2,
    messages: [
      { direction: "inbound" as const, content: "Добрий день! Чи є вільні будинки на 12-14 квітня? Нас буде 4 дорослих і дитина 5 років", createdAt: new Date(Date.now() - 25 * 60000) },
      { direction: "inbound" as const, content: "І скільки коштує проживання з вашими послугами SPA?", createdAt: new Date(Date.now() - 20 * 60000) },
    ],
  },
  {
    channel: "instagram" as const,
    guestName: "Марина Ковальчук",
    guestPhone: "+380501112233",
    subject: "Весілля у вас",
    lastMessagePreview: "Хочемо провести весілля на 50 гостей",
    status: "pending" as const,
    unreadCount: 0,
    messages: [
      { direction: "inbound" as const, content: "Привіт! Бачили ваш заклад в Instagram. Хочемо провести весілля на 50 гостей, приблизно у вересні. Є така можливість?", createdAt: new Date(Date.now() - 2 * 3600000) },
      { direction: "outbound" as const, content: "Добрий день, Маріно! Так, ми проводимо весілля. Напишіть, будь ласка, бажану дату та кількість гостей, і ми підготуємо комерційну пропозицію", createdAt: new Date(Date.now() - 1.5 * 3600000), senderName: "Адмін" },
      { direction: "inbound" as const, content: "Дякую! Думаємо на 14 вересня, гостей 48-52. Що входить в пакет?", createdAt: new Date(Date.now() - 60 * 60000) },
    ],
  },
  {
    channel: "website" as const,
    guestName: "Dmitry Petrenko",
    guestPhone: "+380442223344",
    guestEmail: "dmitry@company.ua",
    subject: "Корпоратив для компанії",
    lastMessagePreview: "Нас цікавить оренда всього комплексу",
    status: "open" as const,
    unreadCount: 1,
    messages: [
      { direction: "inbound" as const, content: "Доброго дня! Ми компанія TechUA, хочемо провести корпоратив для 80 співробітників. Нас цікавить оренда всього комплексу на 2 дні в жовтні. Надішліть КП.", createdAt: new Date(Date.now() - 30 * 60000) },
    ],
  },
  {
    channel: "telegram" as const,
    guestName: "Sofiya Bondarenko",
    guestPhone: "+380931231212",
    subject: "Запит на SPA",
    lastMessagePreview: "А масаж можна без проживання?",
    status: "resolved" as const,
    unreadCount: 0,
    messages: [
      { direction: "inbound" as const, content: "Добрий день! А масаж можна без проживання?", createdAt: new Date(Date.now() - 5 * 3600000) },
      { direction: "outbound" as const, content: "Так, у нас є day pass до SPA. Вартість: 800 грн/годину масаж, плюс 400 грн вхід до басейну. Записати вас?", createdAt: new Date(Date.now() - 4.5 * 3600000), senderName: "Адмін" },
      { direction: "inbound" as const, content: "Чудово! Запишіть на суботу о 14:00", createdAt: new Date(Date.now() - 4 * 3600000) },
      { direction: "outbound" as const, content: "Записано! Чекаємо вас у суботу о 14:00. Підтвердження надійде на ваш номер.", createdAt: new Date(Date.now() - 3.5 * 3600000), senderName: "Адмін" },
    ],
  },
  {
    channel: "viber" as const,
    guestName: "Іванна Романчук",
    guestPhone: "+380972223344",
    subject: "Питання по оренді сапу",
    lastMessagePreview: "Можна взяти сап на пів дня?",
    status: "open" as const,
    unreadCount: 1,
    messages: [
      { direction: "inbound" as const, content: "Привіт! Можна взяти сап на пів дня? Або лише на повний день?", createdAt: new Date(Date.now() - 15 * 60000) },
    ],
  },
  {
    channel: "email" as const,
    guestName: "Андрій Мельник",
    guestEmail: "andry.melnyk@gmail.com",
    subject: "Запит щодо довгострокового проживання",
    lastMessagePreview: "Цікавить місячна оренда будинку",
    status: "pending" as const,
    unreadCount: 0,
    messages: [
      { direction: "inbound" as const, content: "Добрий день! Цікавить місячна оренда одного з ваших будинків. Чи є таке? Якщо так, яка вартість?", createdAt: new Date(Date.now() - 24 * 3600000) },
      { direction: "outbound" as const, content: "Добрий день! Так, ми розглядаємо довгостроковий найм від 30 днів. Напишіть, який саме об'єкт вас цікавить та бажаний термін?", createdAt: new Date(Date.now() - 20 * 3600000), senderName: "Адмін" },
    ],
  },
];

async function ensureDemoData(organizationId: number) {
  const existing = await db.select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(eq(conversationsTable.organizationId, organizationId))
    .limit(1);
  if (existing.length > 0) return;
  for (const demo of DEMO_CONVERSATIONS) {
    const [conv] = await db.insert(conversationsTable).values({
      organizationId,
      channel: demo.channel,
      guestName: demo.guestName,
      guestPhone: (demo as any).guestPhone || null,
      guestEmail: (demo as any).guestEmail || null,
      subject: demo.subject,
      lastMessagePreview: demo.lastMessagePreview,
      status: demo.status,
      unreadCount: demo.unreadCount,
      lastMessageAt: demo.messages[demo.messages.length - 1].createdAt,
    }).returning();
    for (const msg of demo.messages) {
      await db.insert(messagesTable).values({
        conversationId: conv.id,
        direction: msg.direction,
        content: msg.content,
        senderName: (msg as any).senderName || demo.guestName,
        isRead: msg.direction === "outbound" || demo.unreadCount === 0,
        createdAt: msg.createdAt,
      });
    }
  }
}

// ── List conversations ──────────────────────────────────────────────────────
router.get("/conversations", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    await ensureDemoData(orgId);

    const { status, channel, search, limit = "50", offset = "0", view } = req.query as Record<string, string>;

    const q = await (db as any).$client.query(`
      SELECT c.*,
        u.name as assigned_to_name,
        l.status as lead_status, l.id as lead_id_ref
      FROM conversations c
      LEFT JOIN users u ON u.id = c.assigned_to_id
      LEFT JOIN leads l ON l.id = c.lead_id
      WHERE c.organization_id = $1
      ORDER BY c.last_message_at DESC
      LIMIT 200
    `, [orgId]);

    let rows = q.rows;
    if (status) rows = rows.filter((c: any) => c.status === status);
    if (channel) rows = rows.filter((c: any) => c.channel === channel);
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((c: any) =>
        c.guest_name?.toLowerCase().includes(s) ||
        c.guest_phone?.includes(s) ||
        c.subject?.toLowerCase().includes(s) ||
        c.last_message_preview?.toLowerCase().includes(s)
      );
    }

    const total = rows.length;
    const paginated = rows.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    const totalUnread = rows.reduce((s: number, c: any) => s + (c.unread_count || 0), 0);

    const conversations = paginated.map((c: any) => ({
      id: c.id,
      channel: c.channel,
      guestName: c.guest_name,
      guestPhone: c.guest_phone,
      guestEmail: c.guest_email,
      subject: c.subject,
      lastMessagePreview: c.last_message_preview,
      lastMessageAt: c.last_message_at,
      status: c.status,
      unreadCount: c.unread_count || 0,
      bookingId: c.booking_id,
      leadId: c.lead_id,
      leadStatus: c.lead_status,
      tags: c.tags || [],
      assignedToId: c.assigned_to_id,
      assignedToName: c.assigned_to_name,
      estimatedValue: c.estimated_value,
    }));

    res.json({ conversations, total, totalUnread });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Get conversation + messages + context ───────────────────────────────────
router.get("/conversations/:id", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = parseInt(req.params.id);

    const convR = await (db as any).$client.query(`
      SELECT c.*, u.name as assigned_to_name
      FROM conversations c
      LEFT JOIN users u ON u.id = c.assigned_to_id
      WHERE c.id = $1 AND c.organization_id = $2
    `, [id, orgId]);
    if (!convR.rows[0]) return res.status(404).json({ error: "Розмову не знайдено" });
    const conv = convR.rows[0];

    const msgR = await (db as any).$client.query(`
      SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC
    `, [id]);

    await (db as any).$client.query(`
      UPDATE conversations SET unread_count = 0 WHERE id = $1
    `, [id]);
    await (db as any).$client.query(`
      UPDATE messages SET is_read = true WHERE conversation_id = $1 AND direction = 'inbound'
    `, [id]);

    let booking = null;
    if (conv.booking_id) {
      const bR = await (db as any).$client.query(`
        SELECT b.id, b.check_in, b.check_out, b.status, b.payment_status, b.total_amount,
               b.first_name, b.last_name, u.name as unit_name, p.name as property_name
        FROM bookings b
        JOIN units u ON u.id = b.unit_id
        JOIN properties p ON p.id = u.property_id
        WHERE b.id = $1 AND p.organization_id = $2
      `, [conv.booking_id, orgId]);
      booking = bR.rows[0] || null;
    }

    let lead = null;
    if (conv.lead_id) {
      const lR = await (db as any).$client.query(`
        SELECT l.*, u.name as assigned_to_name
        FROM leads l
        LEFT JOIN users u ON u.id = l.assigned_to_id
        WHERE l.id = $1
      `, [conv.lead_id]);
      lead = lR.rows[0] || null;
    }

    const staffR = await (db as any).$client.query(`
      SELECT id, name, role FROM users WHERE organization_id = $1 AND role IN ('owner','manager','reception') ORDER BY name
    `, [orgId]);

    res.json({
      conversation: {
        id: conv.id,
        channel: conv.channel,
        guestName: conv.guest_name,
        guestPhone: conv.guest_phone,
        guestEmail: conv.guest_email,
        guestAvatarUrl: conv.guest_avatar_url,
        guestId: conv.guest_id,
        bookingId: conv.booking_id,
        status: conv.status,
        assignedToId: conv.assigned_to_id,
        subject: conv.subject,
        lastMessageAt: conv.last_message_at,
        lastMessagePreview: conv.last_message_preview,
        tags: conv.tags || [],
        aiSummary: conv.ai_summary,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
        unreadCount: 0,
        assignedToName: conv.assigned_to_name,
      },
      messages: msgR.rows.map((m: any) => ({
        id: m.id,
        conversationId: m.conversation_id,
        direction: m.direction,
        messageType: m.message_type,
        content: m.content,
        mediaUrl: m.media_url,
        senderName: m.sender_name,
        isAiGenerated: m.is_ai_generated,
        isInternal: !!(m.metadata?.is_internal),
        isRead: m.is_read,
        createdAt: m.created_at,
        metadata: m.metadata,
      })),
      booking,
      lead,
      staff: staffR.rows,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Send reply ──────────────────────────────────────────────────────────────
router.post("/conversations/:id/reply", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = parseInt(req.params.id);
    const { content, messageType = "text", isAiGenerated = false } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "Порожнє повідомлення" });

    const convR = await (db as any).$client.query(
      `SELECT id, channel, external_id, metadata FROM conversations WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    if (!convR.rows[0]) return res.status(404).json({ error: "Not found" });
    const conv = convR.rows[0];

    const msgR = await (db as any).$client.query(`
      INSERT INTO messages (conversation_id, direction, message_type, content, sender_name, is_read, is_ai_generated, created_at)
      VALUES ($1, 'outbound', $2, $3, $4, true, $5, NOW())
      RETURNING *
    `, [id, messageType, content.trim(), req.user.name || "Адміністратор", isAiGenerated]);

    await (db as any).$client.query(`
      UPDATE conversations SET last_message_at = NOW(), last_message_preview = $2, status = 'pending', updated_at = NOW()
      WHERE id = $1
    `, [id, content.trim().slice(0, 100)]);

    // ── Dispatch to actual channel ──────────────────────────────────────────
    if (conv.channel === "telegram" && conv.external_id) {
      dispatchTelegram(orgId, conv.external_id, content.trim(), conv.metadata).catch(error =>
        logger.error({ err: error, organizationId: orgId, conversationId: id }, "Telegram reply dispatch failed"),
      );
    } else if (conv.channel === "instagram" && conv.external_id) {
      dispatchInboxChannelMessage({
        organizationId: orgId, channel: "instagram", recipientId: conv.external_id, text: content.trim(),
      }).catch(e =>
        logger.error({ err: e, organizationId: orgId, conversationId: id }, "Instagram reply dispatch failed")
      );
    } else if (conv.channel === "whatsapp" && conv.external_id) {
      dispatchWhatsApp(orgId, conv.external_id, content.trim()).catch(e =>
        logger.error({ err: e, organizationId: orgId, conversationId: id }, "WhatsApp reply dispatch failed")
      );
    }

    const m = msgR.rows[0];
    res.json({
      success: true,
      message: {
        id: m.id, conversationId: m.conversation_id, direction: m.direction,
        messageType: m.message_type, content: m.content, senderName: m.sender_name,
        isAiGenerated: m.is_ai_generated, isInternal: false, isRead: m.is_read, createdAt: m.created_at,
      },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Channel dispatch helpers ─────────────────────────────────────────────────
async function dispatchTelegram(
  orgId: number,
  chatId: string,
  text: string,
  metadata: Record<string, unknown> | null,
) {
  const [cfg] = await db.select().from(channelConfigsTable)
    .where(and(eq(channelConfigsTable.organizationId, orgId), eq(channelConfigsTable.channel, "telegram" as any)));
  const token = cfg?.config?.bot_token;
  if (!token) throw new Error("No Telegram bot token configured");

  const isBusinessMessage = metadata?.telegram_delivery === "business";
  const businessConnectionId = metadata?.telegram_business_connection_id;
  const businessChatId = metadata?.telegram_chat_id;
  const payload: Record<string, unknown> = {
    chat_id: isBusinessMessage ? businessChatId : chatId,
    text,
    parse_mode: "HTML",
  };
  if (isBusinessMessage) {
    if (
      !cfg?.config?.business_enabled
      || typeof businessConnectionId !== "string"
      || typeof businessChatId !== "string"
    ) {
      throw new Error("Telegram Business connection is unavailable");
    }
    const connection = businessConnections(cfg.config as Record<string, unknown>)[businessConnectionId];
    if (!connection?.isEnabled || !connection?.canReply) {
      throw new Error("Telegram Business connection cannot reply");
    }
    payload.business_connection_id = businessConnectionId;
  }

  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const e = await r.json() as any;
    throw new Error(`Telegram API error: ${e.description || r.status}`);
  }
  logger.info({ organizationId: orgId, delivery: isBusinessMessage ? "business" : "bot" }, "Telegram reply sent");
}

async function dispatchWhatsApp(orgId: number, recipientWaId: string, text: string) {
  const [cfg] = await db.select().from(channelConfigsTable)
    .where(and(
      eq(channelConfigsTable.organizationId, orgId),
      eq(channelConfigsTable.channel, "whatsapp" as any),
      eq(channelConfigsTable.isEnabled, true),
    ));
  const accessToken = cfg?.config?.access_token;
  const phoneNumberId = cfg?.config?.phone_number_id;
  if (!accessToken || !phoneNumberId) throw new Error("WhatsApp Business не налаштовано для цієї організації");

  const r = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: recipientWaId,
      type: "text",
      text: { body: text },
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => null) as any;
    throw new Error(`WhatsApp Cloud API error: ${e?.error?.message || r.status}`);
  }
  logger.info({ organizationId: orgId, recipientWaId }, "WhatsApp reply sent");
}

async function dispatchInstagram(orgId: number, recipientId: string, text: string) {
  const [cfg] = await db.select().from(channelConfigsTable)
    .where(and(eq(channelConfigsTable.organizationId, orgId), eq(channelConfigsTable.channel, "instagram" as any)));
  const accessToken = cfg?.config?.access_token;
  const igUserId = cfg?.config?.ig_user_id;
  if (!accessToken || !igUserId) throw new Error("Instagram not configured");

  const r = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      access_token: accessToken,
    }),
  });
  if (!r.ok) {
    const e = await r.json() as any;
    throw new Error(`Instagram API error: ${JSON.stringify(e)}`);
  }
  console.log(`[reply/instagram] sent to user=${recipientId}`);
}


// ── Internal note ───────────────────────────────────────────────────────────
router.post("/conversations/:id/internal-note", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = parseInt(req.params.id);
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "Порожня нотатка" });

    const convR = await (db as any).$client.query(
      `SELECT id FROM conversations WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    if (!convR.rows[0]) return res.status(404).json({ error: "Not found" });

    const msgR = await (db as any).$client.query(`
      INSERT INTO messages (conversation_id, direction, message_type, content, sender_name, is_read, metadata, created_at)
      VALUES ($1, 'outbound', 'text', $2, $3, true, '{"is_internal":true}', NOW())
      RETURNING *
    `, [id, content.trim(), req.user.name || "Адміністратор"]);

    const m = msgR.rows[0];
    res.json({
      success: true,
      message: {
        id: m.id, conversationId: m.conversation_id, direction: m.direction,
        messageType: m.message_type, content: m.content, senderName: m.sender_name,
        isAiGenerated: false, isInternal: true, isRead: true, createdAt: m.created_at,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── AI reply suggestion (GPT-powered) ──────────────────────────────────────
router.post("/conversations/:id/ai-suggest", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = parseInt(req.params.id);
    const [conciergeSettings] = await db.select()
      .from(aiConciergeSettingsTable)
      .where(eq(aiConciergeSettingsTable.organizationId, orgId))
      .limit(1);
    if (conciergeSettings && !conciergeSettings.enabled) {
      res.status(409).json({ error: "AI Concierge вимкнено для цієї організації." });
      return;
    }

    // Fetch conversation
    const convR = await (db as any).$client.query(
      `SELECT * FROM conversations WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    if (!convR.rows[0]) return res.status(404).json({ error: "Not found" });
    const conv = convR.rows[0];

    // Fetch last 10 messages for context (chronological order)
    const msgsR = await (db as any).$client.query(`
      SELECT direction, content, sender_name, created_at
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      LIMIT 10
    `, [id]);
    const messages = msgsR.rows;

    const lastInbound = [...messages].reverse().find((m: any) => m.direction === "inbound");
    if (!lastInbound?.content) return res.status(400).json({ error: "Немає вхідних повідомлень" });

    const publishedArticles = await db.select()
      .from(aiKnowledgeArticlesTable)
      .where(and(
        eq(aiKnowledgeArticlesTable.organizationId, orgId),
        eq(aiKnowledgeArticlesTable.status, "published"),
        sql`(${aiKnowledgeArticlesTable.effectiveFrom} IS NULL OR ${aiKnowledgeArticlesTable.effectiveFrom} <= CURRENT_DATE)`,
        sql`(${aiKnowledgeArticlesTable.effectiveUntil} IS NULL OR ${aiKnowledgeArticlesTable.effectiveUntil} >= CURRENT_DATE)`,
      ))
      .orderBy(desc(aiKnowledgeArticlesTable.updatedAt));
    const knowledgeSources = rankedKnowledgeArticles(publishedArticles, lastInbound.content);
    const knowledgeContext = knowledgeSources.length
      ? knowledgeSources.map((article) => `Джерело #${article.id}: ${article.title}\n${article.content}`).join("\n\n")
      : "Підтверджених джерел для цього питання не знайдено.";

    // Fetch org name for context
    const orgR = await (db as any).$client.query(
      `SELECT name FROM organizations WHERE id = $1`, [orgId]);
    const orgName = orgR.rows[0]?.name || "Готельний комплекс";

    // Fetch linked booking if any
    let bookingContext = "";
    if (conv.booking_id) {
      const bkR = await (db as any).$client.query(`
        SELECT b.check_in, b.check_out, b.status, b.total_amount, b.payment_status,
               u.name as unit_name
        FROM bookings b
        INNER JOIN units u ON u.id = b.unit_id
        INNER JOIN properties p ON p.id = u.property_id
        WHERE b.id = $1 AND p.organization_id = $2
      `, [conv.booking_id, orgId]);
      if (bkR.rows[0]) {
        const bk = bkR.rows[0];
        bookingContext = `\nПов'язане бронювання: ${bk.unit_name}, заїзд ${bk.check_in} → виїзд ${bk.check_out}, статус: ${bk.status}, сума: ${bk.total_amount} UAH (оплата: ${bk.payment_status}).`;
      }
    }

    // Build conversation history for GPT
    const chatHistory: { role: "user" | "assistant" | "system"; content: string }[] = messages
      .filter((m: any) => m.content && m.content.trim())
      .map((m: any) => ({
        role: m.direction === "inbound" ? "user" : "assistant",
        content: m.content,
      }));

    const guestName = conv.guest_name?.split(" ")[0] || "гість";
    const channel = conv.channel || "chat";
    const channelLabel: Record<string, string> = {
      telegram: "Telegram", whatsapp: "WhatsApp", sms: "SMS",
      email: "Email", phone: "телефон", direct: "прямий",
    };

    const systemPrompt = `Ти — AI-асистент ресепшена для готельного об'єкту "${orgName}".
Твоя задача: скласти чернетку відповіді ресепшеніста гостю.

Канал комунікації: ${channelLabel[channel] || channel}.
Ім'я гостя: ${guestName}.${bookingContext}

Правила:
1. Відповідай ТІЛЬКИ українською мовою.
2. Тон — теплий, професійний, гостинний. Не занадто формальний.
3. Якщо питання стосується бронювання — уточнюй деталі (дати, кількість гостей, тип номеру).
4. Якщо питання про ціни — пропонуй уточнити дати для точного розрахунку.
5. Для складних питань — пропонуй зателефонувати або надіслати КП.
6. Можна використовувати 1-2 емодзі. Не перевантажуй текст.
7. Відповідь має бути готова до відправки — ресепшеніст лише перевіряє і може підкоригувати.
8. Максимум 4-5 речень або 4-5 коротких рядків. Не пиши довгих полотен тексту.
9. НЕ додавай фраз "Чернетка:", "AI:", "Пропонована відповідь:" — одразу текст відповіді.
10. Використовуй конкретні правила, тарифи й умови ЛИШЕ з підтверджених джерел нижче. Не вигадуй деталі.
11. Якщо підтверджених знань немає або їх недостатньо, чесно повідом, що уточниш інформацію в менеджера. Не обіцяй бронювання, оплату або точну наявність.

Підтверджені джерела:
${knowledgeContext}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 400,
      messages: [
        { role: "system", content: systemPrompt },
        ...chatHistory,
      ],
    });

    const suggestion = completion.choices[0]?.message?.content?.trim() || "";
    if (!suggestion) return res.status(500).json({ error: "AI не повернув відповідь" });

    const sources = knowledgeSources.map(({ id, title, category, updatedAt }) => ({ id, title, category, updatedAt }));
    const bookingIntake = bookingIntakeFromMessage(lastInbound.content);
    const autoReplyBlocker = faqAutoBlocker(lastInbound.content);
    const handoffSuggested = knowledgeSources.length === 0 || Boolean(autoReplyBlocker);
    const mode = conciergeSettings?.mode ?? "manual";
    const autoReplyEligible = mode === "faq_auto"
      && !autoReplyBlocker
      && knowledgeSources.length > 0
      && knowledgeSources.every((article) => article.category === "faq");

    if (handoffSuggested) {
      await (db as any).$client.query(`
        UPDATE conversations
        SET status = CASE WHEN status = 'resolved' THEN status ELSE 'pending' END,
            updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
      `, [id, orgId]);
    }

    await db.insert(aiConciergeAuditLogsTable).values({
      organizationId: orgId,
      conversationId: id,
      actorUserId: req.user.userId,
      action: "inbox_reply_suggested",
      outcome: handoffSuggested ? "handoff_queued" : autoReplyEligible ? "faq_auto_candidate" : "grounded_review",
      sources: sources.map((source) => source.id),
      details: {
        mode,
        autoReplyEligible,
        bookingIntake,
        autoReplyBlocker,
      },
    });

    res.json({
      suggestion,
      sources,
      handoffSuggested,
      bookingIntake,
      mode,
      autoReplyEligible,
    });
  } catch (err: any) {
    req.log?.error({ err }, "Unable to generate grounded inbox suggestion");
    res.status(500).json({ error: "Не вдалося сформувати AI-підказку." });
  }
});

// ── Update conversation ─────────────────────────────────────────────────────
router.patch("/conversations/:id", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = parseInt(req.params.id);
    const { status, bookingId, leadId, tags, assignedToId, subject, estimatedValue } = req.body;

    if (bookingId !== undefined && bookingId !== null) {
      const ownership = await (db as any).$client.query(`
        SELECT b.id
        FROM bookings b
        INNER JOIN units u ON u.id = b.unit_id
        INNER JOIN properties p ON p.id = u.property_id
        WHERE b.id = $1 AND p.organization_id = $2
      `, [bookingId, orgId]);
      if (!ownership.rows[0]) {
        res.status(403).json({ error: "Це бронювання не належить поточній організації." });
        return;
      }
    }

    const sets: string[] = ["updated_at = NOW()"];
    const vals: any[] = [id, orgId];
    let i = 3;
    if (status !== undefined) { sets.push(`status = $${i++}`); vals.push(status); }
    if (bookingId !== undefined) { sets.push(`booking_id = $${i++}`); vals.push(bookingId); }
    if (leadId !== undefined) { sets.push(`lead_id = $${i++}`); vals.push(leadId); }
    if (tags !== undefined) { sets.push(`tags = $${i++}`); vals.push(JSON.stringify(tags)); }
    if (assignedToId !== undefined) { sets.push(`assigned_to_id = $${i++}`); vals.push(assignedToId || null); }
    if (subject !== undefined) { sets.push(`subject = $${i++}`); vals.push(subject); }
    if (estimatedValue !== undefined) { sets.push(`estimated_value = $${i++}`); vals.push(estimatedValue); }

    const r = await (db as any).$client.query(`
      UPDATE conversations SET ${sets.join(", ")} WHERE id = $1 AND organization_id = $2 RETURNING *
    `, vals);

    if (status) {
      const statusLabels: Record<string, string> = {
        open: "Відкрито", pending: "Очікує", resolved: "Вирішено", spam: "Спам",
      };
      await (db as any).$client.query(`
        INSERT INTO messages (conversation_id, direction, message_type, content, sender_name, is_read, created_at)
        VALUES ($1, 'outbound', 'system', $2, 'Система', true, NOW())
      `, [id, `Статус змінено: ${statusLabels[status] || status}`]);
    }

    if (assignedToId) {
      const userR = await (db as any).$client.query(`SELECT name FROM users WHERE id = $1`, [assignedToId]);
      const userName = userR.rows[0]?.name || "Менеджер";
      await (db as any).$client.query(`
        INSERT INTO messages (conversation_id, direction, message_type, content, sender_name, is_read, created_at)
        VALUES ($1, 'outbound', 'system', $2, 'Система', true, NOW())
      `, [id, `Призначено: ${userName}`]);
    }

    res.json(r.rows[0] || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Create conversation ─────────────────────────────────────────────────────
router.post("/conversations", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const { channel, guestName, guestPhone, guestEmail, subject, initialMessage } = req.body;
    if (!guestName || !channel) return res.status(400).json({ error: "Ім'я гостя та канал обов'язкові" });

    const r = await (db as any).$client.query(`
      INSERT INTO conversations (organization_id, channel, guest_name, guest_phone, guest_email, subject, last_message_preview, status, last_message_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW(), NOW(), NOW())
      RETURNING *
    `, [orgId, channel, guestName, guestPhone || null, guestEmail || null, subject || null, initialMessage || null]);

    const conv = r.rows[0];
    if (initialMessage) {
      await (db as any).$client.query(`
        INSERT INTO messages (conversation_id, direction, content, sender_name, is_read, created_at)
        VALUES ($1, 'inbound', $2, $3, false, NOW())
      `, [conv.id, initialMessage, guestName]);
    }

    res.json(conv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Link booking ────────────────────────────────────────────────────────────
router.post("/conversations/:id/link-booking/:bookingId", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = parseInt(req.params.id);
    const bookingId = parseInt(req.params.bookingId);
    const ownership = await (db as any).$client.query(`
      SELECT b.id
      FROM bookings b
      INNER JOIN units u ON u.id = b.unit_id
      INNER JOIN properties p ON p.id = u.property_id
      WHERE b.id = $1 AND p.organization_id = $2
    `, [bookingId, orgId]);
    if (!ownership.rows[0]) {
      res.status(403).json({ error: "Це бронювання не належить поточній організації." });
      return;
    }

    const r = await (db as any).$client.query(`
      UPDATE conversations SET booking_id = $1, updated_at = NOW()
      WHERE id = $2 AND organization_id = $3 RETURNING *
    `, [bookingId, id, orgId]);

    await (db as any).$client.query(`
      INSERT INTO messages (conversation_id, direction, message_type, content, sender_name, is_read, created_at)
      VALUES ($1, 'outbound', 'system', $2, 'Система', true, NOW())
    `, [id, `Прив'язано до бронювання #${bookingId}`]);

    res.json(r.rows[0] || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Leads list ──────────────────────────────────────────────────────────────
router.get("/leads", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const { status, search } = req.query as Record<string, string>;

    const r = await (db as any).$client.query(`
      SELECT l.*,
        u.name as assigned_to_name,
        c.channel, c.status as conv_status, c.unread_count, c.last_message_at, c.last_message_preview
      FROM leads l
      LEFT JOIN users u ON u.id = l.assigned_to_id
      LEFT JOIN conversations c ON c.id = l.conversation_id
      WHERE l.organization_id = $1
      ORDER BY l.updated_at DESC
    `, [orgId]);

    let rows = r.rows;
    if (status) rows = rows.filter((l: any) => l.status === status);
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((l: any) =>
        l.first_name?.toLowerCase().includes(s) ||
        l.last_name?.toLowerCase().includes(s) ||
        l.email?.toLowerCase().includes(s) ||
        l.phone?.includes(s) ||
        l.subject?.toLowerCase().includes(s)
      );
    }

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Lead detail ─────────────────────────────────────────────────────────────
router.get("/leads/:id", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = parseInt(req.params.id);
    const r = await (db as any).$client.query(`
      SELECT l.*, u.name as assigned_to_name
      FROM leads l
      LEFT JOIN users u ON u.id = l.assigned_to_id
      WHERE l.id = $1 AND l.organization_id = $2
    `, [id, orgId]);
    if (!r.rows[0]) return res.status(404).json({ error: "Не знайдено" });
    res.json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Create lead ─────────────────────────────────────────────────────────────
router.post("/leads", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const { firstName, lastName, email, phone, source, subject, notes, estimatedValue, checkInDate, checkOutDate, guestsCount } = req.body;

    const r = await (db as any).$client.query(`
      INSERT INTO leads (organization_id, source, status, first_name, last_name, email, phone, subject, notes, estimated_value, check_in_date, check_out_date, guests_count, created_at, updated_at)
      VALUES ($1, $2, 'new', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING *
    `, [orgId, source || 'other', firstName || null, lastName || null, email || null, phone || null, subject || null, notes || null, estimatedValue || null, checkInDate || null, checkOutDate || null, guestsCount || 1]);

    res.json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Update lead ─────────────────────────────────────────────────────────────
router.patch("/leads/:id", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = parseInt(req.params.id);
    const { status, assignedToId, quotedAmount, estimatedValue, notes, lostReason, followUpAt } = req.body;

    const sets: string[] = ["updated_at = NOW()"];
    const vals: any[] = [id, orgId];
    let i = 3;
    if (status !== undefined) { sets.push(`status = $${i++}`); vals.push(status); }
    if (assignedToId !== undefined) { sets.push(`assigned_to_id = $${i++}`); vals.push(assignedToId || null); }
    if (quotedAmount !== undefined) { sets.push(`quoted_amount = $${i++}`); vals.push(quotedAmount); }
    if (estimatedValue !== undefined) { sets.push(`estimated_value = $${i++}`); vals.push(estimatedValue); }
    if (notes !== undefined) { sets.push(`notes = $${i++}`); vals.push(notes); }
    if (lostReason !== undefined) { sets.push(`lost_reason = $${i++}`); vals.push(lostReason); }
    if (followUpAt !== undefined) { sets.push(`follow_up_at = $${i++}`); vals.push(followUpAt); }
    if (status === "quote_sent") { sets.push(`quoted_at = NOW()`); }
    if (status === "booked") { sets.push(`booked_at = NOW()`); }
    if (status === "contacted") { sets.push(`contacted_at = NOW()`); }

    const r = await (db as any).$client.query(`
      UPDATE leads SET ${sets.join(", ")} WHERE id = $1 AND organization_id = $2 RETURNING *
    `, vals);

    res.json(r.rows[0] || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Canned replies ──────────────────────────────────────────────────────────
router.get("/canned-replies", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const { category } = req.query as Record<string, string>;
    let q = `SELECT * FROM canned_replies WHERE organization_id = $1`;
    const vals: any[] = [orgId];
    if (category) { q += ` AND category = $2`; vals.push(category); }
    q += ` ORDER BY use_count DESC, title ASC`;
    const r = await (db as any).$client.query(q, vals);
    res.json(r.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/canned-replies", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const { title, content, category = "general", shortcut } = req.body;
    if (!title || !content) return res.status(400).json({ error: "Назва та текст обов'язкові" });
    const r = await (db as any).$client.query(`
      INSERT INTO canned_replies (organization_id, title, content, category, shortcut)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [orgId, title, content, category, shortcut || null]);
    res.json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/canned-replies/:id", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    await (db as any).$client.query(
      `DELETE FROM canned_replies WHERE id = $1 AND organization_id = $2`, [req.params.id, orgId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/canned-replies/:id/use", async (req: any, res) => {
  try {
    await (db as any).$client.query(
      `UPDATE canned_replies SET use_count = use_count + 1 WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.json({ success: true });
  }
});

// ── Staff list ──────────────────────────────────────────────────────────────
router.get("/staff", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const r = await (db as any).$client.query(`
      SELECT id, name, role, email FROM users
      WHERE organization_id = $1 AND role IN ('owner','manager','reception')
      ORDER BY name
    `, [orgId]);
    res.json(r.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Channel configs ─────────────────────────────────────────────────────────
router.get("/channels", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const configs = await db.select().from(channelConfigsTable)
      .where(eq(channelConfigsTable.organizationId, orgId));
    const channels = ["telegram", "instagram", "website", "email", "phone", "whatsapp", "viber"];
    const response = channels.map(ch => {
      const config = configs.find(c => c.channel === ch);
      const rawConfig = (config?.config || {}) as Record<string, string>;
      // Mask sensitive fields in response
      const safeConfig = { ...rawConfig };
      if (safeConfig.bot_token) safeConfig.bot_token = safeConfig.bot_token.slice(0, 10) + "...";
      if (safeConfig.access_token) safeConfig.access_token = safeConfig.access_token.slice(0, 10) + "...";
      delete safeConfig.webhook_secret;
      delete safeConfig.business_connections;
      delete safeConfig.app_secret;
      if (ch === "telegram") {
        safeConfig.needs_secure_webhook = String(Boolean(config?.isEnabled && !rawConfig.webhook_secret));
      }
      return {
        channel: ch,
        isEnabled: config?.isEnabled || ch === "website",
        config: safeConfig,
        webhookUrl: config?.webhookUrl || null,
      };
    });
    const telegramConfig: any = configs.find(c => c.channel === "telegram" as any);
    const telegramSettings = (telegramConfig?.config || {}) as Record<string, unknown>;
    response.push({
      channel: "telegram_business",
      isEnabled: Boolean(telegramConfig?.isEnabled && telegramSettings.business_enabled === "true"),
      config: {
        bot_username: telegramSettings.bot_username,
        business_connection_count: String(Object.values(businessConnections(telegramSettings))
          .filter((connection) => connection?.isEnabled).length),
        needs_bot_setup: String(!telegramConfig?.isEnabled),
      },
      webhookUrl: null,
    });
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Telegram: setup bot & register webhook ───────────────────────────────────
router.post("/channels/telegram/setup", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const { botToken } = req.body;
    if (!botToken?.trim()) return res.status(400).json({ error: "bot_token обов'язковий" });

    // Verify token with Telegram
    const meR = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const me = await meR.json() as any;
    if (!me.ok) return res.status(400).json({ error: `Telegram: невірний токен — ${me.description}` });

    const botName = me.result.username;
    const botId = me.result.id;

    // Upsert channel config
    const existing = await db.select().from(channelConfigsTable)
      .where(and(eq(channelConfigsTable.organizationId, orgId), eq(channelConfigsTable.channel, "telegram" as any)));

    const existingConfig = (existing[0]?.config || {}) as Record<string, string>;
    const webhookUrl = telegramWebhookUrl(orgId);
    const webhookSecret = existingConfig.webhook_secret || randomBytes(32).toString("base64url");
    await registerTelegramWebhook(botToken, webhookUrl, webhookSecret);
    const configData = {
      ...existingConfig,
      bot_token: botToken,
      bot_username: botName,
      bot_id: String(botId),
      webhook_secret: webhookSecret,
    };
    if (existing.length) {
      await db.update(channelConfigsTable).set({
        config: configData, isEnabled: true, webhookUrl, updatedAt: new Date(),
      }).where(eq(channelConfigsTable.id, existing[0].id));
    } else {
      await db.insert(channelConfigsTable).values({
        organizationId: orgId, channel: "telegram" as any,
        config: configData, isEnabled: true, webhookUrl,
      });
    }

    res.json({ success: true, botUsername: botName, webhookUrl });
  } catch (err: any) {
    console.error("[telegram/setup]", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Telegram: secure an existing legacy webhook without re-entering a token ──
router.post("/channels/telegram/secure-webhook", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const [cfg] = await db.select().from(channelConfigsTable)
      .where(and(eq(channelConfigsTable.organizationId, orgId), eq(channelConfigsTable.channel, "telegram" as any)));
    const config = (cfg?.config || {}) as Record<string, string>;
    if (!cfg?.isEnabled || !config.bot_token) {
      res.status(409).json({ error: "Telegram Bot не підключено." });
      return;
    }

    const webhookUrl = telegramWebhookUrl(orgId);
    const webhookSecret = randomBytes(32).toString("base64url");
    await registerTelegramWebhook(config.bot_token, webhookUrl, webhookSecret);
    await db.update(channelConfigsTable).set({
      config: { ...config, webhook_secret: webhookSecret },
      webhookUrl,
      updatedAt: new Date(),
    }).where(eq(channelConfigsTable.id, cfg.id));
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Telegram webhook security update failed");
    res.status(500).json({ error: err.message || "Не вдалося оновити захист Telegram" });
  }
});

// ── Telegram Business: enable a connected business bot ───────────────────────
router.post("/channels/telegram/business/setup", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const [cfg] = await db.select().from(channelConfigsTable)
      .where(and(eq(channelConfigsTable.organizationId, orgId), eq(channelConfigsTable.channel, "telegram" as any)));
    const config = (cfg?.config || {}) as Record<string, string>;
    if (!cfg?.isEnabled || !config.bot_token || !config.bot_username) {
      res.status(409).json({ error: "Спочатку підключіть Telegram Bot для цього закладу." });
      return;
    }

    const webhookUrl = telegramWebhookUrl(orgId);
    const webhookSecret = config.webhook_secret || randomBytes(32).toString("base64url");
    await registerTelegramWebhook(config.bot_token, webhookUrl, webhookSecret);
    await db.update(channelConfigsTable).set({
      config: {
        ...config,
        webhook_secret: webhookSecret,
        business_enabled: "true",
        business_connections: config.business_connections || "{}",
      },
      isEnabled: true,
      webhookUrl,
      updatedAt: new Date(),
    }).where(eq(channelConfigsTable.id, cfg.id));

    res.json({ success: true, botUsername: config.bot_username });
  } catch (err: any) {
    logger.error({ err }, "Telegram Business setup failed");
    res.status(500).json({ error: err.message || "Не вдалося увімкнути Telegram Business" });
  }
});

// ── Telegram Business: stop processing business account messages ─────────────
router.delete("/channels/telegram/business/setup", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const [cfg] = await db.select().from(channelConfigsTable)
      .where(and(eq(channelConfigsTable.organizationId, orgId), eq(channelConfigsTable.channel, "telegram" as any)));
    if (cfg) {
      await db.update(channelConfigsTable).set({
        config: {
          ...(cfg.config || {}),
          business_enabled: "false",
          business_connections: "{}",
        },
        updatedAt: new Date(),
      }).where(eq(channelConfigsTable.id, cfg.id));
    }
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Telegram Business disconnect failed");
    res.status(500).json({ error: err.message || "Не вдалося відключити Telegram Business" });
  }
});

// ── Telegram: disconnect ─────────────────────────────────────────────────────
router.delete("/channels/telegram/setup", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const [cfg] = await db.select().from(channelConfigsTable)
      .where(and(eq(channelConfigsTable.organizationId, orgId), eq(channelConfigsTable.channel, "telegram" as any)));
    if (cfg?.config?.bot_token) {
      await fetch(`https://api.telegram.org/bot${cfg.config.bot_token}/deleteWebhook`).catch(() => {});
    }
    if (cfg) {
      await db.update(channelConfigsTable).set({ isEnabled: false, config: {}, webhookUrl: null, updatedAt: new Date() })
        .where(eq(channelConfigsTable.id, cfg.id));
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Instagram: setup via access token ───────────────────────────────────────
router.post("/channels/instagram/setup", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const { accessToken, pageId, verifyToken, appSecret } = req.body;
    if (!accessToken?.trim() || !pageId?.trim() || !verifyToken?.trim() || !appSecret?.trim()) {
      return res.status(400).json({ error: "accessToken, pageId, verifyToken та appSecret обов'язкові" });
    }

    // Verify access token by fetching page info
    const pageR = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=name,instagram_business_account&access_token=${accessToken}`);
    const pageData = await pageR.json() as any;
    if (pageData.error) return res.status(400).json({ error: `Facebook API: ${pageData.error.message}` });

    const igUserId = pageData.instagram_business_account?.id || pageId;
    const pageName = pageData.name || "Instagram";

    // Build webhook URL
    const baseUrl = process.env.PUBLIC_API_URL
      || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
    if (!baseUrl) return res.status(500).json({ error: "PUBLIC_API_URL не налаштований" });
    const webhookUrl = `${baseUrl}/api/inbox/webhooks/instagram`;

    // Upsert channel config
    const existing = await db.select().from(channelConfigsTable)
      .where(and(eq(channelConfigsTable.organizationId, orgId), eq(channelConfigsTable.channel, "instagram" as any)));

    const configData = {
      access_token: accessToken,
      page_id: pageId,
      ig_user_id: igUserId,
      verify_token: verifyToken,
      app_secret: appSecret,
      page_name: pageName,
    };
    if (existing.length) {
      await db.update(channelConfigsTable).set({
        config: configData, isEnabled: true, webhookUrl, updatedAt: new Date(),
      }).where(eq(channelConfigsTable.id, existing[0].id));
    } else {
      await db.insert(channelConfigsTable).values({
        organizationId: orgId, channel: "instagram" as any,
        config: configData, isEnabled: true, webhookUrl,
      });
    }

    res.json({ success: true, pageName, igUserId, webhookUrl });
  } catch (err: any) {
    console.error("[instagram/setup]", err);
    res.status(500).json({ error: err.message });
  }
});

// ── WhatsApp Business: setup ─────────────────────────────────────────────────
router.post("/channels/whatsapp/setup", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const { phoneNumberId, accessToken, appSecret, verifyToken } = req.body;
    if (!phoneNumberId?.trim() || !accessToken?.trim() || !appSecret?.trim() || !verifyToken?.trim()) {
      return res.status(400).json({ error: "phoneNumberId, accessToken, appSecret та verifyToken обов'язкові" });
    }

    // Verify credentials by fetching phone number info from Meta Graph API
    const phoneR = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}?fields=display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const phoneData = await phoneR.json() as any;
    if (phoneData.error) {
      return res.status(400).json({ error: `Meta API: ${phoneData.error.message}` });
    }
    const displayPhone = phoneData.display_phone_number || phoneNumberId;
    const verifiedName = phoneData.verified_name || "WhatsApp Business";

    // Build webhook URL
    const baseUrl = process.env.PUBLIC_API_URL
      || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
    if (!baseUrl) return res.status(500).json({ error: "PUBLIC_API_URL не налаштований" });
    const webhookUrl = `${baseUrl}/api/inbox/webhooks/whatsapp`;

    // Upsert channel config — never return secrets in this response
    const existing = await db.select().from(channelConfigsTable)
      .where(and(eq(channelConfigsTable.organizationId, orgId), eq(channelConfigsTable.channel, "whatsapp" as any)));

    const configData = {
      phone_number_id: phoneNumberId,
      access_token: accessToken,
      app_secret: appSecret,
      verify_token: verifyToken,
      display_phone: displayPhone,
      verified_name: verifiedName,
    };
    if (existing.length) {
      await db.update(channelConfigsTable).set({
        config: configData, isEnabled: true, webhookUrl, updatedAt: new Date(),
      }).where(eq(channelConfigsTable.id, existing[0].id));
    } else {
      await db.insert(channelConfigsTable).values({
        organizationId: orgId, channel: "whatsapp" as any,
        config: configData, isEnabled: true, webhookUrl,
      });
    }

    res.json({ success: true, displayPhone, verifiedName, webhookUrl });
  } catch (err: any) {
    logger.error({ err }, "WhatsApp setup failed");
    res.status(500).json({ error: err.message });
  }
});

// ── WhatsApp Business: disconnect ────────────────────────────────────────────
router.delete("/channels/whatsapp/setup", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const [cfg] = await db.select().from(channelConfigsTable)
      .where(and(eq(channelConfigsTable.organizationId, orgId), eq(channelConfigsTable.channel, "whatsapp" as any)));
    if (cfg) {
      await db.update(channelConfigsTable).set({ isEnabled: false, config: {}, webhookUrl: null, updatedAt: new Date() })
        .where(eq(channelConfigsTable.id, cfg.id));
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Instagram: disconnect ────────────────────────────────────────────────────
router.delete("/channels/instagram/setup", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const [cfg] = await db.select().from(channelConfigsTable)
      .where(and(eq(channelConfigsTable.organizationId, orgId), eq(channelConfigsTable.channel, "instagram" as any)));
    if (cfg) {
      await db.update(channelConfigsTable).set({ isEnabled: false, config: {}, webhookUrl: null, updatedAt: new Date() })
        .where(eq(channelConfigsTable.id, cfg.id));
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stats ───────────────────────────────────────────────────────────────────
router.get("/stats", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    await ensureDemoData(orgId);

    const [convR, leadR] = await Promise.all([
      (db as any).$client.query(`SELECT status, channel, unread_count FROM conversations WHERE organization_id = $1`, [orgId]),
      (db as any).$client.query(`SELECT status, estimated_value FROM leads WHERE organization_id = $1`, [orgId]),
    ]);

    const convs = convR.rows;
    const leads = leadR.rows;

    const stats = {
      total: convs.length,
      open: convs.filter((c: any) => c.status === "open").length,
      pending: convs.filter((c: any) => c.status === "pending").length,
      resolved: convs.filter((c: any) => c.status === "resolved").length,
      totalUnread: convs.reduce((s: number, c: any) => s + (c.unread_count || 0), 0),
      byChannel: {} as Record<string, number>,
      leads: {
        total: leads.length,
        new: leads.filter((l: any) => l.status === "new").length,
        qualified: leads.filter((l: any) => l.status === "qualified").length,
        quoteSent: leads.filter((l: any) => l.status === "quote_sent").length,
        booked: leads.filter((l: any) => l.status === "booked").length,
        totalValue: leads.reduce((s: number, l: any) => s + parseFloat(l.estimated_value || 0), 0),
      },
    };
    for (const c of convs) {
      stats.byChannel[c.channel] = (stats.byChannel[c.channel] || 0) + 1;
    }
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
