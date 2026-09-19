import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { pool } from "@workspace/db";

const router = Router();
router.use(requireAuth);
const org = (req: any): number => req.user?.organizationId ?? req.user?.organization_id;

async function ensureAppsTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fb_delivery_bot_settings (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL UNIQUE,
      bot_token TEXT,
      delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      dine_in_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      language VARCHAR(10) NOT NULL DEFAULT 'uk',
      contacts_html TEXT,
      pay_online BOOLEAN NOT NULL DEFAULT FALSE,
      pay_cash BOOLEAN NOT NULL DEFAULT TRUE,
      pay_card_on_delivery BOOLEAN NOT NULL DEFAULT TRUE,
      active_category_ids JSONB DEFAULT '[]',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

// ═══════════════════════════════════════════════════════════════════════════
// STOP LIST
// ═══════════════════════════════════════════════════════════════════════════

router.get("/stop-list", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.name, i.price, c.name AS category_name
       FROM fb_items i
       LEFT JOIN fb_categories c ON c.id = i.category_id
       WHERE i.organization_id = $1 AND i.is_stop_list = TRUE
       ORDER BY c.name, i.name`,
      [org(req)]
    );
    res.json({ items: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/stop-list/toggle", async (req, res) => {
  try {
    const { item_id, in_stop_list } = req.body;
    if (!item_id) return res.status(400).json({ error: "item_id required" });
    await pool.query(
      `UPDATE fb_items SET is_stop_list = $1 WHERE id = $2 AND organization_id = $3`,
      [!!in_stop_list, item_id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/stop-list/clear", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE fb_items SET is_stop_list = FALSE WHERE organization_id = $1 RETURNING id`,
      [org(req)]
    );
    res.json({ cleared: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// PRINT CARDS (Tech cards & semi-finished)
// ═══════════════════════════════════════════════════════════════════════════

router.get("/print-cards/items", async (req, res) => {
  try {
    const { category_id } = req.query;
    let where = `i.organization_id = $1`;
    const params: any[] = [org(req)];
    if (category_id && category_id !== "all") {
      params.push(category_id);
      where += ` AND i.category_id = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT i.id, i.name, i.barcode, i.weight_g, i.price, i.category_id,
              c.name AS category_name,
              w.name AS workshop_name,
              i.tech_card
       FROM fb_items i
       LEFT JOIN fb_categories c ON c.id = i.category_id
       LEFT JOIN fb_workshops w ON w.id = i.workshop_id
       WHERE ${where} AND (i.tech_card IS NOT NULL OR i.type = 'tech_card')
       ORDER BY c.name, i.name`,
      params
    );
    // Also include all items if tech_card filter returns nothing
    if (rows.length === 0) {
      const fallback = await pool.query(
        `SELECT i.id, i.name, i.barcode, i.weight_g, i.price, i.category_id,
                c.name AS category_name, w.name AS workshop_name
         FROM fb_items i
         LEFT JOIN fb_categories c ON c.id = i.category_id
         LEFT JOIN fb_workshops w ON w.id = i.workshop_id
         WHERE i.organization_id = $1 ${category_id && category_id !== "all" ? "AND i.category_id = $2" : ""}
         ORDER BY c.name, i.name`,
        category_id && category_id !== "all" ? [org(req), category_id] : [org(req)]
      );
      return res.json({ items: fallback.rows });
    }
    res.json({ items: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELIVERY BOT SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

router.get("/delivery-bot", async (req, res) => {
  try {
    await ensureAppsTables();
    let r = await pool.query(
      `SELECT * FROM fb_delivery_bot_settings WHERE organization_id = $1`, [org(req)]
    );
    if (!r.rows[0]) {
      const ins = await pool.query(
        `INSERT INTO fb_delivery_bot_settings (organization_id) VALUES ($1) RETURNING *`, [org(req)]
      );
      r = { rows: [ins.rows[0]] } as any;
    }
    const s = r.rows[0];
    s.active_category_ids = s.active_category_ids || [];
    res.json({ settings: s });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/delivery-bot", async (req, res) => {
  try {
    await ensureAppsTables();
    const {
      bot_token, delivery_enabled, pickup_enabled, dine_in_enabled,
      language, contacts_html, pay_online, pay_cash, pay_card_on_delivery,
      active_category_ids,
    } = req.body;
    await pool.query(
      `INSERT INTO fb_delivery_bot_settings
         (organization_id, bot_token, delivery_enabled, pickup_enabled, dine_in_enabled,
          language, contacts_html, pay_online, pay_cash, pay_card_on_delivery, active_category_ids, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (organization_id) DO UPDATE SET
         bot_token=EXCLUDED.bot_token, delivery_enabled=EXCLUDED.delivery_enabled,
         pickup_enabled=EXCLUDED.pickup_enabled, dine_in_enabled=EXCLUDED.dine_in_enabled,
         language=EXCLUDED.language, contacts_html=EXCLUDED.contacts_html,
         pay_online=EXCLUDED.pay_online, pay_cash=EXCLUDED.pay_cash,
         pay_card_on_delivery=EXCLUDED.pay_card_on_delivery,
         active_category_ids=EXCLUDED.active_category_ids, updated_at=NOW()`,
      [org(req), bot_token||null, delivery_enabled??true, pickup_enabled??true, dine_in_enabled??false,
       language||'uk', contacts_html||null, pay_online??false, pay_cash??true, pay_card_on_delivery??true,
       JSON.stringify(active_category_ids||[])]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
