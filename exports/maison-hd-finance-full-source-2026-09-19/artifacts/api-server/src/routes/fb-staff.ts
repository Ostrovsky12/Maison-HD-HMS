import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import crypto from "crypto";

const router = Router();
const getOrg = (req: any): number => req.user?.organizationId;

function hashPin(pin: string) {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

// ── List staff ────────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, role, permissions, outlet_ids, is_active, created_at
       FROM fb_staff WHERE organization_id = $1 ORDER BY name ASC`,
      [orgId]
    );
    res.json({ staff: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Create staff ──────────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  const { name, email, phone, role, pin, permissions, outlet_ids, is_active } = req.body;
  if (!name || !role) return res.status(400).json({ error: "name and role are required" });

  try {
    const pinHash = pin ? hashPin(String(pin)) : null;
    const perms = permissions || defaultPermissions(role);
    const outlets = outlet_ids || [];

    const { rows } = await pool.query(
      `INSERT INTO fb_staff (organization_id, name, email, phone, role, pin_hash, permissions, outlet_ids, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, name, email, phone, role, permissions, outlet_ids, is_active, created_at`,
      [orgId, name, email || null, phone || null, role, pinHash, JSON.stringify(perms), outlets, is_active !== false]
    );
    res.status(201).json({ staff: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Update staff ──────────────────────────────────────────────────────────────
router.patch("/:id", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  const { id } = req.params;
  const { name, email, phone, role, pin, permissions, outlet_ids, is_active } = req.body;

  try {
    const existing = await pool.query(
      `SELECT * FROM fb_staff WHERE id = $1 AND organization_id = $2`, [id, orgId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: "Not found" });

    const cur = existing.rows[0];
    const pinHash = pin !== undefined
      ? (pin ? hashPin(String(pin)) : null)
      : cur.pin_hash;

    const { rows } = await pool.query(
      `UPDATE fb_staff SET
         name = $1, email = $2, phone = $3, role = $4, pin_hash = $5,
         permissions = $6, outlet_ids = $7, is_active = $8, updated_at = NOW()
       WHERE id = $9 AND organization_id = $10
       RETURNING id, name, email, phone, role, permissions, outlet_ids, is_active`,
      [
        name ?? cur.name,
        email !== undefined ? email : cur.email,
        phone !== undefined ? phone : cur.phone,
        role ?? cur.role,
        pinHash,
        JSON.stringify(permissions ?? cur.permissions),
        outlet_ids ?? cur.outlet_ids,
        is_active !== undefined ? is_active : cur.is_active,
        id, orgId,
      ]
    );
    res.json({ staff: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Delete staff ──────────────────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  const orgId = getOrg(req);
  try {
    await pool.query(`DELETE FROM fb_staff WHERE id = $1 AND organization_id = $2`, [req.params.id, orgId]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function defaultPermissions(role: string): Record<string, boolean> {
  const base = {
    can_take_orders: false,
    can_send_to_kitchen: false,
    can_apply_discounts: false,
    can_close_orders: false,
    can_cancel_items: false,
    can_view_all_tables: false,
    can_view_reports: false,
    can_manage_menu: false,
    can_open_shift: false,
  };
  switch (role) {
    case "waiter":
      return { ...base, can_take_orders: true, can_send_to_kitchen: true, can_view_all_tables: true };
    case "bartender":
      return { ...base, can_take_orders: true, can_send_to_kitchen: true };
    case "cashier":
      return { ...base, can_close_orders: true, can_apply_discounts: true, can_cancel_items: true, can_open_shift: true, can_view_all_tables: true };
    case "manager":
      return Object.fromEntries(Object.keys(base).map(k => [k, true])) as Record<string, boolean>;
    default:
      return base;
  }
}

export { defaultPermissions };
export default router;
