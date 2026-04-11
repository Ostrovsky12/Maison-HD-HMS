import { Router } from "express";
import { db } from "@workspace/db";
import { legalEntitiesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
const getOrg = (req: any): number => (req as any).user?.organizationId;

// ── List ──────────────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    if (!orgId) return res.status(403).json({ error: "No organization" });
    const db_ = (db as any).$client;
    const r = await db_.query(
      `SELECT * FROM legal_entities WHERE organization_id = $1 AND is_active = true ORDER BY is_default DESC, name`,
      [orgId]
    );
    res.json({ legalEntities: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    if (!orgId) return res.status(403).json({ error: "No organization" });
    const {
      name, type = "fop", edrpou, iban, bank, mfo, address,
      liqpayPublicKey, liqpayPrivateKey, fondyMerchantId, fondySecretKey,
      isDefault = false, categoryIds = [], handlesAlcohol = false, notes,
      ipn, vatNumber, isVatPayer, director, accountant, phone, email,
      legalAddress, actualAddress, shortName, fullName,
    } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const db_ = (db as any).$client;
    if (isDefault) {
      await db_.query(`UPDATE legal_entities SET is_default = false WHERE organization_id = $1`, [orgId]);
    }
    const r = await db_.query(`
      INSERT INTO legal_entities (
        organization_id, name, type, edrpou, iban, bank, mfo, address,
        liqpay_public_key, liqpay_private_key, fondy_merchant_id, fondy_secret_key,
        is_default, category_ids, handles_alcohol, notes,
        ipn, vat_number, is_vat_payer, director, accountant, phone, email,
        legal_address, actual_address, short_name, full_name
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
      RETURNING *
    `, [
      orgId, name, type, edrpou||null, iban||null, bank||null, mfo||null, address||null,
      liqpayPublicKey||null, liqpayPrivateKey||null, fondyMerchantId||null, fondySecretKey||null,
      isDefault, JSON.stringify(categoryIds), handlesAlcohol, notes||null,
      ipn||null, vatNumber||null, isVatPayer||false, director||null, accountant||null,
      phone||null, email||null, legalAddress||null, actualAddress||null, shortName||null, fullName||null,
    ]);
    res.status(201).json({ entity: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Update ────────────────────────────────────────────────────────────────────
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    if (!orgId) return res.status(403).json({ error: "No organization" });
    const id = Number(req.params.id);
    const {
      name, type, edrpou, iban, bank, mfo, address,
      liqpayPublicKey, liqpayPrivateKey, fondyMerchantId, fondySecretKey,
      isDefault, isActive, categoryIds, handlesAlcohol, notes,
      ipn, vatNumber, isVatPayer, director, accountant, phone, email,
      legalAddress, actualAddress, shortName, fullName,
    } = req.body;
    const db_ = (db as any).$client;
    if (isDefault) {
      await db_.query(`UPDATE legal_entities SET is_default = false WHERE organization_id = $1`, [orgId]);
    }
    const r = await db_.query(`
      UPDATE legal_entities SET
        name             = COALESCE($1, name),
        type             = COALESCE($2, type),
        edrpou           = COALESCE($3, edrpou),
        iban             = COALESCE($4, iban),
        bank             = COALESCE($5, bank),
        mfo              = COALESCE($6, mfo),
        address          = COALESCE($7, address),
        liqpay_public_key = COALESCE($8, liqpay_public_key),
        liqpay_private_key = COALESCE($9, liqpay_private_key),
        fondy_merchant_id = COALESCE($10, fondy_merchant_id),
        fondy_secret_key  = COALESCE($11, fondy_secret_key),
        is_default       = COALESCE($12, is_default),
        is_active        = COALESCE($13, is_active),
        category_ids     = COALESCE($14, category_ids),
        handles_alcohol  = COALESCE($15, handles_alcohol),
        notes            = COALESCE($16, notes),
        ipn              = COALESCE($17, ipn),
        vat_number       = COALESCE($18, vat_number),
        is_vat_payer     = COALESCE($19, is_vat_payer),
        director         = COALESCE($20, director),
        accountant       = COALESCE($21, accountant),
        phone            = COALESCE($22, phone),
        email            = COALESCE($23, email),
        legal_address    = COALESCE($24, legal_address),
        actual_address   = COALESCE($25, actual_address),
        short_name       = COALESCE($26, short_name),
        full_name        = COALESCE($27, full_name),
        updated_at       = NOW()
      WHERE id = $28 AND organization_id = $29 RETURNING *
    `, [
      name||null, type||null, edrpou||null, iban||null, bank||null, mfo||null, address||null,
      liqpayPublicKey||null, liqpayPrivateKey||null, fondyMerchantId||null, fondySecretKey||null,
      isDefault ?? null, isActive ?? null,
      categoryIds !== undefined ? JSON.stringify(categoryIds) : null,
      handlesAlcohol ?? null, notes||null,
      ipn||null, vatNumber||null, isVatPayer ?? null, director||null, accountant||null,
      phone||null, email||null, legalAddress||null, actualAddress||null, shortName||null, fullName||null,
      id, orgId,
    ]);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ entity: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Delete (soft) ─────────────────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const id = Number(req.params.id);
    const db_ = (db as any).$client;
    await db_.query(`UPDATE legal_entities SET is_active = false, updated_at = NOW() WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
