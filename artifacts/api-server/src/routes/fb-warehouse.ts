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
    const { menu_item_id, name, yield_quantity, yield_unit, prep_time_min, cook_time_min, technology, notes } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const r = await db.execute(sql`
      INSERT INTO fb_recipe_cards (organization_id, menu_item_id, name, yield_quantity, yield_unit, prep_time_min, cook_time_min, technology, notes)
      VALUES (${org(req)}, ${menu_item_id || null}, ${name}, ${yield_quantity || 1}, ${yield_unit || "пор"}, ${prep_time_min || 15}, ${cook_time_min || 15}, ${technology || null}, ${notes || null})
      RETURNING *
    `);
    res.json({ recipe: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/recipes/:id", async (req, res) => {
  try {
    const { menu_item_id, name, yield_quantity, yield_unit, prep_time_min, cook_time_min, technology, notes } = req.body;
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
    const { status, supplier_id } = req.query;
    const statusVal = status || null;
    const supplierVal = supplier_id ? parseInt(supplier_id as string) : null;
    const result = await db.execute(sql`
      SELECT sr.*, s.name AS supplier_name,
        COUNT(sri.id) AS item_count
      FROM fb_stock_receipts sr
      LEFT JOIN fb_suppliers s ON s.id = sr.supplier_id
      LEFT JOIN fb_stock_receipt_items sri ON sri.receipt_id = sr.id
      WHERE sr.organization_id = ${org(req)}
        AND (${statusVal}::text IS NULL OR sr.status = ${statusVal})
        AND (${supplierVal}::int IS NULL OR sr.supplier_id = ${supplierVal})
      GROUP BY sr.id, s.name
      ORDER BY sr.receipt_date DESC, sr.created_at DESC
    `);
    res.json({ receipts: result.rows });
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
    const { supplier_id, receipt_no, receipt_date, notes } = req.body;
    const r = await db.execute(sql`
      INSERT INTO fb_stock_receipts (organization_id, supplier_id, receipt_no, receipt_date, notes, created_by)
      VALUES (${org(req)}, ${supplier_id || null}, ${receipt_no || null}, ${receipt_date || new Date().toISOString().split("T")[0]}, ${notes || null}, ${uid(req)})
      RETURNING *
    `);
    res.json({ receipt: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/receipts/:id", async (req, res) => {
  try {
    const { supplier_id, receipt_no, receipt_date, notes, status } = req.body;
    const r = await db.execute(sql`
      UPDATE fb_stock_receipts SET
        supplier_id = COALESCE(${supplier_id ?? null}, supplier_id),
        receipt_no = COALESCE(${receipt_no || null}, receipt_no),
        receipt_date = COALESCE(${receipt_date || null}::date, receipt_date),
        notes = COALESCE(${notes || null}, notes),
        status = COALESCE(${status || null}, status),
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
    const { items } = req.body as { items: Array<{ ingredient_id?: number; name: string; quantity: number; unit: string; price_per_unit: number; vat_rate?: number; is_new_ingredient?: boolean; match_confidence?: number }> };

    await db.execute(sql`DELETE FROM fb_stock_receipt_items WHERE receipt_id = ${receiptId}`);
    let total = 0;
    let vat = 0;
    for (const item of items || []) {
      const vatRate = item.vat_rate ?? 20;
      const totalPrice = item.quantity * item.price_per_unit;
      const vatAmount = totalPrice * vatRate / (100 + vatRate);
      total += totalPrice;
      vat += vatAmount;
      await db.execute(sql`
        INSERT INTO fb_stock_receipt_items (receipt_id, ingredient_id, name, quantity, unit, price_per_unit, total_price, vat_rate, vat_amount, is_new_ingredient, match_confidence)
        VALUES (${receiptId}, ${item.ingredient_id || null}, ${item.name}, ${item.quantity}, ${item.unit}, ${item.price_per_unit}, ${totalPrice}, ${vatRate}, ${vatAmount}, ${item.is_new_ingredient || false}, ${item.match_confidence ?? null})
      `);
    }
    await db.execute(sql`UPDATE fb_stock_receipts SET total_amount = ${total}, vat_amount = ${vat}, updated_at = NOW() WHERE id = ${receiptId}`);
    res.json({ success: true, total_amount: total, vat_amount: vat });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Confirm receipt → update stock levels
router.post("/receipts/:id/confirm", async (req, res) => {
  try {
    const receiptId = parseInt(req.params.id);
    const [receipt] = (await db.execute(sql`SELECT * FROM fb_stock_receipts WHERE id = ${receiptId} AND organization_id = ${org(req)}`)).rows as any[];
    if (!receipt) return res.status(404).json({ error: "Not found" });
    if (receipt.status === "confirmed") return res.status(400).json({ error: "Already confirmed" });

    const items = (await db.execute(sql`SELECT * FROM fb_stock_receipt_items WHERE receipt_id = ${receiptId}`)).rows as any[];

    for (const item of items) {
      if (!item.ingredient_id) continue;
      await db.execute(sql`
        UPDATE fb_ingredients SET
          current_stock = current_stock + ${parseFloat(item.quantity)},
          cost_per_unit = ${parseFloat(item.price_per_unit)},
          updated_at = NOW()
        WHERE id = ${item.ingredient_id}
      `);
    }

    await db.execute(sql`
      UPDATE fb_stock_receipts SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
      WHERE id = ${receiptId}
    `);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── AI Invoice Scanner ────────────────────────────────────────────────────
router.post("/receipts/ai-scan", async (req, res) => {
  try {
    const { text, image_base64 } = req.body;
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
      userContent = [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } },
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
      "unit": "одиниця виміру (кг/г/л/мл/шт/пляш/упак)",
      "price_per_unit": ціна за одиницю,
      "total_price": загальна сума,
      "vat_rate": ставка ПДВ у % (20 якщо не вказано, 0 для звільнених)
    }
  ]
}

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
      model: "gpt-5.2",
      max_completion_tokens: 2000,
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

    // Auto-create new ingredients from unmatched items
    const processedItems = [];
    for (const item of parsed.items || []) {
      if (item.is_new_ingredient || !item.ingredient_id) {
        const created = await db.execute(sql`
          INSERT INTO fb_ingredients (organization_id, name, unit, cost_per_unit)
          VALUES (${orgId}, ${item.name}, ${item.unit || "кг"}, ${item.price_per_unit || 0})
          RETURNING id, name
        `);
        item.ingredient_id = (created.rows[0] as any).id;
        item.is_new_ingredient = true;
        item.match_confidence = 0;
      }
      processedItems.push(item);
    }

    // Find matched supplier
    let matchedSupplierId = parsed.supplier_id || null;
    if (!matchedSupplierId && parsed.supplier_name) {
      const match = existingSuppliers.find((s: any) =>
        s.name.toLowerCase().includes(parsed.supplier_name?.toLowerCase()?.split(" ")[0] || "") ||
        (parsed.supplier_edrpou && s.edrpou === parsed.supplier_edrpou)
      );
      if (match) matchedSupplierId = match.id;
    }

    res.json({
      parsed: { ...parsed, items: processedItems, supplier_id: matchedSupplierId },
      new_ingredients_count: processedItems.filter((i: any) => i.is_new_ingredient).length,
    });
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
    const { writeoff_date, reason, notes, items } = req.body;
    if (!items?.length) return res.status(400).json({ error: "items required" });

    let total = 0;
    const r = await db.execute(sql`
      INSERT INTO fb_stock_writeoffs (organization_id, writeoff_date, reason, notes, created_by)
      VALUES (${org(req)}, ${writeoff_date || new Date().toISOString().split("T")[0]}, ${reason || "spoilage"}, ${notes || null}, ${uid(req)})
      RETURNING *
    `);
    const writeoff = r.rows[0] as any;

    for (const item of items) {
      const [ing] = (await db.execute(sql`SELECT cost_per_unit FROM fb_ingredients WHERE id = ${item.ingredient_id}`)).rows as any[];
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
    const [wo] = (await db.execute(sql`SELECT * FROM fb_stock_writeoffs WHERE id = ${writeoffId} AND organization_id = ${org(req)}`)).rows as any[];
    if (!wo) return res.status(404).json({ error: "Not found" });
    if (wo.status === "confirmed") return res.status(400).json({ error: "Already confirmed" });

    const items = (await db.execute(sql`SELECT * FROM fb_stock_writeoff_items WHERE writeoff_id = ${writeoffId}`)).rows as any[];
    for (const item of items) {
      await db.execute(sql`
        UPDATE fb_ingredients SET
          current_stock = GREATEST(0, current_stock - ${parseFloat(item.quantity)}),
          updated_at = NOW()
        WHERE id = ${item.ingredient_id}
      `);
    }

    await db.execute(sql`UPDATE fb_stock_writeoffs SET status = 'confirmed', confirmed_at = NOW() WHERE id = ${writeoffId}`);
    res.json({ success: true });
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
      model: "gpt-4o",
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

export default router;
