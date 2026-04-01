import { Router } from "express";
import { db } from "@workspace/db";
import {
  conversationsTable, messagesTable, channelConfigsTable,
  bookingsTable, guestsTable, unitsTable, propertiesTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
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
      guestPhone: demo.guestPhone || null,
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

    const { status, channel, search, limit = "30", offset = "0" } = req.query as Record<string, string>;

    let query = db.select().from(conversationsTable).where(eq(conversationsTable.organizationId, orgId));

    const conversations = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.organizationId, orgId))
      .orderBy(desc(conversationsTable.lastMessageAt));

    let filtered = conversations;
    if (status) filtered = filtered.filter(c => c.status === status);
    if (channel) filtered = filtered.filter(c => c.channel === channel);
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(c =>
        c.guestName?.toLowerCase().includes(s) ||
        c.guestPhone?.includes(s) ||
        c.subject?.toLowerCase().includes(s) ||
        c.lastMessagePreview?.toLowerCase().includes(s)
      );
    }

    const paginated = filtered.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

    res.json({ conversations: paginated, total: filtered.length, totalUnread });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// ── Get conversation + messages ────────────────────────────────────────────
router.get("/conversations/:id", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = parseInt(req.params.id);

    const [conversation] = await db.select().from(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.organizationId, orgId)));
    if (!conversation) return res.status(404).json({ error: "Розмову не знайдено" });

    const messages = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(messagesTable.createdAt);

    // Mark as read
    await db.update(conversationsTable).set({ unreadCount: 0 }).where(eq(conversationsTable.id, id));
    await db.update(messagesTable).set({ isRead: true })
      .where(and(eq(messagesTable.conversationId, id), eq(messagesTable.direction, "inbound")));

    // If linked to booking, get booking summary
    let booking = null;
    if (conversation.bookingId) {
      const [b] = await db.select({
        id: bookingsTable.id,
        checkIn: bookingsTable.checkIn,
        checkOut: bookingsTable.checkOut,
        status: bookingsTable.status,
        paymentStatus: bookingsTable.paymentStatus,
        totalAmount: bookingsTable.totalAmount,
        unitName: unitsTable.name,
      }).from(bookingsTable)
        .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
        .where(eq(bookingsTable.id, conversation.bookingId));
      booking = b || null;
    }

    res.json({ conversation: { ...conversation, unreadCount: 0 }, messages, booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// ── Send reply ─────────────────────────────────────────────────────────────
router.post("/conversations/:id/reply", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = parseInt(req.params.id);
    const { content, messageType = "text" } = req.body;

    if (!content?.trim()) return res.status(400).json({ error: "Повідомлення не може бути порожнім" });

    const [conversation] = await db.select().from(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.organizationId, orgId)));
    if (!conversation) return res.status(404).json({ error: "Розмову не знайдено" });

    const [message] = await db.insert(messagesTable).values({
      conversationId: id,
      direction: "outbound",
      messageType: messageType as any,
      content: content.trim(),
      senderName: req.user.name || "Адміністратор",
      isRead: true,
    }).returning();

    await db.update(conversationsTable).set({
      lastMessageAt: new Date(),
      lastMessagePreview: content.trim().slice(0, 100),
      status: "pending",
      updatedAt: new Date(),
    }).where(eq(conversationsTable.id, id));

    res.json({ success: true, message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// ── AI reply suggestion ────────────────────────────────────────────────────
router.post("/conversations/:id/ai-suggest", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = parseInt(req.params.id);

    const [conversation] = await db.select().from(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.organizationId, orgId)));
    if (!conversation) return res.status(404).json({ error: "Розмову не знайдено" });

    const messages = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(desc(messagesTable.createdAt))
      .limit(5);

    const lastInbound = messages.find(m => m.direction === "inbound");
    if (!lastInbound?.content) return res.status(400).json({ error: "Немає вхідних повідомлень" });

    // Smart rule-based AI suggestions based on last message content
    const content = lastInbound.content.toLowerCase();
    let suggestion = "";

    if (content.includes("вільн") || content.includes("є місця") || content.includes("є номер")) {
      suggestion = `Добрий день, ${conversation.guestName?.split(" ")[0] || ""}! Так, маємо вільні об'єкти на ваші дати. Щоб підібрати найкращий варіант, уточніть, будь ласка:\n— Кількість гостей\n— Бажані дати заїзду та виїзду\n— Який тип розміщення вас цікавить?\n\nЗ радістю підготуємо пропозицію! 🌿`;
    } else if (content.includes("ціна") || content.includes("вартість") || content.includes("скільки") || content.includes("прайс")) {
      suggestion = `Добрий день! Вартість проживання залежить від обраного об'єкта та сезону. Наші ціни стартують від 2500 грн/ніч. До них можна додати:\n🧖 SPA-процедури\n🚲 Оренду активності\n🍳 Харчування\n\nНадішліть дати та кількість гостей — розрахуємо точну суму!`;
    } else if (content.includes("весілля") || content.includes("весілля")) {
      suggestion = `Дякуємо за інтерес до нашого комплексу! Ми з радістю приймаємо весілля. У нас є:\n✅ Банкетний зал до 100 гостей\n✅ Декорована альтанка для церемонії\n✅ Проживання для гостей\n✅ SPA для молодят\n\nНадішліть бажану дату та кількість гостей — підготуємо детальну КП!`;
    } else if (content.includes("корпоратив") || content.includes("корпорат")) {
      suggestion = `Добрий день! Ми спеціалізуємось на корпоративних заходах. Пропонуємо:\n🏢 Конференц-зал із обладнанням\n🍽️ Корпоративне харчування від шеф-кухаря\n🏊 SPA та активності для тімбілдингу\n🏠 Проживання для учасників\n\nНадішліть кількість учасників, дати та формат заходу — зробимо найкращу пропозицію!`;
    } else if (content.includes("spa") || content.includes("масаж") || content.includes("сауна") || content.includes("басейн")) {
      suggestion = `Наш SPA-центр відкритий щодня! 🌿\n\nПослуги:\n🧖 Масаж від 800 грн/год\n🛁 Джакузі від 600 грн/год\n🔥 Сауна від 900 грн/2 год\n🏊 Басейн — 400 грн вхід\n\nДоступний day pass без проживання. Записати вас на конкретний час?`;
    } else if (content.includes("сап") || content.includes("велосипед") || content.includes("оренд") || content.includes("катамаран")) {
      suggestion = `У нас є все для активного відпочинку! 🌊\n\n🏄 SUP-дошки — 400 грн/год\n🚲 Велосипеди — 250 грн/день\n🎣 Рибальський комплект — 300 грн/день\n🛶 Каяки — 350 грн/2 год\n\nМожна взяти на пів дня або повний день. Бронювати заздалегідь не обов'язково — є в наявності!`;
    } else if (content.includes("довгостроков") || content.includes("місяць") || content.includes("місячн")) {
      suggestion = `Добрий день! Так, ми розглядаємо довгострокову оренду від 30 днів зі спеціальними умовами. Вартість узгоджується індивідуально і зазвичай на 25-30% нижче щоденної ставки. Укажіть об'єкт, що вас цікавить, та бажаний термін — зв'яжемося для обговорення деталей!`;
    } else {
      suggestion = `Добрий день, ${conversation.guestName?.split(" ")[0] || ""}! Дякуємо за звернення до нас. Уточніть, будь ласка, деталі вашого запиту — ми з радістю допоможемо підібрати найкращий варіант для відпочинку! 🏡`;
    }

    res.json({ suggestion });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// ── Update conversation status ─────────────────────────────────────────────
router.patch("/conversations/:id", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = parseInt(req.params.id);
    const { status, bookingId, guestId, tags, assignedToId } = req.body;

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (bookingId !== undefined) updates.bookingId = bookingId;
    if (guestId !== undefined) updates.guestId = guestId;
    if (tags !== undefined) updates.tags = tags;
    if (assignedToId !== undefined) updates.assignedToId = assignedToId;

    const [updated] = await db.update(conversationsTable)
      .set(updates)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.organizationId, orgId)))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// ── Create new conversation (manual) ──────────────────────────────────────
