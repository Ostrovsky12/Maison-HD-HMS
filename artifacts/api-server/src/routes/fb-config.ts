import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { pool } from "@workspace/db";

const router = Router();
router.use(requireAuth);
const org = (req: any): number => req.user?.organizationId ?? req.user?.organization_id;

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fb_config_settings (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      section VARCHAR(64) NOT NULL,
      data JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, section)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fb_order_sources (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      name VARCHAR(128) NOT NULL,
      show_on_pos BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fb_payment_methods (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      name VARCHAR(128) NOT NULL,
      type VARCHAR(32) NOT NULL DEFAULT 'cash',
      commission_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
      show_on_pos BOOLEAN NOT NULL DEFAULT TRUE,
      color VARCHAR(32),
      icon_code VARCHAR(32),
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fb_hall_tables (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      hall_id INT,
      hall_name VARCHAR(64),
      table_number INT NOT NULL,
      pos_x INT NOT NULL DEFAULT 0,
      pos_y INT NOT NULL DEFAULT 0,
      width INT NOT NULL DEFAULT 80,
      height INT NOT NULL DEFAULT 80,
      seats INT NOT NULL DEFAULT 4,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

// ══════════════════════════════════════════════════════════
// Generic section GET/PUT
// ══════════════════════════════════════════════════════════

router.get("/section/:name", async (req, res) => {
  try {
    await ensureTables();
    const { rows } = await pool.query(
      `SELECT data FROM fb_config_settings WHERE organization_id=$1 AND section=$2`,
      [org(req), req.params.name]
    );
    res.json({ data: rows[0]?.data || {} });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/section/:name", async (req, res) => {
  try {
    await ensureTables();
    await pool.query(
      `INSERT INTO fb_config_settings (organization_id, section, data, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (organization_id, section) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()`,
      [org(req), req.params.name, JSON.stringify(req.body.data || {})]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════
// ORDER SOURCES
// ══════════════════════════════════════════════════════════

router.get("/order-sources", async (req, res) => {
  try {
    await ensureTables();
    let { rows } = await pool.query(
      `SELECT * FROM fb_order_sources WHERE organization_id=$1 ORDER BY sort_order, id`,
      [org(req)]
    );
    if (rows.length === 0) {
      await pool.query(
        `INSERT INTO fb_order_sources (organization_id, name, show_on_pos, sort_order) VALUES
         ($1,'У закладі',true,1), ($1,'З собою',true,2)`, [org(req)]
      );
      ({ rows } = await pool.query(
        `SELECT * FROM fb_order_sources WHERE organization_id=$1 ORDER BY sort_order, id`, [org(req)]
      ));
    }
    res.json({ sources: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/order-sources", async (req, res) => {
  try {
    await ensureTables();
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const { rows } = await pool.query(
      `INSERT INTO fb_order_sources (organization_id, name) VALUES ($1,$2) RETURNING *`,
      [org(req), name]
    );
    res.json({ source: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/order-sources/:id", async (req, res) => {
  try {
    const { name, show_on_pos } = req.body;
    const sets: string[] = [];
    const params: any[] = [req.params.id, org(req)];
    if (name !== undefined) { params.push(name); sets.push(`name=$${params.length}`); }
    if (show_on_pos !== undefined) { params.push(show_on_pos); sets.push(`show_on_pos=$${params.length}`); }
    if (sets.length) {
      await pool.query(`UPDATE fb_order_sources SET ${sets.join(",")} WHERE id=$1 AND organization_id=$2`, params);
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/order-sources/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM fb_order_sources WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════
// PAYMENT METHODS
// ══════════════════════════════════════════════════════════

router.get("/payment-methods", async (req, res) => {
  try {
    await ensureTables();
    let { rows } = await pool.query(
      `SELECT * FROM fb_payment_methods WHERE organization_id=$1 ORDER BY sort_order, id`,
      [org(req)]
    );
    if (rows.length === 0) {
      await pool.query(`
        INSERT INTO fb_payment_methods (organization_id, name, type, commission_pct, show_on_pos, color, sort_order) VALUES
        ($1,'Готівка','cash',0,true,'#4CAF50',1),
        ($1,'Картка','cashless',1.9,true,'#2196F3',2),
        ($1,'Сертифікат','other',0,true,'#9C27B0',3),
        ($1,'Депозит','cashless',0,true,'#FF9800',4),
        ($1,'Розрахунковий рахунок','cashless',0,true,'#607D8B',5)
      `, [org(req)]);
      ({ rows } = await pool.query(
        `SELECT * FROM fb_payment_methods WHERE organization_id=$1 ORDER BY sort_order, id`, [org(req)]
      ));
    }
    res.json({ methods: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/payment-methods", async (req, res) => {
  try {
    await ensureTables();
    const { name, type, commission_pct, show_on_pos, color } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const { rows } = await pool.query(
      `INSERT INTO fb_payment_methods (organization_id, name, type, commission_pct, show_on_pos, color)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [org(req), name, type||'cash', commission_pct||0, show_on_pos??true, color||null]
    );
    res.json({ method: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/payment-methods/:id", async (req, res) => {
  try {
    const fields = ['name','type','commission_pct','show_on_pos','color'];
    const sets: string[] = [];
    const params: any[] = [req.params.id, org(req)];
    for (const f of fields) {
      if (req.body[f] !== undefined) { params.push(req.body[f]); sets.push(`${f}=$${params.length}`); }
    }
    if (sets.length) {
      await pool.query(`UPDATE fb_payment_methods SET ${sets.join(",")} WHERE id=$1 AND organization_id=$2`, params);
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/payment-methods/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM fb_payment_methods WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════
// HALL TABLES (floor plan)
// ══════════════════════════════════════════════════════════

router.get("/tables", async (req, res) => {
  try {
    await ensureTables();
    const { rows } = await pool.query(
      `SELECT * FROM fb_hall_tables WHERE organization_id=$1 ORDER BY table_number`,
      [org(req)]
    );
    res.json({ tables: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/tables", async (req, res) => {
  try {
    await ensureTables();
    const { tables } = req.body;
    if (!Array.isArray(tables)) return res.status(400).json({ error: "tables[] required" });
    await pool.query(`DELETE FROM fb_hall_tables WHERE organization_id=$1`, [org(req)]);
    for (const t of tables) {
      await pool.query(
        `INSERT INTO fb_hall_tables (organization_id, hall_name, table_number, pos_x, pos_y, width, height, seats)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [org(req), t.hall_name||'Основний зал', t.table_number, t.pos_x||0, t.pos_y||0,
         t.width||80, t.height||80, t.seats||4]
      );
    }
    res.json({ ok: true, count: tables.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
