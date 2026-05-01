/**
 * Room Concierge API
 * Handles knowledge base, AI chat, session management, and admin replies.
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import OpenAI from "openai";

const router = Router();

function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "no-key" });
}

// ─── Public (terminal) routes — auth by org slug + unit token ────────────────

/**
 * GET /room-concierge/terminal/:orgSlug/:unitId
 * Terminal boot: returns active booking guest info + welcome config.
 * No auth required — terminal is physically in the room.
 */
router.get("/terminal/:orgSlug/:unitId", async (req, res) => {
  const { orgSlug, unitId } = req.params;
  try {
    // Get org
    const { rows: orgs } = await pool.query(
      `SELECT id, name FROM organizations WHERE slug = $1 AND is_active = true LIMIT 1`,
      [orgSlug],
    );
    if (!orgs[0]) return res.status(404).json({ error: "Organization not found" });
    const org = orgs[0];

    // Get unit (must belong to the org)
    const { rows: units } = await pool.query(
      `SELECT u.id, u.name FROM units u WHERE u.organization_id = $1 AND u.id = $2 LIMIT 1`,
      [org.id, unitId],
    );
    // If not found by ID, try first available unit in org
    let unit = units[0];
    if (!unit) {
      const { rows: anyUnit } = await pool.query(
        `SELECT u.id, u.name FROM units u WHERE u.organization_id = $1 ORDER BY u.id LIMIT 1`,
        [org.id],
      );
      unit = anyUnit[0];
    }
    if (!unit) return res.status(404).json({ error: "No units found for this organization" });

    // Get active booking for this unit (checked-in or confirmed today)
    const { rows: bookings } = await pool.query(
      `SELECT b.id, b.first_name, b.last_name, b.check_in, b.check_out, b.guest_id,
              g.first_name as g_first, g.last_name as g_last, g.phone, g.email
       FROM bookings b
       LEFT JOIN guests g ON g.id = b.guest_id
       WHERE b.unit_id = $1
         AND b.status IN ('checked_in', 'confirmed')
         AND b.check_in <= CURRENT_DATE
         AND b.check_out >= CURRENT_DATE
       ORDER BY b.check_in DESC LIMIT 1`,
      [unitId],
    );
    const booking = bookings[0] || null;

    const guestName = booking
      ? `${booking.g_first || booking.first_name || ""} ${booking.g_last || booking.last_name || ""}`.trim()
      : null;

    // Get or create session
    const sessionId = `${orgSlug}-${unitId}-${booking?.id || "noguest"}`;
    const { rows: sessions } = await pool.query(
      `SELECT * FROM concierge_sessions WHERE session_id = $1 LIMIT 1`,
      [sessionId],
    );
    let session = sessions[0];
    if (!session) {
      const { rows: newSess } = await pool.query(
        `INSERT INTO concierge_sessions (session_id, organization_id, unit_id, unit_name, booking_id, guest_name, guest_id, last_seen_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
        [sessionId, org.id, unit.id, unit.name, booking?.id || null, guestName, booking?.guest_id || null],
      );
      session = newSess[0];
    } else {
      await pool.query(
        `UPDATE concierge_sessions SET last_seen_at = NOW(), guest_name = $2, booking_id = $3 WHERE id = $1`,
        [session.id, guestName, booking?.id || null],
      );
    }

    res.json({
      orgId: org.id,
      orgName: org.name,
      unitId: unit.id,
      unitName: unit.name,
      sessionId,
      guestName,
      bookingId: booking?.id || null,
      checkIn: booking?.check_in || null,
      checkOut: booking?.check_out || null,
      preferences: session.preferences || {},
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /room-concierge/chat
 * AI chat endpoint — processes guest voice/text, returns AI response + request log.
 * Body: { orgSlug, unitId, sessionId, message, history[] }
 */
router.post("/chat", async (req, res) => {
  const { orgSlug, unitId, sessionId, message, history = [], guestName } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "message required" });

  try {
    // Get org
    const { rows: orgs } = await pool.query(
      `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`, [orgSlug],
    );
    if (!orgs[0]) return res.status(404).json({ error: "Org not found" });
    const orgId = orgs[0].id;

    // Load knowledge base
    const { rows: knowledge } = await pool.query(
      `SELECT category, title, content FROM concierge_knowledge
       WHERE organization_id = $1 AND is_active = true
       ORDER BY sort_order ASC, category ASC`,
      [orgId],
    );

    const knowledgeText = knowledge.length > 0
      ? knowledge.map(k => `[${k.category.toUpperCase()}] ${k.title}:\n${k.content}`).join("\n\n")
      : "Знань поки не завантажено. Відповідай загально та ввічливо.";

    // Get booking info for context
    const { rows: unitRows } = await pool.query(
      `SELECT u.name as unit_name, b.first_name, b.last_name, b.check_out,
              g.first_name as g_first, g.last_name as g_last
       FROM units u
       LEFT JOIN bookings b ON b.unit_id = u.id AND b.status IN ('checked_in','confirmed')
         AND b.check_in <= CURRENT_DATE AND b.check_out >= CURRENT_DATE
       LEFT JOIN guests g ON g.id = b.guest_id
       WHERE u.id = $1 LIMIT 1`,
      [unitId],
    );
    const unitInfo = unitRows[0];
    const guestFullName = guestName || (unitInfo
      ? `${unitInfo.g_first || unitInfo.first_name || ""} ${unitInfo.g_last || unitInfo.last_name || ""}`.trim()
      : "Гість");

    const systemPrompt = `Ти — AI-консьєрж готелю. Твоє ім'я — Ліна.
Ти розмовляєш з гостем ${guestFullName || "гостем"} у номері ${unitInfo?.unit_name || "номері"}.
Ти дружня, тепла, професійна та корисна. Говориш українською мовою.
Ти слухаєш гостя, уточнюєш деталі, рекомендуєш та допомагаєш.
Ти можеш допомогти з: замовленням їжі, SPA, технічними питаннями, активностями, місцевими порадами.
Коли гість робить замовлення або запит — підтверди деталі та скажи що передала адміністратору.
Відповідай коротко і природньо, як у живій розмові (1-3 речення максимум).

ЗНАННЯ ПРО ГОТЕЛЬ ТА МІСЦЕВІСТЬ:
${knowledgeText}`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10).map((h: any) => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 200,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0]?.message?.content || "Вибачте, сталася помилка. Спробуйте ще раз.";

    // Classify request type
    const lowerMsg = message.toLowerCase();
    let requestType = "general";
    if (lowerMsg.match(/їж|їсти|замов|меню|страв|кава|чай|вода|напій|їда/)) requestType = "food";
    else if (lowerMsg.match(/спа|масаж|басейн|spa|pool|релакс/)) requestType = "spa";
    else if (lowerMsg.match(/музик|sound|звук|пісн|radio|плейлист/)) requestType = "music";
    else if (lowerMsg.match(/ламп|світл|техн|поломк|не працює|кран|вода|ремонт|замін/)) requestType = "maintenance";
    else if (lowerMsg.match(/прибир|рушник|білизн|housekeep|clean|чист/)) requestType = "housekeeping";
    else if (lowerMsg.match(/місц|тур|екскурс|маршрут|куди|де/)) requestType = "tourism";

    // Save request to DB
    const { rows: unitInfoFull } = await pool.query(`SELECT id FROM units WHERE id = $1`, [unitId]);
    if (unitInfoFull[0]) {
      const { rows: [req2] } = await pool.query(
        `INSERT INTO concierge_requests (organization_id, unit_id, guest_name, request_type, request_text, ai_response, status, session_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7) RETURNING id`,
        [orgId, unitId, guestFullName, requestType, message, aiResponse, sessionId],
      );

      // Send Telegram notification for actionable requests
      if (["food", "spa", "maintenance", "housekeeping"].includes(requestType)) {
        sendTelegramNotification(orgId, unitInfo?.unit_name || `Номер ${unitId}`, guestFullName, requestType, message, req2.id);
      }
    }

    res.json({ response: aiResponse, requestType });
  } catch (e: any) {
    console.error("Concierge chat error:", e);
    res.status(500).json({ error: e.message, response: "Вибачте, виникла технічна проблема. Зверніться до адміністратора." });
  }
});

/**
 * GET /room-concierge/admin/reply/:requestId
 * Poll for admin reply on a specific request.
 */
router.get("/admin/reply/:requestId", async (req, res) => {
  const id = parseInt(req.params.requestId);
  try {
    const { rows } = await pool.query(
      `SELECT id, admin_reply, status FROM concierge_requests WHERE id = $1`, [id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /room-concierge/admin/replies/:sessionId
 * Poll for any new admin replies for this session.
 */
router.get("/admin/replies/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const since = req.query.since as string;
  try {
    let query = `SELECT id, admin_reply, status, request_text, request_type, created_at, updated_at
                 FROM concierge_requests
                 WHERE session_id = $1 AND admin_reply IS NOT NULL`;
    const params: any[] = [sessionId];
    if (since) {
      query += ` AND updated_at > $2`;
      params.push(since);
    }
    query += ` ORDER BY updated_at DESC LIMIT 10`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Protected admin routes ───────────────────────────────────────────────────

/**
 * GET /room-concierge/requests
 * List all concierge requests for admin.
 */
router.get("/requests", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const { status, limit = "50" } = req.query as any;
  try {
    let query = `SELECT cr.*, u.name as unit_name
                 FROM concierge_requests cr
                 LEFT JOIN units u ON u.id = cr.unit_id
                 WHERE cr.organization_id = $1`;
    const params: any[] = [orgId];
    if (status) { query += ` AND cr.status = $2`; params.push(status); }
    query += ` ORDER BY cr.created_at DESC LIMIT ${parseInt(limit)}`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PATCH /room-concierge/requests/:id
 * Admin replies to or updates a request.
 */
router.patch("/requests/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const id = parseInt(req.params.id);
  const { adminReply, status } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE concierge_requests SET
         admin_reply = COALESCE($1, admin_reply),
         status = COALESCE($2, status),
         updated_at = NOW()
       WHERE id = $3 AND organization_id = $4 RETURNING *`,
      [adminReply || null, status || null, id, orgId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /room-concierge/knowledge
 * List knowledge base entries.
 */
router.get("/knowledge", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM concierge_knowledge WHERE organization_id = $1 ORDER BY sort_order ASC, category ASC`,
      [orgId],
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /room-concierge/knowledge
 * Create knowledge entry.
 */
router.post("/knowledge", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const { category = "general", title, content, sortOrder = 0 } = req.body;
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: "title and content required" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO concierge_knowledge (organization_id, category, title, content, sort_order)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [orgId, category, title.trim(), content.trim(), sortOrder],
    );
    res.status(201).json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PUT /room-concierge/knowledge/:id
 * Update knowledge entry.
 */
router.put("/knowledge/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const id = parseInt(req.params.id);
  const { category, title, content, isActive, sortOrder } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE concierge_knowledge SET
         category = COALESCE($1, category),
         title = COALESCE($2, title),
         content = COALESCE($3, content),
         is_active = COALESCE($4, is_active),
         sort_order = COALESCE($5, sort_order),
         updated_at = NOW()
       WHERE id = $6 AND organization_id = $7 RETURNING *`,
      [category || null, title || null, content || null,
       isActive !== undefined ? isActive : null,
       sortOrder !== undefined ? sortOrder : null, id, orgId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /room-concierge/knowledge/:id
 * Delete knowledge entry.
 */
router.delete("/knowledge/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const id = parseInt(req.params.id);
  try {
    await pool.query(`DELETE FROM concierge_knowledge WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /room-concierge/knowledge/seed
 * Seed default knowledge base for org.
 */
router.post("/knowledge/seed", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  try {
    const { rows: existing } = await pool.query(
      `SELECT id FROM concierge_knowledge WHERE organization_id = $1 LIMIT 1`, [orgId],
    );
    if (existing.length > 0) return res.json({ seeded: false, message: "Already seeded" });

    const defaults = [
      { category: "restaurant", title: "Ресторан — меню та години роботи", content: "Ресторан відкритий щоденно: сніданок 8:00-11:00, обід 12:00-15:00, вечеря 18:00-22:00. Замовлення в номер доступне до 23:00 (додаткова плата 50 грн за доставку). Меню можна переглянути у застосунку або замовити у консьєржа.", sort_order: 0 },
      { category: "spa", title: "SPA — послуги та запис", content: "SPA відкрита: пн-пт 10:00-20:00, сб-нд 9:00-21:00. Послуги: масаж (60 хв — 800 грн), обгортання (45 хв — 600 грн), манікюр/педикюр (від 400 грн), купання у SPA-басейні (вільний вхід для гостей). Запис через консьєржа або на рецепції.", sort_order: 1 },
      { category: "hotel", title: "Загальна інформація про готель", content: "Check-out до 12:00 (пізній check-out до 14:00 — безкоштовно за наявності, до 18:00 — 50% вартості). WiFi: DOGODA_Guest, пароль: nature2024. Паркінг безкоштовний. Кімнати для куріння — тільки у спеціально відведених місцях на вулиці. Домашні тварини — за попередньою домовленістю.", sort_order: 2 },
      { category: "tourism", title: "Місцеві визначні місця та активності", content: "Поруч із комплексом: ліс для прогулянок та пробіжок (вхід 50 м від рецепції), озеро для купання (5 хв пішки), велопрокат на рецепції (150 грн/день). Екскурсії: організовуємо тури щодня о 10:00, запис на рецепції. Найближче місто: 15 км, таксі через рецепцію.", sort_order: 3 },
      { category: "technical", title: "Технічна допомога", content: "При виникненні технічних проблем (несправне освітлення, опалення, сантехніка, телевізор) — повідомте консьєржа. Технік прибуде протягом 30 хвилин. Аварійний телефон рецепції: 101 (внутрішній). Ключ від сейфа: якщо забули — зверніться на рецепцію з документом.", sort_order: 4 },
      { category: "music", title: "Музика та розваги", content: "У номері є Bluetooth колонка — підключіть свій пристрій. Назва: DOGODA_Room (немає пароля). Телевізор: пульт у тумбочці, понад 50 каналів. Netflix — увійдіть зі своїм акаунтом (порт HDMI 1). Вечірні заходи: перевірте програму на рецепції або запитайте консьєржа.", sort_order: 5 },
    ];

    for (const d of defaults) {
      await pool.query(
        `INSERT INTO concierge_knowledge (organization_id, category, title, content, sort_order)
         VALUES ($1,$2,$3,$4,$5)`,
        [orgId, d.category, d.title, d.content, d.sort_order],
      );
    }
    res.json({ seeded: true, count: defaults.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function sendTelegramNotification(orgId: number, unitName: string, guestName: string, type: string, message: string, requestId: number) {
  try {
    const { rows } = await pool.query(
      `SELECT telegram_bot_token, telegram_chat_id FROM integrations WHERE organization_id = $1 AND type = 'telegram' AND is_active = true LIMIT 1`,
      [orgId],
    );
    if (!rows[0]?.telegram_bot_token || !rows[0]?.telegram_chat_id) return;

    const typeEmojis: Record<string, string> = {
      food: "🍽️", spa: "💆", maintenance: "🔧", housekeeping: "🧹", music: "🎵", tourism: "🗺️", general: "💬",
    };
    const emoji = typeEmojis[type] || "💬";
    const typeLabels: Record<string, string> = {
      food: "Замовлення їжі", spa: "SPA запит", maintenance: "Технічна проблема",
      housekeeping: "Прибирання", music: "Музика", tourism: "Туризм", general: "Загальний запит",
    };

    const text = `${emoji} *Запит від гостя — ${unitName}*\n\n👤 Гість: ${guestName}\n📋 Тип: ${typeLabels[type] || type}\n\n💬 _"${message}"_\n\n🔗 Запит #${requestId} | Відповісти в системі`;

    await fetch(`https://api.telegram.org/bot${rows[0].telegram_bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: rows[0].telegram_chat_id, text, parse_mode: "Markdown" }),
    });
  } catch (e) {
    console.warn("Telegram notification failed:", e);
  }
}

export default router;
