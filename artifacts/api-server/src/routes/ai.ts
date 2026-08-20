import { Router } from "express";
import { db } from "@workspace/db";
import {
  conversationsTable, messagesTable,
  guestsTable, bookingsTable,
  aiKnowledgeArticlesTable, aiConciergeSettingsTable, aiConciergeAuditLogsTable,
} from "@workspace/db";
import { eq, desc, and, sql, ne } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();
const getOrg = (req: any) => req.user?.organizationId;

function requireOrganizationContext(req: any, res: any): number | null {
  const orgId = getOrg(req);
  if (!Number.isInteger(orgId)) {
    res.status(400).json({
      error: "Оберіть організацію перед роботою з базою знань або AI Concierge.",
      code: "ORGANIZATION_CONTEXT_REQUIRED",
    });
    return null;
  }
  return orgId;
}

function articleId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function articleInput(body: any): { data?: Record<string, unknown>; error?: string } {
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "general";
  const allowedCategories = new Set(["general", "faq", "accommodation", "rates", "policies", "services", "checkin", "scripts"]);
  const tags = Array.isArray(body?.tags)
    ? body.tags.filter((tag: unknown) => typeof tag === "string").map((tag: string) => tag.trim()).filter(Boolean).join(", ")
    : typeof body?.tags === "string" ? body.tags.trim() : null;
  const validDate = (value: unknown) => value === null || value === undefined || value === "" || /^\d{4}-\d{2}-\d{2}$/.test(String(value));

  if (!title || title.length > 180) return { error: "Назва має містити від 1 до 180 символів." };
  if (!content || content.length > 20_000) return { error: "Текст має містити від 1 до 20 000 символів." };
  if (!allowedCategories.has(category)) return { error: "Непідтримувана категорія статті." };
  if (!validDate(body?.effectiveFrom) || !validDate(body?.effectiveUntil)) return { error: "Дата дії має бути у форматі YYYY-MM-DD." };
  if (body?.effectiveFrom && body?.effectiveUntil && body.effectiveFrom > body.effectiveUntil) {
    return { error: "Дата завершення не може бути раніше дати початку." };
  }
  return {
    data: {
      title,
      content,
      category,
      tags,
      effectiveFrom: body?.effectiveFrom || null,
      effectiveUntil: body?.effectiveUntil || null,
    },
  };
}

async function conciergeSettings(organizationId: number) {
  const [stored] = await db
    .select()
    .from(aiConciergeSettingsTable)
    .where(eq(aiConciergeSettingsTable.organizationId, organizationId))
    .limit(1);
  return stored ?? { enabled: true, mode: "manual" as const };
}

