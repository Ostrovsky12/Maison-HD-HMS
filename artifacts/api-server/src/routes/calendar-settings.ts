import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

const raw = (q: string, params: any[] = []) =>
  db.execute(sql.raw(q.replace(/\$(\d+)/g, (_, i) => `$${i}`), params));

// ── HOLIDAYS ───────────────────────────────────────────────────────────────

// GET /api/calendar-settings/holidays
router.get("/holidays", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { propertyId } = req.query;
    let query = `SELECT * FROM calendar_holidays WHERE organization_id = ${orgId}`;
    if (propertyId && propertyId !== "all") query += ` AND (property_id = ${Number(propertyId)} OR property_id IS NULL)`;
    query += ` ORDER BY date ASC`;
    const result = await db.execute(sql.raw(query));
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calendar-settings/holidays
router.post("/holidays", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { date, name, color = "#ef4444", isRecurring = false, propertyId = null } = req.body;
    if (!date || !name) return res.status(400).json({ error: "date та name обов'язкові" });
    const result = await db.execute(sql.raw(
      `INSERT INTO calendar_holidays (organization_id, property_id, date, name, color, is_recurring)
       VALUES (${orgId}, ${propertyId ? propertyId : "NULL"}, '${date}', '${name.replace(/'/g, "''")}', '${color}', ${isRecurring})
       RETURNING *`
    ));
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/calendar-settings/holidays/:id
router.put("/holidays/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { id } = req.params;
    const { date, name, color, isRecurring } = req.body;
    const sets: string[] = [];
    if (date) sets.push(`date = '${date}'`);
    if (name) sets.push(`name = '${name.replace(/'/g, "''")}'`);
    if (color) sets.push(`color = '${color}'`);
    if (isRecurring !== undefined) sets.push(`is_recurring = ${isRecurring}`);
    if (!sets.length) return res.status(400).json({ error: "Нічого оновлювати" });
    const result = await db.execute(sql.raw(
      `UPDATE calendar_holidays SET ${sets.join(", ")} WHERE id = ${id} AND organization_id = ${orgId} RETURNING *`
    ));
    res.json(result.rows[0] || { error: "Not found" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/calendar-settings/holidays/:id
router.delete("/holidays/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { id } = req.params;
    await db.execute(sql.raw(`DELETE FROM calendar_holidays WHERE id = ${id} AND organization_id = ${orgId}`));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── RESTRICTIONS ───────────────────────────────────────────────────────────

// GET /api/calendar-settings/restrictions
router.get("/restrictions", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const result = await db.execute(sql.raw(
      `SELECT * FROM calendar_restrictions WHERE organization_id = ${orgId} ORDER BY created_at ASC`
    ));
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calendar-settings/restrictions
router.post("/restrictions", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const {
      name, type = "min_nights", minNights, maxNights,
      daysOfWeek = [], dateFrom = null, dateTo = null,
      applyToHolidays = false, propertyId = null,
    } = req.body;
    if (!name) return res.status(400).json({ error: "name обов'язкове" });
    const dows = JSON.stringify(daysOfWeek);
    const result = await db.execute(sql.raw(
      `INSERT INTO calendar_restrictions
         (organization_id, property_id, name, type, min_nights, max_nights, days_of_week, date_from, date_to, apply_to_holidays)
       VALUES (
         ${orgId},
         ${propertyId ? propertyId : "NULL"},
         '${name.replace(/'/g, "''")}',
         '${type}',
         ${minNights != null ? minNights : "NULL"},
         ${maxNights != null ? maxNights : "NULL"},
         '${dows}'::jsonb,
         ${dateFrom ? `'${dateFrom}'` : "NULL"},
         ${dateTo ? `'${dateTo}'` : "NULL"},
         ${applyToHolidays}
       ) RETURNING *`
    ));
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/calendar-settings/restrictions/:id
router.put("/restrictions/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { id } = req.params;
    const { name, type, minNights, maxNights, daysOfWeek, dateFrom, dateTo, applyToHolidays, isActive } = req.body;
    const sets: string[] = [];
    if (name !== undefined) sets.push(`name = '${name.replace(/'/g, "''")}'`);
    if (type !== undefined) sets.push(`type = '${type}'`);
    if (minNights !== undefined) sets.push(`min_nights = ${minNights != null ? minNights : "NULL"}`);
    if (maxNights !== undefined) sets.push(`max_nights = ${maxNights != null ? maxNights : "NULL"}`);
    if (daysOfWeek !== undefined) sets.push(`days_of_week = '${JSON.stringify(daysOfWeek)}'::jsonb`);
    if (dateFrom !== undefined) sets.push(`date_from = ${dateFrom ? `'${dateFrom}'` : "NULL"}`);
    if (dateTo !== undefined) sets.push(`date_to = ${dateTo ? `'${dateTo}'` : "NULL"}`);
    if (applyToHolidays !== undefined) sets.push(`apply_to_holidays = ${applyToHolidays}`);
    if (isActive !== undefined) sets.push(`is_active = ${isActive}`);
    if (!sets.length) return res.status(400).json({ error: "Нічого оновлювати" });
    const result = await db.execute(sql.raw(
      `UPDATE calendar_restrictions SET ${sets.join(", ")} WHERE id = ${id} AND organization_id = ${orgId} RETURNING *`
    ));
    res.json(result.rows[0] || { error: "Not found" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/calendar-settings/restrictions/:id
router.delete("/restrictions/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { id } = req.params;
    await db.execute(sql.raw(`DELETE FROM calendar_restrictions WHERE id = ${id} AND organization_id = ${orgId}`));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
