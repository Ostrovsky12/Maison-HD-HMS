import { Router } from "express";
import { db } from "@workspace/db";
import { fbCategoriesTable, fbItemsTable, fbTablesTable, fbOrdersTable, fbOrderItemsTable } from "@workspace/db";
import { eq, and, desc, asc, sql, gte, ne } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { createFiscalReceipt, buildCheckboxGoods, toCheckboxPaymentType } from "../services/checkbox.js";

const router = Router();
const getOrg = (req: any) => req.user?.organizationId;

// ─── Role helpers ─────────────────────────────────────────────────────────────
const CASHIER_ROLES = ["cashier", "manager", "owner", "super_admin"];

const checkRole = (req: any, res: any, allowed: string[]): boolean => {
  const role = req.user?.role || "";
  if (!allowed.includes(role)) {
    res.status(403).json({ error: "Недостатньо прав. Потрібна роль: " + allowed.join(" / ") });
    return false;
  }
  return true;
};

// ─── Demo seed ────────────────────────────────────────────────────────────────
async function seedDemo(orgId: number) {
  const ex = await db.select({ id: fbCategoriesTable.id }).from(fbCategoriesTable).where(eq(fbCategoriesTable.organizationId, orgId)).limit(1);
  if (ex.length > 0) return;

  const cats = await db.insert(fbCategoriesTable).values([
    { organizationId: orgId, name: "Сніданки", emoji: "🍳", sortOrder: 1 },
    { organizationId: orgId, name: "Супи", emoji: "🍲", sortOrder: 2 },
    { organizationId: orgId, name: "Основні страви", emoji: "🍖", sortOrder: 3 },
    { organizationId: orgId, name: "Салати", emoji: "🥗", sortOrder: 4 },
    { organizationId: orgId, name: "Десерти", emoji: "🍰", sortOrder: 5 },
    { organizationId: orgId, name: "Напої", emoji: "🥤", sortOrder: 6 },
    { organizationId: orgId, name: "Бар", emoji: "🍸", sortOrder: 7 },
  ]).returning();

  const items = await db.insert(fbItemsTable).values([
    { organizationId: orgId, categoryId: cats[0].id, name: "Англійський сніданок", description: "Яєчня, бекон, тости, квасоля, гриби, томат", price: "320", cookMinutes: 20, isPopular: true, tags: ["популярне"], sortOrder: 1 },
    { organizationId: orgId, categoryId: cats[0].id, name: "Вівсяна каша з ягодами", description: "Вівсянка на молоці, свіжі ягоди, мед", price: "180", cookMinutes: 10, isVegetarian: true, sortOrder: 2 },
    { organizationId: orgId, categoryId: cats[0].id, name: "Омлет із сиром та зеленню", description: "Пухкий омлет, твердий сир, кріп, петрушка", price: "220", cookMinutes: 12, sortOrder: 3 },
    { organizationId: orgId, categoryId: cats[1].id, name: "Борщ із пампушками", description: "Традиційний червоний борщ, сметана, пампушки з часником", price: "220", cookMinutes: 15, isPopular: true, sortOrder: 1 },
    { organizationId: orgId, categoryId: cats[1].id, name: "Юшка рибна", description: "Юшка з форелі, картопля, зелень", price: "280", cookMinutes: 20, sortOrder: 2 },
    { organizationId: orgId, categoryId: cats[2].id, name: "Стейк із телятини", description: "Телятина medium, картопля гратен, соус беарнез", price: "680", cookMinutes: 25, isPopular: true, tags: ["преміум"], sortOrder: 1 },
    { organizationId: orgId, categoryId: cats[2].id, name: "Форель на грилі", description: "Філе форелі, лимон, тімьян, овочі-гриль", price: "520", cookMinutes: 20, sortOrder: 2 },
    { organizationId: orgId, categoryId: cats[2].id, name: "Курка по-домашньому", description: "Куряча грудка, картопляне пюре, підлива", price: "380", cookMinutes: 25, sortOrder: 3 },
    { organizationId: orgId, categoryId: cats[2].id, name: "Паста карбонара", description: "Спагеті, бекон, яйце, пармезан", price: "340", cookMinutes: 18, isVegetarian: false, sortOrder: 4 },
    { organizationId: orgId, categoryId: cats[3].id, name: "Цезар із курятиною", description: "Романо, курятина гриль, соус Цезар, пармезан", price: "280", cookMinutes: 10, isPopular: true, sortOrder: 1 },
    { organizationId: orgId, categoryId: cats[3].id, name: "Грецький салат", description: "Томати, огірки, олівки, фета, оливкова олія", price: "230", cookMinutes: 8, isVegetarian: true, sortOrder: 2 },
    { organizationId: orgId, categoryId: cats[4].id, name: "Медовик", description: "Класичний торт медовик, сметанний крем", price: "180", cookMinutes: 3, isVegetarian: true, sortOrder: 1 },
    { organizationId: orgId, categoryId: cats[4].id, name: "Чізкейк Нью-Йорк", description: "Ніжний чізкейк, ягідний соус", price: "220", cookMinutes: 3, isPopular: true, isVegetarian: true, sortOrder: 2 },
    { organizationId: orgId, categoryId: cats[5].id, name: "Свіжовичавлений сік", description: "Апельсиновий або яблучний", price: "120", cookMinutes: 3, isVegetarian: true, sortOrder: 1 },
    { organizationId: orgId, categoryId: cats[5].id, name: "Американо", description: "Подвійний еспресо, гаряча вода", price: "80", cookMinutes: 3, isVegetarian: true, sortOrder: 2 },
    { organizationId: orgId, categoryId: cats[5].id, name: "Капучіно", description: "Еспресо, молоко, пінка", price: "100", cookMinutes: 4, isVegetarian: true, isPopular: true, sortOrder: 3 },
    { organizationId: orgId, categoryId: cats[6].id, name: "Апероль-шприц", description: "Апероль, просекко, содова, апельсин", price: "220", cookMinutes: 3, sortOrder: 1 },
    { organizationId: orgId, categoryId: cats[6].id, name: "Mojito", description: "Ром, лайм, м'ята, цукор, содова", price: "200", cookMinutes: 3, sortOrder: 2 },
    { organizationId: orgId, categoryId: cats[6].id, name: "Craft пиво (500 мл)", description: "Місцеве крафтове пиво, на розлив", price: "160", cookMinutes: 2, sortOrder: 3 },
  ]).returning();

  const tables = await db.insert(fbTablesTable).values([
    { organizationId: orgId, number: "1", capacity: 2, location: "Основний зал", status: "free" },
    { organizationId: orgId, number: "2", capacity: 4, location: "Основний зал", status: "free" },
    { organizationId: orgId, number: "3", capacity: 4, location: "Основний зал", status: "free" },
    { organizationId: orgId, number: "4", capacity: 6, location: "Основний зал", status: "free" },
    { organizationId: orgId, number: "5", capacity: 6, location: "Основний зал", status: "free" },
    { organizationId: orgId, number: "6", capacity: 8, location: "Основний зал", status: "free" },
    { organizationId: orgId, number: "VIP-1", capacity: 4, location: "VIP-зона", status: "free" },
    { organizationId: orgId, number: "VIP-2", capacity: 6, location: "VIP-зона", status: "free" },
    { organizationId: orgId, number: "Т-1", capacity: 4, location: "Тераса", status: "free" },
    { organizationId: orgId, number: "Т-2", capacity: 4, location: "Тераса", status: "free" },
    { organizationId: orgId, number: "Б-1", capacity: 2, location: "Бар", status: "free" },
    { organizationId: orgId, number: "Б-2", capacity: 2, location: "Бар", status: "free" },
  ]).returning();

  // Seed 3 active demo orders
  const order1 = await db.insert(fbOrdersTable).values({
    organizationId: orgId, tableId: tables[1].id, orderType: "dine_in",
    guestName: "Родина Ковальських", guestCount: 4, status: "in_kitchen",
    totalAmount: "900", notes: "Без цибулі в салаті",
  }).returning();
  await db.update(fbTablesTable).set({ status: "occupied", currentOrderId: order1[0].id }).where(eq(fbTablesTable.id, tables[1].id));
  await db.insert(fbOrderItemsTable).values([
    { orderId: order1[0].id, itemId: items[3].id, organizationId: orgId, name: items[3].name, price: items[3].price, quantity: 2, totalPrice: "440", status: "cooking" },
    { orderId: order1[0].id, itemId: items[9].id, organizationId: orgId, name: items[9].name, price: items[9].price, quantity: 2, totalPrice: "560", status: "pending" },
  ]);

  const order2 = await db.insert(fbOrdersTable).values({
    organizationId: orgId, tableId: tables[6].id, orderType: "dine_in",
    guestName: "Іван Петренко", guestCount: 2, status: "open",
    totalAmount: "1220",
  }).returning();
  await db.update(fbTablesTable).set({ status: "occupied", currentOrderId: order2[0].id }).where(eq(fbTablesTable.id, tables[6].id));
  await db.insert(fbOrderItemsTable).values([
    { orderId: order2[0].id, itemId: items[5].id, organizationId: orgId, name: items[5].name, price: items[5].price, quantity: 1, totalPrice: "680", status: "pending" },
    { orderId: order2[0].id, itemId: items[15].id, organizationId: orgId, name: items[15].name, price: items[15].price, quantity: 2, totalPrice: "200", status: "pending" },
    { orderId: order2[0].id, itemId: items[12].id, organizationId: orgId, name: items[12].name, price: items[12].price, quantity: 2, totalPrice: "440", status: "pending" },
  ]);

  const order3 = await db.insert(fbOrdersTable).values({
    organizationId: orgId, orderType: "room_service",
    guestName: "Олена Морозова", roomNumber: "205", guestCount: 1, status: "open",
    totalAmount: "420",
  }).returning();
  await db.insert(fbOrderItemsTable).values([
    { orderId: order3[0].id, itemId: items[0].id, organizationId: orgId, name: items[0].name, price: items[0].price, quantity: 1, totalPrice: "320", status: "pending" },
    { orderId: order3[0].id, itemId: items[14].id, organizationId: orgId, name: items[14].name, price: items[14].price, quantity: 1, totalPrice: "80", status: "pending" },
    { orderId: order3[0].id, itemId: items[15].id, organizationId: orgId, name: items[15].name, price: items[15].price, quantity: 1, totalPrice: "100", status: "pending" },
  ]);
}

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get("/stats", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedDemo(orgId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayOrders, allTables, openOrders, topItems] = await Promise.all([
      db.select({ id: fbOrdersTable.id, status: fbOrdersTable.status, totalAmount: fbOrdersTable.totalAmount })
        .from(fbOrdersTable)
        .where(and(eq(fbOrdersTable.organizationId, orgId), gte(fbOrdersTable.createdAt, today))),
      db.select({ status: fbTablesTable.status }).from(fbTablesTable).where(eq(fbTablesTable.organizationId, orgId)),
      db.select({ id: fbOrdersTable.id }).from(fbOrdersTable)
        .where(and(eq(fbOrdersTable.organizationId, orgId), ne(fbOrdersTable.status, "cancelled"), ne(fbOrdersTable.status, "billed"))),
      db.select({ name: fbOrderItemsTable.name, total: sql<string>`SUM(quantity)` })
        .from(fbOrderItemsTable)
        .where(eq(fbOrderItemsTable.organizationId, orgId))
        .groupBy(fbOrderItemsTable.name)
        .orderBy(desc(sql`SUM(quantity)`))
        .limit(5),
    ]);

    res.json({
      today: {
        orders: todayOrders.length,
        revenue: todayOrders.filter(o => o.status === "billed").reduce((s, o) => s + parseFloat(o.totalAmount || "0"), 0),
        openOrders: todayOrders.filter(o => !["billed", "cancelled"].includes(o.status)).length,
      },
      tables: {
        total: allTables.length,
        free: allTables.filter(t => t.status === "free").length,
        occupied: allTables.filter(t => t.status === "occupied").length,
        reserved: allTables.filter(t => t.status === "reserved").length,
      },
      openOrders: openOrders.length,
      topItems,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Categories ───────────────────────────────────────────────────────────────
router.get("/categories", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedDemo(orgId);
    const cats = await db.select().from(fbCategoriesTable).where(eq(fbCategoriesTable.organizationId, orgId)).orderBy(asc(fbCategoriesTable.sortOrder));
    res.json({ categories: cats });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/categories", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const [cat] = await db.insert(fbCategoriesTable).values({ ...req.body, organizationId: orgId }).returning();
    res.json({ category: cat });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/categories/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const [cat] = await db.update(fbCategoriesTable).set({ ...req.body })
      .where(and(eq(fbCategoriesTable.id, parseInt(req.params.id)), eq(fbCategoriesTable.organizationId, orgId)))
      .returning();
    res.json({ category: cat });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/categories/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await db.delete(fbCategoriesTable)
      .where(and(eq(fbCategoriesTable.id, parseInt(req.params.id)), eq(fbCategoriesTable.organizationId, orgId)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Menu Items ───────────────────────────────────────────────────────────────
router.get("/items", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { categoryId, available } = req.query;
    const db_ = (db as any).$client;
    const conditions: string[] = [`fi.organization_id = $1`];
    const params: any[] = [orgId];
    if (categoryId) { params.push(parseInt(categoryId as string)); conditions.push(`fi.category_id = $${params.length}`); }
    if (available === "true") conditions.push(`fi.is_available = true`);
    const r = await db_.query(
      `SELECT fi.*,
              fc.name AS "categoryName", fc.emoji AS "categoryEmoji",
              ing.name AS ingredient_name, ing.unit AS ingredient_unit,
              er.group_name  AS excise_group_name,
              er.rate_per_liter,
              er.requires_stamp,
              CASE WHEN fi.is_alcohol AND fi.volume_l IS NOT NULL AND er.rate_per_liter IS NOT NULL
                   THEN ROUND(fi.volume_l * er.rate_per_liter, 2)
                   ELSE 0 END AS excise_per_unit
       FROM fb_items fi
       LEFT JOIN fb_categories fc ON fc.id = fi.category_id
       LEFT JOIN fb_ingredients ing ON ing.id = fi.ingredient_id
       LEFT JOIN fb_excise_rates er ON er.group_key = fi.excise_group
       WHERE ${conditions.join(" AND ")}
       ORDER BY fc.sort_order ASC NULLS LAST, fi.sort_order ASC`,
      params
    );
    res.json({ items: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/items", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { name, description, price, categoryId, cookMinutes, isAvailable = true, isPopular = false, isVegetarian = false,
      allergens, tags, sortOrder = 0, imageUrl,
      vat_rate = 20, is_alcohol = false, alcohol_volume_pct, uktzed_code, excise_code,
      volume_l, excise_group,
      station = "kitchen_general", legal_entity_id, ingredient_id,
    } = req.body;
    const db_ = (db as any).$client;
    const r = await db_.query(
      `INSERT INTO fb_items (organization_id, name, description, price, category_id, cook_minutes,
         is_available, is_popular, is_vegetarian, allergens, tags, sort_order, image_url,
         vat_rate, is_alcohol, alcohol_volume_pct, uktzed_code, excise_code,
         volume_l, excise_group,
         station, legal_entity_id, ingredient_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
      [orgId, name, description||null, price, categoryId||null, cookMinutes||15,
       isAvailable, isPopular, isVegetarian, allergens||null, tags||null, sortOrder, imageUrl||null,
       vat_rate||20, is_alcohol||false, alcohol_volume_pct||null, uktzed_code||null, excise_code||null,
       volume_l||null, excise_group||null,
       station||"kitchen_general", legal_entity_id||null, ingredient_id||null]
    );
    res.json({ item: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/items/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const id = parseInt(req.params.id);
    const { name, description, price, categoryId, cookMinutes, isAvailable, isPopular, isVegetarian,
      allergens, tags, sortOrder, imageUrl,
      vat_rate, is_alcohol, alcohol_volume_pct, uktzed_code, excise_code,
      volume_l, excise_group,
      station, legal_entity_id, ingredient_id,
    } = req.body;
    const db_ = (db as any).$client;
    // ingredient_id can be explicitly null to clear the link
    const ingredientIdVal = req.body.hasOwnProperty("ingredient_id")
      ? (ingredient_id ?? null)
      : undefined;
    const imageUrlVal = req.body.hasOwnProperty("imageUrl") ? (imageUrl ?? null) : undefined;
    const r = await db_.query(
      `UPDATE fb_items SET
         name               = COALESCE($1, name),
         description        = COALESCE($2, description),
         price              = COALESCE($3, price),
         category_id        = COALESCE($4, category_id),
         cook_minutes       = COALESCE($5, cook_minutes),
         is_available       = COALESCE($6, is_available),
         is_popular         = COALESCE($7, is_popular),
         is_vegetarian      = COALESCE($8, is_vegetarian),
         sort_order         = COALESCE($9, sort_order),
         vat_rate           = COALESCE($10, vat_rate),
         is_alcohol         = COALESCE($11, is_alcohol),
         alcohol_volume_pct = COALESCE($12, alcohol_volume_pct),
         uktzed_code        = COALESCE($13, uktzed_code),
         excise_code        = COALESCE($14, excise_code),
         station            = COALESCE($15, station),
         legal_entity_id    = COALESCE($16, legal_entity_id),
         ingredient_id      = CASE WHEN $20::boolean THEN $17::int ELSE ingredient_id END,
         image_url          = CASE WHEN $22::boolean THEN $21 ELSE image_url END,
         volume_l           = COALESCE($23, volume_l),
         excise_group       = COALESCE($24, excise_group),
         updated_at         = NOW()
       WHERE id = $18 AND organization_id = $19 RETURNING *`,
      [name||null, description||null, price??null, categoryId||null, cookMinutes??null,
       isAvailable??null, isPopular??null, isVegetarian??null, sortOrder??null,
       vat_rate??null, is_alcohol??null, alcohol_volume_pct??null, uktzed_code||null, excise_code||null,
       station||null, legal_entity_id||null,
       ingredientIdVal ?? null,
       id, orgId,
       ingredientIdVal !== undefined,
       imageUrlVal ?? null,
       imageUrlVal !== undefined,
       volume_l != null ? volume_l : null,
       excise_group || null]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ item: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/items/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await db.delete(fbItemsTable)
      .where(and(eq(fbItemsTable.id, parseInt(req.params.id)), eq(fbItemsTable.organizationId, orgId)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Excise Rates (global lookup table) ──────────────────────────────────────
router.get("/excise-rates", requireAuth, async (req: any, res) => {
  try {
    const db_ = (db as any).$client;
    const r = await db_.query(`SELECT * FROM fb_excise_rates ORDER BY rate_per_liter ASC`);
    res.json({ rates: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/excise-rates/:id", requireAuth, async (req: any, res) => {
  try {
    const db_ = (db as any).$client;
    const id = parseInt(req.params.id);
    const { rate_per_liter } = req.body;
    if (!rate_per_liter || isNaN(parseFloat(rate_per_liter))) {
      return res.status(400).json({ error: "rate_per_liter is required" });
    }
    const r = await db_.query(
      `UPDATE fb_excise_rates SET rate_per_liter = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [parseFloat(rate_per_liter), id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ rate: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Tables ───────────────────────────────────────────────────────────────────
router.get("/tables", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const tables = await db.select({
      id: fbTablesTable.id, number: fbTablesTable.number, capacity: fbTablesTable.capacity,
      location: fbTablesTable.location, status: fbTablesTable.status, currentOrderId: fbTablesTable.currentOrderId,
      isActive: fbTablesTable.isActive,
      orderGuestName: fbOrdersTable.guestName, orderTotal: fbOrdersTable.totalAmount,
      orderStatus: fbOrdersTable.status, orderType: fbOrdersTable.orderType,
    })
      .from(fbTablesTable)
      .leftJoin(fbOrdersTable, eq(fbTablesTable.currentOrderId, fbOrdersTable.id))
      .where(and(eq(fbTablesTable.organizationId, orgId), eq(fbTablesTable.isActive, true)))
      .orderBy(asc(fbTablesTable.location), asc(fbTablesTable.number));
    res.json({ tables });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/tables", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const [tbl] = await db.insert(fbTablesTable).values({ ...req.body, organizationId: orgId }).returning();
    res.json({ table: tbl });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/tables/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { status, number, capacity, location } = req.body;
    const updates: any = {};
    if (status !== undefined) updates.status = status;
    if (status === "free") updates.currentOrderId = null;
    if (number !== undefined) updates.number = number;
    if (capacity !== undefined) updates.capacity = capacity;
    if (location !== undefined) updates.location = location;
    const [tbl] = await db.update(fbTablesTable).set(updates)
      .where(and(eq(fbTablesTable.id, parseInt(req.params.id)), eq(fbTablesTable.organizationId, orgId)))
      .returning();
    res.json({ table: tbl });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/tables/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await db.update(fbTablesTable).set({ isActive: false })
      .where(and(eq(fbTablesTable.id, parseInt(req.params.id)), eq(fbTablesTable.organizationId, orgId)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Orders list ──────────────────────────────────────────────────────────────
router.get("/orders", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { status, type, open } = req.query;
    let conditions: any[] = [eq(fbOrdersTable.organizationId, orgId)];
    if (status && status !== "all") conditions.push(eq(fbOrdersTable.status, status as any));
    if (type && type !== "all") conditions.push(eq(fbOrdersTable.orderType, type as any));
    if (open === "true") {
      // all non-closed
      conditions.push(ne(fbOrdersTable.status, "billed"));
      conditions.push(ne(fbOrdersTable.status, "cancelled"));
    }

    const orders = await db.select({
      id: fbOrdersTable.id, orderType: fbOrdersTable.orderType, guestName: fbOrdersTable.guestName,
      roomNumber: fbOrdersTable.roomNumber, guestCount: fbOrdersTable.guestCount,
      status: fbOrdersTable.status, totalAmount: fbOrdersTable.totalAmount, paidAmount: fbOrdersTable.paidAmount,
      notes: fbOrdersTable.notes, openedAt: fbOrdersTable.openedAt, closedAt: fbOrdersTable.closedAt,
      createdAt: fbOrdersTable.createdAt, tableId: fbOrdersTable.tableId,
      tableNumber: fbTablesTable.number, tableLocation: fbTablesTable.location,
    })
      .from(fbOrdersTable)
      .leftJoin(fbTablesTable, eq(fbOrdersTable.tableId, fbTablesTable.id))
      .where(and(...conditions))
      .orderBy(desc(fbOrdersTable.openedAt));

    res.json({ orders });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Single order ─────────────────────────────────────────────────────────────
router.get("/orders/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const orderId = parseInt(req.params.id);

    const [order] = await db.select({
      id: fbOrdersTable.id, orderType: fbOrdersTable.orderType, guestName: fbOrdersTable.guestName,
      roomNumber: fbOrdersTable.roomNumber, guestCount: fbOrdersTable.guestCount,
      status: fbOrdersTable.status, totalAmount: fbOrdersTable.totalAmount, paidAmount: fbOrdersTable.paidAmount,
      notes: fbOrdersTable.notes, staffNotes: fbOrdersTable.staffNotes,
      openedAt: fbOrdersTable.openedAt, tableId: fbOrdersTable.tableId,
      tableNumber: fbTablesTable.number,
    })
      .from(fbOrdersTable)
      .leftJoin(fbTablesTable, eq(fbOrdersTable.tableId, fbTablesTable.id))
      .where(and(eq(fbOrdersTable.id, orderId), eq(fbOrdersTable.organizationId, orgId)));

    if (!order) return res.status(404).json({ error: "Not found" });

    const db_ = (db as any).$client;
    const itemsRow = await db_.query(
      `SELECT oi.*,
              fi.is_alcohol, fi.excise_group, fi.volume_l,
              er.rate_per_liter,
              CASE WHEN fi.is_alcohol AND fi.volume_l IS NOT NULL AND er.rate_per_liter IS NOT NULL
                   THEN ROUND(fi.volume_l * er.rate_per_liter, 2)
                   ELSE 0 END AS excise_per_unit
       FROM fb_order_items oi
       LEFT JOIN fb_items fi ON fi.id = oi.item_id
       LEFT JOIN fb_excise_rates er ON er.group_key = fi.excise_group
       WHERE oi.order_id = $1
       ORDER BY oi.created_at ASC`, [orderId]
    );

    res.json({ order, items: itemsRow.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Create order ─────────────────────────────────────────────────────────────
router.post("/orders", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { tableId, orderType, guestName, roomNumber, guestCount, notes, bookingId } = req.body;

    const [order] = await db.insert(fbOrdersTable).values({
      organizationId: orgId, tableId, orderType: orderType || "dine_in",
      guestName, roomNumber, guestCount: parseInt(guestCount) || 1, notes, bookingId,
    }).returning();

    if (tableId) {
      await db.update(fbTablesTable).set({ status: "occupied", currentOrderId: order.id })
        .where(eq(fbTablesTable.id, tableId));
    }

    res.json({ order });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Update order status ──────────────────────────────────────────────────────
router.patch("/orders/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const orderId = parseInt(req.params.id);
    const { status, paidAmount, staffNotes } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (status) { updates.status = status; if (["billed", "cancelled"].includes(status)) updates.closedAt = new Date(); }
    if (paidAmount !== undefined) updates.paidAmount = paidAmount;
    if (staffNotes !== undefined) updates.staffNotes = staffNotes;

    const [order] = await db.update(fbOrdersTable).set(updates)
      .where(and(eq(fbOrdersTable.id, orderId), eq(fbOrdersTable.organizationId, orgId)))
      .returning();

    if (status && ["billed", "cancelled"].includes(status) && order.tableId) {
      await db.update(fbTablesTable).set({ status: "free", currentOrderId: null }).where(eq(fbTablesTable.id, order.tableId));
    }

    res.json({ order });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Add item to order ────────────────────────────────────────────────────────
router.post("/orders/:id/items", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const orderId = parseInt(req.params.id);
    const { itemId, quantity, notes } = req.body;

    let name: string, price: string;
    if (itemId) {
      const [menuItem] = await db.select().from(fbItemsTable).where(eq(fbItemsTable.id, itemId));
      name = menuItem.name; price = menuItem.price;
    } else {
      name = req.body.name; price = req.body.price;
    }

    const qty = parseInt(quantity) || 1;
    const total = (parseFloat(price) * qty).toFixed(2);

    const [orderItem] = await db.insert(fbOrderItemsTable).values({
      orderId, itemId: itemId || null, organizationId: orgId,
      name, price, quantity: qty, totalPrice: total, notes,
    }).returning();

    // Recalc order total
    const allItems = await db.select({ totalPrice: fbOrderItemsTable.totalPrice }).from(fbOrderItemsTable)
      .where(and(eq(fbOrderItemsTable.orderId, orderId), ne(fbOrderItemsTable.status, "cancelled")));
    const newTotal = allItems.reduce((s, i) => s + parseFloat(i.totalPrice), 0).toFixed(2);
    await db.update(fbOrdersTable).set({ totalAmount: newTotal, updatedAt: new Date() }).where(eq(fbOrdersTable.id, orderId));

    res.json({ item: orderItem, newTotal });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Kitchen Display ──────────────────────────────────────────────────────────
router.get("/kitchen", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const kitchenItems = await db.select({
      itemId: fbOrderItemsTable.id,
      itemName: fbOrderItemsTable.name,
      itemStatus: fbOrderItemsTable.status,
      itemNotes: fbOrderItemsTable.notes,
      quantity: fbOrderItemsTable.quantity,
      sentAt: fbOrderItemsTable.sentAt,
      createdAt: fbOrderItemsTable.createdAt,
      orderId: fbOrdersTable.id,
      orderType: fbOrdersTable.orderType,
      guestName: fbOrdersTable.guestName,
      roomNumber: fbOrdersTable.roomNumber,
      tableNumber: fbTablesTable.number,
      tableLocation: fbTablesTable.location,
    })
      .from(fbOrderItemsTable)
      .innerJoin(fbOrdersTable, eq(fbOrderItemsTable.orderId, fbOrdersTable.id))
      .leftJoin(fbTablesTable, eq(fbOrdersTable.tableId, fbTablesTable.id))
      .where(and(
        eq(fbOrderItemsTable.organizationId, orgId),
        sql`${fbOrderItemsTable.status} IN ('pending', 'cooking')`
      ))
      .orderBy(asc(fbOrderItemsTable.createdAt));

    const grouped: Record<number, any> = {};
    for (const item of kitchenItems) {
      if (!grouped[item.orderId]) {
        grouped[item.orderId] = {
          orderId: item.orderId,
          orderType: item.orderType,
          tableNumber: item.tableNumber,
          tableLocation: item.tableLocation,
          guestName: item.guestName,
          roomNumber: item.roomNumber,
          items: [],
        };
      }
      grouped[item.orderId].items.push(item);
    }
    res.json({ orders: Object.values(grouped) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Update order item status ─────────────────────────────────────────────────
router.patch("/order-items/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { status } = req.body;
    const updates: any = { status };
    if (status === "cooking") updates.sentAt = new Date();
    if (status === "ready") updates.readyAt = new Date();
    if (status === "served") updates.servedAt = new Date();

    const [item] = await db.update(fbOrderItemsTable).set(updates)
      .where(and(eq(fbOrderItemsTable.id, parseInt(req.params.id)), eq(fbOrderItemsTable.organizationId, orgId)))
      .returning();
    res.json({ item });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// CASHBOX SESSION — POS Каса
// ══════════════════════════════════════════════════════════════════════════════

// GET current open session(s)
router.get("/cashbox/session", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    const r = await db_.query(
      `SELECT cs.*, u.name AS cashier_name,
              le.name AS entity_name, le.short_name AS entity_short_name, le.type AS entity_type
       FROM cashbox_sessions cs
       LEFT JOIN users u ON u.id = cs.cashier_id
       LEFT JOIN legal_entities le ON le.id = cs.legal_entity_id
       WHERE cs.organization_id = $1 AND cs.status = 'open'
       ORDER BY cs.opened_at ASC`, [orgId]
    );
    res.json({ sessions: r.rows, session: r.rows[0] || null });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST open session
router.post("/cashbox/session", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    if (!checkRole(req, res, CASHIER_ROLES)) return;
    const cashierId = req.user?.userId;
    const { openingBalance = 0, cashboxName = "Каса 1", legalEntityId = null } = req.body;
    const db_ = (db as any).$client;
    // Check if already open for this legal entity (NULL-safe)
    const existing = await db_.query(
      `SELECT id FROM cashbox_sessions
       WHERE organization_id = $1 AND status = 'open'
         AND legal_entity_id IS NOT DISTINCT FROM $2 LIMIT 1`,
      [orgId, legalEntityId]
    );
    if (existing.rows.length) {
      res.status(409).json({ error: "Зміна для цієї юридичної особи вже відкрита", sessionId: existing.rows[0].id });
      return;
    }
    const r = await db_.query(
      `INSERT INTO cashbox_sessions
         (organization_id, cashier_id, cashbox_name, opening_balance, expected_balance, cash_in, cash_out, status, legal_entity_id)
       VALUES ($1, $2, $3, $4, $4, 0, 0, 'open', $5) RETURNING *`,
      [orgId, cashierId, cashboxName, Number(openingBalance), legalEntityId]
    );
    res.status(201).json({ session: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH close session
router.patch("/cashbox/session/:id/close", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    if (!checkRole(req, res, CASHIER_ROLES)) return;
    const id = parseInt(req.params.id);
    const { closingBalance, notes } = req.body;
    const db_ = (db as any).$client;
    // Get current session stats
    const stats = await db_.query(
      `SELECT expected_balance, cash_in, cash_out FROM cashbox_sessions WHERE id = $1 AND organization_id = $2`, [id, orgId]
    );
    if (!stats.rows.length) { res.status(404).json({ error: "Session not found" }); return; }
    const { expected_balance } = stats.rows[0];
    const discrepancy = closingBalance !== undefined ? (Number(closingBalance) - Number(expected_balance)) : 0;
    const r = await db_.query(
      `UPDATE cashbox_sessions SET status='closed', closed_at=NOW(), closing_balance=$1, discrepancy=$2, notes=$3 WHERE id=$4 AND organization_id=$5 RETURNING *`,
      [closingBalance ?? expected_balance, discrepancy, notes || null, id, orgId]
    );
    res.json({ session: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET daily / session report (Z-звіт)
router.get("/cashbox/report", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const date = String(req.query.date || new Date().toISOString().split("T")[0]);
    const db_ = (db as any).$client;
    const orders = await db_.query(
      `SELECT payment_method, COUNT(*)::int AS cnt,
              COALESCE(SUM(total_amount), 0)::numeric AS total,
              COALESCE(SUM(discount_amount), 0)::numeric AS discounts
       FROM fb_orders
       WHERE organization_id = $1 AND status = 'closed'
         AND DATE(closed_at) = $2::date
       GROUP BY payment_method`, [orgId, date]
    );
    const totals = await db_.query(
      `SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_amount),0)::numeric AS revenue,
              COALESCE(SUM(discount_amount),0)::numeric AS discounts,
              COALESCE(AVG(total_amount),0)::numeric AS avg_check
       FROM fb_orders WHERE organization_id = $1 AND status = 'closed' AND DATE(closed_at) = $2::date`,
      [orgId, date]
    );
    res.json({
      date,
      byPaymentMethod: orders.rows,
      totals: totals.rows[0],
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── PAY ORDER ────────────────────────────────────────────────────────────────
router.post("/orders/:id/pay", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const orderId = parseInt(req.params.id);
    const {
      paymentMethod = "cash", paidAmount, discountAmount = 0, notes,
      tipAmount = 0, tipPct = 0, legalEntityId, discountLabel,
      payments, // [{method, amount}] for mixed payment
    } = req.body;

    // Mixed payment resolution
    const isMixed = Array.isArray(payments) && payments.length > 1;
    const effectiveMethod = isMixed ? "mixed" : (payments?.[0]?.method || paymentMethod);
    const effectivePaidAmount = isMixed
      ? payments.reduce((s: number, p: any) => s + Number(p.amount), 0)
      : (paidAmount ?? undefined);
    const db_ = (db as any).$client;

    // Get order
    const orderRow = await db_.query(
      `SELECT * FROM fb_orders WHERE id = $1 AND organization_id = $2`, [orderId, orgId]
    );
    if (!orderRow.rows.length) { res.status(404).json({ error: "Order not found" }); return; }
    const order = orderRow.rows[0];

    if (order.status === "billed" || order.status === "cancelled") {
      res.status(400).json({ error: "Order already closed" }); return;
    }

    const baseAmount  = Number(order.total_amount) - Number(discountAmount);
    const tip         = Number(tipAmount) || 0;
    const finalAmount = baseAmount + tip;
    const resolvedPaidAmount = effectivePaidAmount ?? finalAmount;

    // Generate receipt number
    const cnt = await db_.query(
      `SELECT COUNT(*)::int AS cnt FROM fb_orders WHERE organization_id = $1 AND receipt_number IS NOT NULL`, [orgId]
    );
    const receiptNum = `R-${orgId}-${String((cnt.rows[0]?.cnt || 0) + 1).padStart(5, "0")}`;

    // Calculate excise total from alcohol items
    const exciseItemsRow = await db_.query(
      `SELECT oi.quantity,
              CASE WHEN fi.is_alcohol AND fi.volume_l IS NOT NULL AND er.rate_per_liter IS NOT NULL
                   THEN ROUND(fi.volume_l * er.rate_per_liter, 4)
                   ELSE 0 END AS excise_per_unit
       FROM fb_order_items oi
       LEFT JOIN fb_items fi ON fi.id = oi.item_id
       LEFT JOIN fb_excise_rates er ON er.group_key = fi.excise_group
       WHERE oi.order_id = $1`, [orderId]
    );
    const exciseTotal = exciseItemsRow.rows.reduce((sum: number, row: any) => {
      return sum + (parseFloat(row.excise_per_unit) || 0) * (parseInt(row.quantity) || 1);
    }, 0);

    // Update order (includes tip + legal entity + excise_total + mixed payment)
    const r = await db_.query(
      `UPDATE fb_orders SET
         status = 'billed', paid_amount = $1, payment_method = $2,
         discount_amount = $3, receipt_number = $4, closed_at = NOW(),
         tip_amount = $5, tip_pct = $6,
         legal_entity_id = COALESCE($7, legal_entity_id),
         notes = COALESCE($8, notes),
         discount_label = COALESCE($11, discount_label),
         excise_total = $12,
         payment_details = COALESCE($13::jsonb, payment_details),
         updated_at = NOW()
       WHERE id = $9 AND organization_id = $10 RETURNING *`,
      [resolvedPaidAmount, effectiveMethod, discountAmount, receiptNum,
       tip, tipPct || 0, legalEntityId || null, notes || null, orderId, orgId,
       discountLabel || null, Math.round(exciseTotal * 100) / 100,
       isMixed ? JSON.stringify(payments) : null]
    );

    // Free the table
    if (order.table_id) {
      await db_.query(
        `UPDATE restaurant_tables SET status = 'free', current_order_id = NULL, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`, [order.table_id, orgId]
      );
    }

    // Update cashbox session — only cash portions count
    // Filter by legal_entity_id so cash goes to the right session (ТОВ / ФОП)
    const cashboxEntityId = legalEntityId || null;
    if (isMixed) {
      const cashEntry = payments.find((p: any) => p.method === "cash");
      if (cashEntry) {
        await db_.query(
          `UPDATE cashbox_sessions SET cash_in = cash_in + $1, expected_balance = expected_balance + $1
           WHERE organization_id = $2 AND status = 'open'
             AND legal_entity_id IS NOT DISTINCT FROM $3`,
          [Number(cashEntry.amount), orgId, cashboxEntityId]
        );
      }
    } else if (effectiveMethod === "cash") {
      await db_.query(
        `UPDATE cashbox_sessions SET cash_in = cash_in + $1, expected_balance = expected_balance + $1
         WHERE organization_id = $2 AND status = 'open'
           AND legal_entity_id IS NOT DISTINCT FROM $3`,
        [resolvedPaidAmount, orgId, cashboxEntityId]
      );
    }

    const updatedOrder = r.rows[0];

    // ── Checkbox ПРРО (async, non-blocking) ──────────────────────────────────
    let fiscalResult: any = null;
    try {
      // Determine legal entity
      const leId = legalEntityId || updatedOrder.legal_entity_id;
      if (leId) {
        const leRow = await db_.query(
          `SELECT * FROM legal_entities WHERE id = $1 AND organization_id = $2 AND prro_enabled = true
           AND checkbox_login IS NOT NULL AND checkbox_password IS NOT NULL AND checkbox_license_key IS NOT NULL`,
          [leId, orgId]
        );
        const le = leRow.rows[0];
        if (le) {
          // Fetch order items with their tax info
          const itemsRow = await db_.query(
            `SELECT oi.*, fi.vat_rate, fi.is_alcohol, fi.uktzed_code
             FROM fb_order_items oi
             LEFT JOIN fb_items fi ON fi.id = oi.item_id
             WHERE oi.order_id = $1`, [orderId]
          );
          const goods = buildCheckboxGoods(itemsRow.rows);
          const totalKopecks = Math.round(finalAmount * 100);
          const payments = [{
            type: toCheckboxPaymentType(paymentMethod),
            value: totalKopecks,
          }];
          fiscalResult = await createFiscalReceipt(
            { login: le.checkbox_login, password: le.checkbox_password, licenseKey: le.checkbox_license_key },
            goods, payments, Math.round(tip * 100)
          );
          // Store fiscal data
          await db_.query(
            `UPDATE fb_orders SET
               fiscal_receipt_id = $1, fiscal_receipt_url = $2, fiscal_qr_url = $3,
               fiscal_status = 'done', fiscal_data = $4, updated_at = NOW()
             WHERE id = $5`,
            [fiscalResult.id, fiscalResult.receiptUrl, fiscalResult.qrUrl,
             JSON.stringify(fiscalResult), orderId]
          );
        }
      }
    } catch (fiscalErr: any) {
      // Non-blocking — log but don't fail payment
      console.error("[CHECKBOX ПРРО] Error:", fiscalErr.message);
      await db_.query(
        `UPDATE fb_orders SET fiscal_status = 'error', fiscal_data = $1 WHERE id = $2`,
        [JSON.stringify({ error: fiscalErr.message }), orderId]
      );
    }

    // ── Конвертація одиниць: рецепт → базова одиниця складу ─────────────────
    const UNIT_CONV: Record<string, Record<string, number>> = {
      "г":    { "кг": 0.001, "г": 1 },
      "мл":   { "л": 0.001, "мл": 1 },
      "кг":   { "г": 1000, "кг": 1 },
      "л":    { "мл": 1000, "л": 1 },
      "шт":   { "шт": 1 },
      "пляш": { "пляш": 1 },
      "пач":  { "пач": 1 },
    };
    const unitFactor = (from: string, to: string) => {
      if (from === to) return 1;
      return UNIT_CONV[from]?.[to] ?? 1;
    };

    // ── Auto Stock Deduction — списання по тех. картках (non-blocking) ─────────
    let stockDeductionLog: any = null;
    try {
      // 1. Отримуємо всі позиції замовлення
      const itemsRow = await db_.query(
        `SELECT oi.item_id, oi.quantity, oi.name
         FROM fb_order_items oi
         WHERE oi.order_id = $1`,
        [orderId]
      );
      const orderItems = itemsRow.rows;

      if (orderItems.length > 0) {
        // 2. Для кожної позиції знаходимо тех. картку
        const deductions: Array<{
          ingredientId: number; quantity: number; unit: string;
          costPerUnit: number; menuItemName: string; deductionType?: string;
        }> = [];

        for (const oi of orderItems) {
          // ── Шлях 1: Тех. картка (страви/напої зі складними рецептами) ──────
          const rcRow = await db_.query(
            `SELECT id, yield_quantity FROM fb_recipe_cards
             WHERE menu_item_id = $1 AND organization_id = $2 AND is_active = true
             LIMIT 1`,
            [oi.item_id, orgId]
          );

          if (rcRow.rows.length) {
            // Тех. картка знайдена — списуємо інгредієнти по рецепту
            const recipe = rcRow.rows[0];
            const yieldQty = Number(recipe.yield_quantity) || 1;

            const rciRow = await db_.query(
              `SELECT rci.ingredient_id, rci.net_quantity, rci.unit AS recipe_unit,
                      i.cost_per_unit, i.name AS ingredient_name, i.unit AS base_unit
               FROM fb_recipe_card_items rci
               JOIN fb_ingredients i ON i.id = rci.ingredient_id
               WHERE rci.recipe_id = $1`,
              [recipe.id]
            );

            for (const rci of rciRow.rows) {
              // Автоконвертація: г→кг, мл→л та ін.
              const conv = unitFactor(rci.recipe_unit, rci.base_unit);
              const deductQty = (Number(rci.net_quantity) * conv / yieldQty) * Number(oi.quantity);
              if (deductQty <= 0) continue;
              deductions.push({
                ingredientId: rci.ingredient_id,
                quantity: deductQty,
                unit: rci.base_unit,      // списуємо в базових одиницях складу
                costPerUnit: Number(rci.cost_per_unit) || 0,
                menuItemName: oi.name,
                deductionType: "recipe",
              });
            }
          } else if (oi.item_id) {
            // ── Шлях 2: Штучний товар (пряма прив'язка до інгредієнту) ────────
            // Перевіряємо чи є ingredient_id на самому пункті меню
            const itemRow = await db_.query(
              `SELECT fi.ingredient_id, ing.unit, ing.cost_per_unit, ing.name AS ingredient_name
               FROM fb_items fi
               JOIN fb_ingredients ing ON ing.id = fi.ingredient_id
               WHERE fi.id = $1 AND fi.organization_id = $2 AND fi.ingredient_id IS NOT NULL`,
              [oi.item_id, orgId]
            );
            if (itemRow.rows.length) {
              const itm = itemRow.rows[0];
              // 1 продаж = 1 одиниця зі складу × кількість
              deductions.push({
                ingredientId: itm.ingredient_id,
                quantity: Number(oi.quantity),
                unit: itm.unit,
                costPerUnit: Number(itm.cost_per_unit) || 0,
                menuItemName: oi.name,
                deductionType: "direct",
              });
            }
            // Якщо жодного зв'язку — просто пропускаємо (послуга, страва без картки)
          }
        }

        if (deductions.length > 0) {
          // 3. Підбиваємо дублікати по інгредієнту (може бути одна страва в кількох позиціях)
          const merged: Record<number, typeof deductions[0]> = {};
          for (const d of deductions) {
            if (merged[d.ingredientId]) {
              merged[d.ingredientId].quantity += d.quantity;
            } else {
              merged[d.ingredientId] = { ...d };
            }
          }
          const finalDeductions = Object.values(merged);

          // 4. Створюємо запис в fb_stock_writeoffs (reason: auto_sale)
          const woRow = await db_.query(
            `INSERT INTO fb_stock_writeoffs
               (organization_id, writeoff_date, reason, notes, created_by, total_amount)
             VALUES ($1, CURRENT_DATE, 'auto_sale', $2, $3, 0)
             RETURNING id`,
            [
              orgId,
              `Авто-списання по замовленню ${receiptNum}`,
              req.user?.id || null,
            ]
          );
          const writeoffId = woRow.rows[0].id;
          let totalCost = 0;

          // 5. Записуємо кожен інгредієнт і знімаємо зі складу
          for (const d of finalDeductions) {
            const lineTotal = d.quantity * d.costPerUnit;
            totalCost += lineTotal;

            // Вставка рядка списання
            await db_.query(
              `INSERT INTO fb_stock_writeoff_items
                 (writeoff_id, ingredient_id, quantity, unit, cost_per_unit, total_cost, notes)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [writeoffId, d.ingredientId, d.quantity, d.unit, d.costPerUnit, lineTotal,
               `Авто: ${d.menuItemName}`]
            );

            // Знімаємо зі складу (не нижче 0)
            await db_.query(
              `UPDATE fb_ingredients
               SET current_stock = GREATEST(0, current_stock - $1), updated_at = NOW()
               WHERE id = $2 AND organization_id = $3`,
              [d.quantity, d.ingredientId, orgId]
            );
          }

          // 6. Оновлюємо загальну суму списання
          await db_.query(
            `UPDATE fb_stock_writeoffs SET total_amount = $1 WHERE id = $2`,
            [totalCost, writeoffId]
          );

          stockDeductionLog = { writeoffId, lines: finalDeductions.length, totalCost };
        }
      }
    } catch (stockErr: any) {
      // Non-blocking — не ламаємо оплату якщо списання не спрацювало
      console.error("[AUTO STOCK DEDUCTION] Error:", stockErr.message);
      stockDeductionLog = { error: stockErr.message };
    }

    res.json({
      order:         updatedOrder,
      receiptNumber: receiptNum,
      tipAmount:     tip,
      fiscal:        fiscalResult,
      stockDeduction: stockDeductionLog,
      change: effectiveMethod === "cash" && !isMixed
        ? Math.max(0, resolvedPaidAmount - finalAmount)
        : 0,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── SPLIT ORDER ───────────────────────────────────────────────────────────────
router.post("/orders/:id/split", requireAuth, async (req: any, res) => {
  try {
    const orgId   = getOrg(req);
    const orderId = parseInt(req.params.id);
    const { itemIds } = req.body; // fb_order_items.id[] to move to new bill
    if (!Array.isArray(itemIds) || !itemIds.length) {
      res.status(400).json({ error: "itemIds required" }); return;
    }
    const db_ = (db as any).$client;

    // Validate order belongs to org
    const origRow = await db_.query(
      `SELECT * FROM fb_orders WHERE id = $1 AND organization_id = $2`, [orderId, orgId]
    );
    if (!origRow.rows.length) { res.status(404).json({ error: "Order not found" }); return; }
    const orig = origRow.rows[0];

    // Create new order (Bill 2) — no table assignment, same metadata
    const newOrderRow = await db_.query(
      `INSERT INTO fb_orders (organization_id, order_type, guest_name, guest_count, status, notes, parent_order_id)
       VALUES ($1, $2, $3, $4, 'open', $5, $6) RETURNING *`,
      [orgId, orig.order_type, orig.guest_name, orig.guest_count, orig.notes, orderId]
    );
    const newOrderId = newOrderRow.rows[0].id;

    // Move selected items to new order
    await db_.query(
      `UPDATE fb_order_items SET order_id = $1
       WHERE id = ANY($2::int[]) AND order_id = $3 AND organization_id = $4`,
      [newOrderId, itemIds, orderId, orgId]
    );

    // Recalculate totals for both orders
    await db_.query(
      `UPDATE fb_orders
       SET total_amount = (
         SELECT COALESCE(SUM(total_price), 0)
         FROM fb_order_items WHERE order_id = fb_orders.id
       ), updated_at = NOW()
       WHERE id = ANY($1::int[])`,
      [[orderId, newOrderId]]
    );

    // Return both order summaries
    const fetchOrder = (id: number) => db_.query(
      `SELECT o.*, json_agg(row_to_json(oi)) FILTER (WHERE oi.id IS NOT NULL) AS items
       FROM fb_orders o
       LEFT JOIN fb_order_items oi ON oi.order_id = o.id
       WHERE o.id = $1 GROUP BY o.id`, [id]
    );
    const [r1, r2] = await Promise.all([fetchOrder(orderId), fetchOrder(newOrderId)]);
    res.json({ order1: r1.rows[0], order2: r2.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// POS PRINTERS
// ══════════════════════════════════════════════════════════════════════════════

router.get("/printers", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    const r = await db_.query(
      `SELECT * FROM pos_printers WHERE organization_id = $1 ORDER BY printer_type, name`, [orgId]
    );
    res.json({ printers: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/printers", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { name, printerType = "kitchen_general", ipAddress, port = 9100, usbPath, autoPrint = true, copies = 1, notes } = req.body;
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    const db_ = (db as any).$client;
    const r = await db_.query(
      `INSERT INTO pos_printers (organization_id, name, printer_type, ip_address, port, usb_path, auto_print, copies, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [orgId, name, printerType, ipAddress||null, port, usbPath||null, autoPrint, copies, notes||null]
    );
    res.status(201).json({ printer: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/printers/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const id = parseInt(req.params.id);
    const { name, printerType, ipAddress, port, usbPath, isActive, autoPrint, copies, notes } = req.body;
    const db_ = (db as any).$client;
    const r = await db_.query(
      `UPDATE pos_printers SET
         name         = COALESCE($1, name),
         printer_type = COALESCE($2, printer_type),
         ip_address   = COALESCE($3, ip_address),
         port         = COALESCE($4, port),
         usb_path     = COALESCE($5, usb_path),
         is_active    = COALESCE($6, is_active),
         auto_print   = COALESCE($7, auto_print),
         copies       = COALESCE($8, copies),
         notes        = COALESCE($9, notes),
         updated_at   = NOW()
       WHERE id = $10 AND organization_id = $11 RETURNING *`,
      [name||null, printerType||null, ipAddress||null, port??null, usbPath||null,
       isActive??null, autoPrint??null, copies??null, notes||null, id, orgId]
    );
    if (!r.rows.length) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ printer: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/printers/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const id = parseInt(req.params.id);
    const db_ = (db as any).$client;
    await db_.query(`UPDATE pos_printers SET is_active = false WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// DISCOUNTS — Акції та знижки
// ══════════════════════════════════════════════════════════════════════════════

async function ensureDiscountsTable(db_: any) {
  await db_.query(`
    CREATE TABLE IF NOT EXISTS fb_discounts (
      id                     SERIAL PRIMARY KEY,
      organization_id        INT NOT NULL,
      name                   TEXT NOT NULL,
      type                   TEXT NOT NULL DEFAULT 'percent',
      value                  NUMERIC(10,2) NOT NULL DEFAULT 0,
      min_order_amount       NUMERIC(10,2) DEFAULT 0,
      requires_manager       BOOLEAN DEFAULT false,
      is_active              BOOLEAN DEFAULT true,
      description            TEXT,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

router.get("/discounts", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    await ensureDiscountsTable(db_);
    const r = await db_.query(
      `SELECT * FROM fb_discounts WHERE organization_id = $1 AND is_active = true ORDER BY name`,
      [orgId]
    );
    res.json({ discounts: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/discounts/all", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    await ensureDiscountsTable(db_);
    const r = await db_.query(
      `SELECT * FROM fb_discounts WHERE organization_id = $1 ORDER BY is_active DESC, name`,
      [orgId]
    );
    res.json({ discounts: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/discounts", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    await ensureDiscountsTable(db_);
    const { name, type = "percent", value = 0, min_order_amount = 0, requires_manager = false, description } = req.body;
    if (!name) return res.status(400).json({ error: "Назва обов'язкова" });
    if (!["percent", "fixed", "compliment"].includes(type)) return res.status(400).json({ error: "Невірний тип знижки" });
    const r = await db_.query(
      `INSERT INTO fb_discounts (organization_id, name, type, value, min_order_amount, requires_manager, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [orgId, name, type, value, min_order_amount, requires_manager, description || null]
    );
    res.status(201).json({ discount: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/discounts/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const id = parseInt(req.params.id);
    const db_ = (db as any).$client;
    const { name, type, value, min_order_amount, requires_manager, description, is_active } = req.body;
    const r = await db_.query(
      `UPDATE fb_discounts SET
        name             = COALESCE($1, name),
        type             = COALESCE($2, type),
        value            = COALESCE($3, value),
        min_order_amount = COALESCE($4, min_order_amount),
        requires_manager = COALESCE($5, requires_manager),
        description      = COALESCE($6, description),
        is_active        = COALESCE($7, is_active)
       WHERE id = $8 AND organization_id = $9 RETURNING *`,
      [name||null, type||null, value??null, min_order_amount??null, requires_manager??null, description??null, is_active??null, id, orgId]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Не знайдено" });
    res.json({ discount: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/discounts/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const id = parseInt(req.params.id);
    const db_ = (db as any).$client;
    await db_.query(`UPDATE fb_discounts SET is_active = false WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOMERS — Клієнти / CRM
// ══════════════════════════════════════════════════════════════════════════════

async function ensureCustomersTable(db_: any) {
  await db_.query(`
    CREATE TABLE IF NOT EXISTS fb_customers (
      id              SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      name            TEXT NOT NULL,
      phone           TEXT,
      email           TEXT,
      birthday        DATE,
      notes           TEXT,
      visits_count    INT NOT NULL DEFAULT 0,
      total_spent     NUMERIC(12,2) NOT NULL DEFAULT 0,
      last_visit_at   TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db_.query(`CREATE INDEX IF NOT EXISTS idx_fb_customers_org ON fb_customers(organization_id)`);
  await db_.query(`CREATE INDEX IF NOT EXISTS idx_fb_customers_phone ON fb_customers(phone)`);
  await db_.query(`ALTER TABLE fb_orders ADD COLUMN IF NOT EXISTS customer_id INT REFERENCES fb_customers(id) ON DELETE SET NULL`);
  await db_.query(`ALTER TABLE fb_orders ADD COLUMN IF NOT EXISTS discount_label TEXT`);
}

router.get("/customers", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    await ensureCustomersTable(db_);
    const search = (req.query.search as string) || "";
    const limit = Math.min(100, parseInt(String(req.query.limit || "50")));
    const r = await db_.query(
      `SELECT * FROM fb_customers
       WHERE organization_id = $1
         AND ($2 = '' OR name ILIKE $3 OR phone ILIKE $3)
       ORDER BY last_visit_at DESC NULLS LAST, name
       LIMIT $4`,
      [orgId, search, `%${search}%`, limit]
    );
    res.json({ customers: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/customers/search", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    await ensureCustomersTable(db_);
    const q = (req.query.q as string) || "";
    const r = await db_.query(
      `SELECT id, name, phone, visits_count, total_spent FROM fb_customers
       WHERE organization_id = $1 AND (name ILIKE $2 OR phone ILIKE $2)
       ORDER BY visits_count DESC LIMIT 10`,
      [orgId, `%${q}%`]
    );
    res.json({ customers: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/customers/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const id = parseInt(req.params.id);
    const db_ = (db as any).$client;
    await ensureCustomersTable(db_);
    const cr = await db_.query(`SELECT * FROM fb_customers WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    if (!cr.rows[0]) return res.status(404).json({ error: "Не знайдено" });
    const or = await db_.query(
      `SELECT id, created_at, total_amount, discount_amount, tip_amount, payment_method, status, order_type, receipt_number
       FROM fb_orders WHERE customer_id = $1 AND organization_id = $2
       ORDER BY created_at DESC LIMIT 20`,
      [id, orgId]
    );
    res.json({ customer: cr.rows[0], orders: or.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/customers", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    await ensureCustomersTable(db_);
    const { name, phone, email, birthday, notes } = req.body;
    if (!name) return res.status(400).json({ error: "Ім'я обов'язкове" });
    const r = await db_.query(
      `INSERT INTO fb_customers (organization_id, name, phone, email, birthday, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [orgId, name, phone || null, email || null, birthday || null, notes || null]
    );
    res.status(201).json({ customer: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/customers/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const id = parseInt(req.params.id);
    const db_ = (db as any).$client;
    const { name, phone, email, birthday, notes } = req.body;
    const r = await db_.query(
      `UPDATE fb_customers SET
        name     = COALESCE($1, name),
        phone    = COALESCE($2, phone),
        email    = COALESCE($3, email),
        birthday = COALESCE($4, birthday),
        notes    = COALESCE($5, notes)
       WHERE id = $6 AND organization_id = $7 RETURNING *`,
      [name||null, phone||null, email||null, birthday||null, notes||null, id, orgId]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Не знайдено" });
    res.json({ customer: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/customers/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const id = parseInt(req.params.id);
    const db_ = (db as any).$client;
    await db_.query(`DELETE FROM fb_customers WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── AI Waiter Settings ───────────────────────────────────────────────────────
router.get("/ai-waiter-settings", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    const r = await db_.query(`SELECT * FROM fb_ai_waiter_settings WHERE org_id = $1`, [orgId]);
    res.json({ settings: r.rows[0] || null });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/ai-waiter-settings", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { waiter_name, personality, promo_text, greeting_text, language_hint } = req.body;
    const db_ = (db as any).$client;
    const r = await db_.query(`
      INSERT INTO fb_ai_waiter_settings (org_id, waiter_name, personality, promo_text, greeting_text, language_hint, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (org_id) DO UPDATE SET
        waiter_name   = EXCLUDED.waiter_name,
        personality   = EXCLUDED.personality,
        promo_text    = EXCLUDED.promo_text,
        greeting_text = EXCLUDED.greeting_text,
        language_hint = EXCLUDED.language_hint,
        updated_at    = NOW()
      RETURNING *`,
      [orgId, waiter_name || "AI Офіціант", personality || "friendly",
       promo_text || null, greeting_text || null, language_hint || "auto"]
    );
    res.json({ settings: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;

