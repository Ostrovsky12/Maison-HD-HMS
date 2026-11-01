import { Router } from "express";
import { db, pool } from "@workspace/db";
import { fbCategoriesTable, fbItemsTable, fbTablesTable, fbOrdersTable, fbOrderItemsTable } from "@workspace/db";
import { eq, and, desc, asc, sql, gte, lte, ne } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { allocatePositiveFiscalItems, orchestrateFiscalization, isSubmissionEligible } from "../services/prro-orchestrator.js";
import { submitDocument } from "./prro.js";
import { isPosterManagedOrder } from "../lib/poster-order-bridge.js";

const router = Router();
const getOrg = (req: any): number => req.user?.organizationId;

// Phase-one bridge owns open orders only. Never independently pay/fiscalize,
// split, merge or close a managed bill while its Poster account remains open.
router.use("/orders/:id", requireAuth, async (req: any, res, next) => {
  const destructive = req.method === "DELETE"
    || (req.method === "POST" && /^\/(pay|return|split|merge)\/?$/.test(req.path))
    || (req.method === "PATCH" && (["billed", "cancelled"].includes(req.body?.status) || req.body?.paidAmount !== undefined));
  if (!destructive) return next();
  try {
    if (await isPosterManagedOrder(getOrg(req), Number(req.params.id))
      || (req.body?.sourceOrderId && await isPosterManagedOrder(getOrg(req), Number(req.body.sourceOrderId)))) {
      return res.status(409).json({ error: "Рахунок пов’язаний із Poster. Оплату, закриття та поділ виконуйте на касі Poster до підключення синхронізації оплат." });
    }
    return next();
  } catch { return res.status(503).json({ error: "Не вдалося перевірити зв’язок із Poster. Операцію не виконано." }); }
});

// ── resolveOrgId — auto-creates org if user has none (mirrors acc-ledger.ts) ─
async function resolveOrgId(req: any): Promise<number> {
  if (req.user?.organizationId) return req.user.organizationId;
  const userId = req.user?.userId;
  if (!userId) throw new Error("Unauthorized: no userId");
  const { rows: uRows } = await pool.query(
    `SELECT organization_id FROM users WHERE id = $1 LIMIT 1`, [userId],
  );
  if (uRows[0]?.organization_id) {
    req.user.organizationId = uRows[0].organization_id;
    return uRows[0].organization_id;
  }
  const email = req.user?.email ?? `user${userId}@maisonhd.com`;
  const orgName = email.split("@")[0] ?? "My Organization";
  const { rows: oRows } = await pool.query(
    `INSERT INTO organizations (name, slug, plan, is_active, created_at, updated_at)
     VALUES ($1, $2, 'basic', true, NOW(), NOW()) RETURNING id`,
    [orgName, orgName.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + userId],
  );
  const newOrgId = oRows[0].id;
  await pool.query(`UPDATE users SET organization_id = $1 WHERE id = $2`, [newOrgId, userId]);
  req.user.organizationId = newOrgId;
  return newOrgId;
}

