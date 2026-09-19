import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();
router.use(requireAuth);

function org(req: any): number { return req.user?.organizationId ?? req.user?.organization_id ?? null; }
function uid(req: any): number { return req.user?.id ?? req.user?.userId ?? null; }

// ─── Auto-create tables ────────────────────────────────────────────────────────
async function ensureMarketingTables() {
  const client = (db as any).$client;
  await client.query(`
    CREATE TABLE IF NOT EXISTS fb_client_groups (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      bonus_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      min_purchase NUMERIC(12,2) DEFAULT 0,
      color VARCHAR(20),
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS fb_clients (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      name VARCHAR(200) NOT NULL,
      phone VARCHAR(30),
      email VARCHAR(150),
      card_number VARCHAR(50),
      group_id INT REFERENCES fb_client_groups(id) ON DELETE SET NULL,
      bonus_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_purchases NUMERIC(14,2) NOT NULL DEFAULT 0,
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS fb_loyalty_settings (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL UNIQUE,
      bonus_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      discount_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      max_bonus_pct NUMERIC(5,2) NOT NULL DEFAULT 50,
      welcome_bonus NUMERIC(10,2) NOT NULL DEFAULT 0,
      bonus_transitions JSONB DEFAULT '[]',
      discount_transitions JSONB DEFAULT '[]',
      sms_on_order BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS fb_promotions (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      name VARCHAR(200) NOT NULL,
      start_date DATE,
      end_date DATE,
      bonus_multiplier NUMERIC(5,2) NOT NULL DEFAULT 1,
      discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS fb_loyalty_exceptions (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      exception_type VARCHAR(20) NOT NULL DEFAULT 'item',
      ref_id INT,
      name VARCHAR(200) NOT NULL,
      category_name VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT GROUPS / ГРУПИ КЛІЄНТІВ
// ═══════════════════════════════════════════════════════════════════════════

router.get("/client-groups", async (req, res) => {
  try {
    await ensureMarketingTables();
    const client = (db as any).$client;
    const r = await client.query(`
      SELECT g.*, COUNT(c.id)::int AS client_count
      FROM fb_client_groups g
      LEFT JOIN fb_clients c ON c.group_id = g.id AND c.is_active = TRUE
      WHERE g.organization_id = $1
      GROUP BY g.id
      ORDER BY g.min_purchase ASC, g.name
    `, [org(req)]);
    res.json({ groups: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/client-groups", async (req, res) => {
  try {
    await ensureMarketingTables();
    const client = (db as any).$client;
    const { name, bonus_pct, discount_pct, min_purchase, color, is_default } = req.body;
    if (!name) return res.status(400).json({ error: "Назва обов'язкова" });
    if (is_default) await client.query(
      `UPDATE fb_client_groups SET is_default=FALSE WHERE organization_id=$1`, [org(req)]
    );
    const r = await client.query(
      `INSERT INTO fb_client_groups (organization_id, name, bonus_pct, discount_pct, min_purchase, color, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [org(req), name, bonus_pct || 0, discount_pct || 0, min_purchase || 0, color || null, is_default || false]
    );
    res.json({ group: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/client-groups/:id", async (req, res) => {
  try {
    const client = (db as any).$client;
    const { name, bonus_pct, discount_pct, min_purchase, color, is_default } = req.body;
    if (is_default) await client.query(
      `UPDATE fb_client_groups SET is_default=FALSE WHERE organization_id=$1`, [org(req)]
    );
    await client.query(
      `UPDATE fb_client_groups SET
         name=COALESCE($1,name), bonus_pct=COALESCE($2,bonus_pct),
         discount_pct=COALESCE($3,discount_pct), min_purchase=COALESCE($4,min_purchase),
         color=COALESCE($5,color), is_default=COALESCE($6,is_default)
       WHERE id=$7 AND organization_id=$8`,
      [name??null, bonus_pct??null, discount_pct??null, min_purchase??null,
       color??null, is_default??null, req.params.id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/client-groups/:id", async (req, res) => {
  try {
    const client = (db as any).$client;
    await client.query(
      `UPDATE fb_clients SET group_id=NULL WHERE group_id=$1 AND organization_id=$2`,
      [req.params.id, org(req)]
    );
    await client.query(`DELETE FROM fb_client_groups WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTS / КЛІЄНТИ
// ═══════════════════════════════════════════════════════════════════════════

router.get("/clients", async (req, res) => {
  try {
    await ensureMarketingTables();
    const client = (db as any).$client;
    const { search, group_id, limit = "100", offset = "0" } = req.query;
    let where = `c.organization_id=$1`;
    const params: any[] = [org(req)];
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.card_number ILIKE $${params.length})`;
    }
    if (group_id && group_id !== "all") {
      params.push(group_id);
      where += ` AND c.group_id=$${params.length}`;
    }
    const countR = await client.query(
      `SELECT COUNT(*)::int AS total FROM fb_clients c WHERE ${where}`, params
    );
    params.push(parseInt(limit as string), parseInt(offset as string));
    const r = await client.query(`
      SELECT c.*, g.name AS group_name, g.bonus_pct, g.discount_pct
      FROM fb_clients c
      LEFT JOIN fb_client_groups g ON g.id = c.group_id
      WHERE ${where}
      ORDER BY c.total_purchases DESC, c.name
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    res.json({ clients: r.rows, total: countR.rows[0].total });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/clients", async (req, res) => {
  try {
    await ensureMarketingTables();
    const client = (db as any).$client;
    const { name, phone, email, card_number, group_id, notes } = req.body;
    if (!name) return res.status(400).json({ error: "Ім'я обов'язкове" });

    // Get welcome bonus from loyalty settings
    const ls = await client.query(
      `SELECT welcome_bonus FROM fb_loyalty_settings WHERE organization_id=$1`, [org(req)]
    );
    const welcomeBonus = parseFloat(ls.rows[0]?.welcome_bonus || "0");

    const r = await client.query(
      `INSERT INTO fb_clients (organization_id, name, phone, email, card_number, group_id, notes, bonus_balance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [org(req), name, phone||null, email||null, card_number||null,
       group_id||null, notes||null, welcomeBonus]
    );
    res.json({ client: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/clients/:id", async (req, res) => {
  try {
    const client = (db as any).$client;
    const { name, phone, email, card_number, group_id, notes, bonus_balance, is_active } = req.body;
    await client.query(
      `UPDATE fb_clients SET
         name=COALESCE($1,name), phone=COALESCE($2,phone),
         email=COALESCE($3,email), card_number=COALESCE($4,card_number),
         group_id=COALESCE($5,group_id), notes=COALESCE($6,notes),
         bonus_balance=COALESCE($7,bonus_balance), is_active=COALESCE($8,is_active)
       WHERE id=$9 AND organization_id=$10`,
      [name??null, phone??null, email??null, card_number??null,
       group_id??null, notes??null, bonus_balance??null, is_active??null,
       req.params.id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/clients/:id", async (req, res) => {
  try {
    const client = (db as any).$client;
    await client.query(
      `DELETE FROM fb_clients WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// LOYALTY SETTINGS / ПРОГРАМИ ЛОЯЛЬНОСТІ
// ═══════════════════════════════════════════════════════════════════════════

router.get("/loyalty-settings", async (req, res) => {
  try {
    await ensureMarketingTables();
    const client = (db as any).$client;
    let r = await client.query(
      `SELECT * FROM fb_loyalty_settings WHERE organization_id=$1`, [org(req)]
    );
    if (!r.rows[0]) {
      const ins = await client.query(
        `INSERT INTO fb_loyalty_settings (organization_id) VALUES ($1) RETURNING *`, [org(req)]
      );
      r = { rows: [ins.rows[0]] };
    }
    const settings = r.rows[0];
    settings.bonus_transitions = settings.bonus_transitions || [];
    settings.discount_transitions = settings.discount_transitions || [];
    res.json({ settings });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/loyalty-settings", async (req, res) => {
  try {
    await ensureMarketingTables();
    const client = (db as any).$client;
    const {
      bonus_enabled, discount_enabled, max_bonus_pct,
      welcome_bonus, bonus_transitions, discount_transitions, sms_on_order,
    } = req.body;
    await client.query(
      `INSERT INTO fb_loyalty_settings
         (organization_id, bonus_enabled, discount_enabled, max_bonus_pct, welcome_bonus,
          bonus_transitions, discount_transitions, sms_on_order, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (organization_id) DO UPDATE SET
         bonus_enabled=EXCLUDED.bonus_enabled,
         discount_enabled=EXCLUDED.discount_enabled,
         max_bonus_pct=EXCLUDED.max_bonus_pct,
         welcome_bonus=EXCLUDED.welcome_bonus,
         bonus_transitions=EXCLUDED.bonus_transitions,
         discount_transitions=EXCLUDED.discount_transitions,
         sms_on_order=EXCLUDED.sms_on_order,
         updated_at=NOW()`,
      [org(req), bonus_enabled ?? true, discount_enabled ?? false,
       max_bonus_pct || 50, welcome_bonus || 0,
       JSON.stringify(bonus_transitions || []),
       JSON.stringify(discount_transitions || []),
       sms_on_order ?? false]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// PROMOTIONS / АКЦІЇ
// ═══════════════════════════════════════════════════════════════════════════

router.get("/promotions", async (req, res) => {
  try {
    await ensureMarketingTables();
    const client = (db as any).$client;
    const r = await client.query(
      `SELECT * FROM fb_promotions WHERE organization_id=$1 ORDER BY created_at DESC`, [org(req)]
    );
    res.json({ promotions: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/promotions", async (req, res) => {
  try {
    await ensureMarketingTables();
    const client = (db as any).$client;
    const { name, start_date, end_date, bonus_multiplier, discount_pct, notes } = req.body;
    if (!name) return res.status(400).json({ error: "Назва обов'язкова" });
    const r = await client.query(
      `INSERT INTO fb_promotions (organization_id, name, start_date, end_date, bonus_multiplier, discount_pct, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [org(req), name, start_date||null, end_date||null,
       bonus_multiplier||1, discount_pct||0, notes||null]
    );
    res.json({ promotion: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/promotions/:id", async (req, res) => {
  try {
    const client = (db as any).$client;
    const { name, start_date, end_date, bonus_multiplier, discount_pct, notes, is_active } = req.body;
    await client.query(
      `UPDATE fb_promotions SET
         name=COALESCE($1,name), start_date=COALESCE($2,start_date),
         end_date=COALESCE($3,end_date), bonus_multiplier=COALESCE($4,bonus_multiplier),
         discount_pct=COALESCE($5,discount_pct), notes=COALESCE($6,notes),
         is_active=COALESCE($7,is_active)
       WHERE id=$8 AND organization_id=$9`,
      [name??null, start_date??null, end_date??null, bonus_multiplier??null,
       discount_pct??null, notes??null, is_active??null, req.params.id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/promotions/:id", async (req, res) => {
  try {
    const client = (db as any).$client;
    await client.query(
      `DELETE FROM fb_promotions WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// LOYALTY EXCEPTIONS / ВИНЯТКИ
// ═══════════════════════════════════════════════════════════════════════════

router.get("/loyalty-exceptions", async (req, res) => {
  try {
    await ensureMarketingTables();
    const client = (db as any).$client;
    const r = await client.query(
      `SELECT * FROM fb_loyalty_exceptions WHERE organization_id=$1 ORDER BY exception_type, name`, [org(req)]
    );
    res.json({ exceptions: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/loyalty-exceptions", async (req, res) => {
  try {
    await ensureMarketingTables();
    const client = (db as any).$client;
    const { exception_type, ref_id, name, category_name } = req.body;
    if (!name) return res.status(400).json({ error: "Назва обов'язкова" });
    const r = await client.query(
      `INSERT INTO fb_loyalty_exceptions (organization_id, exception_type, ref_id, name, category_name)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [org(req), exception_type||'item', ref_id||null, name, category_name||null]
    );
    res.json({ exception: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/loyalty-exceptions/:id", async (req, res) => {
  try {
    const client = (db as any).$client;
    await client.query(
      `DELETE FROM fb_loyalty_exceptions WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════

router.get("/stats", async (req, res) => {
  try {
    await ensureMarketingTables();
    const client = (db as any).$client;
    const orgId = org(req);
    const [total, active, bonusTotal, topGroup] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS n FROM fb_clients WHERE organization_id=$1`, [orgId]),
      client.query(`SELECT COUNT(*)::int AS n FROM fb_clients WHERE organization_id=$1 AND is_active=TRUE`, [orgId]),
      client.query(`SELECT COALESCE(SUM(bonus_balance),0)::numeric AS n FROM fb_clients WHERE organization_id=$1`, [orgId]),
      client.query(`
        SELECT g.name, COUNT(c.id)::int AS cnt
        FROM fb_client_groups g
        LEFT JOIN fb_clients c ON c.group_id=g.id
        WHERE g.organization_id=$1
        GROUP BY g.id ORDER BY cnt DESC LIMIT 1
      `, [orgId]),
    ]);
    res.json({
      total_clients: total.rows[0].n,
      active_clients: active.rows[0].n,
      total_bonus_balance: parseFloat(topGroup.rows[0]?.n || "0"),
      top_group: topGroup.rows[0]?.name || null,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
