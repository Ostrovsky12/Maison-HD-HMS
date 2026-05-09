/**
 * F&B Guest QR Routes — public (no auth) + cashier-protected endpoints
 * Mounted at /fb alongside fbRouter in index.ts
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// ─── GET /fb/public/guest-menu?tid=<tableId> ─────────────────────────────────
// Returns org info + full menu by table ID. No auth required.
router.get("/public/guest-menu", async (req, res) => {
  const { tid } = req.query;
  if (!tid) return res.status(400).json({ error: "tid required" });

  try {
    const { rows: tableRows } = await pool.query(
      `SELECT ft.id, ft.number, ft.location, ft.organization_id,
              o.name as org_name, o.slug as org_slug
       FROM fb_tables ft
       JOIN organizations o ON o.id = ft.organization_id
       WHERE ft.id = $1 AND ft.is_active = true LIMIT 1`,
      [tid],
    );
    if (!tableRows[0]) return res.status(404).json({ error: "Table not found" });
    const { organization_id: orgId, org_name, org_slug, number: tableNumber, location: tableLocation } = tableRows[0];

    const { rows: cats } = await pool.query(
      `SELECT id, name, description, color FROM fb_categories
       WHERE organization_id = $1 AND is_active = true
       ORDER BY sort_order ASC NULLS LAST, name ASC`,
      [orgId],
    );

    const { rows: items } = await pool.query(
      `SELECT id, category_id, name, description, price,
              is_popular, is_vegetarian, allergens, image_url, cook_minutes
       FROM fb_items
       WHERE organization_id = $1 AND is_available = true AND (is_stop_list IS NULL OR is_stop_list = false)
       ORDER BY sort_order ASC NULLS LAST, name ASC`,
      [orgId],
    );

    res.json({ orgId, orgName: org_name, orgSlug: org_slug, tableNumber, tableLocation, categories: cats, items });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /fb/public/guest-orders ────────────────────────────────────────────
// Guest places order from QR menu. Creates order with status 'new_guest'.
router.post("/public/guest-orders", async (req, res) => {
  const { tableId, items, guestName, guestCount, notes } = req.body;
  if (!tableId || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "tableId and items required" });
  }

  try {
    const { rows: tableRows } = await pool.query(
      `SELECT id, number, organization_id FROM fb_tables WHERE id = $1 AND is_active = true LIMIT 1`,
      [tableId],
    );
    if (!tableRows[0]) return res.status(404).json({ error: "Table not found" });
    const orgId = tableRows[0].organization_id;

    // Create order with new_guest status (cashier must accept before kitchen sees it)
    const { rows: orderRows } = await pool.query(
      `INSERT INTO fb_orders (organization_id, table_id, order_type, guest_name, guest_count, status, notes, opened_at)
       VALUES ($1, $2, 'dine_in', $3, $4, 'new_guest', $5, NOW())
       RETURNING *`,
      [orgId, tableId, guestName || "Гість (QR)", parseInt(guestCount) || 1, notes || null],
    );
    const order = orderRows[0];

    // Mark table as occupied
    await pool.query(
      `UPDATE fb_tables SET status = 'occupied', current_order_id = $1 WHERE id = $2`,
      [order.id, tableId],
    );

    // Insert order items
    for (const item of items) {
      const { rows: itemRows } = await pool.query(
        `SELECT name, price FROM fb_items WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [item.itemId, orgId],
      );
      if (!itemRows[0]) continue;
      const { name, price } = itemRows[0];
      const qty = parseInt(item.quantity) || 1;
      const total = (parseFloat(price) * qty).toFixed(2);
      await pool.query(
        `INSERT INTO fb_order_items (order_id, item_id, organization_id, name, price, quantity, total_price, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
        [order.id, item.itemId, orgId, name, price, qty, total, item.notes || null],
      );
    }

    // Recalc total
    await pool.query(
      `UPDATE fb_orders SET total_amount = (
         SELECT COALESCE(SUM(total_price::numeric), 0) FROM fb_order_items WHERE order_id = $1
       ) WHERE id = $1`,
      [order.id],
    );

    const { rows: finalRows } = await pool.query(`SELECT * FROM fb_orders WHERE id = $1`, [order.id]);
    res.json({ order: finalRows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /fb/public/pending-orders ───────────────────────────────────────────
// Returns all new_guest orders waiting for cashier acceptance. Auth required.
router.get("/public/pending-orders", requireAuth, async (req: any, res) => {
  const orgId = req.user?.organizationId;
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.status, o.guest_name, o.guest_count, o.notes, o.total_amount, o.opened_at,
              ft.number as table_number, ft.location as table_location,
              COALESCE(json_agg(
                json_build_object(
                  'id', oi.id, 'name', oi.name, 'quantity', oi.quantity,
                  'price', oi.price, 'total_price', oi.total_price, 'notes', oi.notes
                ) ORDER BY oi.id
              ) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
       FROM fb_orders o
       LEFT JOIN fb_tables ft ON ft.id = o.table_id
       LEFT JOIN fb_order_items oi ON oi.order_id = o.id
       WHERE o.organization_id = $1 AND o.status = 'new_guest'
       GROUP BY o.id, ft.number, ft.location
       ORDER BY o.opened_at ASC`,
      [orgId],
    );
    res.json({ orders: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PATCH /fb/public/guest-orders/:id/accept ────────────────────────────────
// Cashier accepts the QR order → status becomes 'open', visible to kitchen.
router.patch("/public/guest-orders/:id/accept", requireAuth, async (req: any, res) => {
  const orgId = req.user?.organizationId;
  const orderId = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE fb_orders SET status = 'open', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'new_guest'
       RETURNING *`,
      [orderId, orgId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Order not found or already processed" });
    res.json({ order: rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PATCH /fb/public/guest-orders/:id/reject ────────────────────────────────
// Cashier rejects the QR order → cancelled, table freed.
router.patch("/public/guest-orders/:id/reject", requireAuth, async (req: any, res) => {
  const orgId = req.user?.organizationId;
  const orderId = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE fb_orders SET status = 'cancelled', closed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'new_guest'
       RETURNING table_id`,
      [orderId, orgId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Order not found or already processed" });
    if (rows[0].table_id) {
      await pool.query(
        `UPDATE fb_tables SET status = 'free', current_order_id = NULL WHERE id = $1`,
        [rows[0].table_id],
      );
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
