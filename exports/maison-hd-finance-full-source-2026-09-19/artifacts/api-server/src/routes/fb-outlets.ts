import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";

const router = Router();
const getOrg = (req: any): number => req.user?.organizationId;

// ── List outlets ──────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  try {
    const { rows } = await pool.query(
      `SELECT o.*, 
         (SELECT COUNT(*) FROM fb_outlet_items oi WHERE oi.outlet_id = o.id) as item_count,
         (SELECT COUNT(*) FROM fb_outlet_tables ot WHERE ot.outlet_id = o.id) as table_count
       FROM fb_outlets o WHERE o.organization_id = $1 ORDER BY o.sort_order ASC, o.name ASC`,
      [orgId]
    );
    res.json({ outlets: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Get single outlet ─────────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM fb_outlets WHERE id = $1 AND organization_id = $2`, [req.params.id, orgId]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ outlet: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Create outlet ─────────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  const { name, slug, description, color, icon, is_active, is_seasonal, season_from, season_until, address, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9а-яіїє]/gi, "-").slice(0, 80);
  try {
    const { rows } = await pool.query(
      `INSERT INTO fb_outlets (organization_id, name, slug, description, color, icon, is_active, is_seasonal, season_from, season_until, address, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [orgId, name, finalSlug, description || null, color || "blue", icon || "utensils",
       is_active !== false, !!is_seasonal, season_from || null, season_until || null, address || null, sort_order || 0]
    );
    res.status(201).json({ outlet: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Update outlet ─────────────────────────────────────────────────────────────
router.patch("/:id", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  const { name, slug, description, color, icon, is_active, is_seasonal, season_from, season_until, address, sort_order } = req.body;
  try {
    const cur = await pool.query(`SELECT * FROM fb_outlets WHERE id=$1 AND organization_id=$2`, [req.params.id, orgId]);
    if (!cur.rows.length) return res.status(404).json({ error: "Not found" });
    const c = cur.rows[0];
    const { rows } = await pool.query(
      `UPDATE fb_outlets SET name=$1,slug=$2,description=$3,color=$4,icon=$5,is_active=$6,
         is_seasonal=$7,season_from=$8,season_until=$9,address=$10,sort_order=$11,updated_at=NOW()
       WHERE id=$12 AND organization_id=$13 RETURNING *`,
      [name??c.name, slug??c.slug, description??c.description, color??c.color, icon??c.icon,
       is_active??c.is_active, is_seasonal??c.is_seasonal, season_from??c.season_from, season_until??c.season_until,
       address??c.address, sort_order??c.sort_order, req.params.id, orgId]
    );
    res.json({ outlet: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Delete outlet ─────────────────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  try {
    await pool.query(`DELETE FROM fb_outlets WHERE id=$1 AND organization_id=$2`, [req.params.id, orgId]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Outlet items ──────────────────────────────────────────────────────────────
router.get("/:id/items", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  try {
    // Verify outlet belongs to org
    const oCheck = await pool.query(`SELECT id FROM fb_outlets WHERE id=$1 AND organization_id=$2`, [req.params.id, orgId]);
    if (!oCheck.rows.length) return res.status(404).json({ error: "Outlet not found" });

    const { rows } = await pool.query(
      `SELECT fi.id, fi.name, fi.price as base_price, fi.category_id, fi.is_available as globally_available,
              fc.name as category_name, fc.emoji as category_emoji,
              oi.is_available, oi.price_override
       FROM fb_items fi
       LEFT JOIN fb_categories fc ON fi.category_id = fc.id
       LEFT JOIN fb_outlet_items oi ON oi.item_id = fi.id AND oi.outlet_id = $1
       WHERE fi.organization_id = $2
       ORDER BY fc.sort_order ASC, fi.sort_order ASC, fi.name ASC`,
      [req.params.id, orgId]
    );
    res.json({ items: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/:id/items", requireAuth, async (req, res) => {
  const { item_id, is_available, price_override } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO fb_outlet_items (outlet_id, item_id, is_available, price_override)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (outlet_id, item_id) DO UPDATE SET is_available=$3, price_override=$4
       RETURNING *`,
      [req.params.id, item_id, is_available !== false, price_override || null]
    );
    res.json({ item: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/:id/items/:itemId", requireAuth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM fb_outlet_items WHERE outlet_id=$1 AND item_id=$2`, [req.params.id, req.params.itemId]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Outlet tables ─────────────────────────────────────────────────────────────
router.get("/:id/tables", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  try {
    const oCheck = await pool.query(`SELECT id FROM fb_outlets WHERE id=$1 AND organization_id=$2`, [req.params.id, orgId]);
    if (!oCheck.rows.length) return res.status(404).json({ error: "Outlet not found" });

    const { rows } = await pool.query(
      `SELECT t.*, (ot.outlet_id IS NOT NULL) as assigned
       FROM fb_tables t
       LEFT JOIN fb_outlet_tables ot ON ot.table_id = t.id AND ot.outlet_id = $1
       WHERE t.organization_id = $2
       ORDER BY t.number ASC`,
      [req.params.id, orgId]
    );
    res.json({ tables: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/:id/tables", requireAuth, async (req, res) => {
  const { table_ids } = req.body; // array of table ids
  try {
    // Replace all table assignments for this outlet
    await pool.query(`DELETE FROM fb_outlet_tables WHERE outlet_id=$1`, [req.params.id]);
    if (table_ids?.length) {
      for (const tid of table_ids) {
        await pool.query(
          `INSERT INTO fb_outlet_tables (outlet_id, table_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [req.params.id, tid]
        );
      }
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
