import { Router } from "express";
import { db } from "@workspace/db";
import { requireAuth, requireRole } from "../lib/auth.js";
import { sql } from "drizzle-orm";

const router = Router();

function toRule(r: any) {
  return {
    id:               r.id,
    orgId:            r.org_id,
    name:             r.name,
    color:            r.color,
    pricePerNight:    Number(r.price_per_night),
    weekendPrice:     r.weekend_price != null ? Number(r.weekend_price) : null,
    minNights:        r.min_nights,
    minNightsWeekend: r.min_nights_weekend,
    applyDays:        r.apply_days,
    dateFrom:         r.date_from ? String(r.date_from).slice(0, 10) : null,
    dateTo:           r.date_to   ? String(r.date_to).slice(0, 10)   : null,
    unitIds:          r.unit_ids  || [],
    isActive:         r.is_active,
    createdAt:        r.created_at,
  };
}

function buildIntArray(arr: number[]) {
  if (!arr.length) return sql`ARRAY[]::integer[]`;
  return sql`ARRAY[${sql.join(arr.map(n => sql`${n}`), sql`, `)}]::integer[]`;
}

// GET /pricing-rules
router.get("/", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const rows = await db.execute(
      sql`SELECT * FROM pricing_calendar_rules WHERE org_id = ${orgId} ORDER BY created_at DESC`
    );
    res.json((rows as any[]).map(toRule));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /pricing-rules
router.post("/", requireAuth, requireRole("super_admin", "owner", "manager"), async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const {
      name, color = "#6366f1",
      pricePerNight, weekendPrice,
      minNights = 1, minNightsWeekend = 1,
      applyDays = [0,1,2,3,4,5,6],
      dateFrom, dateTo,
      unitIds = [],
    } = req.body;

    if (!name?.trim())  return res.status(400).json({ error: "Назва обов'язкова" });
    if (!pricePerNight) return res.status(400).json({ error: "Ціна обов'язкова" });

    const [row] = await db.execute(sql`
      INSERT INTO pricing_calendar_rules
        (org_id, name, color, price_per_night, weekend_price,
         min_nights, min_nights_weekend, apply_days,
         date_from, date_to, unit_ids)
      VALUES (
        ${orgId}, ${name.trim()}, ${color},
        ${Number(pricePerNight)},
        ${weekendPrice != null ? Number(weekendPrice) : null},
        ${Number(minNights)}, ${Number(minNightsWeekend)},
        ${buildIntArray(applyDays)},
        ${dateFrom || null}, ${dateTo || null},
        ${buildIntArray(unitIds)}
      )
      RETURNING *
    `) as any[];
    res.status(201).json(toRule(row));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /pricing-rules/:id
router.put("/:id", requireAuth, requireRole("super_admin", "owner", "manager"), async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = Number(req.params.id);

    // Fetch existing first
    const [existing] = await db.execute(
      sql`SELECT * FROM pricing_calendar_rules WHERE id = ${id} AND org_id = ${orgId}`
    ) as any[];
    if (!existing) return res.status(404).json({ error: "Правило не знайдено" });

    const {
      name             = existing.name,
      color            = existing.color,
      pricePerNight    = Number(existing.price_per_night),
      weekendPrice,
      minNights        = existing.min_nights,
      minNightsWeekend = existing.min_nights_weekend,
      applyDays        = existing.apply_days,
      dateFrom,
      dateTo,
      unitIds          = existing.unit_ids,
      isActive         = existing.is_active,
    } = req.body;

    const wkndPrice = weekendPrice !== undefined ? (weekendPrice != null ? Number(weekendPrice) : null) : (existing.weekend_price != null ? Number(existing.weekend_price) : null);
    const df  = dateFrom !== undefined ? (dateFrom || null) : existing.date_from;
    const dt  = dateTo   !== undefined ? (dateTo   || null) : existing.date_to;

    const [row] = await db.execute(sql`
      UPDATE pricing_calendar_rules SET
        name               = ${String(name).trim()},
        color              = ${String(color)},
        price_per_night    = ${Number(pricePerNight)},
        weekend_price      = ${wkndPrice},
        min_nights         = ${Number(minNights)},
        min_nights_weekend = ${Number(minNightsWeekend)},
        apply_days         = ${buildIntArray(applyDays)},
        date_from          = ${df},
        date_to            = ${dt},
        unit_ids           = ${buildIntArray(unitIds)},
        is_active          = ${Boolean(isActive)}
      WHERE id = ${id} AND org_id = ${orgId}
      RETURNING *
    `) as any[];

    res.json(toRule(row));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /pricing-rules/:id
router.delete("/:id", requireAuth, requireRole("super_admin", "owner", "manager"), async (req: any, res) => {
  try {
    const orgId = req.user.organizationId;
    const id = Number(req.params.id);
    await db.execute(sql`DELETE FROM pricing_calendar_rules WHERE id = ${id} AND org_id = ${orgId}`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
