import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// ── HOLIDAYS ───────────────────────────────────────────────────────────────

// GET /api/calendar-settings/holidays
router.get("/holidays", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { propertyId } = req.query;
    const params: any[] = [orgId];
    let query = `SELECT * FROM calendar_holidays WHERE organization_id = $1`;
    if (propertyId && propertyId !== "all") {
      params.push(Number(propertyId));
      query += ` AND (property_id = $${params.length} OR property_id IS NULL)`;
    }
    query += ` ORDER BY date ASC`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
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
    const { rows } = await pool.query(
      `INSERT INTO calendar_holidays (organization_id, property_id, date, name, color, is_recurring)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [orgId, propertyId || null, date, name, color, Boolean(isRecurring)],
    );
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/calendar-settings/holidays/:id
router.put("/holidays/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    const { date, name, color, isRecurring } = req.body;
    const sets: string[] = [];
    const params: any[] = [id, orgId];
    const addField = (col: string, val: any) => {
      if (val !== undefined) { sets.push(`${col} = $${params.length + 1}`); params.push(val); }
    };
    addField("date", date);
    addField("name", name);
    addField("color", color);
    if (isRecurring !== undefined) addField("is_recurring", Boolean(isRecurring));
    if (!sets.length) return res.status(400).json({ error: "Нічого оновлювати" });
    const { rows } = await pool.query(
      `UPDATE calendar_holidays SET ${sets.join(", ")} WHERE id = $1 AND organization_id = $2 RETURNING *`,
      params,
    );
    res.json(rows[0] || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/calendar-settings/holidays/:id
router.delete("/holidays/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    await pool.query(`DELETE FROM calendar_holidays WHERE id = $1 AND organization_id = $2`, [id, orgId]);
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
    const { rows } = await pool.query(
      `SELECT * FROM calendar_restrictions WHERE organization_id = $1 ORDER BY created_at ASC`,
      [orgId],
    );
    res.json(rows);
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
    const { rows } = await pool.query(
      `INSERT INTO calendar_restrictions
         (organization_id, property_id, name, type, min_nights, max_nights, days_of_week, date_from, date_to, apply_to_holidays)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10) RETURNING *`,
      [
        orgId, propertyId || null, name, type,
        minNights != null ? minNights : null, maxNights != null ? maxNights : null,
        JSON.stringify(daysOfWeek), dateFrom || null, dateTo || null, Boolean(applyToHolidays),
      ],
    );
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/calendar-settings/restrictions/:id
router.put("/restrictions/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    const { name, type, minNights, maxNights, daysOfWeek, dateFrom, dateTo, applyToHolidays, isActive } = req.body;
    const sets: string[] = [];
    const params: any[] = [id, orgId];
    const addField = (col: string, val: any, cast?: string) => {
      if (val !== undefined) {
        sets.push(`${col} = $${params.length + 1}${cast ? `::${cast}` : ""}`);
        params.push(val);
      }
    };
    addField("name", name);
    addField("type", type);
    if (minNights !== undefined) addField("min_nights", minNights != null ? minNights : null);
    if (maxNights !== undefined) addField("max_nights", maxNights != null ? maxNights : null);
    if (daysOfWeek !== undefined) addField("days_of_week", JSON.stringify(daysOfWeek), "jsonb");
    if (dateFrom !== undefined) addField("date_from", dateFrom || null);
    if (dateTo !== undefined) addField("date_to", dateTo || null);
    if (applyToHolidays !== undefined) addField("apply_to_holidays", Boolean(applyToHolidays));
    if (isActive !== undefined) addField("is_active", Boolean(isActive));
    if (!sets.length) return res.status(400).json({ error: "Нічого оновлювати" });
    const { rows } = await pool.query(
      `UPDATE calendar_restrictions SET ${sets.join(", ")} WHERE id = $1 AND organization_id = $2 RETURNING *`,
      params,
    );
    res.json(rows[0] || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/calendar-settings/restrictions/:id
router.delete("/restrictions/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const id = parseInt(req.params.id);
    await pool.query(
      `DELETE FROM calendar_restrictions WHERE id = $1 AND organization_id = $2`,
      [id, orgId],
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