router.post("/conversations", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const { channel, guestName, guestPhone, guestEmail, subject, initialMessage } = req.body;

    if (!guestName || !channel) return res.status(400).json({ error: "Ім'я гостя та канал обов'язкові" });

    const [conversation] = await db.insert(conversationsTable).values({
      organizationId: orgId,
      channel: channel as any,
      guestName,
      guestPhone: guestPhone || null,
      guestEmail: guestEmail || null,
      subject: subject || null,
      lastMessagePreview: initialMessage || null,
      status: "open",
      lastMessageAt: new Date(),
    }).returning();

    if (initialMessage) {
      await db.insert(messagesTable).values({
        conversationId: conversation.id,
        direction: "inbound",
        content: initialMessage,
        senderName: guestName,
      });
    }

    res.json(conversation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// ── Link booking to conversation ───────────────────────────────────────────
router.post("/conversations/:id/link-booking/:bookingId", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = parseInt(req.params.id);
    const bookingId = parseInt(req.params.bookingId);

    const [updated] = await db.update(conversationsTable)
      .set({ bookingId, updatedAt: new Date() })
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.organizationId, orgId)))
      .returning();

    // Add system message
    await db.insert(messagesTable).values({
      conversationId: id,
      direction: "outbound",
      messageType: "system",
      content: `📎 Прив'язано до бронювання #${bookingId}`,
      senderName: "Система",
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// ── Get channel configs ────────────────────────────────────────────────────
router.get("/channels", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const configs = await db.select().from(channelConfigsTable)
      .where(eq(channelConfigsTable.organizationId, orgId));

    const channels = ["telegram", "instagram", "website", "email", "phone", "whatsapp", "viber"];
    const result = channels.map(ch => {
      const config = configs.find(c => c.channel === ch);
      return {
        channel: ch,
        isEnabled: config?.isEnabled || ch === "website",
        config: config?.config || {},
        webhookUrl: config?.webhookUrl || null,
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// ── Stats ──────────────────────────────────────────────────────────────────
router.get("/stats", async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    await ensureDemoData(orgId);

    const conversations = await db.select().from(conversationsTable)
      .where(eq(conversationsTable.organizationId, orgId));

    const stats = {
      total: conversations.length,
      open: conversations.filter(c => c.status === "open").length,
      pending: conversations.filter(c => c.status === "pending").length,
      resolved: conversations.filter(c => c.status === "resolved").length,
      totalUnread: conversations.reduce((s, c) => s + c.unreadCount, 0),
      byChannel: {} as Record<string, number>,
    };

    for (const c of conversations) {
      stats.byChannel[c.channel] = (stats.byChannel[c.channel] || 0) + 1;
    }

    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

export default router;
