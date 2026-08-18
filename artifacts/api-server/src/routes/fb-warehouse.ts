import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();
router.use(requireAuth);
const org = (req: any): number => req.user.organizationId;
const uid = (req: any): number => req.user.userId;

// ═══════════════════════════════════════════════════════════════════════════
// COST ACCOUNTING BRIDGE — автоматичні бухгалтерські проводки для складу
// НП(С)БО 9 «Запаси»: 281 Товари, 631 Пост., 902 СВОТ, 947 Нестача, 719 Надлишок
// ═══════════════════════════════════════════════════════════════════════════

async function ensureAccPeriodWH(db_: any, orgId: number, dateStr: string): Promise<number | null> {
  const d = new Date(dateStr);
  const year = d.getFullYear(), month = d.getMonth() + 1;
  const { rows } = await db_.query(
    `SELECT id FROM acc_periods WHERE organization_id=$1 AND year=$2 AND month=$3 LIMIT 1`,
    [orgId, year, month]
  );
  if (rows[0]) return rows[0].id;
  const { rows: ins } = await db_.query(
    `INSERT INTO acc_periods (organization_id, year, month, status)
     VALUES ($1,$2,$3,'open') ON CONFLICT DO NOTHING RETURNING id`,
    [orgId, year, month]
  );
  if (ins[0]) return ins[0].id;
  const { rows: sel2 } = await db_.query(
    `SELECT id FROM acc_periods WHERE organization_id=$1 AND year=$2 AND month=$3 LIMIT 1`,
    [orgId, year, month]
  );
  return sel2[0]?.id ?? null;
}

async function getAccIdWH(db_: any, orgId: number, code: string): Promise<number | null> {
  const { rows } = await db_.query(
    `SELECT id FROM acc_accounts WHERE organization_id=$1 AND code=$2 LIMIT 1`,
    [orgId, code]
  );
  return rows[0]?.id ?? null;
}