function rankArticles(articles: any[], question: string) {
  const keywords = [...new Set(question.toLowerCase().match(/[а-яіїєa-z0-9]{3,}/gi) || [])].slice(0, 16);
  return articles
    .map((article) => {
      const searchable = `${article.title} ${article.tags || ""} ${article.content}`.toLowerCase();
      const matches = keywords.filter((keyword) => searchable.includes(keyword)).length;
      return { article, score: matches + (article.title.toLowerCase().includes(question.toLowerCase()) ? 3 : 0) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.article.updatedAt.getTime() - a.article.updatedAt.getTime())
    .slice(0, 4)
    .map(({ article }) => article);
}

async function writeConciergeAudit(input: {
  organizationId: number;
  actorUserId?: number;
  action: string;
  outcome: string;
  sources?: unknown;
  details?: unknown;
}) {
  await db.insert(aiConciergeAuditLogsTable).values({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    outcome: input.outcome,
    sources: input.sources ?? null,
    details: input.details ?? null,
  });
}

function extractJSON(raw: string, arrayMode = false): any {
  const stripped = raw.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
  
  const direct = tryParse(stripped);
  if (direct !== null) {
    if (!arrayMode) return direct;
    if (Array.isArray(direct)) return direct;
    const firstArr = Object.values(direct as any).find((v: any) => Array.isArray(v));
    if (firstArr) return firstArr;
  }
  
  const arrMatch = stripped.match(/\[[\s\S]*?\]/);
  if (arrMatch) { const v = tryParse(arrMatch[0]); if (v !== null) return v; }
  
  const objMatch = stripped.match(/\{[\s\S]*\}/);
  if (objMatch) {
    const v = tryParse(objMatch[0]);
    if (v !== null) {
      if (!arrayMode) return v;
      if (Array.isArray(v)) return v;
      const firstArr = Object.values(v as any).find((x: any) => Array.isArray(x));
      if (firstArr) return firstArr;
    }
  }
  return arrayMode ? [] : {};
}

const HOTEL_SYSTEM_CONTEXT = `Ти — AI-асистент для готельного менеджменту Maison HD. 
Ти допомагаєш персоналу та власникам готелів. Відповідай українською мовою.
Будь конкретним, корисним та професійним. Надавай практичні рекомендації.`;

// ─── 1. AI відповіді в чатах ─────────────────────────────────────────────────
router.post("/chat-reply", requireAuth, async (req: any, res) => {
  try {
    const { conversationId, context } = req.body;
    const orgId = getOrg(req);

    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.id, conversationId), eq(conversationsTable.organizationId, orgId)))
      .limit(1);

    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const messages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(desc(messagesTable.createdAt))
      .limit(10);

    const chatHistory = messages.reverse().map((m: any) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.content || "",
    }));

    const systemPrompt = `${HOTEL_SYSTEM_CONTEXT}
Ти відповідаєш від імені персоналу готелю гостю: ${conv.guestName || "Гість"}.
Канал: ${conv.channel}. Тема: ${conv.subject || "Загальне питання"}.
${context ? `Додатковий контекст: ${context}` : ""}
Складіть короткий, ввічливий і корисний текст відповіді для гостя.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 512,
      messages: [
        { role: "system", content: systemPrompt },
        ...chatHistory,
        { role: "user", content: "Запропонуйте оптимальну відповідь для гостя." },
      ],
    });

    const reply = completion.choices[0]?.message?.content || "";
    res.json({ reply });
  } catch (err: any) {
    console.error("AI chat-reply error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 2. AI sales assistant ────────────────────────────────────────────────────
router.post("/sales-suggest", requireAuth, async (req: any, res) => {
  try {
    const { bookingId, guestId } = req.body;
    const orgId = getOrg(req);

    let bookingContext = "";
    if (bookingId) {
      const [booking] = await db
        .select({
          checkIn: bookingsTable.checkIn,
          checkOut: bookingsTable.checkOut,
          adults: bookingsTable.adults,
          children: bookingsTable.children,
          totalAmount: bookingsTable.totalAmount,
        })
        .from(bookingsTable)
        .where(eq(bookingsTable.id, bookingId))
        .limit(1);
      if (booking) {
        bookingContext = `Бронювання: заїзд ${booking.checkIn}, виїзд ${booking.checkOut}, 
        дорослих: ${booking.adults}, дітей: ${booking.children || 0}, 
        сума: ${booking.totalAmount} грн.`;
      }
    }

    let guestContext = "";
    if (guestId) {
      const [guest] = await db
        .select()
        .from(guestsTable)
        .where(and(eq(guestsTable.id, guestId), eq(guestsTable.organizationId, orgId)))
        .limit(1);
      if (guest) {
        guestContext = `Гість: ${guest.firstName} ${guest.lastName}, ${guest.nationality || ""}, ${guest.vipStatus ? "VIP статус" : "звичайний гість"}.`;
      }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "system",
          content: `${HOTEL_SYSTEM_CONTEXT}
Ти — AI sales assistant для готелю. Генеруй конкретні пропозиції для збільшення доходу.
Враховуй контекст гостя та бронювання. Відповідай у форматі JSON масиву об'єктів:
[{"type": "тип", "title": "назва", "description": "опис", "estimatedRevenue": "сума", "priority": "high|medium|low"}]`,
        },
        {
          role: "user",
          content: `${bookingContext} ${guestContext}
