import { Router } from "express";
import { db } from "@workspace/db";
import {
  conversationsTable, messagesTable, channelConfigsTable,
  bookingsTable, guestsTable, unitsTable, propertiesTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

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
        WHERE b.id = $1
      `, [conv.booking_id]);
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
        ...conv,
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
      `SELECT id FROM conversations WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    if (!convR.rows[0]) return res.status(404).json({ error: "Not found" });

    const msgR = await (db as any).$client.query(`
      INSERT INTO messages (conversation_id, direction, message_type, content, sender_name, is_read, is_ai_generated, created_at)
      VALUES ($1, 'outbound', $2, $3, $4, true, $5, NOW())
      RETURNING *
    `, [id, messageType, content.trim(), req.user.name || "Адміністратор", isAiGenerated]);

    await (db as any).$client.query(`
      UPDATE conversations SET last_message_at = NOW(), last_message_preview = $2, status = 'pending', updated_at = NOW()
      WHERE id = $1
    `, [id, content.trim().slice(0, 100)]);

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

// ── AI reply suggestion ─────────────────────────────────────────────────────
router.post("/conversations/:id/ai-suggest", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = parseInt(req.params.id);

    const convR = await (db as any).$client.query(
      `SELECT * FROM conversations WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    if (!convR.rows[0]) return res.status(404).json({ error: "Not found" });
    const conv = convR.rows[0];

    const msgsR = await (db as any).$client.query(`
      SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 6
    `, [id]);

    const lastInbound = msgsR.rows.find((m: any) => m.direction === "inbound");
    if (!lastInbound?.content) return res.status(400).json({ error: "Немає вхідних повідомлень" });

    const content = lastInbound.content.toLowerCase();
    const name = conv.guest_name?.split(" ")[0] || "";
    let suggestion = "";

    if (content.includes("вільн") || content.includes("є місця") || content.includes("є номер") || content.includes("доступн")) {
      suggestion = `Добрий день, ${name}! Так, маємо вільні об'єкти на ваші дати 🌿\n\nЩоб підібрати найкращий варіант, уточніть:\n— Кількість гостей\n— Бажані дати заїзду та виїзду\n— Який тип розміщення вас цікавить?\n\nВідповімо протягом 15 хвилин!`;
    } else if (content.includes("ціна") || content.includes("вартість") || content.includes("скільки") || content.includes("прайс") || content.includes("розцінк")) {
      suggestion = `Добрий день! Вартість проживання залежить від обраного об'єкта та сезону 🏡\n\nНаші ціни стартують від 2 500 ₴/ніч.\nДо них можна додати:\n🧖 SPA-процедури\n🚲 Оренду активності\n🍳 Харчування\n\nНадішліть дати та кількість гостей — розрахуємо точну суму!`;
    } else if (content.includes("весілля") || content.includes("одруження")) {
      suggestion = `Дякуємо за інтерес до нашого комплексу! Ми з радістю приймаємо весілля 💍\n\nУ нас є:\n✅ Банкетний зал до 120 гостей\n✅ Декорована альтанка для церемонії\n✅ Проживання для гостей\n✅ SPA для молодят\n✅ Власна фотозона\n\nНадішліть бажану дату та кількість гостей — підготуємо детальну КП!`;
    } else if (content.includes("корпоратив") || content.includes("корпорат") || content.includes("конференц")) {
      suggestion = `Добрий день! Ми спеціалізуємось на корпоративних заходах 🎯\n\nПропонуємо:\n🏢 Конференц-зал із обладнанням\n🍽️ Корпоративне харчування від шеф-кухаря\n🏊 SPA та активності для тімбілдингу\n🏠 Проживання для учасників\n\nНадішліть кількість учасників, дати та формат заходу!`;
    } else if (content.includes("spa") || content.includes("масаж") || content.includes("сауна") || content.includes("басейн")) {
      suggestion = `Наш SPA-центр відкритий щодня! 🌿\n\nПослуги:\n🧖 Масаж — від 800 ₴/год\n🛁 Джакузі — 600 ₴/год\n🔥 Сауна — 900 ₴/2 год\n🏊 Басейн — 400 ₴ вхід\n\nDay pass без проживання доступний. Записати вас на конкретний час?`;
    } else if (content.includes("сап") || content.includes("велосипед") || content.includes("каяк") || content.includes("риб")) {
      suggestion = `У нас є все для активного відпочинку! 🌊\n\n🏄 SUP-дошки — 400 ₴/год\n🚲 Велосипеди — 250 ₴/день\n🎣 Рибальський комплект — 300 ₴/день\n🛶 Каяки — 350 ₴/2 год\n\nМожна взяти на пів дня або повний день. Бронювати заздалегідь не потрібно!`;
    } else if (content.includes("довгостроков") || content.includes("місяць") || content.includes("місячн")) {
      suggestion = `Добрий день! Так, ми розглядаємо довгострокову оренду від 30 днів зі спеціальними умовами 🏠\n\nВартість узгоджується індивідуально і зазвичай на 25-30% нижче щоденної ставки.\n\nУкажіть об'єкт та бажаний термін — зв'яжемося для обговорення деталей!`;
    } else if (content.includes("дякую") || content.includes("дякую") || content.includes("чудово") || content.includes("відмінно")) {
      suggestion = `Дякуємо і вам за добрі слова! 🙏\n\nЗавжди раді бачити вас знову. Якщо виникнуть будь-які питання або захочете забронювати наступний відпочинок — звертайтесь!\n\nАрт-курорт «Догода» завжди для вас відкритий! 🌿`;
    } else {
      suggestion = `Добрий день, ${name}! Дякуємо за звернення до арт-курорту «Догода» 🏡\n\nМи уважно ознайомились з вашим запитом і з радістю допоможемо. Уточніть, будь ласка, деталі — підберемо найкращий варіант для вас!`;
    }

    res.json({ suggestion });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Update conversation ─────────────────────────────────────────────────────
router.patch("/conversations/:id", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = parseInt(req.params.id);
    const { status, bookingId, leadId, tags, assignedToId, subject, estimatedValue } = req.body;

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
    res.json(channels.map(ch => {
      const config = configs.find(c => c.channel === ch);
      return { channel: ch, isEnabled: config?.isEnabled || ch === "website", config: config?.config || {} };
    }));
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