async function postInventoryEntry(db_: any, params: {
  orgId: number; dateStr: string;
  debitCode: string; creditCode: string;
  amount: number; description: string; userId: number;
}): Promise<number | null> {
  if (params.amount < 0.01) return null;
  try {
    const periodId = await ensureAccPeriodWH(db_, params.orgId, params.dateStr);
    if (!periodId) return null;
    const debitId  = await getAccIdWH(db_, params.orgId, params.debitCode);
    const creditId = await getAccIdWH(db_, params.orgId, params.creditCode);
    if (!debitId || !creditId) return null;
    const { rows } = await db_.query(`
      INSERT INTO acc_entries
        (organization_id, entry_date, period_id, debit_account_id, credit_account_id,
         amount, currency, description, is_manual, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,'UAH',$7,false,$8) RETURNING id`,
      [params.orgId, params.dateStr, periodId, debitId, creditId,
       params.amount, params.description, params.userId]
    );
    return rows[0]?.id ?? null;
  } catch {
    return null; // ніколи не ламає складську операцію через бухгалтерію
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIERS — Постачальники
// ═══════════════════════════════════════════════════════════════════════════

router.get("/suppliers", async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT s.*, COUNT(i.id) AS ingredient_count
      FROM fb_suppliers s
      LEFT JOIN fb_ingredients i ON i.supplier_id = s.id AND i.is_active = true
      WHERE s.organization_id = ${org(req)} AND s.is_active = true
      GROUP BY s.id ORDER BY s.name
    `);
    res.json({ suppliers: result.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/suppliers", async (req, res) => {
  try {
    const { name, contact_name, phone, email, address, edrpou, ipn, is_vat_payer, payment_terms, delivery_days, notes } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const r = await db.execute(sql`
      INSERT INTO fb_suppliers (organization_id, name, contact_name, phone, email, address, edrpou, ipn, is_vat_payer, payment_terms, delivery_days, notes)
      VALUES (${org(req)}, ${name}, ${contact_name || null}, ${phone || null}, ${email || null}, ${address || null}, ${edrpou || null}, ${ipn || null}, ${is_vat_payer || false}, ${payment_terms || "готівка"}, ${delivery_days || 1}, ${notes || null})
      RETURNING *
    `);
    res.json({ supplier: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/suppliers/:id", async (req, res) => {
  try {
    const { name, contact_name, phone, email, address, edrpou, ipn, is_vat_payer, payment_terms, delivery_days, notes } = req.body;
    const r = await db.execute(sql`
      UPDATE fb_suppliers SET
        name = COALESCE(${name || null}, name),
        contact_name = COALESCE(${contact_name || null}, contact_name),
        phone = COALESCE(${phone || null}, phone),
        email = COALESCE(${email || null}, email),
        address = COALESCE(${address || null}, address),
        edrpou = COALESCE(${edrpou || null}, edrpou),
        ipn = COALESCE(${ipn || null}, ipn),
        is_vat_payer = COALESCE(${is_vat_payer ?? null}, is_vat_payer),
        payment_terms = COALESCE(${payment_terms || null}, payment_terms),
        delivery_days = COALESCE(${delivery_days ?? null}, delivery_days),
        notes = COALESCE(${notes || null}, notes),
        updated_at = NOW()
      WHERE id = ${parseInt(req.params.id)} AND organization_id = ${org(req)}
      RETURNING *
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ supplier: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/suppliers/:id", async (req, res) => {
  try {
    await db.execute(sql`UPDATE fb_suppliers SET is_active = false, updated_at = NOW() WHERE id = ${parseInt(req.params.id)} AND organization_id = ${org(req)}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// INGREDIENTS — Інгредієнти / Склад
// ═══════════════════════════════════════════════════════════════════════════

router.get("/ingredients", async (req, res) => {
  try {
    const { search, category, low_stock } = req.query;
    const searchVal = search ? `%${search}%` : null;
    const catVal = category || null;
    const lowStockOnly = low_stock === "true";
    const result = await db.execute(sql`
      SELECT i.*, s.name AS supplier_name
      FROM fb_ingredients i
      LEFT JOIN fb_suppliers s ON s.id = i.supplier_id
      WHERE i.organization_id = ${org(req)} AND i.is_active = true
        AND (${searchVal}::text IS NULL OR i.name ILIKE ${searchVal})
        AND (${catVal}::text IS NULL OR i.category = ${catVal})
        AND (NOT ${lowStockOnly} OR i.current_stock <= i.min_stock)
      ORDER BY i.category NULLS LAST, i.name
    `);
    res.json({ ingredients: result.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/ingredients", async (req, res) => {
  try {
    const { name, unit, category, current_stock, min_stock, cost_per_unit, supplier_id, barcode } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const r = await db.execute(sql`
      INSERT INTO fb_ingredients (organization_id, name, unit, category, current_stock, min_stock, cost_per_unit, supplier_id, barcode)
      VALUES (${org(req)}, ${name}, ${unit || "кг"}, ${category || null}, ${current_stock || 0}, ${min_stock || 0}, ${cost_per_unit || 0}, ${supplier_id || null}, ${barcode || null})
      RETURNING *
    `);
    res.json({ ingredient: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/ingredients/:id", async (req, res) => {
  try {
    const { name, unit, category, current_stock, min_stock, cost_per_unit, supplier_id, barcode } = req.body;
    const r = await db.execute(sql`
      UPDATE fb_ingredients SET
        name = COALESCE(${name || null}, name),
        unit = COALESCE(${unit || null}, unit),
        category = COALESCE(${category || null}, category),
        current_stock = COALESCE(${current_stock ?? null}, current_stock),
        min_stock = COALESCE(${min_stock ?? null}, min_stock),
        cost_per_unit = COALESCE(${cost_per_unit ?? null}, cost_per_unit),
        supplier_id = COALESCE(${supplier_id ?? null}, supplier_id),
        barcode = COALESCE(${barcode || null}, barcode),
        updated_at = NOW()
      WHERE id = ${parseInt(req.params.id)} AND organization_id = ${org(req)}
      RETURNING *
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ ingredient: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/ingredients/:id", async (req, res) => {
  try {
    await db.execute(sql`UPDATE fb_ingredients SET is_active = false, updated_at = NOW() WHERE id = ${parseInt(req.params.id)} AND organization_id = ${org(req)}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// RECIPE CARDS — Технологічні карти
// ═══════════════════════════════════════════════════════════════════════════

router.get("/recipes", async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT rc.*, fi.name AS menu_item_name, fi.price AS menu_item_price,
        CASE WHEN fi.price > 0 AND rc.cost_per_portion > 0
          THEN ROUND((1 - rc.cost_per_portion / fi.price::numeric) * 100, 1)
          ELSE NULL END AS margin_pct
      FROM fb_recipe_cards rc
      LEFT JOIN fb_items fi ON fi.id = rc.menu_item_id
      WHERE rc.organization_id = ${org(req)} AND rc.is_active = true
      ORDER BY rc.name
    `);
    res.json({ recipes: result.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/recipes/:id", async (req, res) => {
  try {
    const [recipe] = (await db.execute(sql`
      SELECT rc.*, fi.name AS menu_item_name, fi.price AS menu_item_price
      FROM fb_recipe_cards rc
      LEFT JOIN fb_items fi ON fi.id = rc.menu_item_id
      WHERE rc.id = ${parseInt(req.params.id)} AND rc.organization_id = ${org(req)}
    `)).rows as any[];
    if (!recipe) return res.status(404).json({ error: "Not found" });

    const items = (await db.execute(sql`
      SELECT rci.*, i.name AS ingredient_name, i.unit AS ingredient_unit, i.cost_per_unit
      FROM fb_recipe_card_items rci
      JOIN fb_ingredients i ON i.id = rci.ingredient_id
      WHERE rci.recipe_id = ${parseInt(req.params.id)}
      ORDER BY rci.id
    `)).rows;

    res.json({ recipe, items });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/recipes", async (req, res) => {
  try {
    const { menu_item_id, name, yield_quantity, yield_unit, prep_time_min, cook_time_min, technology, notes,
      nutrition_proteins, nutrition_fats, nutrition_carbs, nutrition_calories, markup_pct, storage_temp, storage_days, allergens, card_number } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const r = await db.execute(sql`
      INSERT INTO fb_recipe_cards (organization_id, menu_item_id, name, yield_quantity, yield_unit, prep_time_min, cook_time_min, technology, notes,
        nutrition_proteins, nutrition_fats, nutrition_carbs, nutrition_calories, markup_pct, storage_temp, storage_days, allergens, card_number)
      VALUES (${org(req)}, ${menu_item_id || null}, ${name}, ${yield_quantity || 1}, ${yield_unit || "пор"},
        ${prep_time_min || 15}, ${cook_time_min || 15}, ${technology || null}, ${notes || null},
        ${nutrition_proteins ?? null}, ${nutrition_fats ?? null}, ${nutrition_carbs ?? null}, ${nutrition_calories ?? null},
        ${markup_pct ?? 200}, ${storage_temp || null}, ${storage_days ?? null}, ${allergens || null}, ${card_number || null})
      RETURNING *
    `);
    res.json({ recipe: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/recipes/:id", async (req, res) => {
  try {
    const { menu_item_id, name, yield_quantity, yield_unit, prep_time_min, cook_time_min, technology, notes,
      nutrition_proteins, nutrition_fats, nutrition_carbs, nutrition_calories, markup_pct, storage_temp, storage_days, allergens, card_number } = req.body;
    const r = await db.execute(sql`
      UPDATE fb_recipe_cards SET
        menu_item_id = COALESCE(${menu_item_id ?? null}, menu_item_id),
        name = COALESCE(${name || null}, name),
        yield_quantity = COALESCE(${yield_quantity ?? null}, yield_quantity),
        yield_unit = COALESCE(${yield_unit || null}, yield_unit),
        prep_time_min = COALESCE(${prep_time_min ?? null}, prep_time_min),
        cook_time_min = COALESCE(${cook_time_min ?? null}, cook_time_min),
        technology = COALESCE(${technology || null}, technology),
        notes = COALESCE(${notes || null}, notes),
        nutrition_proteins = COALESCE(${nutrition_proteins ?? null}, nutrition_proteins),
        nutrition_fats = COALESCE(${nutrition_fats ?? null}, nutrition_fats),
        nutrition_carbs = COALESCE(${nutrition_carbs ?? null}, nutrition_carbs),
        nutrition_calories = COALESCE(${nutrition_calories ?? null}, nutrition_calories),
        markup_pct = COALESCE(${markup_pct ?? null}, markup_pct),
        storage_temp = COALESCE(${storage_temp || null}, storage_temp),
        storage_days = COALESCE(${storage_days ?? null}, storage_days),
        allergens = COALESCE(${allergens || null}, allergens),
        card_number = COALESCE(${card_number || null}, card_number),
        updated_at = NOW()
      WHERE id = ${parseInt(req.params.id)} AND organization_id = ${org(req)}
      RETURNING *
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ recipe: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/recipes/:id", async (req, res) => {
  try {
    await db.execute(sql`UPDATE fb_recipe_cards SET is_active = false, updated_at = NOW() WHERE id = ${parseInt(req.params.id)} AND organization_id = ${org(req)}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Recipe items
router.put("/recipes/:id/items", async (req, res) => {
  try {
    const recipeId = parseInt(req.params.id);
    const { items } = req.body as { items: Array<{ ingredient_id: number; gross_quantity: number; net_quantity: number; unit: string; loss_pct?: number; notes?: string }> };

    await db.execute(sql`DELETE FROM fb_recipe_card_items WHERE recipe_id = ${recipeId}`);
    let totalCost = 0;
    for (const item of items || []) {
      await db.execute(sql`
        INSERT INTO fb_recipe_card_items (recipe_id, ingredient_id, gross_quantity, net_quantity, unit, loss_pct, notes)
        VALUES (${recipeId}, ${item.ingredient_id}, ${item.gross_quantity}, ${item.net_quantity}, ${item.unit}, ${item.loss_pct || 0}, ${item.notes || null})
      `);
      const [ing] = (await db.execute(sql`SELECT cost_per_unit FROM fb_ingredients WHERE id = ${item.ingredient_id}`)).rows as any[];
      if (ing) totalCost += parseFloat(ing.cost_per_unit || 0) * item.net_quantity;
    }

    await db.execute(sql`UPDATE fb_recipe_cards SET cost_per_portion = ${totalCost}, updated_at = NOW() WHERE id = ${recipeId}`);
    res.json({ success: true, cost_per_portion: totalCost });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// STOCK RECEIPTS — Накладні (приходи)
// ═══════════════════════════════════════════════════════════════════════════

router.get("/receipts", async (req, res) => {
  try {
    const { status, supplier_id, payment_type, date_from, date_to } = req.query;
    const statusVal = status || null;
    const supplierVal = supplier_id ? parseInt(supplier_id as string) : null;
    const paymentVal = payment_type || null;
    const dateFromVal = date_from || null;
    const dateToVal = date_to || null;

    const result = await db.execute(sql`
      SELECT sr.*, s.name AS supplier_name,
        COUNT(sri.id) AS item_count
      FROM fb_stock_receipts sr
      LEFT JOIN fb_suppliers s ON s.id = sr.supplier_id
      LEFT JOIN fb_stock_receipt_items sri ON sri.receipt_id = sr.id
      WHERE sr.organization_id = ${org(req)}
        AND (${statusVal}::text IS NULL OR sr.status = ${statusVal})
        AND (${supplierVal}::int IS NULL OR sr.supplier_id = ${supplierVal})
        AND (${paymentVal}::text IS NULL OR sr.payment_type = ${paymentVal})
        AND (${dateFromVal}::date IS NULL OR sr.receipt_date >= ${dateFromVal}::date)
        AND (${dateToVal}::date IS NULL OR sr.receipt_date <= ${dateToVal}::date)
      GROUP BY sr.id, s.name
      ORDER BY sr.receipt_date DESC, sr.created_at DESC
    `);

    const debtResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN payment_type = 'unpaid' THEN total_amount ELSE 0 END), 0) AS total_unpaid,
        COALESCE(SUM(CASE WHEN payment_type = 'cash' THEN total_amount ELSE 0 END), 0) AS total_cash,
        COALESCE(SUM(CASE WHEN payment_type = 'bank' THEN total_amount ELSE 0 END), 0) AS total_bank,
        COUNT(CASE WHEN payment_type = 'unpaid' THEN 1 END) AS count_unpaid
      FROM fb_stock_receipts
      WHERE organization_id = ${org(req)} AND status != 'cancelled'
    `);

    res.json({ receipts: result.rows, summary: debtResult.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/receipts/:id", async (req, res) => {
  try {
    const [receipt] = (await db.execute(sql`
      SELECT sr.*, s.name AS supplier_name
      FROM fb_stock_receipts sr
      LEFT JOIN fb_suppliers s ON s.id = sr.supplier_id
      WHERE sr.id = ${parseInt(req.params.id)} AND sr.organization_id = ${org(req)}
    `)).rows as any[];
    if (!receipt) return res.status(404).json({ error: "Not found" });

    const items = (await db.execute(sql`
      SELECT sri.*, i.name AS ingredient_name, i.unit AS ingredient_unit, i.current_stock
      FROM fb_stock_receipt_items sri
      LEFT JOIN fb_ingredients i ON i.id = sri.ingredient_id
      WHERE sri.receipt_id = ${parseInt(req.params.id)}
      ORDER BY sri.id
    `)).rows;

    res.json({ receipt, items });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/receipts", async (req, res) => {
  try {
    const { supplier_id, receipt_no, receipt_date, notes, invoice_image, payment_type } = req.body;
    const r = await db.execute(sql`
      INSERT INTO fb_stock_receipts (organization_id, supplier_id, receipt_no, receipt_date, notes, invoice_image, created_by, payment_type)
      VALUES (${org(req)}, ${supplier_id || null}, ${receipt_no || null}, ${receipt_date || new Date().toISOString().split("T")[0]}, ${notes || null}, ${invoice_image || null}, ${uid(req)}, ${payment_type || "unpaid"})
      RETURNING id, organization_id, supplier_id, receipt_no, receipt_date, notes, status, total_amount, payment_type, created_at
    `);
    res.json({ receipt: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/receipts/:id", async (req, res) => {
  try {
    const { supplier_id, receipt_no, receipt_date, notes, status, payment_type, invoice_image } = req.body;
    const r = await db.execute(sql`
      UPDATE fb_stock_receipts SET
        supplier_id = COALESCE(${supplier_id ?? null}, supplier_id),
        receipt_no = COALESCE(${receipt_no || null}, receipt_no),
        receipt_date = COALESCE(${receipt_date || null}::date, receipt_date),
        notes = COALESCE(${notes || null}, notes),
        status = COALESCE(${status || null}, status),
        payment_type = COALESCE(${payment_type || null}, payment_type),
        invoice_image = CASE WHEN ${invoice_image !== undefined} THEN ${invoice_image || null} ELSE invoice_image END,
        updated_at = NOW()
      WHERE id = ${parseInt(req.params.id)} AND organization_id = ${org(req)}
      RETURNING *
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ receipt: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Add items to receipt
router.put("/receipts/:id/items", async (req, res) => {
  try {
    const receiptId = parseInt(req.params.id);
    const orgId = org(req);
    // Verify receipt belongs to caller's org before modifying its items
    const [receiptCheck] = (await db.execute(sql`
      SELECT id FROM fb_stock_receipts WHERE id = ${receiptId} AND organization_id = ${orgId}
    `)).rows;
    if (!receiptCheck) return res.status(403).json({ error: "Forbidden" });

    const { items } = req.body as { items: Array<{
      ingredient_id?: number; name: string;
      quantity: number; unit: string;
      receipt_unit?: string; conversion_factor?: number;
      price_per_unit: number; vat_rate?: number;
      is_new_ingredient?: boolean; match_confidence?: number;
    }> };

    await db.execute(sql`DELETE FROM fb_stock_receipt_items WHERE receipt_id = ${receiptId}`);
    let total = 0;
    let vat = 0;
    for (const item of items || []) {
      const vatRate = item.vat_rate ?? 20;
      const conv = item.conversion_factor && item.conversion_factor > 0 ? item.conversion_factor : 1;
      const rcptUnit = item.receipt_unit || item.unit;
      const totalPrice = item.quantity * item.price_per_unit;
      const vatAmount = totalPrice * vatRate / (100 + vatRate);
      total += totalPrice;
      vat += vatAmount;

      const itemType = item.item_type === "product" ? "product" : "ingredient";

      // Create new ingredient on save (only for ingredient-type items, not products)
      let ingredientId = item.ingredient_id || null;
      if (itemType === "ingredient" && !ingredientId && item.is_new_ingredient) {
        const created = await db.execute(sql`
          INSERT INTO fb_ingredients (organization_id, name, unit, cost_per_unit)
          VALUES (${orgId}, ${item.name}, ${item.unit || "кг"}, ${item.price_per_unit || 0})
          RETURNING id
        `);
        ingredientId = (created.rows[0] as any)?.id || null;
      }
      // Products don't link to ingredients
      if (itemType === "product") ingredientId = null;

      await db.execute(sql`
        INSERT INTO fb_stock_receipt_items
          (receipt_id, ingredient_id, name, quantity, unit, receipt_unit, conversion_factor,
           price_per_unit, total_price, vat_rate, vat_amount, is_new_ingredient, match_confidence, item_type)
        VALUES (${receiptId}, ${ingredientId}, ${item.name}, ${item.quantity},
                ${item.unit}, ${rcptUnit}, ${conv},
                ${item.price_per_unit}, ${totalPrice}, ${vatRate}, ${vatAmount},
                ${itemType === "ingredient" ? (item.is_new_ingredient || false) : false},
                ${item.match_confidence ?? null}, ${itemType})
      `);
    }
    await db.execute(sql`UPDATE fb_stock_receipts SET total_amount = ${total}, vat_amount = ${vat}, updated_at = NOW() WHERE id = ${receiptId} AND organization_id = ${orgId}`);
    res.json({ success: true, total_amount: total, vat_amount: vat });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Confirm receipt → update stock levels
router.post("/receipts/:id/confirm", async (req, res) => {
  try {
    const receiptId = parseInt(req.params.id);
    const orgId = org(req);
    const db_ = (db as any).$client;
    const [receipt] = (await db.execute(sql`SELECT * FROM fb_stock_receipts WHERE id = ${receiptId} AND organization_id = ${orgId}`)).rows as any[];
    if (!receipt) return res.status(404).json({ error: "Not found" });
    if (receipt.status === "confirmed") return res.status(400).json({ error: "Already confirmed" });

    const items = (await db.execute(sql`SELECT * FROM fb_stock_receipt_items WHERE receipt_id = ${receiptId}`)).rows as any[];

    const summary: any[] = [];
    let totalReceiptAmount = 0;

    for (const item of items) {
      if (!item.ingredient_id || item.item_type === "product") continue;
      // conversion_factor: скільки базових одиниць у 1 одиниці приходу
      const conv = parseFloat(item.conversion_factor) > 0 ? parseFloat(item.conversion_factor) : 1;
      const stockAdded = parseFloat(item.quantity) * conv;
      const costPerBaseUnit = parseFloat(item.price_per_unit) / conv;

      // WAC (Weighted Average Cost / Метод середньозваженої собівартості — НП(С)БО 9 п.18)
      const prevRow = await db_.query(
        `SELECT current_stock, cost_per_unit FROM fb_ingredients WHERE id=$1`, [item.ingredient_id]
      );
      const prev = prevRow.rows[0];
      const prevStock = parseFloat(prev?.current_stock ?? 0);
      const prevCost  = parseFloat(prev?.cost_per_unit  ?? 0);
      const newTotalStock = prevStock + stockAdded;
      const wacCost = newTotalStock > 0
        ? (prevStock * prevCost + stockAdded * costPerBaseUnit) / newTotalStock
        : costPerBaseUnit;

      await db.execute(sql`
        UPDATE fb_ingredients SET
          current_stock = current_stock + ${stockAdded},
          cost_per_unit = ${Math.round(wacCost * 10000) / 10000},
          updated_at = NOW()
        WHERE id = ${item.ingredient_id}
      `);

      const lineAmount = parseFloat(item.price_per_unit) * parseFloat(item.quantity);
      totalReceiptAmount += lineAmount;
      summary.push({
        ingredient_id: item.ingredient_id, name: item.name,
        stock_added: stockAdded, base_unit: item.unit,
        cost_per_unit: costPerBaseUnit, wac_cost: Math.round(wacCost * 10000) / 10000,
        line_amount: lineAmount,
      });
    }

    await db.execute(sql`
      UPDATE fb_stock_receipts SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
      WHERE id = ${receiptId} AND organization_id = ${orgId}
    `);

    // Бухгалтерська проводка: Дт 281 Товари → Кт 631 Розрахунки з постачальниками
    const receiptDate = receipt.receipt_date
      ? new Date(receipt.receipt_date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const accEntryId = await postInventoryEntry(db_, {
      orgId, dateStr: receiptDate,
      debitCode: "281", creditCode: "631",
      amount: Math.round(totalReceiptAmount * 100) / 100,
      description: `Прихід товарів від постачальника: ${receipt.notes || `накладна #${receiptId}`}`,
      userId: uid(req),
    });

    res.json({ success: true, summary, acc_entry_id: accEntryId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Cancel (storno) confirmed receipt → reverse stock changes
router.post("/receipts/:id/cancel", async (req, res) => {
  try {
    const receiptId = parseInt(req.params.id);
    const orgId = org(req);
    const db_ = (db as any).$client;
    const [receipt] = (await db.execute(sql`
      SELECT * FROM fb_stock_receipts WHERE id = ${receiptId} AND organization_id = ${orgId}
    `)).rows as any[];
    if (!receipt) return res.status(404).json({ error: "Not found" });
    if (receipt.status === "cancelled") return res.status(400).json({ error: "Already cancelled" });
    if (receipt.status === "draft") {
      // For drafts: just mark cancelled, no stock to reverse
      await db.execute(sql`UPDATE fb_stock_receipts SET status = 'cancelled', updated_at = NOW() WHERE id = ${receiptId}`);
      return res.json({ success: true, reversed: [] });
    }

    // For confirmed: reverse stock changes
    const items = (await db.execute(sql`SELECT * FROM fb_stock_receipt_items WHERE receipt_id = ${receiptId}`)).rows as any[];
    const reversed: any[] = [];
    let totalReversed = 0;

    for (const item of items) {
      if (!item.ingredient_id || item.item_type === "product") continue;
      const conv = parseFloat(item.conversion_factor) > 0 ? parseFloat(item.conversion_factor) : 1;
      const stockToRemove = parseFloat(item.quantity) * conv;

      // Check current stock won't go below zero (warn but allow)
      const prevRow = await db_.query(
        `SELECT current_stock, cost_per_unit FROM fb_ingredients WHERE id=$1`, [item.ingredient_id]
      );
      const prev = prevRow.rows[0];
      const prevStock = parseFloat(prev?.current_stock ?? 0);
      const newStock = Math.max(0, prevStock - stockToRemove); // floor at 0

      await db.execute(sql`
        UPDATE fb_ingredients SET
          current_stock = ${newStock},
          updated_at = NOW()
        WHERE id = ${item.ingredient_id}
      `);

      const lineAmount = parseFloat(item.price_per_unit) * parseFloat(item.quantity);
      totalReversed += lineAmount;
      reversed.push({ ingredient_id: item.ingredient_id, name: item.name, stock_removed: stockToRemove });
    }

    await db.execute(sql`
      UPDATE fb_stock_receipts SET status = 'cancelled', updated_at = NOW() WHERE id = ${receiptId} AND organization_id = ${orgId}
    `);

    // Reverse accounting entry: Дт 631 → Кт 281 (сторно)
    if (totalReversed > 0) {
      const receiptDate = receipt.receipt_date
        ? new Date(receipt.receipt_date).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      await postInventoryEntry(db_, {
        orgId, dateStr: receiptDate,
        debitCode: "631", creditCode: "281",
        amount: Math.round(totalReversed * 100) / 100,
        description: `Сторно приходу: ${receipt.notes || `накладна #${receiptId}`}`,
        userId: uid(req),
      });
    }

    res.json({ success: true, reversed, total_reversed: totalReversed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Fuzzy ingredient matching helper ────────────────────────────────────────
function ingredientFuzzyScore(name1: string, name2: string): number {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[^а-яёіїєa-z0-9\s]/gi, " ")
      .split(/\s+/)
      .filter(w => w.length > 1);
  const w1 = normalize(name1);
  const w2 = normalize(name2);
  if (!w1.length || !w2.length) return 0;
  let matches = 0;
  for (const a of w1) {
    for (const b of w2) {
      if (a === b) { matches++; break; }
      const pfxLen = Math.min(4, Math.min(a.length, b.length));
      if (pfxLen >= 3 && a.slice(0, pfxLen) === b.slice(0, pfxLen)) { matches++; break; }
    }
  }
  return Math.round((matches / Math.max(w1.length, w2.length)) * 100);
}

function findSimilarIngredients(name: string, existing: any[], topN = 4, minScore = 35) {
  return existing
    .map(i => ({ id: i.id, name: i.name, unit: i.unit, score: ingredientFuzzyScore(name, i.name) }))
    .filter(i => i.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// ─── AI Invoice Scanner ────────────────────────────────────────────────────
router.post("/receipts/ai-scan", async (req, res) => {
  try {
    const { text, image_base64, image_mime } = req.body;
    if (!text && !image_base64) return res.status(400).json({ error: "text or image_base64 required" });

    const orgId = org(req);

    // Get existing ingredients for fuzzy matching
    const existingIngredients = (await db.execute(sql`
      SELECT id, name, unit FROM fb_ingredients WHERE organization_id = ${orgId} AND is_active = true ORDER BY name
    `)).rows as any[];

    // Get existing suppliers
    const existingSuppliers = (await db.execute(sql`
      SELECT id, name, edrpou FROM fb_suppliers WHERE organization_id = ${orgId} AND is_active = true ORDER BY name
    `)).rows as any[];

    const ingredientsList = existingIngredients.map((i: any) => `${i.id}|${i.name}|${i.unit}`).join("\n");
    const suppliersList = existingSuppliers.map((s: any) => `${s.id}|${s.name}`).join("\n");

    let userContent: any;
    if (image_base64) {
      const mimeType = image_mime || "image/jpeg";
      userContent = [
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${image_base64}` } },
        { type: "text", text: "Розпізнай цю накладну (видаткову накладну, товарно-транспортну накладну або рахунок-фактуру) і витягни всі дані." }
      ];
    } else {
      userContent = text;
    }

    const systemPrompt = `Ти система розпізнавання накладних для ресторану/кафе в Україні.
Витягни з документу такі дані і поверни ТІЛЬКИ валідний JSON без markdown:
{
  "receipt_no": "номер накладної або null",
  "receipt_date": "YYYY-MM-DD або null",
  "supplier_name": "назва постачальника або null",
  "supplier_edrpou": "ЄДРПОУ або null",
  "total_amount": число або null,
  "items": [
    {
      "name": "назва товару як в документі",
      "quantity": число,
      "unit": "одиниця виміру в базових одиницях (кг/л/шт/пляш/упак)",
      "price_per_unit": ЦІНА З ПДВ за одиницю (колонка 'Ціна з ПДВ' або 'Ціна з вкл. ПДВ') — НЕ 'Ціна без ПДВ'. Якщо в документі лише одна колонка ціни — брати її. Якщо є обидві — обов'язково брати ту що з ПДВ (більша).
      "total_price": загальна сума З ПДВ (колонка 'Сума з ПДВ' або 'Разом з ПДВ') — НЕ 'Сума без ПДВ',
      "vat_rate": ставка ПДВ у % (20 якщо не вказано, 0 для звільнених),
      "pack_info": "опис упаковки якщо є, напр. '6×2л' або '10×900г', інакше null",
      "item_type": "ingredient або product"
    }
  ]
}

КРИТИЧНО: У накладних з колонками 'Ціна без ПДВ' та 'Ціна з ПДВ' — ЗАВЖДИ використовувати 'Ціна з ПДВ' як price_per_unit. Собівартість в ресторані розраховується з урахуванням ПДВ.

КРИТИЧНО ВАЖЛИВО — конвертація упаковок в базові одиниці:
Якщо у назві товару є мультипак/розфасовка (формати: "2Л-6", "2Л*6", "2Л×6", "2L x6", "900Г 10ШТ", "0.5Л 12ШТ" тощо):
  → quantity = кількість з накладної × кількість штук у упаковці × об'єм/вага одиниці (в базових одиницях)
  → unit = "л" для рідин (вода, молоко, соки, напої), "кг" для твердих продуктів (якщо в грамах — ділити на 1000)
  → price_per_unit залишається як в накладній (за упаковку/шт як зазначено)

Приклади конвертації:
- "ВОДА 2Л - 6" кількість 5 шт → quantity=60, unit="л" (5 паків × 6 пляш × 2л), pack_info="6×2л"
- "МОЛОКО 900Г 10ШТ" кількість 10 шт → quantity=9, unit="л" (10 × 0.9л), pack_info="10×900г"  
- "МОЛОКО 1000Г" кількість 36 шт → quantity=36, unit="л" (36 × 1л), pack_info="1×1000г"
- "КОЛА 0.33Л" кількість 99 пляш → quantity=99, unit="пляш" (штучний напій, залишаємо в пляшах)
- "ОЛІЯ 1Л" кількість 4 шт → quantity=4, unit="л"
- "БОРОШНО 2КГ" кількість 10 шт → quantity=20, unit="кг"
- "ЯЙЦЕ" кількість 14 шт → quantity=14, unit="шт" (штучний продукт без об'єму)

Правило конвертації: рідкі продукти (вода, молоко, сік, олія, кефір) → завжди в літрах; сипучі/тверді → в кг якщо є вага в назві; штучні (яйця, пляшки, контейнери) → в шт/пляш.

ВИЗНАЧЕННЯ ТИПУ (item_type):
- "ingredient" — сировина для кухні: молоко, борошно, олія, м'ясо, овочі, фрукти, спеції, вода у великих обсягах, алкоголь для коктейлів (горілка, ром, лікер), сиропи, соуси. Все що йде у рецептури і списується частково.
- "product" — готовий товар для продажу штучно: Cola 0.33л, пляшковий алкоголь у роздріб (вино 0.75л, пиво 0.5л), пакована вода для продажу (0.5л, 1л), готові снеки, цукерки, жуйки, контейнери, стакани. Все що продається "як є" без розбивки.
Правило: якщо порційна упаковка ≤ 0.5л (напій) або ≤ 500г (їжа) — зазвичай товар. Якщо велика тара (1.25л, 1л, 5л, 10кг мішок) без пак. форми — зазвичай інгредієнт. При сумніві — ingredient.

Знайди постачальника з цього списку (id|name):
${suppliersList || "список порожній"}

Для кожного товару знайди найближчий збіг з цього списку інгредієнтів (id|name|unit):
${ingredientsList || "список порожній"}

Додай до кожного item: 
- "ingredient_id": id з списку або null якщо не знайдено
- "match_confidence": від 0 до 100 (впевненість у збігу)
- "is_new_ingredient": true якщо ingredient_id = null
- "supplier_id": id постачальника або null`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 8000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    });

    let parsed: any = null;
    const raw = completion.choices[0].message.content || "";
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      return res.status(422).json({ error: "AI не зміг розпізнати документ", raw });
    }

    // Server-side fuzzy matching + suggestions (do NOT auto-create here — creation happens on save)
    const processedItems = [];
    for (const item of parsed.items || []) {
      const isNew = item.is_new_ingredient || !item.ingredient_id;
      if (isNew) {
        item.ingredient_id = null;
        item.is_new_ingredient = true;
        item.match_confidence = 0;
        // Find similar existing ingredients for the user to choose from
        const suggestions = findSimilarIngredients(item.name, existingIngredients);
        item.suggestions = suggestions;
        // If top suggestion is very confident (≥80%), pre-select it but mark as "suggested"
        if (suggestions.length > 0 && suggestions[0].score >= 80) {
          item.suggested_ingredient_id = suggestions[0].id;
          item.suggested_ingredient_name = suggestions[0].name;
        }
      } else {
        item.suggestions = [];
      }
      processedItems.push(item);
    }

    // Find matched supplier — bidirectional fuzzy + EDRPOU exact
    let matchedSupplierId = parsed.supplier_id || null;
    if (!matchedSupplierId && parsed.supplier_name) {
      const pName = parsed.supplier_name.toLowerCase().trim();
      const match = existingSuppliers.find((s: any) => {
        const sName = s.name.toLowerCase().trim();
        return (
          sName.includes(pName) ||
          pName.includes(sName) ||
          pName.split(" ").some((w: string) => w.length > 3 && sName.includes(w)) ||
          (parsed.supplier_edrpou && s.edrpou === parsed.supplier_edrpou)
        );
      });
      if (match) matchedSupplierId = match.id;
    }

    res.json({
      parsed: { ...parsed, items: processedItems, supplier_id: matchedSupplierId },
      new_ingredients_count: processedItems.filter((i: any) => i.is_new_ingredient).length,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── AI голосовий парсинг: накладна з голосу ────────────────────────────────
// Те саме що ai-scan але для тексту вже з SpeechRecognition браузера
// Повертає той же формат — можна перенаправити в existing AI review form
router.post("/receipts/ai-voice-receipt", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  // Reuse same logic as ai-scan but always with text
  req.body.text = text;
  req.body.image_base64 = null;
  // Forward to ai-scan logic inline (duplicating minimal code)
  try {
    const orgId = org(req);
    const existingIngredients = (await db.execute(sql`
      SELECT id, name, unit FROM fb_ingredients WHERE organization_id = ${orgId} AND is_active = true ORDER BY name
    `)).rows as any[];
    const existingSuppliers = (await db.execute(sql`
      SELECT id, name FROM fb_suppliers WHERE organization_id = ${orgId} AND is_active = true ORDER BY name
    `)).rows as any[];
    const ingredientsList = existingIngredients.map((i: any) => `${i.id}|${i.name}|${i.unit}`).join("\n");
    const suppliersList = existingSuppliers.map((s: any) => `${s.id}|${s.name}`).join("\n");

    const systemPrompt = `Ти система розпізнавання накладних для ресторану в Україні. Текст отриманий через голосовий ввід (може містити помилки розпізнавання). Витягни дані і поверни ТІЛЬКИ валідний JSON:
{"receipt_no":null,"receipt_date":"YYYY-MM-DD або сьогодні","supplier_name":null,"total_amount":null,"items":[{"name":"назва","quantity":число,"unit":"кг/л/шт/пляш","price_per_unit":0,"vat_rate":20,"ingredient_id":null,"match_confidence":0,"is_new_ingredient":true,"pack_info":null}]}
Сьогодні: ${new Date().toISOString().split("T")[0]}
Постачальники (id|name):\n${suppliersList || "—"}
Інгредієнти (id|name|unit):\n${ingredientsList || "—"}
Знайди збіги ingredient_id і supplier_id де можливо.
КОНВЕРТАЦІЯ УПАКОВОК: якщо у назві є розфасовка (напр. "2л*6", "900г 10шт") — конвертуй quantity в базові одиниці (л або кг). Приклад: "вода 2л пак 6" × 5 паків = 60л; "молоко 900г" × 10 шт = 9л. Рідини → л, тверді → кг.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 2000,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }]
    });
    const raw = completion.choices[0].message.content || "";
    let parsed: any;
    try { const m = raw.match(/\{[\s\S]*\}/); parsed = JSON.parse(m ? m[0] : raw); }
    catch { return res.status(422).json({ error: "Не вдалося розпізнати", raw }); }

    const processedItems = [];
    for (const item of parsed.items || []) {
      if (!item.ingredient_id) {
        const c = await db.execute(sql`INSERT INTO fb_ingredients (organization_id, name, unit, cost_per_unit) VALUES (${orgId}, ${item.name}, ${item.unit || "кг"}, ${item.price_per_unit || 0}) RETURNING id, name`);
        item.ingredient_id = (c.rows[0] as any).id;
        item.is_new_ingredient = true;
      }
      processedItems.push(item);
    }
    let matchedSupplierId = parsed.supplier_id || null;
    if (!matchedSupplierId && parsed.supplier_name) {
      const m = existingSuppliers.find((s: any) => s.name.toLowerCase().includes((parsed.supplier_name || "").toLowerCase().split(" ")[0]));
      if (m) matchedSupplierId = m.id;
    }
    res.json({ parsed: { ...parsed, items: processedItems, supplier_id: matchedSupplierId }, new_ingredients_count: processedItems.filter((i: any) => i.is_new_ingredient).length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── AI голосовий парсинг: ТЕХНОЛОГІЧНА КАРТА з голосу ─────────────────────
router.post("/recipes/ai-voice-recipe", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  try {
    const orgId = org(req);
    const existingIngredients = (await db.execute(sql`
      SELECT id, name, unit, cost_per_unit FROM fb_ingredients WHERE organization_id = ${orgId} AND is_active = true ORDER BY name
    `)).rows as any[];
    const ingredientsList = existingIngredients.map((i: any) => `${i.id}|${i.name}|${i.unit}`).join("\n");

    const systemPrompt = `Ти система голосового створення технологічних карт для ресторану в Україні.
Текст отримано через голосовий ввід (можуть бути помилки розпізнавання мови). Витягни дані про страву та поверни ТІЛЬКИ валідний JSON:
{
  "name": "назва страви",
  "yield_quantity": число,
  "yield_unit": "пор|кг|г|л|шт",
  "prep_time_min": число,
  "cook_time_min": число,
  "technology": "технологія приготування або null",
  "notes": "примітки або null",
  "items": [
    {
      "ingredient_id": число або null,
      "name": "назва інгредієнту",
      "gross_quantity": число,
      "net_quantity": число,
      "unit": "кг|г|л|мл|шт|пор|пач|упак",
      "loss_pct": число від 0 до 100
    }
  ]
}
Правила:
- yield_unit: "пор" якщо не вказано
- prep_time_min: час підготовки/нарізки (якщо не вказано — 15)
- cook_time_min: час термічної обробки (якщо не вказано — 30)
- gross_quantity: вага з урахуванням відходів (якщо loss_pct=0, то gross=net)
- net_quantity: чиста вага після обробки
- loss_pct: % відходів (цибуля ~10%, картопля ~25%, риба ~40%, зелень ~5%, стандарт ~0)
- Одиниці: г/кг (тверді), мл/л (рідкі), шт (штучні)
- Якщо вказано "200 грам" → gross_quantity=0.200, unit="кг"
- Якщо вказано "200г" або "200 г" → gross_quantity=0.200, unit="кг"
- Якщо вказано "2 штуки" → gross_quantity=2, unit="шт"
Інгредієнти бази (id|name|unit):\n${ingredientsList || "—"}
Зіставляй ingredient_id де можливо (нечутливо до регістру, часткове співпадіння назви).`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 2000,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }]
    });
    const raw = completion.choices[0].message.content || "";
    let parsed: any;
    try { const m = raw.match(/\{[\s\S]*\}/); parsed = JSON.parse(m ? m[0] : raw); }
    catch { return res.status(422).json({ error: "Не вдалося розпізнати — спробуйте ще раз", raw }); }

    // Enrich items with ingredient data (fuzzy match if no id)
    const enrichedItems = (parsed.items || []).map((item: any) => {
      let ing = item.ingredient_id
        ? existingIngredients.find((i: any) => i.id === item.ingredient_id)
        : null;
      if (!ing && item.name) {
        const nameLower = (item.name || "").toLowerCase();
        ing = existingIngredients.find((i: any) =>
          i.name.toLowerCase().includes(nameLower.slice(0, 5)) ||
          nameLower.includes(i.name.toLowerCase().slice(0, 5))
        );
      }
      const gross = parseFloat(item.gross_quantity) || 0;
      const lossPct = parseFloat(item.loss_pct) || 0;
      const net = item.net_quantity ? parseFloat(item.net_quantity) : +(gross * (1 - lossPct / 100)).toFixed(4);
      return {
        ingredient_id: (ing?.id || item.ingredient_id || "").toString(),
        name: item.name || ing?.name || "",
        gross_quantity: gross,
        net_quantity: net,
        unit: item.unit || ing?.unit || "кг",
        loss_pct: lossPct,
        cost_per_unit: ing?.cost_per_unit || 0,
        is_new_ingredient: !ing,
      };
    });

    res.json({ parsed: { ...parsed, items: enrichedItems } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── AI голосовий парсинг: СПИСАННЯ з голосу ────────────────────────────────
router.post("/ai-voice-writeoff", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  try {
    const orgId = org(req);
    const existingIngredients = (await db.execute(sql`
      SELECT id, name, unit, current_stock FROM fb_ingredients WHERE organization_id = ${orgId} AND is_active = true ORDER BY name
    `)).rows as any[];
    const ingredientsList = existingIngredients.map((i: any) => `${i.id}|${i.name}|${i.unit}`).join("\n");

    const systemPrompt = `Ти система голосового вводу актів списання для ресторану в Україні.
Текст отримано через голосовий ввід, можуть бути помилки. Визнач причину списання, дату та позиції.
Поверни ТІЛЬКИ JSON:
{
  "reason": "production|staff_meal|tasting|spoilage|expired|damage|other",
  "writeoff_date": "YYYY-MM-DD",
  "notes": "пояснення/коментар або null",
  "items": [{"ingredient_id": число або null, "name": "назва", "quantity": число, "unit": "кг/г/л/мл/шт/пляш"}]
}
Причини: production=виробниче списання, staff_meal=харчування штату, tasting=пропрацювання/дегустація, spoilage=псування, expired=прострочення, damage=пошкодження/бій, other=інше.
Сьогодні: ${new Date().toISOString().split("T")[0]}
Інгредієнти (id|name|unit):\n${ingredientsList || "—"}
Знайди ingredient_id де можливо.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 1000,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }]
    });
    const raw = completion.choices[0].message.content || "";
    let parsed: any;
    try { const m = raw.match(/\{[\s\S]*\}/); parsed = JSON.parse(m ? m[0] : raw); }
    catch { return res.status(422).json({ error: "Не вдалося розпізнати", raw }); }

    // Enrich items with ingredient data
    const enrichedItems = (parsed.items || []).map((item: any) => {
      const ing = item.ingredient_id
        ? existingIngredients.find((i: any) => i.id === item.ingredient_id)
        : existingIngredients.find((i: any) => i.name.toLowerCase().includes((item.name || "").toLowerCase().slice(0, 5)));
      return {
        ...item,
        ingredient_id: ing?.id || item.ingredient_id || "",
        unit: item.unit || ing?.unit || "кг",
        current_stock: ing?.current_stock || 0,
      };
    });
    res.json({ parsed: { ...parsed, items: enrichedItems } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /ai-voice-transfer — парсить голосовий текст для переміщення
router.post("/ai-voice-transfer", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  try {
    const orgId = org(req);
    const existingIngredients = (await db.execute(sql`
      SELECT id, name, unit, current_stock FROM fb_ingredients WHERE organization_id = ${orgId} AND is_active = true ORDER BY name
    `)).rows as any[];
    const ingredientsList = existingIngredients.map((i: any) => `${i.id}|${i.name}|${i.unit}`).join("\n");

    const systemPrompt = `Ти система голосового вводу для переміщення товарів між складами ресторану в Україні.
Текст отримано через голосовий ввід, можуть бути помилки. Визнач звідки, куди та позиції для переміщення.
Поверни ТІЛЬКИ JSON:
{
  "from_location": "назва складу-джерела або null",
  "to_location": "назва складу-призначення або null",
  "notes": "примітка або null",
  "items": [{"ingredient_id": число або null, "name": "назва", "quantity": число, "unit": "кг/г/л/мл/шт/пляш"}]
}
Сьогодні: ${new Date().toISOString().split("T")[0]}
Інгредієнти (id|name|unit):\n${ingredientsList || "—"}
Знайди ingredient_id де можливо.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_completion_tokens: 1000,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }]
    });
    const raw = completion.choices[0].message.content || "";
    let parsed: any;
    try { const m = raw.match(/\{[\s\S]*\}/); parsed = JSON.parse(m ? m[0] : raw); }
    catch { return res.status(422).json({ error: "Не вдалося розпізнати", raw }); }

    const enrichedItems = (parsed.items || []).map((item: any) => {
      const ing = item.ingredient_id
        ? existingIngredients.find((i: any) => i.id === item.ingredient_id)
        : existingIngredients.find((i: any) => i.name.toLowerCase().includes((item.name || "").toLowerCase().slice(0, 5)));
      return {
        ...item,
        ingredient_id: ing?.id || item.ingredient_id || "",
        unit: item.unit || ing?.unit || "кг",
      };
    });
    res.json({ parsed: { ...parsed, items: enrichedItems } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// WRITE-OFFS — Списання
// ═══════════════════════════════════════════════════════════════════════════

router.get("/writeoffs", async (req, res) => {
  try {
    const { status } = req.query;
    const statusVal = status || null;
    const result = await db.execute(sql`
      SELECT w.*, COUNT(wi.id) AS item_count
      FROM fb_stock_writeoffs w
      LEFT JOIN fb_stock_writeoff_items wi ON wi.writeoff_id = w.id
      WHERE w.organization_id = ${org(req)}
        AND (${statusVal}::text IS NULL OR w.status = ${statusVal})
      GROUP BY w.id
      ORDER BY w.writeoff_date DESC, w.created_at DESC
    `);
    res.json({ writeoffs: result.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/writeoffs/:id", async (req, res) => {
  try {
    const [writeoff] = (await db.execute(sql`
      SELECT * FROM fb_stock_writeoffs WHERE id = ${parseInt(req.params.id)} AND organization_id = ${org(req)}
    `)).rows as any[];
    if (!writeoff) return res.status(404).json({ error: "Not found" });

    const items = (await db.execute(sql`
      SELECT wi.*, i.name AS ingredient_name, i.unit AS ingredient_unit, i.current_stock
      FROM fb_stock_writeoff_items wi
      JOIN fb_ingredients i ON i.id = wi.ingredient_id
      WHERE wi.writeoff_id = ${parseInt(req.params.id)}
    `)).rows;

    res.json({ writeoff, items });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/writeoffs", async (req, res) => {
  try {
    const { writeoff_date, reason, notes, notes_detail, items } = req.body;
    if (!items?.length) return res.status(400).json({ error: "items required" });

    let total = 0;
    const r = await db.execute(sql`
      INSERT INTO fb_stock_writeoffs (organization_id, writeoff_date, reason, notes, notes_detail, created_by)
      VALUES (${org(req)}, ${writeoff_date || new Date().toISOString().split("T")[0]}, ${reason || "spoilage"}, ${notes || null}, ${notes_detail || null}, ${uid(req)})
      RETURNING *
    `);
    const writeoff = r.rows[0] as any;

    for (const item of items) {
      // Scope ingredient lookup to caller's org to prevent cross-tenant data reads
      const [ing] = (await db.execute(sql`
        SELECT cost_per_unit FROM fb_ingredients WHERE id = ${item.ingredient_id} AND organization_id = ${org(req)}
      `)).rows as any[];
      const costPerUnit = item.cost_per_unit || parseFloat(ing?.cost_per_unit || "0");
      const totalCost = item.quantity * costPerUnit;
      total += totalCost;
      await db.execute(sql`
        INSERT INTO fb_stock_writeoff_items (writeoff_id, ingredient_id, quantity, unit, cost_per_unit, total_cost, notes)
        VALUES (${writeoff.id}, ${item.ingredient_id}, ${item.quantity}, ${item.unit}, ${costPerUnit}, ${totalCost}, ${item.notes || null})
      `);
    }

    await db.execute(sql`UPDATE fb_stock_writeoffs SET total_amount = ${total} WHERE id = ${writeoff.id}`);
    res.json({ writeoff: { ...writeoff, total_amount: total } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/writeoffs/:id/confirm", async (req, res) => {
  try {
    const writeoffId = parseInt(req.params.id);
    const orgId = org(req);
    const db_ = (db as any).$client;
    const [wo] = (await db.execute(sql`SELECT * FROM fb_stock_writeoffs WHERE id = ${writeoffId} AND organization_id = ${orgId}`)).rows as any[];
    if (!wo) return res.status(404).json({ error: "Not found" });
    if (wo.status === "confirmed") return res.status(400).json({ error: "Already confirmed" });

    // Приєднуємо cost_per_unit з fb_ingredients для розрахунку собівартості
    const itemsRows = await db_.query(`
      SELECT wi.*, i.cost_per_unit, i.name AS ingredient_name
      FROM fb_stock_writeoff_items wi
      JOIN fb_ingredients i ON i.id = wi.ingredient_id
      WHERE wi.writeoff_id = $1
    `, [writeoffId]);
    const items = itemsRows.rows;

    let totalCost = 0;
    for (const item of items) {
      const qty = parseFloat(item.quantity);
      const cpu = parseFloat(item.cost_per_unit ?? 0);
      totalCost += qty * cpu;
      await db.execute(sql`
        UPDATE fb_ingredients SET
          current_stock = GREATEST(0, current_stock - ${qty}),
          updated_at = NOW()
        WHERE id = ${item.ingredient_id}
      `);
    }

    await db.execute(sql`UPDATE fb_stock_writeoffs SET status = 'confirmed', confirmed_at = NOW() WHERE id = ${writeoffId} AND organization_id = ${orgId}`);

    // Бухгалтерська проводка:
    // Дт 902 (СВОТ) → Кт 281 для реалізації/виробництва
    // Дт 947 (Нестача/псування) → Кт 281 для відходів/псування
    const reason = (wo.reason || wo.writeoff_type || "").toLowerCase();
    const isWaste = reason.includes("псув") || reason.includes("брак") || reason.includes("нестач") || reason.includes("waste");
    const debitCode = isWaste ? "947" : "902";
    const writeoffDate = wo.writeoff_date
      ? new Date(wo.writeoff_date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const accEntryId = await postInventoryEntry(db_, {
      orgId, dateStr: writeoffDate,
      debitCode, creditCode: "281",
      amount: Math.round(totalCost * 100) / 100,
      description: `Списання: ${wo.reason || wo.notes || `акт #${writeoffId}`}`,
      userId: uid(req),
    });

    res.json({ success: true, total_cost: Math.round(totalCost * 100) / 100, acc_entry_id: accEntryId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// STOCK LEVELS — Залишки + попередження
// ═══════════════════════════════════════════════════════════════════════════

router.get("/stock-levels", async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        i.*,
        s.name AS supplier_name,
        CASE
          WHEN i.current_stock = 0 THEN 'critical'
          WHEN i.current_stock <= i.min_stock THEN 'low'
          WHEN i.current_stock <= i.min_stock * 1.5 THEN 'warning'
          ELSE 'ok'
        END AS stock_status,
        ROUND(i.current_stock * i.cost_per_unit, 2) AS stock_value
      FROM fb_ingredients i
      LEFT JOIN fb_suppliers s ON s.id = i.supplier_id
      WHERE i.organization_id = ${org(req)} AND i.is_active = true
      ORDER BY
        CASE WHEN i.current_stock = 0 THEN 0
             WHEN i.current_stock <= i.min_stock THEN 1
             ELSE 2 END,
        i.name
    `);

    const summary = (await db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE current_stock = 0) AS critical,
        COUNT(*) FILTER (WHERE current_stock > 0 AND current_stock <= min_stock) AS low,
        ROUND(SUM(current_stock * cost_per_unit), 2) AS total_value
      FROM fb_ingredients
      WHERE organization_id = ${org(req)} AND is_active = true
    `)).rows[0];

    res.json({ ingredients: result.rows, summary });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS — F&B Аналітика складу та продажів
// ═══════════════════════════════════════════════════════════════════════════

router.get("/analytics", async (req, res) => {
  try {
    const orgId = org(req);
    const days = Math.min(parseInt(String(req.query.days || "30")), 365);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0]; // YYYY-MM-DD

    // 1. Food Cost по тех.картах (recipe cards linked to menu items)
    const foodCostRows = (await db.execute(sql`
      SELECT
        rc.id,
        rc.name,
        COALESCE(fi.price, 0)::numeric            AS selling_price,
        COALESCE(rc.cost_per_portion, 0)::numeric AS cost_per_portion,
        CASE
          WHEN COALESCE(fi.price, 0) > 0
          THEN ROUND(COALESCE(rc.cost_per_portion, 0) / fi.price::numeric * 100, 1)
          ELSE 0
        END                                        AS food_cost_pct,
        CASE
          WHEN COALESCE(fi.price, 0) > 0
          THEN ROUND(fi.price::numeric - COALESCE(rc.cost_per_portion, 0), 2)
          ELSE 0
        END                                        AS margin_uah
      FROM fb_recipe_cards rc
      LEFT JOIN fb_items fi ON fi.id = rc.menu_item_id
      WHERE rc.organization_id = ${orgId} AND rc.is_active = true
      ORDER BY food_cost_pct DESC NULLS LAST
      LIMIT 50
    `)).rows;

    // 2. Рух складу по днях — окремі запити, серія дат будується в JS
    const recDays = (await db.execute(sql`
      SELECT receipt_date::date::text AS d, COUNT(*) AS cnt,
             COALESCE(SUM(total_amount), 0)::numeric AS amt
      FROM fb_stock_receipts
      WHERE organization_id = ${orgId} AND status = 'confirmed'
        AND receipt_date >= ${cutoffStr}::date
      GROUP BY receipt_date::date
    `)).rows as any[];

    const wofDays = (await db.execute(sql`
      SELECT created_at::date::text AS d, COUNT(*) AS cnt,
             COALESCE(SUM(total_amount), 0)::numeric AS amt
      FROM fb_stock_writeoffs
      WHERE organization_id = ${orgId} AND status = 'confirmed'
        AND created_at >= ${cutoffStr}::date
      GROUP BY created_at::date
    `)).rows as any[];

    // Build full date series in JavaScript
    const recMap = Object.fromEntries(recDays.map((r: any) => [r.d, r]));
    const wofMap = Object.fromEntries(wofDays.map((w: any) => [w.d, w]));
    const movementRows: any[] = [];
    const startDate = new Date(cutoffStr + "T00:00:00Z");
    const endDate   = new Date();
    for (const d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().split("T")[0];
      movementRows.push({
        date: key,
        receipts_count:  Number(recMap[key]?.cnt ?? 0),
        receipts_amount: Number(recMap[key]?.amt ?? 0),
        writeoffs_count:  Number(wofMap[key]?.cnt ?? 0),
        writeoffs_amount: Number(wofMap[key]?.amt ?? 0),
      });
    }

    // 3. Відходи по причинах
    const wasteByReason = (await db.execute(sql`
      SELECT
        reason,
        COUNT(*) AS cnt,
        ROUND(SUM(total_amount)::numeric, 2) AS total_cost
      FROM fb_stock_writeoffs
      WHERE organization_id = ${orgId} AND status = 'confirmed'
        AND created_at >= ${cutoffStr}::date
      GROUP BY reason
      ORDER BY total_cost DESC
    `)).rows;

    // 4. Топ-10 інгредієнтів за вартістю запасу
    const topStockValue = (await db.execute(sql`
      SELECT
        name, unit, category,
        current_stock::numeric,
        cost_per_unit::numeric,
        ROUND(current_stock::numeric * cost_per_unit::numeric, 2) AS stock_value
      FROM fb_ingredients
      WHERE organization_id = ${orgId} AND is_active = true AND current_stock > 0
      ORDER BY stock_value DESC
      LIMIT 10
    `)).rows;

    // 5. Топ-10 інгредієнтів за споживанням (з накладних)
    const topUsage = (await db.execute(sql`
      SELECT
        i.name,
        i.unit,
        ROUND(SUM(sri.quantity)::numeric, 2) AS total_received,
        ROUND(SUM(sri.total_price)::numeric, 2) AS total_cost
      FROM fb_stock_receipt_items sri
      JOIN fb_stock_receipts sr ON sr.id = sri.receipt_id
      JOIN fb_ingredients i ON i.id = sri.ingredient_id
      WHERE sr.organization_id = ${orgId} AND sr.status = 'confirmed'
        AND sr.receipt_date >= ${cutoffStr}::date
      GROUP BY i.id, i.name, i.unit
      ORDER BY total_cost DESC
      LIMIT 10
    `)).rows;

    // 6. KPI summary
    const kpi = (await db.execute(sql`
      SELECT
        (SELECT ROUND(SUM(total_amount)::numeric, 2) FROM fb_stock_receipts
         WHERE organization_id = ${orgId} AND status = 'confirmed'
           AND receipt_date >= ${cutoffStr}::date
        ) AS total_purchased,
        (SELECT ROUND(SUM(total_amount)::numeric, 2) FROM fb_stock_writeoffs
         WHERE organization_id = ${orgId} AND status = 'confirmed'
           AND created_at >= ${cutoffStr}::date
        ) AS total_waste,
        (SELECT COUNT(*) FROM fb_ingredients
         WHERE organization_id = ${orgId} AND is_active = true) AS ingredients_total,
        (SELECT ROUND(SUM(current_stock::numeric * cost_per_unit::numeric), 2)
         FROM fb_ingredients
         WHERE organization_id = ${orgId} AND is_active = true) AS stock_total_value,
        (SELECT ROUND(AVG(food_cost_pct), 1) FROM (
          SELECT CASE WHEN fi.price::numeric > 0
                      THEN rc.cost_per_portion::numeric / fi.price::numeric * 100
                      ELSE 0 END AS food_cost_pct
          FROM fb_recipe_cards rc
          LEFT JOIN fb_items fi ON fi.id = rc.menu_item_id
          WHERE rc.organization_id = ${orgId} AND rc.is_active = true
            AND fi.price::numeric > 0 AND rc.cost_per_portion IS NOT NULL
        ) sub) AS avg_food_cost_pct
    `)).rows[0];

    res.json({
      kpi,
      food_cost_by_dish: foodCostRows,
      stock_movement: movementRows,
      waste_by_reason: wasteByReason,
      top_stock_value: topStockValue,
      top_usage: topUsage,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// AI — Alcohol tax classification helper
// ═══════════════════════════════════════════════════════════════════════════
router.post("/ai/classify-alcohol", async (req, res) => {
  try {
    const { name, volume_pct, volume_ml } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 500,
      messages: [
        {
          role: "system",
          content: `Ти експерт з акцизного оподаткування алкогольних напоїв в Україні (Податковий кодекс України, ст. 215).
Визнач тип напою та ставку акцизного збору. Поверни ТІЛЬКИ JSON без markdown:
{
  "product_type": "тип (пиво/вино_тихе/вино_ігристе/сидр/міцні_напої/інше)",
  "uktzed_code": "код УКТЗЕД",
  "excise_rate_uah": ставка акцизу в гривнях на літр або на літр 100% спирту,
  "excise_unit": "одиниця (л / л_100_спирту)",
  "excise_per_portion_uah": розрахунок акцизу на порцію якщо відомий обʼєм,
  "vat_rate": 20,
  "note": "коротке пояснення ставки"
}`
        },
        {
          role: "user",
          content: `Напій: "${name}", міцність: ${volume_pct || "невідома"}%, обʼєм порції: ${volume_ml || "невідомо"} мл. Визнач акцизну ставку за ПКУ.`
        }
      ]
    });

    const raw = completion.choices[0].message.content || "";
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      const result = JSON.parse(match ? match[0] : raw);
      res.json(result);
    } catch {
      res.status(422).json({ error: "AI не зміг класифікувати", raw });
    }
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// F&B COSTING REPORT
// ═══════════════════════════════════════════════════════════════════════════

router.get("/costing-report", requireAuth, async (req, res) => {
  try {
    const orgId = org(req);
    const days  = Math.min(365, Math.max(1, parseInt(String(req.query.days || "30"))));
    const cutoffStr = (() => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().split("T")[0]; })();
    const db_ = (db as any).$client;

    // 1. Per-item sales data + cost_price
    const items = await db_.query(`
      SELECT
        fi.id                                                   AS item_id,
        fi.name,
        fc.name                                                 AS category_name,
        COALESCE(fi.price, 0)::numeric                         AS selling_price,
        COALESCE(fi.cost_price, 0)::numeric                    AS cost_price,
        CASE WHEN COALESCE(fi.price,0) > 0 AND COALESCE(fi.cost_price,0) > 0
             THEN ROUND((fi.cost_price / fi.price) * 100, 1)
             ELSE NULL END                                      AS food_cost_pct,
        CASE WHEN COALESCE(fi.price,0) > 0 AND COALESCE(fi.cost_price,0) > 0
             THEN ROUND(((fi.price - fi.cost_price) / fi.price) * 100, 1)
             ELSE NULL END                                      AS margin_pct,
        COALESCE(SUM(oi.quantity), 0)::int                     AS qty_sold,
        COALESCE(SUM(oi.total_price), 0)::numeric              AS revenue,
        COALESCE(SUM(oi.quantity * fi.cost_price), 0)::numeric AS theoretical_cost
      FROM fb_items fi
      LEFT JOIN fb_categories fc ON fc.id = fi.category_id
      LEFT JOIN fb_order_items oi ON oi.item_id = fi.id
        AND oi.organization_id = $1
        AND oi.created_at >= $2::date
      WHERE fi.organization_id = $1
      GROUP BY fi.id, fi.name, fc.name, fi.price, fi.cost_price
      ORDER BY revenue DESC
    `, [orgId, cutoffStr]);

    // 2. Totals
    const totals = await db_.query(`
      SELECT
        COALESCE(SUM(oi.total_price), 0)::numeric              AS total_revenue,
        COALESCE(SUM(oi.quantity * fi.cost_price), 0)::numeric AS total_theoretical_cost,
        CASE WHEN COALESCE(SUM(oi.total_price),0) > 0
             THEN ROUND(SUM(oi.quantity * COALESCE(fi.cost_price,0)) / SUM(oi.total_price) * 100, 1)
             ELSE NULL END                                      AS overall_food_cost_pct
      FROM fb_order_items oi
      JOIN fb_items fi ON fi.id = oi.item_id AND fi.organization_id = $1
      WHERE oi.organization_id = $1 AND oi.created_at >= $2::date
    `, [orgId, cutoffStr]);

    // 3. By category
    const byCategory = await db_.query(`
      SELECT
        COALESCE(fc.name, 'Без категорії')                     AS category_name,
        COUNT(DISTINCT fi.id)::int                             AS item_count,
        COALESCE(SUM(oi.quantity), 0)::int                     AS qty_sold,
        COALESCE(SUM(oi.total_price), 0)::numeric              AS revenue,
        COALESCE(SUM(oi.quantity * fi.cost_price), 0)::numeric AS theoretical_cost,
        CASE WHEN COALESCE(SUM(oi.total_price),0) > 0
             THEN ROUND(SUM(oi.quantity * COALESCE(fi.cost_price,0)) / SUM(oi.total_price) * 100, 1)
             ELSE NULL END                                      AS food_cost_pct,
        CASE WHEN COALESCE(SUM(oi.total_price),0) > 0
             THEN ROUND(AVG((fi.price - COALESCE(fi.cost_price,0)) / NULLIF(fi.price,0)) * 100, 1)
             ELSE NULL END                                      AS avg_margin_pct
      FROM fb_items fi
      LEFT JOIN fb_categories fc ON fc.id = fi.category_id
      LEFT JOIN fb_order_items oi ON oi.item_id = fi.id
        AND oi.organization_id = $1
        AND oi.created_at >= $2::date
      WHERE fi.organization_id = $1
      GROUP BY fc.name
      ORDER BY revenue DESC
    `, [orgId, cutoffStr]);

    // 4. Actual writeoffs cost in period
    const writeoffs = await db_.query(`
      SELECT COALESCE(SUM(total_amount), 0)::numeric AS actual_waste_cost
      FROM fb_stock_writeoffs
      WHERE organization_id = $1 AND writeoff_date >= $2::date
    `, [orgId, cutoffStr]);

    res.json({
      period: { days, from: cutoffStr },
      totals: {
        ...totals.rows[0],
        actual_waste_cost: writeoffs.rows[0]?.actual_waste_cost ?? 0,
      },
      items: items.rows,
      byCategory: byCategory.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// INVENTORY — Інвентаризація
// ═══════════════════════════════════════════════════════════════════════════

async function ensureInventoryTables(db_: any) {
  await db_.query(`
    CREATE TABLE IF NOT EXISTS fb_inventory_sessions (
      id               SERIAL PRIMARY KEY,
      organization_id  INT NOT NULL,
      name             TEXT NOT NULL,
      date             DATE NOT NULL DEFAULT CURRENT_DATE,
      status           TEXT NOT NULL DEFAULT 'draft',
      notes            TEXT,
      variance_total   NUMERIC(12,2) DEFAULT 0,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at     TIMESTAMPTZ
    )
  `);
  await db_.query(`
    CREATE TABLE IF NOT EXISTS fb_inventory_lines (
      id              SERIAL PRIMARY KEY,
      session_id      INT NOT NULL REFERENCES fb_inventory_sessions(id) ON DELETE CASCADE,
      ingredient_id   INT NOT NULL REFERENCES fb_ingredients(id) ON DELETE CASCADE,
      system_qty      NUMERIC(12,4) NOT NULL DEFAULT 0,
      actual_qty      NUMERIC(12,4),
      cost_per_unit   NUMERIC(12,4) NOT NULL DEFAULT 0,
      UNIQUE (session_id, ingredient_id)
    )
  `);
}

router.get("/inventory", async (req, res) => {
  try {
    const orgId = org(req);
    const db_ = (db as any).$client;
    await ensureInventoryTables(db_);
    const r = await db_.query(`
      SELECT s.*,
        COUNT(l.id)::int AS line_count,
        COUNT(CASE WHEN l.actual_qty IS NOT NULL THEN 1 END)::int AS counted_count
      FROM fb_inventory_sessions s
      LEFT JOIN fb_inventory_lines l ON l.session_id = s.id
      WHERE s.organization_id = $1
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 50
    `, [orgId]);
    res.json({ sessions: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/inventory", async (req, res) => {
  try {
    const orgId = org(req);
    const db_ = (db as any).$client;
    await ensureInventoryTables(db_);
    const { name, date, notes } = req.body;
    if (!name) return res.status(400).json({ error: "Вкажіть назву" });

    const sr = await db_.query(`
      INSERT INTO fb_inventory_sessions (organization_id, name, date, notes)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [orgId, name, date || new Date().toISOString().slice(0, 10), notes || null]);
    const session = sr.rows[0];

    const ings = await db_.query(`
      SELECT id, current_stock, cost_per_unit FROM fb_ingredients
      WHERE organization_id = $1 AND is_active = TRUE ORDER BY name
    `, [orgId]);

    if (ings.rows.length > 0) {
      const vals = ings.rows.map((i: any, idx: number) =>
        `(${session.id}, ${i.id}, ${parseFloat(i.current_stock) || 0}, ${parseFloat(i.cost_per_unit) || 0})`
      ).join(",");
      await db_.query(`INSERT INTO fb_inventory_lines (session_id, ingredient_id, system_qty, cost_per_unit) VALUES ${vals} ON CONFLICT DO NOTHING`);
    }

    res.json({ ok: true, session });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/inventory/:id", async (req, res) => {
  try {
    const orgId = org(req);
    const db_ = (db as any).$client;
    const { id } = req.params;
    const sr = await db_.query(`SELECT * FROM fb_inventory_sessions WHERE id=$1 AND organization_id=$2`, [id, orgId]);
    if (!sr.rows[0]) return res.status(404).json({ error: "Не знайдено" });
    const lr = await db_.query(`
      SELECT l.*, i.name AS ingredient_name, i.unit, i.category
      FROM fb_inventory_lines l
      JOIN fb_ingredients i ON i.id = l.ingredient_id
      WHERE l.session_id = $1
      ORDER BY i.category NULLS LAST, i.name
    `, [id]);
    res.json({ session: sr.rows[0], lines: lr.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/inventory/:id", async (req, res) => {
  try {
    const orgId = org(req);
    const db_ = (db as any).$client;
    const { id } = req.params;
    const { name, notes, date } = req.body;
    await db_.query(`
      UPDATE fb_inventory_sessions SET
        name = COALESCE($1, name),
        notes = COALESCE($2, notes),
        date = COALESCE($3, date)
      WHERE id = $4 AND organization_id = $5
    `, [name || null, notes ?? null, date || null, id, orgId]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/inventory/:id/lines", requireAuth, async (req: any, res) => {
  try {
    const orgId = org(req);
    const db_ = (db as any).$client;
    const sessionId = req.params.id;
    const { lines } = req.body;
    if (!Array.isArray(lines)) return res.status(400).json({ error: "lines array required" });
    // Verify the inventory session belongs to caller's org before updating lines
    const sessionCheck = await db_.query(
      `SELECT id FROM fb_inventory_sessions WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [sessionId, orgId],
    );
    if (!sessionCheck.rows.length) return res.status(403).json({ error: "Forbidden" });
    for (const l of lines) {
      if (l.id) {
        await db_.query(
          `UPDATE fb_inventory_lines SET actual_qty = $1 WHERE id = $2 AND session_id = $3`,
          [l.actual_qty !== "" && l.actual_qty !== null ? parseFloat(l.actual_qty) : null, l.id, sessionId],
        );
      }
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/inventory/:id/complete", async (req, res) => {
  try {
    const orgId = org(req);
    const db_ = (db as any).$client;
    const { id } = req.params;

    const sr = await db_.query(`SELECT * FROM fb_inventory_sessions WHERE id=$1 AND organization_id=$2`, [id, orgId]);
    if (!sr.rows[0]) return res.status(404).json({ error: "Не знайдено" });
    if (sr.rows[0].status === "completed") return res.status(400).json({ error: "Вже завершено" });
    const session = sr.rows[0];

    // Намагаємось joinити fb_ingredients (основна таблиця), fallback на fb_warehouse_ingredients
    let lr: any;
    try {
      lr = await db_.query(`
        SELECT l.*, i.name, i.cost_per_unit FROM fb_inventory_lines l
        JOIN fb_ingredients i ON i.id = l.ingredient_id
        WHERE l.session_id = $1 AND l.actual_qty IS NOT NULL
      `, [id]);
    } catch {
      lr = await db_.query(`
        SELECT l.*, i.name FROM fb_inventory_lines l
        JOIN fb_warehouse_ingredients i ON i.id = l.ingredient_id
        WHERE l.session_id = $1 AND l.actual_qty IS NOT NULL
      `, [id]);
    }

    let varTot = 0;
    let surplusTotal = 0, shortageTotal = 0;
    const accEntryIds: number[] = [];
    const invDate = new Date().toISOString().slice(0, 10);

    for (const line of lr.rows) {
      const actualQty  = parseFloat(line.actual_qty);
      const systemQty  = parseFloat(line.system_qty ?? 0);
      const cpu        = parseFloat(line.cost_per_unit ?? line.cost_per_unit ?? 0);
      const variance   = actualQty - systemQty;
      const varValue   = variance * cpu;

      // Оновлюємо залишок
      try {
        await db_.query(`UPDATE fb_ingredients SET current_stock=$1, updated_at=NOW() WHERE id=$2`,
          [actualQty, line.ingredient_id]);
      } catch {
        await db_.query(`UPDATE fb_warehouse_ingredients SET current_stock=$1 WHERE id=$2`,
          [actualQty, line.ingredient_id]);
      }

      varTot += Math.abs(varValue);

      if (Math.abs(varValue) < 0.01) continue;

      // Бухгалтерська проводка за результатами інвентаризації (НП(С)БО 9 п.27-28)
      if (variance > 0) {
        // Надлишок: Дт 281 → Кт 719 «Інші операційні доходи»
        surplusTotal += varValue;
        const eid = await postInventoryEntry(db_, {
          orgId, dateStr: invDate,
          debitCode: "281", creditCode: "719",
          amount: Math.round(varValue * 100) / 100,
          description: `Надлишок при інвентаризації: ${line.name} (+${variance.toFixed(3)} ${session.name})`,
          userId: uid(req),
        });
        if (eid) accEntryIds.push(eid);
      } else {
        // Нестача: Дт 947 «Нестача та втрати від псування» → Кт 281
        shortageTotal += Math.abs(varValue);
        const eid = await postInventoryEntry(db_, {
          orgId, dateStr: invDate,
          debitCode: "947", creditCode: "281",
          amount: Math.round(Math.abs(varValue) * 100) / 100,
          description: `Нестача при інвентаризації: ${line.name} (${variance.toFixed(3)} ${session.name})`,
          userId: uid(req),
        });
        if (eid) accEntryIds.push(eid);
      }
    }

    await db_.query(`
      UPDATE fb_inventory_sessions SET status='completed', completed_at=NOW(), variance_total=$1 WHERE id=$2
    `, [Math.round(varTot * 100) / 100, id]);

    res.json({
      ok: true, updated: lr.rows.length,
      variance_total: Math.round(varTot * 100) / 100,
      surplus_total: Math.round(surplusTotal * 100) / 100,
      shortage_total: Math.round(shortageTotal * 100) / 100,
      acc_entry_ids: accEntryIds,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── AI Voice Inventory ────────────────────────────────────────────────────────
// Парсить вільний голосовий текст і повертає фактичні залишки для рядків інвентаризації
router.post("/ai-voice-inventory", async (req, res) => {
  const { text, session_id } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  if (!session_id) return res.status(400).json({ error: "session_id required" });
  try {
    const orgId = org(req);
    const db_ = (db as any).$client;

    // Перевіряємо що сесія належить організації
    const sr = await db_.query(
      `SELECT id, status FROM fb_inventory_sessions WHERE id=$1 AND organization_id=$2`,
      [session_id, orgId]
    );
    if (!sr.rows[0]) return res.status(404).json({ error: "Сесію не знайдено" });
    if (sr.rows[0].status === "completed") return res.status(400).json({ error: "Інвентаризацію вже проведено" });

    // Завантажуємо рядки сесії з назвами інгредієнтів
    const lr = await db_.query(`
      SELECT l.id AS line_id, l.system_qty, l.actual_qty,
             i.name AS ingredient_name, i.unit
      FROM fb_inventory_lines l
      JOIN fb_ingredients i ON i.id = l.ingredient_id
      WHERE l.session_id = $1
      ORDER BY i.name
    `, [session_id]);
    const lines = lr.rows;

    // Формуємо список для промпту
    const linesList = lines
      .map((l: any) => `${l.line_id}|${l.ingredient_name}|${l.unit}|по системі: ${parseFloat(l.system_qty||0).toFixed(3)}`)
      .join("\n");

    const systemPrompt = `Ти система голосового вводу для інвентаризації ресторану в Україні.
Менеджер диктує фактичні залишки товарів на складі. Розпізнай кожну позицію та її кількість.
Текст може містити помилки розпізнавання (схожі за звуком слова, суржик).
Сьогодні: ${new Date().toISOString().split("T")[0]}

Список рядків інвентаризації (line_id|назва|одиниця|системний залишок):
${linesList || "—"}

Поверни ТІЛЬКИ JSON масив знайдених позицій:
[
  {"line_id": число, "ingredient_name": "назва", "actual_qty": число, "unit": "одиниця", "confidence": "high|medium|low"}
]

Правила:
- Включай тільки ті позиції, для яких чітко названа кількість
- Конвертуй одиниці якщо потрібно (250г = 0.25кг)
- Якщо назва нечітка — шукай найближчу з переліку
- Не вигадуй позиції яких немає у списку
- confidence: high = чітко розпізнано, medium = з припущенням, low = неточно`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_completion_tokens: 1500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ]
    });

    const raw = completion.choices[0].message.content || "";
    let parsed: any[];
    try {
      const m = raw.match(/\[[\s\S]*\]/);
      parsed = JSON.parse(m ? m[0] : raw);
      if (!Array.isArray(parsed)) throw new Error("not array");
    } catch {
      return res.status(422).json({ error: "Не вдалося розпізнати відповідь AI", raw });
    }

    // Фільтруємо тільки валідні line_id з нашої сесії
    const validLineIds = new Set(lines.map((l: any) => l.line_id));
    const enriched = parsed
      .filter((item: any) => item.line_id && validLineIds.has(item.line_id) && item.actual_qty >= 0)
      .map((item: any) => {
        const line = lines.find((l: any) => l.line_id === item.line_id);
        return {
          line_id: item.line_id,
          ingredient_name: line?.ingredient_name || item.ingredient_name,
          actual_qty: Number(item.actual_qty),
          unit: line?.unit || item.unit,
          system_qty: line ? parseFloat(line.system_qty || 0) : 0,
          confidence: item.confidence || "medium",
        };
      });

    res.json({ items: enriched, raw_transcript: text });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/inventory/:id", async (req, res) => {
  try {
    const orgId = org(req);
    const db_ = (db as any).$client;
    const { id } = req.params;
    const sr = await db_.query(`SELECT status FROM fb_inventory_sessions WHERE id=$1 AND organization_id=$2`, [id, orgId]);
    if (!sr.rows[0]) return res.status(404).json({ error: "Не знайдено" });
    if (sr.rows[0].status === "completed") return res.status(400).json({ error: "Не можна видалити завершену інвентаризацію" });
    await db_.query(`DELETE FROM fb_inventory_sessions WHERE id=$1 AND organization_id=$2`, [id, orgId]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// WAREHOUSES / СКЛАДИ  |  TRANSFERS / ПЕРЕМІЩЕННЯ  |  PACKAGING / ФАСУВАННЯ
// ═══════════════════════════════════════════════════════════════════════════

async function ensureWarehouseTables(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS fb_warehouses (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      address TEXT,
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`ALTER TABLE fb_ingredients ADD COLUMN IF NOT EXISTS warehouse_id INT REFERENCES fb_warehouses(id) ON DELETE SET NULL`).catch(() => {});
  await client.query(`
    CREATE TABLE IF NOT EXISTS fb_transfers (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      from_location VARCHAR(150),
      to_location VARCHAR(150),
      transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      notes TEXT,
      total_amount NUMERIC(12,2) DEFAULT 0,
      created_by INT,
      confirmed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS fb_transfer_items (
      id SERIAL PRIMARY KEY,
      transfer_id INT NOT NULL REFERENCES fb_transfers(id) ON DELETE CASCADE,
      ingredient_id INT REFERENCES fb_ingredients(id),
      name VARCHAR(255) NOT NULL,
      quantity NUMERIC(12,3) NOT NULL,
      unit VARCHAR(20) NOT NULL DEFAULT 'кг',
      cost_per_unit NUMERIC(10,4) DEFAULT 0,
      total_cost NUMERIC(12,2) DEFAULT 0
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS fb_packaging (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      unit VARCHAR(20) NOT NULL DEFAULT 'шт',
      quantity NUMERIC(12,3) DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

// ─── Склади ───────────────────────────────────────────────────────────────────
router.get("/warehouses-list", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    await ensureWarehouseTables(db_);
    const r = await db_.query(
      `SELECT * FROM fb_warehouses WHERE organization_id=$1 ORDER BY name`, [org(req)]
    );
    res.json({ warehouses: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/warehouses-list", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    await ensureWarehouseTables(db_);
    const { name, address, notes } = req.body;
    if (!name) return res.status(400).json({ error: "Назва обов'язкова" });
    const r = await db_.query(
      `INSERT INTO fb_warehouses (organization_id, name, address, notes) VALUES ($1,$2,$3,$4) RETURNING *`,
      [org(req), name, address || null, notes || null]
    );
    res.json({ warehouse: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/warehouses-list/:id", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    const { name, address, notes, is_active } = req.body;
    await db_.query(
      `UPDATE fb_warehouses SET
         name=COALESCE($1,name), address=COALESCE($2,address),
         notes=COALESCE($3,notes), is_active=COALESCE($4,is_active)
       WHERE id=$5 AND organization_id=$6`,
      [name ?? null, address ?? null, notes ?? null, is_active ?? null, req.params.id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/warehouses-list/:id", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    await db_.query(
      `DELETE FROM fb_warehouses WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /warehouses-list/:id/ingredients — інгредієнти складу
router.get("/warehouses-list/:id/ingredients", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    await ensureWarehouseTables(db_);
    const whId = parseInt(req.params.id);
    const wh = await db_.query(`SELECT * FROM fb_warehouses WHERE id=$1 AND organization_id=$2`, [whId, org(req)]);
    if (!wh.rows[0]) return res.status(404).json({ error: "Склад не знайдено" });
    const ings = await db_.query(
      `SELECT id, name, unit, category, current_stock, min_stock, cost_per_unit, warehouse_id
       FROM fb_ingredients WHERE organization_id=$1 AND is_active=TRUE AND warehouse_id=$2 ORDER BY name`,
      [org(req), whId]
    );
    res.json({ warehouse: wh.rows[0], ingredients: ings.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /warehouses-list/:id/assign — прив'язати інгредієнт до складу
router.post("/warehouses-list/:id/assign", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    await ensureWarehouseTables(db_);
    const whId = parseInt(req.params.id);
    const { ingredient_id } = req.body;
    if (!ingredient_id) return res.status(400).json({ error: "ingredient_id required" });
    await db_.query(
      `UPDATE fb_ingredients SET warehouse_id=$1 WHERE id=$2 AND organization_id=$3`,
      [whId, ingredient_id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /warehouses-list/:id/assign/:ingId — відв'язати інгредієнт від складу
router.delete("/warehouses-list/:id/assign/:ingId", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    await db_.query(
      `UPDATE fb_ingredients SET warehouse_id=NULL WHERE id=$1 AND organization_id=$2`,
      [req.params.ingId, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Переміщення ─────────────────────────────────────────────────────────────
router.get("/transfers", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    await ensureWarehouseTables(db_);
    const r = await db_.query(`
      SELECT t.*, COUNT(ti.id)::int AS item_count
      FROM fb_transfers t
      LEFT JOIN fb_transfer_items ti ON ti.transfer_id = t.id
      WHERE t.organization_id = $1
      GROUP BY t.id
      ORDER BY t.transfer_date DESC, t.created_at DESC
    `, [org(req)]);
    res.json({ transfers: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/transfers/:id", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    const r = await db_.query(
      `SELECT * FROM fb_transfers WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Не знайдено" });
    const items = await db_.query(`
      SELECT ti.*, i.name AS ingredient_name
      FROM fb_transfer_items ti
      LEFT JOIN fb_ingredients i ON i.id = ti.ingredient_id
      WHERE ti.transfer_id=$1
    `, [req.params.id]);
    res.json({ transfer: r.rows[0], items: items.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/transfers", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    await ensureWarehouseTables(db_);
    const { from_location, to_location, transfer_date, notes, items } = req.body;
    if (!items?.length) return res.status(400).json({ error: "Потрібні позиції" });
    const tr = await db_.query(
      `INSERT INTO fb_transfers (organization_id, from_location, to_location, transfer_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [org(req), from_location || null, to_location || null,
       transfer_date || new Date().toISOString().slice(0,10), notes || null, uid(req)]
    );
    const transfer = tr.rows[0];
    let total = 0;
    for (const item of items) {
      const totalCost = (parseFloat(item.quantity) || 0) * (parseFloat(item.cost_per_unit) || 0);
      total += totalCost;
      await db_.query(
        `INSERT INTO fb_transfer_items (transfer_id, ingredient_id, name, quantity, unit, cost_per_unit, total_cost)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [transfer.id, item.ingredient_id || null, item.name,
         item.quantity, item.unit || 'кг', item.cost_per_unit || 0, totalCost]
      );
    }
    await db_.query(`UPDATE fb_transfers SET total_amount=$1 WHERE id=$2`, [total, transfer.id]);
    res.json({ transfer: { ...transfer, total_amount: total } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/transfers/:id/confirm", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    const tr = await db_.query(
      `SELECT * FROM fb_transfers WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]
    );
    if (!tr.rows[0]) return res.status(404).json({ error: "Не знайдено" });
    if (tr.rows[0].status === "confirmed") return res.status(400).json({ error: "Вже підтверджено" });
    await db_.query(
      `UPDATE fb_transfers SET status='confirmed', confirmed_at=NOW() WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/transfers/:id", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    const tr = await db_.query(
      `SELECT status FROM fb_transfers WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]
    );
    if (!tr.rows[0]) return res.status(404).json({ error: "Не знайдено" });
    if (tr.rows[0].status === "confirmed") return res.status(400).json({ error: "Не можна видалити підтверджене переміщення" });
    await db_.query(`DELETE FROM fb_transfers WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Фасування ────────────────────────────────────────────────────────────────
router.get("/packaging", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    await ensureWarehouseTables(db_);
    const r = await db_.query(
      `SELECT * FROM fb_packaging WHERE organization_id=$1 ORDER BY name`, [org(req)]
    );
    res.json({ packaging: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/packaging", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    await ensureWarehouseTables(db_);
    const { name, unit, quantity } = req.body;
    if (!name) return res.status(400).json({ error: "Назва обов'язкова" });
    const r = await db_.query(
      `INSERT INTO fb_packaging (organization_id, name, unit, quantity) VALUES ($1,$2,$3,$4) RETURNING *`,
      [org(req), name, unit || 'шт', quantity || 0]
    );
    res.json({ packaging: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/packaging/:id", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    const { name, unit, quantity } = req.body;
    await db_.query(
      `UPDATE fb_packaging SET
         name=COALESCE($1,name), unit=COALESCE($2,unit), quantity=COALESCE($3,quantity)
       WHERE id=$4 AND organization_id=$5`,
      [name ?? null, unit ?? null, quantity ?? null, req.params.id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/packaging/:id", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    await db_.query(
      `DELETE FROM fb_packaging WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Звіт за рухом ────────────────────────────────────────────────────────────
router.get("/movement-report", async (req, res) => {
  try {
    const db_ = (db as any).$client;
    const orgId = org(req);
    const from = (req.query.from as string) || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);

    const receipts = await db_.query(`
      SELECT ri.ingredient_id,
             COALESCE(SUM(ri.quantity),0)::numeric                     AS qty,
             COALESCE(SUM(ri.quantity * ri.price_per_unit),0)::numeric AS amt
      FROM fb_stock_receipt_items ri
      JOIN fb_stock_receipts sr ON sr.id = ri.receipt_id
      WHERE sr.organization_id=$1 AND sr.status='confirmed'
        AND sr.receipt_date BETWEEN $2 AND $3
        AND ri.ingredient_id IS NOT NULL
      GROUP BY ri.ingredient_id
    `, [orgId, from, to]);

    const writeoffs = await db_.query(`
      SELECT wi.ingredient_id,
             COALESCE(SUM(wi.quantity),0)::numeric  AS qty,
             COALESCE(SUM(wi.total_cost),0)::numeric AS amt
      FROM fb_stock_writeoff_items wi
      JOIN fb_stock_writeoffs sw ON sw.id = wi.writeoff_id
      WHERE sw.organization_id=$1 AND sw.status='confirmed'
        AND sw.writeoff_date BETWEEN $2 AND $3
        AND wi.ingredient_id IS NOT NULL
      GROUP BY wi.ingredient_id
    `, [orgId, from, to]);

    const ingredients = await db_.query(`
      SELECT id, name, unit, category,
             current_stock::numeric AS closing_qty,
             cost_per_unit::numeric AS cost
      FROM fb_ingredients
      WHERE organization_id=$1 AND is_active=TRUE
      ORDER BY category NULLS LAST, name
    `, [orgId]);

    const recMap: Record<number, any> = {};
    for (const r of receipts.rows) recMap[r.ingredient_id] = r;
    const wofMap: Record<number, any> = {};
    for (const w of writeoffs.rows) wofMap[w.ingredient_id] = w;

    const rows = ingredients.rows
      .map((i: any) => {
        const rec = recMap[i.id] || { qty: 0, amt: 0 };
        const wof = wofMap[i.id] || { qty: 0, amt: 0 };
        const recQty = parseFloat(rec.qty) || 0;
        const wofQty = parseFloat(wof.qty) || 0;
        const closingQty = parseFloat(i.closing_qty) || 0;
        const cost = parseFloat(i.cost) || 0;
        const openingQty = Math.round((closingQty - recQty + wofQty) * 1000) / 1000;
        return {
          id: i.id,
          name: i.name,
          unit: i.unit,
          category: i.category || "—",
          opening_qty: openingQty,
          opening_amt: Math.round(openingQty * cost * 100) / 100,
          received_qty: recQty,
          received_amt: parseFloat(rec.amt) || 0,
          writeoff_qty: wofQty,
          writeoff_amt: parseFloat(wof.amt) || 0,
          closing_qty: closingQty,
          closing_amt: Math.round(closingQty * cost * 100) / 100,
          cost,
        };
      })
      .filter((r: any) => r.received_qty > 0 || r.writeoff_qty > 0 || r.closing_qty !== 0);

    res.json({ rows, from, to, total: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// COST ACCOUNTING SUMMARY — Дашборд собівартості (Phase 2)
// Рах. 281 «Товари», 902 «СВОТ», 947 «Нестача», 631 «Постачальники», 719 «Доходи»
// ═══════════════════════════════════════════════════════════════════════════

router.get("/cost-accounting", async (req, res) => {
  try {
    const orgId = org(req);
    const db_ = (db as any).$client;
    const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || "30"))));
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // 1. Поточна вартість запасів (рах. 281) — з fb_ingredients
    const stockVal = await db_.query(`
      SELECT
        COUNT(*)::int                                              AS item_count,
        ROUND(SUM(current_stock * cost_per_unit)::numeric, 2)    AS total_value,
        COUNT(*) FILTER (WHERE current_stock = 0)::int           AS zero_stock,
        COUNT(*) FILTER (WHERE current_stock > 0
          AND current_stock <= min_stock)::int                   AS low_stock
      FROM fb_ingredients
      WHERE organization_id=$1 AND is_active=true
    `, [orgId]);

    // 2. Вартість по категоріях
    const byCategory = await db_.query(`
      SELECT
        COALESCE(category, 'Без категорії')                          AS category,
        COUNT(*)::int                                                 AS item_count,
        ROUND(SUM(current_stock * cost_per_unit)::numeric, 2)        AS value,
        ROUND(AVG(cost_per_unit)::numeric, 4)                        AS avg_cost
      FROM fb_ingredients
      WHERE organization_id=$1 AND is_active=true
      GROUP BY category
      ORDER BY value DESC NULLS LAST
    `, [orgId]);

    // 3. Автоматичні проводки з журналу (за останні N днів)
    const accMovements = await db_.query(`
      SELECT
        e.id, e.entry_date, e.amount, e.description,
        da.code AS debit_code, da.name AS debit_name,
        ca.code AS credit_code, ca.name AS credit_name
      FROM acc_entries e
      JOIN acc_accounts da ON da.id = e.debit_account_id
      JOIN acc_accounts ca ON ca.id = e.credit_account_id
      WHERE e.organization_id=$1
        AND e.is_manual = false
        AND e.entry_date >= $2::date
        AND (da.code IN ('281','902','947') OR ca.code IN ('281','631','719'))
      ORDER BY e.entry_date DESC, e.id DESC
      LIMIT 50
    `, [orgId, cutoffStr]);

    // 4. Підсумки по типах проводок
    const accSummary = await db_.query(`
      SELECT
        da.code AS debit_code, ca.code AS credit_code,
        COUNT(*)::int                                AS count,
        ROUND(SUM(e.amount)::numeric, 2)             AS total_amount
      FROM acc_entries e
      JOIN acc_accounts da ON da.id = e.debit_account_id
      JOIN acc_accounts ca ON ca.id = e.credit_account_id
      WHERE e.organization_id=$1
        AND e.is_manual = false
        AND e.entry_date >= $2::date
        AND (da.code IN ('281','902','947') OR ca.code IN ('281','631','719'))
      GROUP BY da.code, ca.code
      ORDER BY total_amount DESC
    `, [orgId, cutoffStr]);

    // 5. Food cost (теоретичний) з продажів
    const foodCost = await db_.query(`
      SELECT
        COALESCE(SUM(oi.total_price), 0)::numeric              AS revenue,
        COALESCE(SUM(oi.quantity * fi.cost_price), 0)::numeric AS theoretical_cost,
        CASE WHEN COALESCE(SUM(oi.total_price),0) > 0
             THEN ROUND(
               SUM(oi.quantity * COALESCE(fi.cost_price,0))
               / SUM(oi.total_price) * 100, 1)
             ELSE NULL END                                      AS food_cost_pct
      FROM fb_order_items oi
      JOIN fb_items fi ON fi.id = oi.item_id AND fi.organization_id=$1
      WHERE oi.organization_id=$1 AND oi.created_at >= $2::date
    `, [orgId, cutoffStr]);

    // 6. Нещодавні прихід/списання
    const recentReceipts = await db_.query(`
      SELECT id, receipt_date AS date, notes, total_amount, status
      FROM fb_stock_receipts
      WHERE organization_id=$1 AND status='confirmed' AND receipt_date >= $2::date
      ORDER BY receipt_date DESC LIMIT 10
    `, [orgId, cutoffStr]);

    const recentWriteoffs = await db_.query(`
      SELECT id, writeoff_date AS date, reason, notes, total_amount, status
      FROM fb_stock_writeoffs
      WHERE organization_id=$1 AND status='confirmed' AND writeoff_date >= $2::date
      ORDER BY writeoff_date DESC LIMIT 10
    `, [orgId, cutoffStr]);

    res.json({
      period: { days, from: cutoffStr },
      stock: {
        ...stockVal.rows[0],
        by_category: byCategory.rows,
      },
      food_cost: foodCost.rows[0] ?? { revenue: 0, theoretical_cost: 0, food_cost_pct: null },
      acc: {
        movements: accMovements.rows,
        summary: accSummary.rows,
      },
      recent_receipts: recentReceipts.rows,
      recent_writeoffs: recentWriteoffs.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;