Запропонуй 3-5 конкретних upsell-пропозицій для цього гостя (SPA, F&B, трансфер, туристичні послуги тощо).`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "[]";
    const suggestions = extractJSON(raw, true);
    res.json({ suggestions });
  } catch (err: any) {
    console.error("AI sales-suggest error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 3. AI summary по гостю ───────────────────────────────────────────────────
router.post("/guest-summary/:guestId", requireAuth, async (req: any, res) => {
  try {
    const guestId = parseInt(req.params.guestId);
    const orgId = getOrg(req);

    const [guest] = await db
      .select()
      .from(guestsTable)
      .where(and(eq(guestsTable.id, guestId), eq(guestsTable.organizationId, orgId)))
      .limit(1);

    if (!guest) return res.status(404).json({ error: "Guest not found" });

    const bookings = await db
      .select({
        checkIn: bookingsTable.checkIn,
        checkOut: bookingsTable.checkOut,
        status: bookingsTable.status,
        totalAmount: bookingsTable.totalAmount,
      })
      .from(bookingsTable)
      .where(eq(bookingsTable.guestId, guestId))
      .orderBy(desc(bookingsTable.checkIn))
      .limit(10);

    const guestData = `
Гість: ${guest.firstName} ${guest.lastName}
Email: ${guest.email || "не вказано"}
Телефон: ${guest.phone || "не вказано"}
Громадянство: ${guest.nationality || "не вказано"}
VIP: ${guest.vipStatus ? "Так" : "Ні"}
Кількість візитів: ${bookings.length}
Бронювання: ${bookings.map(b => `${b.checkIn} – ${b.checkOut} (${b.status}, ${b.totalAmount} грн)`).join(", ")}
${guest.notes ? `Нотатки: ${guest.notes}` : ""}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "system",
          content: `${HOTEL_SYSTEM_CONTEXT}
Генеруй структурований AI-профіль гостя для персоналу готелю.
Включи: загальну характеристику, переваги, ризики, рекомендації по сервісу.
Відповідь у форматі JSON:
{"summary": "...", "preferences": [...], "risks": [...], "recommendations": [...], "vipNotes": "..."}`,
        },
        { role: "user", content: `Проаналізуй профіль гостя:\n${guestData}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const profile = extractJSON(raw) || { summary: raw };
    res.json({ profile, guest });
  } catch (err: any) {
    console.error("AI guest-summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 4. AI підказки для адміністратора ───────────────────────────────────────
router.get("/admin-tips", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);

    const todayCheckIns = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM bookings b
          JOIN units u ON u.id = b.unit_id
          JOIN properties p ON p.id = u.property_id
          WHERE p.organization_id = ${orgId}
          AND b.check_in = CURRENT_DATE AND b.status = 'confirmed'`
    );
    const todayCheckOuts = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM bookings b
          JOIN units u ON u.id = b.unit_id
          JOIN properties p ON p.id = u.property_id
          WHERE p.organization_id = ${orgId}
          AND b.check_out = CURRENT_DATE AND b.status = 'confirmed'`
    );
    const pendingHK = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM housekeeping_tasks ht
          JOIN units u ON u.id = ht.unit_id
          JOIN properties p ON p.id = u.property_id
          WHERE p.organization_id = ${orgId}
          AND ht.status IN ('pending', 'in_progress')`
    );
    const openInbox = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM conversations WHERE organization_id = ${orgId} AND status = 'open'`
    );

    const contextData = `