// ── Middleware: ensure every FB request has a valid organizationId ─────────────
// This fixes super_admin (organizationId=null in JWT) by looking up or creating an org.
router.use(async (req: any, res: any, next: any) => {
  // Public guest routes bypass authentication
  if (req.path.startsWith("/public/")) return next();
  requireAuth(req, res, async () => {
    try {
      await resolveOrgId(req);
      next();
    } catch (e: any) {
      res.status(401).json({ error: e.message });
    }
  });
});

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
async function seedDemo(orgId: number | null) {
  if (!orgId) return;
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
    const orgId = await resolveOrgId(req);
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
    const orgId = await resolveOrgId(req);
    await seedDemo(orgId);
    const cats = await db.select().from(fbCategoriesTable).where(eq(fbCategoriesTable.organizationId, orgId)).orderBy(asc(fbCategoriesTable.sortOrder));
    res.json({ categories: cats });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/categories", requireAuth, async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
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
    const catId = parseInt(req.params.id);
    // Null out items in this category first to avoid FK constraint violation
    await pool.query(
      `UPDATE fb_items SET category_id = NULL WHERE category_id = $1 AND organization_id = $2`,
      [catId, orgId],
    );
    await db.delete(fbCategoriesTable)
      .where(and(eq(fbCategoriesTable.id, catId), eq(fbCategoriesTable.organizationId, orgId)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Menu Items ───────────────────────────────────────────────────────────────
router.get("/items", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { categoryId, available, outletId } = req.query;
    const db_ = (db as any).$client;
    const conditions: string[] = [`fi.organization_id = $1`];
    const params: any[] = [orgId];
    if (categoryId) { params.push(parseInt(categoryId as string)); conditions.push(`fi.category_id = $${params.length}`); }
    if (available === "true") conditions.push(`fi.is_available = true`);

    // Outlet filter: hide items explicitly disabled for this outlet; apply price override
    let outletJoin = "";
    let priceSelect = "fi.price";
    if (outletId) {
      params.push(parseInt(outletId as string));
      const oidx = params.length;
      outletJoin = `LEFT JOIN fb_outlet_items foi ON foi.item_id = fi.id AND foi.outlet_id = $${oidx}`;
      conditions.push(`(foi.item_id IS NULL OR foi.is_available IS NULL OR foi.is_available = true)`);
      priceSelect = `COALESCE(foi.price_override, fi.price)`;
    }

    const r = await db_.query(
      `SELECT fi.*,
              ${priceSelect} AS price,
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
       ${outletJoin}
       WHERE ${conditions.join(" AND ")}
       ORDER BY fc.sort_order ASC NULLS LAST, fi.sort_order ASC`,
      params
    );
    res.json({ items: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Lookup item by УКЗЕД / excise code / barcode ────────────────────────────
router.get("/items/lookup", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const code = (req.query.code as string || "").trim();
    if (!code) return res.status(400).json({ error: "code is required" });
    const db_ = (db as any).$client;
    const r = await db_.query(
      `SELECT fi.*, fc.name AS "categoryName", fc.emoji AS "categoryEmoji",
              fi.image_url AS "imageUrl"
       FROM fb_items fi
       LEFT JOIN fb_categories fc ON fc.id = fi.category_id
       WHERE fi.organization_id = $1
         AND fi.is_available = true
         AND (
           fi.uktzed_code   = $2
           OR fi.excise_code = $2
           OR fi.excise_code ILIKE $3
         )
       LIMIT 1`,
      [orgId, code, `%${code}%`]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Товар не знайдено за кодом" });
    res.json({ item: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/items", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { name, description, price, categoryId, cookMinutes, isAvailable = true, isPopular = false, isVegetarian = false,
      allergens, tags, sortOrder = 0, imageUrl,
      vat_rate = 20, is_alcohol = false, alcohol_volume_pct, uktzed_code, excise_code,
      volume_l, excise_group,
      station = "kitchen_general", legal_entity_id, ingredient_id, item_type = "dish",
    } = req.body;
    const db_ = (db as any).$client;
    const r = await db_.query(
      `INSERT INTO fb_items (organization_id, name, description, price, category_id, cook_minutes,
         is_available, is_popular, is_vegetarian, allergens, tags, sort_order, image_url,
         vat_rate, is_alcohol, alcohol_volume_pct, uktzed_code, excise_code,
         volume_l, excise_group,
         station, legal_entity_id, ingredient_id, item_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING *`,
      [orgId, name, description||null, price, categoryId||null, cookMinutes||15,
       isAvailable, isPopular, isVegetarian, allergens||null, tags||null, sortOrder, imageUrl||null,
       vat_rate||20, is_alcohol||false, alcohol_volume_pct||null, uktzed_code||null, excise_code||null,
       volume_l||null, excise_group||null,
       station||"kitchen_general", legal_entity_id||null, ingredient_id||null, item_type||"dish"]
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
      station, legal_entity_id, ingredient_id, item_type,
      is_stop_list, tech_card, tax_group_id, price_happy,
    } = req.body;
    const db_ = (db as any).$client;
    // ingredient_id can be explicitly null to clear the link
    const ingredientIdVal = req.body.hasOwnProperty("ingredient_id")
      ? (ingredient_id ?? null)
      : undefined;
    const imageUrlVal = req.body.hasOwnProperty("imageUrl") ? (imageUrl ?? null) : undefined;
    const stopListVal = req.body.hasOwnProperty("is_stop_list") ? (is_stop_list ?? false) : undefined;
    const techCardVal = req.body.hasOwnProperty("tech_card") ? (tech_card ?? null) : undefined;
    const taxGroupVal = req.body.hasOwnProperty("tax_group_id") ? (tax_group_id ?? null) : undefined;
    const priceHappyVal = req.body.hasOwnProperty("price_happy") ? (price_happy ?? null) : undefined;
    const allergensVal = req.body.hasOwnProperty("allergens") ? (allergens ?? null) : undefined;
    const tagsVal = req.body.hasOwnProperty("tags") ? (tags ?? null) : undefined;
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
         is_stop_list       = CASE WHEN $26 = TRUE THEN $25 ELSE is_stop_list END,
         tech_card          = CASE WHEN $28 = TRUE THEN $27::jsonb ELSE tech_card END,
         tax_group_id       = CASE WHEN $30 = TRUE THEN $29::int ELSE tax_group_id END,
         price_happy        = CASE WHEN $32 = TRUE THEN $31::numeric ELSE price_happy END,
         allergens          = CASE WHEN $34 = TRUE THEN $33::jsonb ELSE allergens END,
         tags               = CASE WHEN $36 = TRUE THEN $35::jsonb ELSE tags END,
         item_type          = COALESCE($37::varchar, item_type),
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
       excise_group || null,
       stopListVal ?? false,
       stopListVal !== undefined,
       techCardVal ? JSON.stringify(techCardVal) : null,
       techCardVal !== undefined,
       taxGroupVal ?? null,
       taxGroupVal !== undefined,
       priceHappyVal ?? null,
       priceHappyVal !== undefined,
       allergensVal ? JSON.stringify(allergensVal) : null,
       allergensVal !== undefined,
       tagsVal ? JSON.stringify(tagsVal) : null,
       tagsVal !== undefined,
       item_type || null,
      ]
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

// ─── Modifier Groups & Options ────────────────────────────────────────────────

router.get("/modifier-groups", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { itemId } = req.query;
    const db_ = (db as any).$client;
    const params: any[] = [orgId];
    let where = `mg.organization_id = $1`;
    if (itemId) { params.push(parseInt(itemId as string)); where += ` AND mg.item_id = $2`; }
    const r = await db_.query(
      `SELECT mg.*,
              COALESCE(json_agg(
                json_build_object(
                  'id', mo.id, 'name', mo.name, 'price_delta', mo.price_delta,
                  'sort_order', mo.sort_order, 'is_available', mo.is_available,
                  'tech_card', mo.tech_card
                ) ORDER BY mo.sort_order
              ) FILTER (WHERE mo.id IS NOT NULL), '[]') AS options
       FROM fb_modifier_groups mg
       LEFT JOIN fb_modifier_options mo ON mo.group_id = mg.id
       WHERE ${where}
       GROUP BY mg.id ORDER BY mg.sort_order`, params
    );
    res.json({ groups: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Bulk-save modifier groups for an item (reconcile: delete removed, create/update)
router.put("/modifier-groups/bulk/:itemId", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const itemId = parseInt(req.params.itemId);
    const { groups } = req.body as { groups: Array<{
      id?: number; name: string; is_required: boolean;
      min_select: number; max_select: number; sort_order: number;
      options: Array<{ id?: number; name: string; price_delta: number; sort_order: number; is_available: boolean; tech_card?: any[] | null; }>;
    }> };
    const db_ = (db as any).$client;

    // Fetch existing group ids
    const { rows: existingGroups } = await db_.query(
      `SELECT id FROM fb_modifier_groups WHERE item_id = $1 AND organization_id = $2`,
      [itemId, orgId]
    );
    const incomingIds = (groups || []).filter(g => g.id).map(g => g.id!);
    const toDelete = existingGroups.map((r: any) => r.id).filter((id: number) => !incomingIds.includes(id));
    if (toDelete.length) {
      await db_.query(`DELETE FROM fb_modifier_groups WHERE id = ANY($1) AND organization_id = $2`, [toDelete, orgId]);
    }

    const resultGroups: any[] = [];
    for (let gi = 0; gi < (groups || []).length; gi++) {
      const g = groups[gi];
      let groupId = g.id;
      if (groupId) {
        await db_.query(
          `UPDATE fb_modifier_groups SET name=$1, is_required=$2, min_select=$3, max_select=$4, sort_order=$5
           WHERE id=$6 AND organization_id=$7`,
          [g.name, g.is_required, g.min_select, g.max_select, gi, groupId, orgId]
        );
      } else {
        const { rows } = await db_.query(
          `INSERT INTO fb_modifier_groups (organization_id, item_id, name, is_required, min_select, max_select, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [orgId, itemId, g.name, g.is_required, g.min_select, g.max_select, gi]
        );
        groupId = rows[0].id;
      }
      // Reconcile options
      const { rows: existingOpts } = await db_.query(
        `SELECT id FROM fb_modifier_options WHERE group_id = $1`, [groupId]
      );
      const incomingOptIds = (g.options || []).filter(o => o.id).map(o => o.id!);
      const optsToDelete = existingOpts.map((r: any) => r.id).filter((id: number) => !incomingOptIds.includes(id));
      if (optsToDelete.length) {
        await db_.query(`DELETE FROM fb_modifier_options WHERE id = ANY($1)`, [optsToDelete]);
      }
      const resultOpts: any[] = [];
      for (let oi = 0; oi < (g.options || []).length; oi++) {
        const o = g.options[oi];
        const tcJson = (o.tech_card && o.tech_card.length > 0) ? JSON.stringify(o.tech_card) : null;
        if (o.id) {
          await db_.query(
            `UPDATE fb_modifier_options SET name=$1, price_delta=$2, sort_order=$3, is_available=$4, tech_card=$5
             WHERE id=$6 AND group_id=$7`,
            [o.name, o.price_delta, oi, o.is_available, tcJson, o.id, groupId]
          );
          resultOpts.push({ ...o, sort_order: oi });
        } else {
          const { rows } = await db_.query(
            `INSERT INTO fb_modifier_options (organization_id, group_id, name, price_delta, sort_order, is_available, tech_card)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [orgId, groupId, o.name, o.price_delta, oi, o.is_available !== false, tcJson]
          );
          resultOpts.push(rows[0]);
        }
      }
      resultGroups.push({ ...g, id: groupId, sort_order: gi, options: resultOpts });
    }
    res.json({ groups: resultGroups });
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
    const orgId = await resolveOrgId(req);
    const db_ = (db as any).$client;

    // Physical tables (with or without active orders)
    const { rows: tableRows } = await db_.query(
      `SELECT
         t.id,
         t.number        AS table_number,
         t.capacity,
         t.location      AS section,
         t.status,
         t.current_order_id,
         t.is_active,
         t.group_id,
         tg.name         AS group_name,
         tg.icon         AS group_icon,
         tg.color        AS group_color,
         tg.is_minibar   AS group_is_minibar,
         o.guest_name    AS current_guest,
         o.total_amount  AS current_total,
         o.status        AS order_status,
         o.order_type,
         NULL::int       AS current_waiter_user_id
       FROM fb_tables t
       LEFT JOIN fb_table_groups tg ON tg.id = t.group_id AND tg.is_active = true
       LEFT JOIN fb_orders o ON o.id = t.current_order_id
       WHERE t.organization_id = $1 AND t.is_active = true
       ORDER BY t.location, t.number`,
      [orgId]
    );

    // Orphan orders (no table_id) — waiter typed a number not in DB, show them as virtual rows
    const { rows: orphanRows } = await db_.query(
      `SELECT
         NULL::int                                            AS id,
         REGEXP_REPLACE(o.guest_name, '^Стіл\\s+', '')       AS table_number,
         1                                                   AS capacity,
         'Без столу'                                         AS section,
         'occupied'                                          AS status,
         o.id                                               AS current_order_id,
         true                                               AS is_active,
         o.guest_name                                       AS current_guest,
         o.total_amount                                     AS current_total,
         o.status                                           AS order_status,
         o.order_type,
         NULL::int                                          AS current_waiter_user_id
       FROM fb_orders o
       WHERE o.organization_id = $1
         AND o.table_id IS NULL
         AND o.status NOT IN ('billed', 'cancelled')
       ORDER BY o.opened_at DESC`,
      [orgId]
    );

    res.json({ tables: [...tableRows, ...orphanRows] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/tables", requireAuth, async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { number, capacity, location, groupId } = req.body;
    if (!number?.trim()) { res.status(400).json({ error: "Номер столу обов'язковий" }); return; }
    const db_ = (db as any).$client;
    const r = await db_.query(
      `INSERT INTO fb_tables (organization_id, number, capacity, location, group_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orgId, number.trim(), parseInt(capacity) || 4, location?.trim() || "Основний зал", groupId ? parseInt(groupId) : null]
    );
    res.json({ table: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/tables/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    const { status, number, capacity, location, groupId } = req.body;
    // Use raw SQL to support group_id (not yet in Drizzle schema)
    const r = await db_.query(
      `UPDATE fb_tables SET
         status           = COALESCE($1, status),
         current_order_id = CASE WHEN $1 = 'free' THEN NULL ELSE current_order_id END,
         number           = COALESCE($2, number),
         capacity         = COALESCE($3, capacity),
         location         = COALESCE($4, location),
         group_id         = CASE WHEN $5 IS NOT NULL THEN $5::int ELSE group_id END,
         updated_at       = NOW()
       WHERE id = $6 AND organization_id = $7 RETURNING *`,
      [status ?? null, number ?? null, capacity ? parseInt(capacity) : null,
       location ?? null, groupId !== undefined ? (groupId ? parseInt(groupId) : null) : undefined,
       parseInt(req.params.id), orgId]
    );
    // Handle "unset group" explicitly (groupId === null sent by client)
    if (groupId === null || groupId === "") {
      await db_.query(
        `UPDATE fb_tables SET group_id = NULL WHERE id = $1 AND organization_id = $2`,
        [parseInt(req.params.id), orgId]
      );
    }
    res.json({ table: r.rows[0] });
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
    const { status, type, open, date_from, date_to } = req.query;
    let conditions: any[] = [eq(fbOrdersTable.organizationId, orgId)];
    if (status && status !== "all") conditions.push(eq(fbOrdersTable.status, status as any));
    if (type && type !== "all") conditions.push(eq(fbOrdersTable.orderType, type as any));
    if (open === "true") {
      // all non-closed
      conditions.push(ne(fbOrdersTable.status, "billed"));
      conditions.push(ne(fbOrdersTable.status, "cancelled"));
    }
    if (date_from) {
      const from = new Date(date_from as string);
      from.setHours(0, 0, 0, 0);
      conditions.push(gte(fbOrdersTable.closedAt, from));
    }
    if (date_to) {
      const to = new Date(date_to as string);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(fbOrdersTable.closedAt, to));
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

    const db_ = (db as any).$client;
    const { rows: orderRows } = await db_.query(
      `SELECT o.id, o.order_type AS "orderType", o.guest_name AS "guestName",
              o.room_number AS "roomNumber", o.guest_count AS "guestCount",
              o.status, o.total_amount AS "totalAmount", o.paid_amount AS "paidAmount",
              o.notes, o.staff_notes AS "staffNotes",
              o.opened_at AS "openedAt", o.table_id AS "tableId",
              o.tip_pct AS "tipPct", o.receipt_number AS "receiptNumber",
              o.payment_method AS "paymentMethod", o.closed_at AS "closedAt",
              o.fiscal_status AS "fiscalStatus",
              o.fiscal_receipt_id AS "fiscalReceiptId",
              o.fiscal_receipt_url AS "fiscalReceiptUrl",
              o.fiscal_qr_url AS "fiscalQrUrl",
              ft.number AS "tableNumber"
       FROM fb_orders o
       LEFT JOIN fb_tables ft ON ft.id = o.table_id
       WHERE o.id = $1 AND o.organization_id = $2`,
      [orderId, orgId]
    );
    const order = orderRows[0];

    if (!order) return res.status(404).json({ error: "Not found" });

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
  const client = await pool.connect();
  let transaction = false;
  try {
    const orgId = getOrg(req);
    const { tableId, orderType, guestName, roomNumber, guestCount, notes, bookingId, outletId } = req.body;
    await client.query("BEGIN");
    transaction = true;
    if (tableId) {
      const table = (await client.query("SELECT * FROM fb_tables WHERE id=$1 AND organization_id=$2 AND is_active=true FOR UPDATE", [tableId, orgId])).rows[0];
      if (!table) return res.status(404).json({ error: "Стіл не знайдено в цьому закладі." });
      if (table.status === "occupied" && table.current_order_id) {
        const existing = (await client.query("SELECT * FROM fb_orders WHERE id=$1 AND organization_id=$2 AND table_id=$3 AND status NOT IN ('billed','cancelled') FOR UPDATE",
          [table.current_order_id, orgId, tableId])).rows[0];
        if (existing) {
          if (Number(existing.paid_amount || 0) > 0) return res.status(409).json({ error: "Рахунок уже оплачується." });
          await client.query("COMMIT"); transaction = false;
          return res.json({ order: existing, reused: true });
        }
      }
    }
    if (outletId && !(await client.query("SELECT id FROM fb_outlets WHERE id=$1 AND organization_id=$2", [outletId, orgId])).rows.length) {
      return res.status(404).json({ error: "Точку продажу не знайдено." });
    }

    const { rows: [order] } = await client.query(
      `INSERT INTO fb_orders
         (organization_id, table_id, order_type, guest_name, room_number,
          guest_count, notes, booking_id, outlet_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [orgId, tableId || null, orderType || "dine_in", guestName || null,
       roomNumber || null, parseInt(guestCount) || 1, notes || null,
       bookingId || null, outletId || null]
    );

    if (tableId) {
      // Scope the table update to the same org to prevent cross-tenant write
      await client.query(
        `UPDATE fb_tables SET status = 'occupied', current_order_id = $1 WHERE id = $2 AND organization_id = $3`,
        [order.id, tableId, orgId]
      );
    }

    await client.query("COMMIT"); transaction = false;
    return res.json({ order });
  } catch { return res.status(500).json({ error: "Не вдалося створити замовлення." }); }
  finally {
    if (transaction) await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
});

// ─── Update order status ──────────────────────────────────────────────────────
router.patch("/orders/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const orderId = parseInt(req.params.id);
    const { status, paidAmount, staffNotes } = req.body;
    const db_ = (db as any).$client;

    const setClauses: string[] = ["updated_at = NOW()"];
    const vals: any[] = [];
    let idx = 1;

    if (status) {
      setClauses.push(`status = $${idx++}`); vals.push(status);
      if (["billed", "cancelled"].includes(status)) { setClauses.push(`closed_at = NOW()`); }
    }
    if (paidAmount !== undefined) { setClauses.push(`paid_amount = $${idx++}`); vals.push(paidAmount); }
    if (staffNotes !== undefined) { setClauses.push(`staff_notes = $${idx++}`); vals.push(staffNotes); }

    vals.push(orderId); vals.push(orgId);
    const { rows: [order] } = await db_.query(
      `UPDATE fb_orders SET ${setClauses.join(", ")}
       WHERE id = $${idx++} AND organization_id = $${idx++}
       RETURNING id, table_id, status, closed_at, total_amount, paid_amount, order_type, guest_name`,
      vals
    );

    if (status && ["billed", "cancelled"].includes(status) && order?.table_id) {
      await db_.query(
        `UPDATE fb_tables SET status = 'free', current_order_id = NULL WHERE id = $1`,
        [order.table_id]
      );
    }

    res.json({ order });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Add item to order ────────────────────────────────────────────────────────
router.post("/orders/:id/items", requireAuth, async (req: any, res) => {
  const client = await pool.connect();
  let transaction = false;
  try {
    const orgId = getOrg(req);
    const orderId = parseInt(req.params.id);
    const { itemId, quantity, notes } = req.body;
    await client.query("BEGIN"); transaction = true;
    const order = (await client.query("SELECT * FROM fb_orders WHERE id=$1 AND organization_id=$2 FOR UPDATE", [orderId, orgId])).rows[0];
    if (!order) return res.status(404).json({ error: "Замовлення не знайдено." });
    if (["billed", "cancelled"].includes(order.status) || Number(order.paid_amount || 0) > 0) return res.status(409).json({ error: "Не можна доповнювати закритий або оплачений рахунок." });

    let name: string, price: string;
    if (itemId) {
      const { rows } = await client.query(
        `SELECT name, price FROM fb_items WHERE id = $1 AND organization_id = $2`,
        [parseInt(itemId), orgId]
      );
      if (!rows.length) return res.status(404).json({ error: "Страву не знайдено" });
      name = rows[0].name; price = rows[0].price;
    } else {
      name = req.body.name; price = req.body.price;
    }

    const qty = Number(quantity ?? 1);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 100 || !name || !Number.isFinite(Number(price)) || Number(price) < 0) return res.status(400).json({ error: "Перевірте назву, ціну та кількість страви." });
    const total = (parseFloat(price) * qty).toFixed(2);

    const { rows: [orderItem] } = await client.query(
      `INSERT INTO fb_order_items (order_id, item_id, organization_id, name, price, quantity, total_price, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [orderId, itemId || null, orgId, name, price, qty, total, notes || null]
    );

    // Recalc order total
    const { rows: sumRows } = await client.query(
      `SELECT COALESCE(SUM(total_price),0)::numeric AS total FROM fb_order_items
       WHERE order_id = $1 AND status != 'cancelled'`,
      [orderId]
    );
    const newTotal = parseFloat(sumRows[0].total).toFixed(2);
    // Scope total update to org to prevent cross-tenant write
    await client.query(
      `UPDATE fb_orders SET total_amount = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
      [newTotal, orderId, orgId]
    );

    await client.query("COMMIT"); transaction = false;
    return res.json({ item: orderItem, newTotal });
  } catch { return res.status(500).json({ error: "Не вдалося додати страву." }); }
  finally {
    if (transaction) await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
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
    const db_ = (db as any).$client;

    const setClauses: string[] = [`status = $1`];
    const vals: any[] = [status];
    if (status === "cooking") setClauses.push("sent_at = NOW()");
    if (status === "ready")   setClauses.push("ready_at = NOW()");
    if (status === "served")  setClauses.push("served_at = NOW()");
    vals.push(parseInt(req.params.id)); vals.push(orgId);

    const { rows: [item] } = await db_.query(
      `UPDATE fb_order_items SET ${setClauses.join(", ")}
       WHERE id = $2 AND organization_id = $3
       RETURNING id, order_id, status, sent_at, ready_at, served_at`,
      vals
    );
    res.json({ item });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// CASHBOX SESSION — POS Каса
// ══════════════════════════════════════════════════════════════════════════════

// GET legal entities available for cashbox sessions (used by shift-open dialog)
router.get("/cashbox/legal-entities", requireAuth, async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const db_ = (db as any).$client;
    // Return legal entities with current open session info
    const r = await db_.query(
      `SELECT le.*,
              cs.id         AS session_id,
              cs.cashbox_name AS session_cashbox_name,
              cs.opened_at  AS session_opened_at,
              cs.status     AS session_status
       FROM legal_entities le
       LEFT JOIN cashbox_sessions cs ON cs.legal_entity_id = le.id
         AND cs.organization_id = $1 AND cs.status = 'open'
       WHERE le.organization_id = $1 AND le.is_active = true
       ORDER BY le.is_default DESC, le.name ASC`,
      [orgId]
    );
    res.json({ legalEntities: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET current open session(s)
router.get("/cashbox/session", requireAuth, async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
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
    const orgId = await resolveOrgId(req);
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
       WHERE organization_id = $1 AND status = 'billed'
         AND DATE(closed_at) = $2::date
       GROUP BY payment_method`, [orgId, date]
    );
    const totals = await db_.query(
      `SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_amount),0)::numeric AS revenue,
              COALESCE(SUM(discount_amount),0)::numeric AS discounts,
              COALESCE(AVG(total_amount),0)::numeric AS avg_check
       FROM fb_orders WHERE organization_id = $1 AND status = 'billed' AND DATE(closed_at) = $2::date`,
      [orgId, date]
    );
    res.json({
      date,
      byPaymentMethod: orders.rows,
      totals: totals.rows[0],
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── CASH MOVEMENT (внесення / інкасація) ─────────────────────────────────────
router.post("/cashbox/movement", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { type, amount, notes } = req.body;
    const db_ = (db as any).$client;
    const sess = await db_.query(
      `SELECT id FROM cashbox_sessions WHERE organization_id=$1 AND status='open' LIMIT 1`, [orgId]
    );
    if (!sess.rows.length) { res.status(400).json({ error: "Немає відкритої зміни" }); return; }
    const sessionId = sess.rows[0].id;
    const amt = Math.abs(Number(amount) || 0);
    if (type === "in") {
      await db_.query(
        `UPDATE cashbox_sessions SET cash_in=cash_in+$1, expected_balance=expected_balance+$1 WHERE id=$2 AND organization_id=$3`, [amt, sessionId, orgId]
      );
    } else {
      await db_.query(
        `UPDATE cashbox_sessions SET cash_out=cash_out+$1, expected_balance=GREATEST(0,expected_balance-$1) WHERE id=$2 AND organization_id=$3`, [amt, sessionId, orgId]
      );
    }
    const r = await db_.query(`SELECT * FROM cashbox_sessions WHERE id=$1`, [sessionId]);
    res.json({ session: r.rows[0], movement: { type, amount: amt, notes } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── X-REPORT (поточна зміна, опц. sessionId) ──────────────────────────────────
router.get("/cashbox/x-report", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : null;
    const sess = await db_.query(
      `SELECT cs.*, u.name AS cashier_name,
              le.name AS entity_name, le.short_name AS entity_short_name
       FROM cashbox_sessions cs
       LEFT JOIN users u ON u.id = cs.cashier_id
       LEFT JOIN legal_entities le ON le.id = cs.legal_entity_id
       WHERE cs.organization_id=$1 AND cs.status='open'
         AND ($2::int IS NULL OR cs.id = $2)
       ORDER BY cs.opened_at ASC LIMIT 1`, [orgId, sessionId]
    );
    if (!sess.rows.length) { res.json({ session: null, byPayment: [], byOutlet: [], totals: {} }); return; }
    const session = sess.rows[0];
    const [byPayR, totR, byOutletR] = await Promise.all([
      db_.query(
        `SELECT payment_method AS method, COUNT(*)::int AS cnt, COALESCE(SUM(total_amount),0)::numeric AS amount
         FROM fb_orders WHERE organization_id=$1 AND status='billed' AND closed_at >= $2
         GROUP BY payment_method ORDER BY amount DESC`, [orgId, session.opened_at]
      ),
      db_.query(
        `SELECT COUNT(*)::int AS checks, COALESCE(SUM(total_amount),0)::numeric AS revenue,
                COALESCE(SUM(guest_count),0)::int AS guests
         FROM fb_orders WHERE organization_id=$1 AND status='billed' AND closed_at >= $2`,
        [orgId, session.opened_at]
      ),
      db_.query(
        `SELECT COALESCE(o.name, 'Без точки') AS outlet_name,
                COALESCE(o.icon, '🍽') AS outlet_icon,
                COALESCE(o.color, '#6b7280') AS outlet_color,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(r.total_amount),0)::numeric AS amount
         FROM fb_orders r
         LEFT JOIN fb_outlets o ON o.id = r.outlet_id
         WHERE r.organization_id=$1 AND r.status='billed' AND r.closed_at >= $2
         GROUP BY o.id, o.name, o.icon, o.color
         ORDER BY amount DESC`, [orgId, session.opened_at]
      ),
    ]);
    res.json({ session, byPayment: byPayR.rows, byOutlet: byOutletR.rows, totals: totR.rows[0] || {} });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Y-REPORT (звіт по закритій зміні) ─────────────────────────────────────────
router.get("/cashbox/y-report", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    const date = req.query.date ? String(req.query.date) : new Date().toISOString().split("T")[0];
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : null;
    const sessions = await db_.query(
      `SELECT cs.*, u.name AS cashier_name,
              le.name AS entity_name, le.short_name AS entity_short_name
       FROM cashbox_sessions cs
       LEFT JOIN users u ON u.id = cs.cashier_id
       LEFT JOIN legal_entities le ON le.id = cs.legal_entity_id
       WHERE cs.organization_id=$1
         AND ($2::int IS NULL OR cs.id = $2)
         AND (DATE(cs.opened_at) = $3::date OR ($2::int IS NULL AND DATE(cs.closed_at) = $3::date))
       ORDER BY cs.opened_at DESC`, [orgId, sessionId, date]
    );
    if (!sessions.rows.length) { res.json({ sessions: [], date }); return; }
    const result = await Promise.all(sessions.rows.map(async (session: any) => {
      const endAt = session.closed_at || new Date().toISOString();
      const [byPayR, totR, byOutletR] = await Promise.all([
        db_.query(
          `SELECT payment_method AS method, COUNT(*)::int AS cnt, COALESCE(SUM(total_amount),0)::numeric AS amount
           FROM fb_orders WHERE organization_id=$1 AND status='billed'
             AND closed_at BETWEEN $2 AND $3
           GROUP BY payment_method ORDER BY amount DESC`,
          [orgId, session.opened_at, endAt]
        ),
        db_.query(
          `SELECT COUNT(*)::int AS checks, COALESCE(SUM(total_amount),0)::numeric AS revenue,
                  COALESCE(SUM(guest_count),0)::int AS guests,
                  COALESCE(SUM(discount_amount),0)::numeric AS discounts
           FROM fb_orders WHERE organization_id=$1 AND status='billed'
             AND closed_at BETWEEN $2 AND $3`,
          [orgId, session.opened_at, endAt]
        ),
        db_.query(
          `SELECT COALESCE(o.name, 'Без точки') AS outlet_name,
                  COALESCE(o.icon, '🍽') AS outlet_icon,
                  COALESCE(o.color, '#6b7280') AS outlet_color,
                  COUNT(*)::int AS cnt,
                  COALESCE(SUM(r.total_amount),0)::numeric AS amount
           FROM fb_orders r
           LEFT JOIN fb_outlets o ON o.id = r.outlet_id
           WHERE r.organization_id=$1 AND r.status='billed'
             AND r.closed_at BETWEEN $2 AND $3
           GROUP BY o.id, o.name, o.icon, o.color
           ORDER BY amount DESC`,
          [orgId, session.opened_at, endAt]
        ),
      ]);
      return { session, byPayment: byPayR.rows, byOutlet: byOutletR.rows, totals: totR.rows[0] || {} };
    }));
    res.json({ sessions: result, date });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── PERIODIC REPORT (звіт за период) ──────────────────────────────────────────
router.get("/cashbox/periodic-report", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { from, to } = dateRange(req.query.from as string, req.query.to as string);
    const db_ = (db as any).$client;
    const [byPayR, totR, byDayR, byOutletR] = await Promise.all([
      db_.query(
        `SELECT payment_method AS method, COUNT(*)::int AS cnt, COALESCE(SUM(total_amount),0)::numeric AS amount
         FROM fb_orders WHERE organization_id=$1 AND status='billed'
           AND DATE(closed_at) BETWEEN $2 AND $3
         GROUP BY payment_method ORDER BY amount DESC`,
        [orgId, from, to]
      ),
      db_.query(
        `SELECT COUNT(*)::int AS checks, COALESCE(SUM(total_amount),0)::numeric AS revenue,
                COALESCE(SUM(guest_count),0)::int AS guests,
                COALESCE(SUM(discount_amount),0)::numeric AS discounts,
                COALESCE(AVG(total_amount),0)::numeric AS avg_check
         FROM fb_orders WHERE organization_id=$1 AND status='billed'
           AND DATE(closed_at) BETWEEN $2 AND $3`,
        [orgId, from, to]
      ),
      db_.query(
        `SELECT DATE(closed_at) AS day,
                COUNT(*)::int AS checks,
                COALESCE(SUM(total_amount),0)::numeric AS revenue
         FROM fb_orders WHERE organization_id=$1 AND status='billed'
           AND DATE(closed_at) BETWEEN $2 AND $3
         GROUP BY DATE(closed_at) ORDER BY day ASC`,
        [orgId, from, to]
      ),
      db_.query(
        `SELECT COALESCE(o.name, 'Без точки') AS outlet_name,
                COALESCE(o.icon, '🍽') AS outlet_icon,
                COALESCE(o.color, '#6b7280') AS outlet_color,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(r.total_amount),0)::numeric AS amount
         FROM fb_orders r
         LEFT JOIN fb_outlets o ON o.id = r.outlet_id
         WHERE r.organization_id=$1 AND r.status='billed'
           AND DATE(r.closed_at) BETWEEN $2 AND $3
         GROUP BY o.id, o.name, o.icon, o.color
         ORDER BY amount DESC`,
        [orgId, from, to]
      ),
    ]);
    res.json({ from, to, byPayment: byPayR.rows, byOutlet: byOutletR.rows, totals: totR.rows[0] || {}, byDay: byDayR.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── RETURN ORDER (повернення) ─────────────────────────────────────────────────
// ── PRINT RECEIPT to internal receipt printer ────────────────────────────────
router.post("/orders/:id/print-receipt", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const orderId = parseInt(req.params.id);
    const db_ = (db as any).$client;

    // Find active receipt printer for this org
    const printerRow = await db_.query(
      `SELECT * FROM pos_printers
       WHERE organization_id = $1 AND printer_type = 'receipt' AND is_active = true
       ORDER BY id LIMIT 1`,
      [orgId]
    );
    if (!printerRow.rows.length) {
      res.status(404).json({ error: "Принтер чеків не налаштований. Налаштуйте принтер у розділі Налаштування → Принтери." });
      return;
    }
    const printer = printerRow.rows[0];

    // Get order + table
    const orderRow = await db_.query(
      `SELECT o.*, rt.number AS table_number, rt.location AS table_location
       FROM fb_orders o
       LEFT JOIN restaurant_tables rt ON rt.id = o.table_id
       WHERE o.id = $1 AND o.organization_id = $2`,
      [orderId, orgId]
    );
    if (!orderRow.rows.length) { res.status(404).json({ error: "Замовлення не знайдено" }); return; }
    const order = orderRow.rows[0];

    // Get order items
    const itemsRow = await db_.query(
      `SELECT oi.quantity, oi.unit_price AS price, oi.total_price, oi.notes,
              fi.name
       FROM fb_order_items oi
       LEFT JOIN fb_items fi ON fi.id = oi.item_id
       WHERE oi.order_id = $1`,
      [orderId]
    );
    const items = itemsRow.rows.map((i: any) => ({
      name: i.name,
      quantity: Number(i.quantity),
      price: Number(i.price),
      total: Number(i.total_price),
      notes: i.notes || null,
    }));

    // Create print job
    await db_.query(
      `INSERT INTO fb_print_jobs
         (organization_id, order_id, printer_id, printer_type, station,
          status, table_number, table_location, guest_name, items_json)
       VALUES ($1,$2,$3,'receipt','receipt','queued',$4,$5,$6,$7)`,
      [orgId, orderId, printer.id,
       order.table_number || null, order.table_location || null,
       order.guest_name || null,
       JSON.stringify(items)]
    );

    res.json({ ok: true, printerName: printer.name || "Принтер чеків" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/orders/:id/return", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const orderId = parseInt(req.params.id);
    const { reason } = req.body;
    const db_ = (db as any).$client;
    const orig = await db_.query(
      `SELECT * FROM fb_orders WHERE id=$1 AND organization_id=$2 AND status='billed'`, [orderId, orgId]
    );
    if (!orig.rows.length) { res.status(404).json({ error: "Замовлення не знайдено або не закрите" }); return; }
    const order = orig.rows[0];
    const returnNum = `RET-${order.receipt_number || orderId}`;
    const retR = await db_.query(
      `INSERT INTO fb_orders
         (organization_id, order_type, guest_name, status, total_amount, paid_amount,
          payment_method, receipt_number, notes, closed_at, opened_at)
       VALUES ($1,'dine_in',$2,'cancelled',
               (SELECT total_amount FROM fb_orders WHERE id=$3) * -1,
               (SELECT paid_amount  FROM fb_orders WHERE id=$3) * -1,
               $4,$5,$6,NOW(),NOW()) RETURNING id, receipt_number`,
      [orgId, order.guest_name, orderId, order.payment_method, returnNum,
       `ПОВЕРНЕННЯ. Причина: ${reason || "не вказана"}. Оригінал: ${order.receipt_number || orderId}`]
    );
    await db_.query(
      `UPDATE fb_orders SET notes=CONCAT(COALESCE(notes,''), ' [ПОВЕРНЕНО]'), updated_at=NOW() WHERE id=$1 AND organization_id=$2`, [orderId, orgId]
    );
    res.json({ returnOrder: retR.rows[0] });
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

    // ── Shared PRRO orchestration (one document per seller) ─────────────────
    let fiscalResult: any = null;
    try {
      const leId = legalEntityId || updatedOrder.legal_entity_id;
      const itemsRow = await db_.query(
        `SELECT oi.name, oi.quantity, oi.price, oi.total_price, fi.legal_entity_id,
                fi.vat_rate, fi.uktzed_code
           FROM fb_order_items oi
           LEFT JOIN fb_items fi ON fi.id = oi.item_id
          WHERE oi.order_id = $1 AND oi.organization_id = $2
          ORDER BY oi.id`, [orderId, orgId]
      );
      const itemKind = "goods" as const;
      const fiscalItems = itemsRow.rows.map((item: any) => ({
        name: item.name || "Позиція",
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.price || 0),
        amount: Number(item.total_price ?? Number(item.price || 0) * Number(item.quantity || 1)),
        taxCode: item.vat_rate !== undefined && item.vat_rate !== null ? String(item.vat_rate) : undefined,
        productCode: item.uktzed_code || undefined,
        legalEntityId: item.legal_entity_id || leId || undefined,
      }));
      if (tip > 0 && leId) {
        fiscalItems.push({
          name: "Сервісний збір",
          quantity: 1,
          unitPrice: tip,
          amount: tip,
          legalEntityId: leId,
        });
      }
      const payableItems = allocatePositiveFiscalItems(fiscalItems, finalAmount);
      const paymentChannel = effectiveMethod === "cash" ? "cash"
        : effectiveMethod === "pos" || effectiveMethod === "card" ? "pos_card" : "pos_card";
      const allocation = await orchestrateFiscalization({
        organizationId: orgId,
        sourceType: "fb_order",
        sourceId: String(orderId),
        items: payableItems,
        defaultLegalEntityId: leId,
        totalAmount: finalAmount,
        paymentChannel,
        idempotencyKey: `fb-order:${orgId}:${orderId}:payment`,
        createdBy: req.user?.userId,
        requestId: String(req.id ?? ""),
      });
      const submitted = [];
      for (const document of allocation.documents) {
        submitted.push(isSubmissionEligible(document.status)
          ? await submitDocument(orgId, Number(document.id), String(req.id ?? ""))
          : document);
      }
      fiscalResult = { ...allocation, documents: submitted };
      const first = submitted[0] as any;
      const fiscalized = submitted.filter((d: any) => ["fiscalized", "completed"].includes(d?.status)).length;
      const fiscalStatus = fiscalized === submitted.length ? "done"
        : submitted.some((d: any) => d?.status === "review") ? "review" : "error";
      await db_.query(
        `UPDATE fb_orders SET
           fiscal_receipt_id = $1, fiscal_receipt_url = $2, fiscal_qr_url = $3,
           fiscal_status = $4, fiscal_data = $5, updated_at = NOW()
         WHERE id = $6 AND organization_id = $7`,
        [first?.dpsDocumentId || first?.dps_document_id || null,
         first?.dpsDocumentId ? `https://cabinet.tax.gov.ua/check?id=${first.dpsDocumentId}` : null,
         null, fiscalStatus, JSON.stringify(fiscalResult), orderId, orgId]
      );
    } catch (fiscalErr: any) {
      // Payment remains recorded, while fiscalization is explicitly visible for retry/review.
      await db_.query(
        `UPDATE fb_orders SET fiscal_status = 'error', fiscal_data = $1 WHERE id = $2 AND organization_id = $3`,
        [JSON.stringify({ error: fiscalErr.message }), orderId, orgId]
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
            // ── Завантажуємо дані позиції меню ────────────────────────────────
            const fbItemRow = await db_.query(
              `SELECT fi.item_type, fi.tech_card, fi.ingredient_id,
                      ing.unit AS ing_unit, ing.cost_per_unit AS ing_cost
               FROM fb_items fi
               LEFT JOIN fb_ingredients ing ON ing.id = fi.ingredient_id
               WHERE fi.id = $1 AND fi.organization_id = $2`,
              [oi.item_id, orgId]
            );
            const fbItem = fbItemRow.rows[0];

            // ── Шлях 1.5: tech_card JSONB (наш редактор техкарти) ─────────────
            const tcLines = Array.isArray(fbItem?.tech_card) ? fbItem.tech_card : null;
            if (tcLines && tcLines.length > 0 && fbItem?.item_type !== "goods") {
              for (const line of tcLines) {
                if (!line.ingredient_id || !line.brutto) continue;
                const ingRow = await db_.query(
                  `SELECT unit, cost_per_unit FROM fb_ingredients WHERE id = $1 AND organization_id = $2`,
                  [line.ingredient_id, orgId]
                );
                if (!ingRow.rows.length) continue;
                const ing = ingRow.rows[0];
                const conv = unitFactor(line.unit || "г", ing.unit);
                const deductQty = Number(line.brutto) * conv * Number(oi.quantity);
                if (deductQty <= 0) continue;
                deductions.push({
                  ingredientId: line.ingredient_id,
                  quantity: deductQty,
                  unit: ing.unit,
                  costPerUnit: Number(ing.cost_per_unit) || Number(line.cost_per_unit) || 0,
                  menuItemName: oi.name,
                  deductionType: "tech_card",
                });
              }
            } else if (fbItem?.ingredient_id && fbItem?.ing_unit) {
              // ── Шлях 2: Товар (пряма прив'язка до інгредієнту) ───────────────
              // 1 продаж = 1 одиниця зі складу × кількість
              deductions.push({
                ingredientId: fbItem.ingredient_id,
                quantity: Number(oi.quantity),
                unit: fbItem.ing_unit,
                costPerUnit: Number(fbItem.ing_cost) || 0,
                menuItemName: oi.name,
                deductionType: "direct",
              });
            }
            // Якщо жодного зв'язку (послуга) — пропускаємо

            // ── Шлях 3: Модифікатори → склад (tech_card на опції) ────────────────
            if (Array.isArray(oi.modifiers) && oi.modifiers.length > 0) {
              const optionIds = oi.modifiers.map((m: any) => m.optionId).filter(Boolean);
              if (optionIds.length > 0) {
                const modOptsRow = await db_.query(
                  `SELECT id, tech_card FROM fb_modifier_options WHERE id = ANY($1) AND tech_card IS NOT NULL`,
                  [optionIds]
                );
                for (const modOpt of modOptsRow.rows) {
                  const modTc = Array.isArray(modOpt.tech_card) ? modOpt.tech_card : null;
                  if (!modTc || modTc.length === 0) continue;
                  for (const line of modTc) {
                    if (!line.ingredient_id || !line.brutto) continue;
                    const ingRow2 = await db_.query(
                      `SELECT unit, cost_per_unit FROM fb_ingredients WHERE id = $1 AND organization_id = $2`,
                      [line.ingredient_id, orgId]
                    );
                    if (!ingRow2.rows.length) continue;
                    const ing2 = ingRow2.rows[0];
                    const conv2 = unitFactor(line.unit || "г", ing2.unit);
                    const deductQty2 = Number(line.brutto) * conv2 * Number(oi.quantity);
                    if (deductQty2 <= 0) continue;
                    deductions.push({
                      ingredientId: line.ingredient_id,
                      quantity: deductQty2,
                      unit: ing2.unit,
                      costPerUnit: Number(ing2.cost_per_unit) || Number(line.cost_per_unit) || 0,
                      menuItemName: `${oi.name} (мод.)`,
                      deductionType: "modifier_tech_card",
                    });
                  }
                }
              }
            }
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

// ── MERGE ORDERS ──────────────────────────────────────────────────────────────
router.post("/orders/:id/merge", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const targetOrderId = parseInt(req.params.id);
    const { sourceOrderId } = req.body;
    if (!sourceOrderId) { res.status(400).json({ error: "sourceOrderId required" }); return; }
    const srcId = parseInt(sourceOrderId);
    if (srcId === targetOrderId) { res.status(400).json({ error: "Cannot merge order with itself" }); return; }
    const db_ = (db as any).$client;

    // Validate both orders belong to org
    const [targetRow, sourceRow] = await Promise.all([
      db_.query(`SELECT * FROM fb_orders WHERE id = $1 AND organization_id = $2`, [targetOrderId, orgId]),
      db_.query(`SELECT * FROM fb_orders WHERE id = $1 AND organization_id = $2`, [srcId, orgId]),
    ]);
    if (!targetRow.rows.length) { res.status(404).json({ error: "Target order not found" }); return; }
    if (!sourceRow.rows.length) { res.status(404).json({ error: "Source order not found" }); return; }
    if (sourceRow.rows[0].status === "billed") { res.status(400).json({ error: "Cannot merge a paid order" }); return; }

    // Move all active items from source to target
    await db_.query(
      `UPDATE fb_order_items SET order_id = $1
       WHERE order_id = $2 AND organization_id = $3 AND status != 'cancelled'`,
      [targetOrderId, srcId, orgId]
    );

    // Cancel source order — org-scoped
    await db_.query(
      `UPDATE fb_orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [srcId, orgId]
    );

    // Recalculate target total — org-scoped
    await db_.query(
      `UPDATE fb_orders
       SET total_amount = (SELECT COALESCE(SUM(total_price),0) FROM fb_order_items WHERE order_id = $1 AND status != 'cancelled'),
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [targetOrderId, orgId]
    );

    // Return updated target order with items
    const { rows } = await db_.query(
      `SELECT o.*, ft.number AS "tableNumber",
              json_agg(row_to_json(oi) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL) AS items
       FROM fb_orders o
       LEFT JOIN fb_tables ft ON ft.id = o.table_id
       LEFT JOIN fb_order_items oi ON oi.order_id = o.id
       WHERE o.id = $1 GROUP BY o.id, ft.number`, [targetOrderId]
    );
    res.json({ order: rows[0], mergedFromOrderId: srcId });
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

// ── WiFi printer discovery: scan subnet for open port 9100 ──
router.get("/printers/scan", requireAuth, async (req: any, res) => {
  try {
    const subnet = ((req.query.subnet as string) || "192.168.1").trim();
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(subnet)) {
      return res.status(400).json({ error: "Невірний формат підмережі. Використовуйте формат: 192.168.1" });
    }

    const net = await import("net");
    const PORTS = [9100, 9101]; // thermal printer ports
    const TIMEOUT_MS = 400;
    const CONCURRENCY = 40;

    const probeIp = (ip: string): Promise<{ ip: string; port: number } | null> =>
      new Promise(resolve => {
        let resolved = false;
        const tryPort = (port: number) => new Promise<boolean>(portResolve => {
          const socket = new (net as any).Socket();
          socket.setTimeout(TIMEOUT_MS);
          socket.on("connect", () => { socket.destroy(); portResolve(true); });
          socket.on("timeout", () => { socket.destroy(); portResolve(false); });
          socket.on("error", () => { socket.destroy(); portResolve(false); });
          socket.connect(port, ip);
        });

        Promise.all(PORTS.map(tryPort)).then(results => {
          if (resolved) return;
          resolved = true;
          const idx = results.findIndex(Boolean);
          resolve(idx >= 0 ? { ip, port: PORTS[idx] } : null);
        });
      });

    const ips = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
    const found: { ip: string; port: number }[] = [];

    for (let i = 0; i < ips.length; i += CONCURRENCY) {
      const batch = ips.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(probeIp));
      results.filter(Boolean).forEach(r => found.push(r!));
    }

    res.json({ found, subnet, scanned: ips.length });
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
  await db_.query(`ALTER TABLE fb_orders ADD COLUMN IF NOT EXISTS outlet_id INT REFERENCES fb_outlets(id) ON DELETE SET NULL`);
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
    if (!orgId) return res.status(403).json({ error: "Для збереження потрібна організація. Увійдіть як власник або менеджер організації." });
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

// ─── Public bill endpoint (no auth required) ──────────────────────────────────
router.get("/public/bill/:orderId", async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order id" });
  try {
    const orderRows = await pool.query(
      `SELECT o.*, t.number as table_number, t.location as table_location
       FROM fb_orders o
       LEFT JOIN fb_tables t ON o.table_id = t.id
       WHERE o.id = $1 LIMIT 1`,
      [orderId]
    );
    if (!orderRows.rows.length) return res.status(404).json({ error: "Order not found" });
    const order = orderRows.rows[0];

    const itemRows = await pool.query(
      `SELECT oi.*, fi.name, fi.description, fi.image_url, fc.name as category_name
       FROM fb_order_items oi
       JOIN fb_items fi ON oi.item_id = fi.id
       LEFT JOIN fb_categories fc ON fi.category_id = fc.id
       WHERE oi.order_id = $1 AND oi.status != 'cancelled'
       ORDER BY oi.created_at ASC`,
      [orderId]
    );

    res.json({ order, items: itemRows.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── ANALYTICS ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const CLOSED = `('billed')`;

function dateRange(from?: string, to?: string) {
  const f = from || new Date(Date.now() - 29 * 86400000).toISOString().split("T")[0];
  const t = to || new Date().toISOString().split("T")[0];
  return { from: f, to: t };
}

// GET /analytics/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/analytics/overview", requireAuth, async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { from, to } = dateRange(req.query.from as string, req.query.to as string);
    const db_ = (db as any).$client;

    const [kpiR, chartR, payR] = await Promise.all([
      db_.query(
        `SELECT
           COALESCE(SUM(total_amount),0)::numeric    AS revenue,
           0::numeric                                 AS discounts,
           0::numeric                                 AS tips,
           COUNT(*)::int                              AS checks,
           COALESCE(SUM(guest_count),0)::int          AS guests
         FROM fb_orders
         WHERE organization_id=$1 AND status IN ${CLOSED}
           AND DATE(closed_at) BETWEEN $2 AND $3`,
        [orgId, from, to]
      ),
      db_.query(
        `SELECT DATE(closed_at)::text AS date,
                COUNT(*)::int                    AS checks,
                COALESCE(SUM(total_amount),0)::numeric AS revenue
         FROM fb_orders
         WHERE organization_id=$1 AND status IN ${CLOSED}
           AND DATE(closed_at) BETWEEN $2 AND $3
         GROUP BY DATE(closed_at) ORDER BY DATE(closed_at)`,
        [orgId, from, to]
      ),
      db_.query(
        `SELECT payment_method AS method,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(total_amount),0)::numeric AS amount
         FROM fb_orders
         WHERE organization_id=$1 AND status IN ${CLOSED}
           AND DATE(closed_at) BETWEEN $2 AND $3
         GROUP BY payment_method ORDER BY amount DESC`,
        [orgId, from, to]
      ),
    ]);

    const k = kpiR.rows[0] || {};
    const revenue = Number(k.revenue || 0);
    const checks = Number(k.checks || 0);
    res.json({
      from, to,
      kpi: {
        revenue,
        checks,
        avg_check: checks ? Math.round(revenue / checks * 100) / 100 : 0,
        guests: Number(k.guests || 0),
        tips: Number(k.tips || 0),
        discounts: Number(k.discounts || 0),
      },
      chart: chartR.rows,
      by_payment: payR.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /analytics/orders?from=&to=&status=&payment=&page=&limit=
router.get("/analytics/orders", requireAuth, async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { from, to } = dateRange(req.query.from as string, req.query.to as string);
    const { status, payment, waiter } = req.query as any;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
    const offset = (page - 1) * limit;
    const db_ = (db as any).$client;

    const conds: string[] = [
      `o.organization_id = $1`,
      `DATE(COALESCE(o.closed_at, o.created_at)) BETWEEN $2 AND $3`,
    ];
    const vals: any[] = [orgId, from, to];
    let idx = 4;
    if (status && status !== "all") { conds.push(`o.status = $${idx++}`); vals.push(status); }
    if (payment && payment !== "all") { conds.push(`o.payment_method = $${idx++}`); vals.push(payment); }
    // waiter filter skipped until current_waiter_user_id column is restored via migration

    const where = conds.join(" AND ");

    const [ordersR, totalR] = await Promise.all([
      db_.query(
        `SELECT o.id, o.receipt_number, o.guest_name, o.guest_count, o.status,
                o.payment_method, o.total_amount, o.discount_amount, o.tip_amount,
                o.order_type, o.created_at, o.closed_at, o.notes,
                t.number AS table_number,
                NULL::text AS waiter_name
         FROM fb_orders o
         LEFT JOIN fb_tables t ON t.id = o.table_id
         WHERE ${where}
         ORDER BY COALESCE(o.closed_at, o.created_at) DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...vals, limit, offset]
      ),
      db_.query(`SELECT COUNT(*)::int AS total FROM fb_orders o WHERE ${where}`, vals),
    ]);

    res.json({ orders: ordersR.rows, total: totalR.rows[0]?.total || 0, page, limit });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /analytics/products?from=&to=
router.get("/analytics/products", requireAuth, async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { from, to } = dateRange(req.query.from as string, req.query.to as string);
    const db_ = (db as any).$client;

    const r = await db_.query(
      `SELECT oi.item_id,
              oi.name,
              COALESCE(fc.name,'—') AS category_name,
              SUM(oi.quantity)::numeric      AS qty,
              SUM(oi.total_price)::numeric   AS revenue
       FROM fb_order_items oi
       JOIN fb_orders o ON o.id = oi.order_id
       LEFT JOIN fb_items fi ON fi.id = oi.item_id
       LEFT JOIN fb_categories fc ON fc.id = fi.category_id
       WHERE o.organization_id=$1 AND o.status IN ${CLOSED}
         AND DATE(o.closed_at) BETWEEN $2 AND $3
         AND oi.status != 'cancelled'
       GROUP BY oi.item_id, oi.name, fc.name
       ORDER BY revenue DESC`,
      [orgId, from, to]
    );

    res.json({ products: r.rows, from, to });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /analytics/categories?from=&to=
router.get("/analytics/categories", requireAuth, async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { from, to } = dateRange(req.query.from as string, req.query.to as string);
    const db_ = (db as any).$client;

    const r = await db_.query(
      `SELECT fc.id AS category_id,
              COALESCE(fc.name,'Без категорії') AS name,
              SUM(oi.quantity)::numeric     AS qty,
              SUM(oi.total_price)::numeric  AS revenue
       FROM fb_order_items oi
       JOIN fb_orders o ON o.id = oi.order_id
       LEFT JOIN fb_items fi ON fi.id = oi.item_id
       LEFT JOIN fb_categories fc ON fc.id = fi.category_id
       WHERE o.organization_id=$1 AND o.status IN ${CLOSED}
         AND DATE(o.closed_at) BETWEEN $2 AND $3
         AND oi.status != 'cancelled'
       GROUP BY fc.id, fc.name
       ORDER BY revenue DESC`,
      [orgId, from, to]
    );

    res.json({ categories: r.rows, from, to });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /analytics/abc?from=&to=
router.get("/analytics/abc", requireAuth, async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { from, to } = dateRange(req.query.from as string, req.query.to as string);
    const db_ = (db as any).$client;

    const r = await db_.query(
      `SELECT oi.item_id,
              oi.name,
              COALESCE(fc.name,'—') AS category_name,
              SUM(oi.quantity)::numeric     AS qty,
              SUM(oi.total_price)::numeric  AS revenue
       FROM fb_order_items oi
       JOIN fb_orders o ON o.id = oi.order_id
       LEFT JOIN fb_items fi ON fi.id = oi.item_id
       LEFT JOIN fb_categories fc ON fc.id = fi.category_id
       WHERE o.organization_id=$1 AND o.status IN ${CLOSED}
         AND DATE(o.closed_at) BETWEEN $2 AND $3
         AND oi.status != 'cancelled'
       GROUP BY oi.item_id, oi.name, fc.name
       ORDER BY revenue DESC`,
      [orgId, from, to]
    );

    const items = r.rows as any[];
    const totalRevenue = items.reduce((s: number, i: any) => s + Number(i.revenue), 0);
    const totalQty = items.reduce((s: number, i: any) => s + Number(i.qty), 0);

    // Sort by revenue for ABC (by revenue)
    let cumRevenue = 0;
    const sorted = [...items].sort((a, b) => Number(b.revenue) - Number(a.revenue));
    const result = sorted.map((item: any, idx: number) => {
      cumRevenue += Number(item.revenue);
      const cumPct = totalRevenue > 0 ? cumRevenue / totalRevenue : 0;
      const revClass = cumPct <= 0.70 ? "A" : cumPct <= 0.90 ? "B" : "C";
      const revPct = totalRevenue > 0 ? Number(item.revenue) / totalRevenue * 100 : 0;
      const qtyPct = totalQty > 0 ? Number(item.qty) / totalQty * 100 : 0;
      return {
        rank: idx + 1,
        item_id: item.item_id,
        name: item.name,
        category_name: item.category_name,
        qty: Number(item.qty),
        qty_pct: Math.round(qtyPct * 100) / 100,
        revenue: Number(item.revenue),
        revenue_pct: Math.round(revPct * 100) / 100,
        class: revClass,
      };
    });

    res.json({ items: result, from, to, total_revenue: totalRevenue, total_qty: totalQty });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /cashbox/sessions/history?from=&to=
router.get("/cashbox/sessions/history", requireAuth, async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { from, to } = dateRange(req.query.from as string, req.query.to as string);
    const db_ = (db as any).$client;

    const r = await db_.query(
      `SELECT cs.*,
              u.name  AS cashier_name,
              le.name AS entity_name,
              (SELECT COUNT(*)::int FROM fb_orders o
               WHERE o.organization_id = cs.organization_id
                 AND o.status IN ${CLOSED}
                 AND o.closed_at BETWEEN cs.opened_at AND COALESCE(cs.closed_at, NOW())
              ) AS checks,
              (SELECT COALESCE(SUM(o.total_amount),0)::numeric FROM fb_orders o
               WHERE o.organization_id = cs.organization_id
                 AND o.status IN ${CLOSED}
                 AND o.closed_at BETWEEN cs.opened_at AND COALESCE(cs.closed_at, NOW())
              ) AS revenue
       FROM cashbox_sessions cs
       LEFT JOIN users u ON u.id = cs.cashier_id
       LEFT JOIN legal_entities le ON le.id = cs.legal_entity_id
       WHERE cs.organization_id = $1
         AND DATE(cs.opened_at) BETWEEN $2 AND $3
       ORDER BY cs.opened_at DESC`,
      [orgId, from, to]
    );

    res.json({ sessions: r.rows, from, to });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /analytics/waiters?from=&to= (staff performance)
router.get("/analytics/waiters", requireAuth, async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { from, to } = dateRange(req.query.from as string, req.query.to as string);
    const db_ = (db as any).$client;

    const r = await db_.query(
      `SELECT 0 AS id, 'Н/Д' AS name,
              0::int AS checks, 0::numeric AS revenue,
              0::numeric AS avg_check, 0::numeric AS avg_minutes
       WHERE false`,
      []
    );

    res.json({ waiters: r.rows, from, to });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── AI Report ────────────────────────────────────────────────────────────────
// POST /analytics/ai-report
router.post("/analytics/ai-report", requireAuth, async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { question, from: fromQ, to: toQ } = req.body as { question: string; from?: string; to?: string };
    if (!question?.trim()) return res.status(400).json({ error: "question required" });

    const { from, to } = dateRange(fromQ, toQ);
    const db_ = (db as any).$client;

    // Gather analytics context in parallel
    const [overviewR, productsR, categoriesR, hoursR] = await Promise.all([
      db_.query(
        `SELECT COALESCE(SUM(total_amount),0)::numeric AS revenue,
                COUNT(*)::int AS checks,
                COALESCE(SUM(guest_count),0)::int AS guests,
                CASE WHEN COUNT(*)>0 THEN (SUM(total_amount)/COUNT(*))::numeric ELSE 0 END AS avg_check
         FROM fb_orders WHERE organization_id=$1 AND status IN ${CLOSED} AND DATE(closed_at) BETWEEN $2 AND $3`,
        [orgId, from, to]
      ),
      db_.query(
        `SELECT oi.name, COALESCE(fc.name,'—') AS category,
                SUM(oi.quantity)::int AS qty,
                SUM(oi.total_price)::numeric AS revenue
         FROM fb_order_items oi
         JOIN fb_orders o ON o.id = oi.order_id
         LEFT JOIN fb_items fi ON fi.id = oi.item_id
         LEFT JOIN fb_categories fc ON fc.id = fi.category_id
         WHERE o.organization_id=$1 AND o.status IN ${CLOSED}
           AND DATE(o.closed_at) BETWEEN $2 AND $3 AND oi.status!='cancelled'
         GROUP BY oi.name, fc.name ORDER BY revenue DESC LIMIT 20`,
        [orgId, from, to]
      ),
      db_.query(
        `SELECT COALESCE(fc.name,'Без категорії') AS name,
                SUM(oi.quantity)::int AS qty,
                SUM(oi.total_price)::numeric AS revenue
         FROM fb_order_items oi
         JOIN fb_orders o ON o.id = oi.order_id
         LEFT JOIN fb_items fi ON fi.id = oi.item_id
         LEFT JOIN fb_categories fc ON fc.id = fi.category_id
         WHERE o.organization_id=$1 AND o.status IN ${CLOSED}
           AND DATE(o.closed_at) BETWEEN $2 AND $3 AND oi.status!='cancelled'
         GROUP BY fc.name ORDER BY revenue DESC LIMIT 10`,
        [orgId, from, to]
      ),
      db_.query(
        `SELECT EXTRACT(HOUR FROM closed_at)::int AS hour, COUNT(*)::int AS checks,
                SUM(total_amount)::numeric AS revenue
         FROM fb_orders WHERE organization_id=$1 AND status IN ${CLOSED}
           AND DATE(closed_at) BETWEEN $2 AND $3
         GROUP BY hour ORDER BY hour`,
        [orgId, from, to]
      ),
    ]);

    const kpi = overviewR.rows[0] || {};
    const products = productsR.rows as any[];
    const categories = categoriesR.rows as any[];
    const hours = hoursR.rows as any[];

    // Find peak hour
    const peakHour = hours.length > 0
      ? hours.reduce((best: any, h: any) => Number(h.revenue) > Number(best.revenue) ? h : best, hours[0])
      : null;

    // Build context string
    const ctx = `
АНАЛІТИЧНІ ДАНІ РЕСТОРАНУ (${from} — ${to}):

📊 КЛЮЧОВІ ПОКАЗНИКИ:
- Виторг: ${Number(kpi.revenue).toFixed(2)} ₴
- Кількість чеків: ${kpi.checks}
- Середній чек: ${Number(kpi.avg_check).toFixed(2)} ₴
- Кількість гостей: ${kpi.guests}

🏆 ТОП-20 СТРАВ (за виторгом):
${products.map((p, i) => `${i + 1}. ${p.name} (${p.category}) — ${p.qty} шт., ${Number(p.revenue).toFixed(0)} ₴`).join("\n") || "Немає даних"}

📂 КАТЕГОРІЇ:
${categories.map(c => `- ${c.name}: ${c.qty} шт., ${Number(c.revenue).toFixed(0)} ₴`).join("\n") || "Немає даних"}

⏰ ПІКОВІ ГОДИНИ:
${hours.map(h => `${String(h.hour).padStart(2, "0")}:00 — ${h.checks} чеків, ${Number(h.revenue).toFixed(0)} ₴`).join("\n") || "Немає даних"}
${peakHour ? `\nНайактивніша година: ${String(peakHour.hour).padStart(2, "0")}:00` : ""}
`.trim();

    const aiBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "http://localhost:1106/modelfarm/openai";
    const aiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY  || "_DUMMY_API_KEY_";

    const aiRes = await fetch(`${aiBase}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${aiKey}` },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        max_completion_tokens: 16000,
        messages: [
          {
            role: "user",
            content: `Ти аналітик ресторанного бізнесу. Відповідай українською мовою. Форматуй відповідь у Markdown з заголовками та пунктами. Використовуй реальні цифри. Якщо даних немає - поясни що за цей період немає продажів і дай загальні рекомендації.

${ctx}

ПИТАННЯ: ${question}`,
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`AI error ${aiRes.status}: ${errText.slice(0, 200)}`);
    }
    const aiJson = await aiRes.json() as any;
    const report = aiJson.choices?.[0]?.message?.content || "ШІ не надав відповіді. Спробуйте ще раз.";

    res.json({
      report,
      question,
      from,
      to,
      kpi: {
        revenue: Number(kpi.revenue),
        checks: Number(kpi.checks),
        avg_check: Number(kpi.avg_check),
        guests: Number(kpi.guests),
      },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Tax Groups (for item editor) ────────────────────────────────────────────
router.get("/settings/tax-groups", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    const { rows } = await db_.query(
      `SELECT id, name, code, rate, is_excise, uktzed, description, is_active, is_default
       FROM fb_tax_groups
       WHERE organization_id = $1 AND is_active = true
       ORDER BY name`,
      [orgId]
    );
    res.json({ taxGroups: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Table Notifications (waiter calls, payment requests) ─────────────────────
// GET /notifications
router.get("/notifications", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    const { rows } = await db_.query(
      `SELECT id, table_id, table_number, table_location, type, payload, status, created_at
       FROM fb_table_notifications
       WHERE organization_id = $1 AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT 50`,
      [orgId],
    );
    res.json({ notifications: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /notifications/:id/dismiss
router.post("/notifications/:id/dismiss", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    await db_.query(
      `UPDATE fb_table_notifications
       SET status = 'dismissed', dismissed_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId],
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;

