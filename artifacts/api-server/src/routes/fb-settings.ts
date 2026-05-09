import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db } from "@workspace/db";
import { createHash } from "crypto";

const router = Router();
const getOrg = (req: any): number => (req as any).user?.organizationId;
const pool = () => (db as any).$client;

// ── Ensure tables ─────────────────────────────────────────────────────────────
async function ensureFbSettingsTables() {
  const p = pool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS fb_tax_groups (
      id            SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      name          VARCHAR(100) NOT NULL,
      code          VARCHAR(20)  NOT NULL,
      rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
      is_excise     BOOLEAN NOT NULL DEFAULT false,
      uktzed        VARCHAR(20),
      description   TEXT,
      is_active     BOOLEAN NOT NULL DEFAULT true,
      is_default    BOOLEAN NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS fb_payment_forms (
      id            SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      name          VARCHAR(100) NOT NULL,
      code          VARCHAR(30)  NOT NULL,
      type          VARCHAR(30)  NOT NULL DEFAULT 'cash',
      legal_entity_id INTEGER,
      liqpay_public_key  VARCHAR(255),
      liqpay_private_key VARCHAR(255),
      is_active     BOOLEAN NOT NULL DEFAULT true,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS fb_printers (
      id            SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      name          VARCHAR(100) NOT NULL,
      type          VARCHAR(20)  NOT NULL DEFAULT 'receipt',
      driver        VARCHAR(30)  NOT NULL DEFAULT 'escpos',
      connection    VARCHAR(20)  NOT NULL DEFAULT 'network',
      ip_address    VARCHAR(50),
      port          INTEGER DEFAULT 9100,
      usb_vendor    VARCHAR(20),
      usb_product   VARCHAR(20),
      paper_width   INTEGER DEFAULT 80,
      is_active     BOOLEAN NOT NULL DEFAULT true,
      is_default    BOOLEAN NOT NULL DEFAULT false,
      print_copies  INTEGER NOT NULL DEFAULT 1,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

ensureFbSettingsTables().catch(console.error);

// ══════════════════════════════════════════════════════════════════
// TAX GROUPS
// ══════════════════════════════════════════════════════════════════

router.get("/tax-groups", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    if (!orgId) return res.status(403).json({ error: "No organization" });
    const r = await pool().query(
      `SELECT * FROM fb_tax_groups WHERE organization_id = $1 AND is_active = true ORDER BY rate ASC, name`,
      [orgId]
    );
    res.json({ taxGroups: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/tax-groups", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    if (!orgId) return res.status(403).json({ error: "No organization" });
    const { name, code, rate = 0, isExcise = false, uktzed, description, isDefault = false } = req.body;
    if (!name || !code) return res.status(400).json({ error: "name and code required" });
    if (isDefault) {
      await pool().query(`UPDATE fb_tax_groups SET is_default = false WHERE organization_id = $1`, [orgId]);
    }
    const r = await pool().query(`
      INSERT INTO fb_tax_groups (organization_id, name, code, rate, is_excise, uktzed, description, is_default)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [orgId, name, code, rate, isExcise, uktzed || null, description || null, isDefault]);
    res.status(201).json({ taxGroup: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/tax-groups/:id", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const id = Number(req.params.id);
    const { name, code, rate, isExcise, uktzed, description, isDefault, isActive } = req.body;
    if (isDefault) {
      await pool().query(`UPDATE fb_tax_groups SET is_default = false WHERE organization_id = $1`, [orgId]);
    }
    const r = await pool().query(`
      UPDATE fb_tax_groups SET
        name        = COALESCE($1, name),
        code        = COALESCE($2, code),
        rate        = COALESCE($3, rate),
        is_excise   = COALESCE($4, is_excise),
        uktzed      = COALESCE($5, uktzed),
        description = COALESCE($6, description),
        is_default  = COALESCE($7, is_default),
        is_active   = COALESCE($8, is_active),
        updated_at  = NOW()
      WHERE id = $9 AND organization_id = $10 RETURNING *
    `, [name||null, code||null, rate??null, isExcise??null, uktzed||null, description||null,
        isDefault??null, isActive??null, id, orgId]);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ taxGroup: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/tax-groups/:id", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const id = Number(req.params.id);
    await pool().query(
      `UPDATE fb_tax_groups SET is_active = false, updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// PAYMENT FORMS
// ══════════════════════════════════════════════════════════════════

router.get("/payment-forms", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    if (!orgId) return res.status(403).json({ error: "No organization" });
    const r = await pool().query(
      `SELECT pf.*, le.name AS legal_entity_name
       FROM fb_payment_forms pf
       LEFT JOIN legal_entities le ON le.id = pf.legal_entity_id
       WHERE pf.organization_id = $1 AND pf.is_active = true
       ORDER BY pf.sort_order ASC, pf.name`,
      [orgId]
    );
    res.json({ paymentForms: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/payment-forms", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    if (!orgId) return res.status(403).json({ error: "No organization" });
    const { name, code, type = "cash", legalEntityId, liqpayPublicKey, liqpayPrivateKey, sortOrder = 0 } = req.body;
    if (!name || !code) return res.status(400).json({ error: "name and code required" });
    const r = await pool().query(`
      INSERT INTO fb_payment_forms (organization_id, name, code, type, legal_entity_id, liqpay_public_key, liqpay_private_key, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [orgId, name, code, type, legalEntityId || null, liqpayPublicKey || null, liqpayPrivateKey || null, sortOrder]);
    res.status(201).json({ paymentForm: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/payment-forms/:id", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const id = Number(req.params.id);
    const { name, code, type, legalEntityId, liqpayPublicKey, liqpayPrivateKey, sortOrder, isActive } = req.body;
    const r = await pool().query(`
      UPDATE fb_payment_forms SET
        name               = COALESCE($1, name),
        code               = COALESCE($2, code),
        type               = COALESCE($3, type),
        legal_entity_id    = COALESCE($4, legal_entity_id),
        liqpay_public_key  = COALESCE($5, liqpay_public_key),
        liqpay_private_key = COALESCE($6, liqpay_private_key),
        sort_order         = COALESCE($7, sort_order),
        is_active          = COALESCE($8, is_active),
        updated_at         = NOW()
      WHERE id = $9 AND organization_id = $10 RETURNING *
    `, [name||null, code||null, type||null, legalEntityId||null, liqpayPublicKey||null,
        liqpayPrivateKey||null, sortOrder??null, isActive??null, id, orgId]);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ paymentForm: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/payment-forms/:id", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const id = Number(req.params.id);
    await pool().query(
      `UPDATE fb_payment_forms SET is_active = false, updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// PRINTERS
// ══════════════════════════════════════════════════════════════════

router.get("/printers", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    if (!orgId) return res.status(403).json({ error: "No organization" });
    const r = await pool().query(
      `SELECT * FROM fb_printers WHERE organization_id = $1 AND is_active = true ORDER BY is_default DESC, type ASC, name`,
      [orgId]
    );
    res.json({ printers: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/printers", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    if (!orgId) return res.status(403).json({ error: "No organization" });
    const { name, type = "receipt", driver = "escpos", connection = "network",
            ipAddress, port = 9100, usbVendor, usbProduct, paperWidth = 80,
            isDefault = false, printCopies = 1 } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    if (isDefault) {
      await pool().query(`UPDATE fb_printers SET is_default = false WHERE organization_id = $1 AND type = $2`, [orgId, type]);
    }
    const r = await pool().query(`
      INSERT INTO fb_printers (organization_id, name, type, driver, connection, ip_address, port, usb_vendor, usb_product, paper_width, is_default, print_copies)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    `, [orgId, name, type, driver, connection, ipAddress||null, port, usbVendor||null, usbProduct||null, paperWidth, isDefault, printCopies]);
    res.status(201).json({ printer: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/printers/:id", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const id = Number(req.params.id);
    const { name, type, driver, connection, ipAddress, port, usbVendor, usbProduct, paperWidth, isDefault, isActive, printCopies } = req.body;
    if (isDefault && type) {
      await pool().query(`UPDATE fb_printers SET is_default = false WHERE organization_id = $1 AND type = $2`, [orgId, type]);
    }
    const r = await pool().query(`
      UPDATE fb_printers SET
        name         = COALESCE($1, name),
        type         = COALESCE($2, type),
        driver       = COALESCE($3, driver),
        connection   = COALESCE($4, connection),
        ip_address   = COALESCE($5, ip_address),
        port         = COALESCE($6, port),
        usb_vendor   = COALESCE($7, usb_vendor),
        usb_product  = COALESCE($8, usb_product),
        paper_width  = COALESCE($9, paper_width),
        is_default   = COALESCE($10, is_default),
        is_active    = COALESCE($11, is_active),
        print_copies = COALESCE($12, print_copies),
        updated_at   = NOW()
      WHERE id = $13 AND organization_id = $14 RETURNING *
    `, [name||null, type||null, driver||null, connection||null, ipAddress||null, port??null,
        usbVendor||null, usbProduct||null, paperWidth??null, isDefault??null, isActive??null, printCopies??null, id, orgId]);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ printer: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/printers/:id", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const id = Number(req.params.id);
    await pool().query(
      `UPDATE fb_printers SET is_active = false, updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// ADMIN PIN
// ══════════════════════════════════════════════════════════════════

async function ensureAdminPinTable() {
  await pool().query(`
    CREATE TABLE IF NOT EXISTS fb_admin_pins (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL UNIQUE,
      pin_hash        VARCHAR(255) NOT NULL,
      actions         TEXT[] NOT NULL DEFAULT ARRAY['cancel_order','apply_discount','open_shift','delete_item'],
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
ensureAdminPinTable().catch(console.error);

// Simple hash — use SHA-256 via Node crypto (imported at top)
function hashPin(pin: string): string {
  return createHash("sha256").update(`maison-hd-pin:${pin}`).digest("hex");
}

// GET current PIN config (never returns the hash)
router.get("/admin-pin", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const r = await pool().query(
      `SELECT id, actions, created_at, updated_at FROM fb_admin_pins WHERE organization_id = $1`,
      [orgId]
    );
    if (!r.rows.length) return res.json({ pin: null });
    res.json({ pin: { ...r.rows[0], is_set: true } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST set/update PIN
router.post("/admin-pin", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const { pin, actions } = req.body;
    if (!pin || !/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: "PIN має бути від 4 до 6 цифр" });
    const hash = hashPin(pin);
    const acts = Array.isArray(actions) ? actions : ["cancel_order", "apply_discount", "open_shift", "delete_item"];
    await pool().query(`
      INSERT INTO fb_admin_pins (organization_id, pin_hash, actions)
      VALUES ($1, $2, $3)
      ON CONFLICT (organization_id)
      DO UPDATE SET pin_hash = $2, actions = $3, updated_at = NOW()
    `, [orgId, hash, acts]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST verify PIN (used by POS/front-office)
router.post("/admin-pin/verify", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: "pin required" });
    const r = await pool().query(
      `SELECT pin_hash, actions FROM fb_admin_pins WHERE organization_id = $1`,
      [orgId]
    );
    if (!r.rows.length) return res.json({ valid: false, reason: "no_pin_set" });
    const valid = r.rows[0].pin_hash === hashPin(pin);
    res.json({ valid, actions: valid ? r.rows[0].actions : [] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE remove PIN
router.delete("/admin-pin", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    await pool().query(`DELETE FROM fb_admin_pins WHERE organization_id = $1`, [orgId]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
