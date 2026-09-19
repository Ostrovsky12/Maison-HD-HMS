/**
 * Journey Steps — Guest Journey automation roadmap
 * Configurable per-organization steps stored in DB.
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// GET /journey-steps — list steps for org
router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM journey_steps WHERE organization_id = $1 ORDER BY sort_order ASC, id ASC`,
      [orgId],
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /journey-steps — create step
router.post("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const { stage, time, icon, description, color, isEnabled, is_enabled, sortOrder, sort_order, emailSubject, email_subject, emailTemplate, email_template, messageText, message_text } = req.body;
  if (!stage?.trim()) return res.status(400).json({ error: "stage required" });
  const enabled = isEnabled !== undefined ? isEnabled : (is_enabled !== undefined ? is_enabled : true);
  const order = sortOrder ?? sort_order ?? 0;
  const eSubj = emailSubject ?? email_subject ?? "";
  const eTmpl = emailTemplate ?? email_template ?? "default";
  const mText = messageText ?? message_text ?? "";
  try {
    const { rows } = await pool.query(
      `INSERT INTO journey_steps (organization_id, stage, time, icon, description, color, is_enabled, sort_order, email_subject, email_template, message_text, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now()) RETURNING *`,
      [orgId, stage.trim(), time || "", icon || "📋", description || "", color || "bg-blue-500", enabled, order, eSubj, eTmpl, mText],
    );
    res.status(201).json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /journey-steps/:id — update step
router.put("/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const id = parseInt(req.params.id);
  const { stage, time, icon, description, color, isEnabled, is_enabled, sortOrder, sort_order, emailSubject, email_subject, emailTemplate, email_template, messageText, message_text } = req.body;
  const enabled = isEnabled !== undefined ? isEnabled : (is_enabled !== undefined ? is_enabled : null);
  const order = sortOrder !== undefined ? sortOrder : (sort_order !== undefined ? sort_order : null);
  const eSubj = emailSubject ?? email_subject ?? null;
  const eTmpl = emailTemplate ?? email_template ?? null;
  const mText = messageText ?? message_text ?? null;
  try {
    const { rows } = await pool.query(
      `UPDATE journey_steps SET
         stage = COALESCE($1, stage),
         time = COALESCE($2, time),
         icon = COALESCE($3, icon),
         description = COALESCE($4, description),
         color = COALESCE($5, color),
         is_enabled = COALESCE($6, is_enabled),
         sort_order = COALESCE($7, sort_order),
         email_subject = COALESCE($8, email_subject),
         email_template = COALESCE($9, email_template),
         message_text = COALESCE($10, message_text),
         updated_at = now()
       WHERE id = $11 AND organization_id = $12
       RETURNING *`,
      [stage || null, time ?? null, icon ?? null, description ?? null, color ?? null,
       enabled, order, eSubj, eTmpl, mText, id, orgId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /journey-steps/:id — delete step
router.delete("/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const id = parseInt(req.params.id);
  try {
    await pool.query(`DELETE FROM journey_steps WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /journey-steps/seed — seed default steps for org
router.post("/seed", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const DEFAULT_STEPS = [
    { stage: "Бронювання",       time: "Одразу",    icon: "📋", description: "Підтвердження бронювання + посилання на гостьовий портал",          color: "bg-blue-500",   sort_order: 0, email_subject: "Підтвердження бронювання", email_template: "confirmation" },
    { stage: "За 3 дні до заїзду", time: "72 год до", icon: "📲", description: "Нагадування + онлайн-чекін + upsell SPA / активності",               color: "bg-purple-500", sort_order: 1, email_subject: "Ваш заїзд вже скоро!", email_template: "reminder_3d" },
    { stage: "За 1 день до заїзду", time: "24 год до", icon: "🏨", description: "Нагадування заповнити форму + спецпропозиції на час перебування",     color: "bg-indigo-500", sort_order: 2, email_subject: "Завтра ваш заїзд", email_template: "reminder_1d" },
    { stage: "День заїзду",      time: "Check-in",  icon: "🔑", description: "Вітальне повідомлення + WiFi + корисна інформація",                   color: "bg-green-500",  sort_order: 3, email_subject: "Ласкаво просимо!", email_template: "welcome" },
    { stage: "Під час перебування", time: "In-stay", icon: "💬", description: "Доступний чат з готелем + замовлення послуг",                         color: "bg-teal-500",   sort_order: 4, email_subject: "", email_template: "instay" },
    { stage: "День виїзду",      time: "Check-out", icon: "🧳", description: "Запит на виїзд + збір зворотнього зв'язку + квитанція",               color: "bg-orange-500", sort_order: 5, email_subject: "Дякуємо за перебування!", email_template: "checkout" },
    { stage: "Через 24 год",     time: "Post-stay", icon: "⭐", description: "Запит на відгук + нарахування loyalty балів",                          color: "bg-yellow-500", sort_order: 6, email_subject: "Ваша думка важлива для нас", email_template: "review_request" },
    { stage: "Через 30 днів",    time: "+1 місяць", icon: "🎁", description: "Спецпропозиція для повернення + loyalty бонус",                        color: "bg-pink-500",   sort_order: 7, email_subject: "Спеціальна пропозиція для вас!", email_template: "return_offer" },
  ];
  try {
    const { rows: existing } = await pool.query(`SELECT id FROM journey_steps WHERE organization_id = $1`, [orgId]);
    if (existing.length > 0) return res.json({ seeded: false, message: "Steps already exist" });
    for (const s of DEFAULT_STEPS) {
      await pool.query(
        `INSERT INTO journey_steps (organization_id, stage, time, icon, description, color, is_enabled, sort_order, email_subject, email_template, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,$9,now(),now())`,
        [orgId, s.stage, s.time, s.icon, s.description, s.color, s.sort_order, s.email_subject, s.email_template],
      );
    }
    res.json({ seeded: true, count: DEFAULT_STEPS.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