Сьогодні заїздів: ${(todayCheckIns.rows[0] as any)?.cnt || 0}
Сьогодні виїздів: ${(todayCheckOuts.rows[0] as any)?.cnt || 0}
Відкритих HK завдань: ${(pendingHK.rows[0] as any)?.cnt || 0}
Відкритих повідомлень: ${(openInbox.rows[0] as any)?.cnt || 0}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "system",
          content: `${HOTEL_SYSTEM_CONTEXT}
Ти — AI-помічник для адміністратора готелю. Завжди надавай 5-7 конкретних операційних рекомендацій на сьогодні, незалежно від завантаженості готелю.
Відповідай ВИКЛЮЧНО у форматі JSON масиву (без пояснень, без markdown):
[{"priority": "high", "category": "назва", "tip": "конкретна порада", "action": "що зробити зараз"}]
priority може бути: high, medium, low. Масив ніколи НЕ повинен бути порожнім.`,
        },
        {
          role: "user",
          content: `Поточна ситуація в готелі:\n${contextData}\n\nСкладіть JSON масив з 5-7 практичних порад для адміністратора на сьогодні. Включіть: перевірку персоналу, комунікацію з гостями, оперативні задачі, превентивні дії. ЛИШЕ JSON масив, без пояснень.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "[]";
    const tips: any[] = extractJSON(raw, true);
    res.json({ tips, stats: { todayCheckIns: (todayCheckIns.rows[0] as any)?.cnt, todayCheckOuts: (todayCheckOuts.rows[0] as any)?.cnt, pendingHK: (pendingHK.rows[0] as any)?.cnt, openInbox: (openInbox.rows[0] as any)?.cnt } });
  } catch (err: any) {
    console.error("AI admin-tips error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 5. AI owner insights ─────────────────────────────────────────────────────
router.get("/owner-insights", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);

    const revenueData = await db.execute(
      sql`SELECT 
          SUM(total_amount) as total_revenue,
          COUNT(*) as total_bookings,
          AVG(total_amount) as avg_booking
          FROM bookings b
          JOIN units u ON u.id = b.unit_id
          JOIN properties p ON p.id = u.property_id
          WHERE p.organization_id = ${orgId}
          AND b.check_in >= date_trunc('month', CURRENT_DATE)
          AND b.status IN ('confirmed', 'checked_in', 'checked_out')`
    );
    const occupancyData = await db.execute(
      sql`SELECT 
          COUNT(*) FILTER (WHERE b.id IS NOT NULL AND b.check_in <= CURRENT_DATE AND b.check_out > CURRENT_DATE) as occupied,
          COUNT(*) as total_units
          FROM units u
          JOIN properties p ON p.id = u.property_id
          LEFT JOIN bookings b ON b.unit_id = u.id AND b.status IN ('confirmed', 'checked_in')
          WHERE p.organization_id = ${orgId}`
    );

    const rev = revenueData.rows[0] as any;
    const occ = occupancyData.rows[0] as any;

    const contextData = `
Виручка за поточний місяць: ${rev?.total_revenue || 0} грн
Кількість бронювань: ${rev?.total_bookings || 0}
Середній чек: ${Math.round(rev?.avg_booking || 0)} грн
Зайнятих номерів сьогодні: ${occ?.occupied || 0} з ${occ?.total_units || 0}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 1500,
      messages: [
        {
          role: "system",
          content: `${HOTEL_SYSTEM_CONTEXT}
Ти — AI-аналітик для власника готелю. Надавай стратегічні інсайти та рекомендації.
Відповідь у форматі JSON:
{
  "executiveSummary": "...",
  "kpiAnalysis": [{"metric": "...", "value": "...", "trend": "up|down|stable", "insight": "..."}],
  "opportunities": [...],
  "risks": [...],
  "strategicRecommendations": [...]
}`,
        },
        {
          role: "user",
          content: `Поточні показники готелю:\n${contextData}\nНадай стратегічний аналіз та рекомендації для власника.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const insights: any = extractJSON(raw) || { executiveSummary: raw };
    res.json({ insights, metrics: { totalRevenue: rev?.total_revenue, totalBookings: rev?.total_bookings, avgBooking: rev?.avg_booking } });
  } catch (err: any) {
    console.error("AI owner-insights error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 6. Tenant Knowledge Hub and Concierge controls ───────────────────────────
router.get("/knowledge", requireAuth, async (req: any, res): Promise<void> => {
  const orgId = requireOrganizationContext(req, res);
  if (!orgId) return;
  try {
    const [articles, settings] = await Promise.all([
      db.select()
        .from(aiKnowledgeArticlesTable)
        .where(eq(aiKnowledgeArticlesTable.organizationId, orgId))
        .orderBy(desc(aiKnowledgeArticlesTable.updatedAt)),
      conciergeSettings(orgId),
    ]);
    res.json({ articles, settings });
  } catch (err: any) {
    req.log?.error({ err }, "Unable to load knowledge hub");
    res.status(500).json({ error: "Не вдалося завантажити базу знань." });
  }
});

router.post("/knowledge", requireAuth, requireRole("super_admin", "owner", "manager"), async (req: any, res): Promise<void> => {
  const orgId = requireOrganizationContext(req, res);
  if (!orgId) return;
  const parsed = articleInput(req.body);
  if (!parsed.data) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const [article] = await db.insert(aiKnowledgeArticlesTable).values({
      ...parsed.data,
      organizationId: orgId,
      createdById: req.user.userId,
      status: "draft",
    }).returning();
    await writeConciergeAudit({
      organizationId: orgId, actorUserId: req.user.userId, action: "knowledge_created",
      outcome: "draft", details: { articleId: article.id },
    });
    res.status(201).json({ article });
  } catch (err: any) {
    req.log?.error({ err }, "Unable to create knowledge article");
    res.status(500).json({ error: "Не вдалося створити статтю." });
  }
});

router.put("/knowledge/:id", requireAuth, requireRole("super_admin", "owner", "manager"), async (req: any, res): Promise<void> => {
  const orgId = requireOrganizationContext(req, res);
  const id = articleId(req.params.id);
  if (!orgId || !id) {
    if (orgId && !id) res.status(400).json({ error: "Некоректний ідентифікатор статті." });
    return;
  }
  const parsed = articleInput(req.body);
  if (!parsed.data) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const [article] = await db.update(aiKnowledgeArticlesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(aiKnowledgeArticlesTable.id, id), eq(aiKnowledgeArticlesTable.organizationId, orgId)))
      .returning();
    if (!article) {
      res.status(404).json({ error: "Статтю не знайдено." });
      return;
    }
    await writeConciergeAudit({
      organizationId: orgId, actorUserId: req.user.userId, action: "knowledge_updated",
      outcome: article.status, details: { articleId: article.id },
    });
    res.json({ article });
  } catch (err: any) {
    req.log?.error({ err }, "Unable to update knowledge article");
    res.status(500).json({ error: "Не вдалося оновити статтю." });
  }
});

router.post("/knowledge/:id/publish", requireAuth, requireRole("super_admin", "owner", "manager"), async (req: any, res): Promise<void> => {
  const orgId = requireOrganizationContext(req, res);
  const id = articleId(req.params.id);
  if (!orgId || !id) {
    if (orgId && !id) res.status(400).json({ error: "Некоректний ідентифікатор статті." });
    return;
  }
  try {
    const [article] = await db.update(aiKnowledgeArticlesTable)
      .set({ status: "published", publishedAt: new Date(), archivedAt: null, updatedAt: new Date() })
      .where(and(eq(aiKnowledgeArticlesTable.id, id), eq(aiKnowledgeArticlesTable.organizationId, orgId)))
      .returning();
    if (!article) {
      res.status(404).json({ error: "Статтю не знайдено." });
      return;
    }
    await writeConciergeAudit({
      organizationId: orgId, actorUserId: req.user.userId, action: "knowledge_published",
      outcome: "published", details: { articleId: article.id },
    });
    res.json({ article });
  } catch (err: any) {
    req.log?.error({ err }, "Unable to publish knowledge article");
    res.status(500).json({ error: "Не вдалося опублікувати статтю." });
  }
});

router.post("/knowledge/:id/archive", requireAuth, requireRole("super_admin", "owner", "manager"), async (req: any, res): Promise<void> => {
  const orgId = requireOrganizationContext(req, res);
  const id = articleId(req.params.id);
  if (!orgId || !id) {
    if (orgId && !id) res.status(400).json({ error: "Некоректний ідентифікатор статті." });
    return;
  }
  try {
    const [article] = await db.update(aiKnowledgeArticlesTable)
      .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(aiKnowledgeArticlesTable.id, id), eq(aiKnowledgeArticlesTable.organizationId, orgId)))
      .returning();
    if (!article) {
      res.status(404).json({ error: "Статтю не знайдено." });
      return;
    }
    await writeConciergeAudit({
      organizationId: orgId, actorUserId: req.user.userId, action: "knowledge_archived",
      outcome: "archived", details: { articleId: article.id },
    });
    res.json({ article });
  } catch (err: any) {
    req.log?.error({ err }, "Unable to archive knowledge article");
    res.status(500).json({ error: "Не вдалося архівувати статтю." });
  }
});

router.delete("/knowledge/:id", requireAuth, requireRole("super_admin", "owner", "manager"), async (req: any, res): Promise<void> => {
  const orgId = requireOrganizationContext(req, res);
  const id = articleId(req.params.id);
  if (!orgId || !id) {
    if (orgId && !id) res.status(400).json({ error: "Некоректний ідентифікатор статті." });
    return;
  }
  try {
    const [deleted] = await db.delete(aiKnowledgeArticlesTable)
      .where(and(
        eq(aiKnowledgeArticlesTable.id, id),
        eq(aiKnowledgeArticlesTable.organizationId, orgId),
        ne(aiKnowledgeArticlesTable.status, "published"),
      ))
      .returning({ id: aiKnowledgeArticlesTable.id });
    if (!deleted) {
      res.status(409).json({ error: "Опубліковані статті потрібно спочатку архівувати." });
      return;
    }
    await writeConciergeAudit({
      organizationId: orgId, actorUserId: req.user.userId, action: "knowledge_deleted",
      outcome: "deleted", details: { articleId: id },
    });
    res.json({ ok: true });
  } catch (err: any) {
    req.log?.error({ err }, "Unable to delete knowledge article");
    res.status(500).json({ error: "Не вдалося видалити статтю." });
  }
});

router.patch("/knowledge/settings", requireAuth, requireRole("super_admin", "owner", "manager"), async (req: any, res): Promise<void> => {
  const orgId = requireOrganizationContext(req, res);
  if (!orgId) return;
  const mode = req.body?.mode;
  const enabled = req.body?.enabled;
  if ((mode !== undefined && !["manual", "faq_auto"].includes(mode)) || (enabled !== undefined && typeof enabled !== "boolean")) {
    res.status(400).json({ error: "Некоректні налаштування AI Concierge." });
    return;
  }
  try {
    const current = await conciergeSettings(orgId);
    const [settings] = await db.insert(aiConciergeSettingsTable).values({
      organizationId: orgId,
      mode: mode ?? current.mode,
      enabled: enabled ?? current.enabled,
      updatedById: req.user.userId,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: aiConciergeSettingsTable.organizationId,
      set: {
        mode: mode ?? current.mode,
        enabled: enabled ?? current.enabled,
        updatedById: req.user.userId,
        updatedAt: new Date(),
      },
    }).returning();
    await writeConciergeAudit({
      organizationId: orgId, actorUserId: req.user.userId, action: "concierge_settings_changed",
      outcome: settings.mode, details: { enabled: settings.enabled },
    });
    res.json({ settings });
  } catch (err: any) {
    req.log?.error({ err }, "Unable to update concierge settings");
    res.status(500).json({ error: "Не вдалося зберегти налаштування." });
  }
});

router.post("/knowledge/preview", requireAuth, async (req: any, res): Promise<void> => {
  const orgId = requireOrganizationContext(req, res);
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!orgId) return;
  if (!question || question.length > 1_000) {
    res.status(400).json({ error: "Введіть питання до 1 000 символів." });
    return;
  }
  try {
    const published = await db.select()
      .from(aiKnowledgeArticlesTable)
      .where(and(
        eq(aiKnowledgeArticlesTable.organizationId, orgId),
        eq(aiKnowledgeArticlesTable.status, "published"),
        sql`(${aiKnowledgeArticlesTable.effectiveFrom} IS NULL OR ${aiKnowledgeArticlesTable.effectiveFrom} <= CURRENT_DATE)`,
        sql`(${aiKnowledgeArticlesTable.effectiveUntil} IS NULL OR ${aiKnowledgeArticlesTable.effectiveUntil} >= CURRENT_DATE)`,
      ))
      .orderBy(desc(aiKnowledgeArticlesTable.updatedAt));
    const sources = rankArticles(published, question);
    if (!sources.length) {
      await writeConciergeAudit({
        organizationId: orgId, actorUserId: req.user.userId, action: "knowledge_preview",
        outcome: "handoff", sources: [], details: { question },
      });
      res.json({
        answer: "У базі знань немає підтвердженої інформації для точної відповіді. Уточніть деталі або передайте запит менеджеру.",
        sources: [],
        handoffSuggested: true,
      });
      return;
    }
    const sourceContext = sources.map((article) =>
      `Джерело #${article.id} — ${article.title} (${article.category}):\n${article.content}`,
    ).join("\n\n");
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 600,
      messages: [
        {
          role: "system",
          content: `${HOTEL_SYSTEM_CONTEXT}
Ти відповідаєш лише на основі наданих підтверджених джерел. Не вигадуй умов, цін, наявності чи політик.
Якщо джерел недостатньо, прямо скажи, що потрібно уточнення менеджера. Відповідай коротко українською мовою.`,
        },
        { role: "user", content: `Питання: ${question}\n\nПідтверджені джерела:\n${sourceContext}` },
      ],
    });
    const answer = completion.choices[0]?.message?.content?.trim() || "Потрібно уточнення менеджера.";
    await writeConciergeAudit({
      organizationId: orgId, actorUserId: req.user.userId, action: "knowledge_preview",
      outcome: "grounded", sources: sources.map((source) => source.id), details: { question },
    });
    res.json({
      answer,
      sources: sources.map(({ id, title, category, updatedAt }) => ({ id, title, category, updatedAt })),
      handoffSuggested: false,
    });
  } catch (err: any) {
    req.log?.error({ err }, "Unable to preview grounded response");
    res.status(500).json({ error: "Не вдалося сформувати відповідь на основі знань." });
  }
});

// ─── 7. AI routing задач ─────────────────────────────────────────────────────
router.post("/route-task", requireAuth, async (req: any, res) => {
  try {
    const { taskDescription, urgency } = req.body;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 512,
      messages: [
        {
          role: "system",
          content: `${HOTEL_SYSTEM_CONTEXT}
Ти — AI-диспетчер завдань готелю. Визнач найкращий відділ та пріоритет для завдання.
Відповідай у форматі JSON:
{"department": "housekeeping|reception|fb|spa|maintenance|management|security", "priority": "urgent|high|medium|low", "assignTo": "роль персоналу", "reasoning": "обґрунтування", "suggestedDeadline": "часовий рядок", "additionalSteps": ["крок 1", ...]}`,
        },
        {
          role: "user",
          content: `Завдання: ${taskDescription}\nТерміновість вказана: ${urgency || "не вказано"}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const routing = extractJSON(raw) || { department: "reception", reasoning: raw };
    res.json({ routing });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 8. AI internal copilot для staff (streaming) ────────────────────────────
router.post("/copilot", requireAuth, async (req: any, res) => {
  try {
    const { message, history } = req.body;
    const orgId = getOrg(req);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const chatHistory = (history || []).slice(-10).map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const systemPrompt = `${HOTEL_SYSTEM_CONTEXT}
Ти — внутрішній AI copilot для персоналу готелю. Допомагай з:
- Процедурами та протоколами
- Відповідями на питання гостей
- Вирішенням ситуацій
- Написанням листів та повідомлень
- Аналізом ситуацій
- Навчанням нового персоналу
Завжди давай практичні, конкретні відповіді.`;

    const stream = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 8192,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...chatHistory,
        { role: "user", content: message },
      ],
    });

    let fullResponse = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error("AI copilot error:", err);
    res.write(`data: ${JSON.stringify({ error: err.message, done: true })}\n\n`);
    res.end();
  }
});

export default router;
