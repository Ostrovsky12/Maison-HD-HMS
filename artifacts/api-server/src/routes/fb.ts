import { Router } from "express";
import { db } from "@workspace/db";
import { fbCategoriesTable, fbItemsTable, fbTablesTable, fbOrdersTable, fbOrderItemsTable } from "@workspace/db";
import { eq, and, desc, asc, sql, gte, ne } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { createFiscalReceipt, buildCheckboxGoods, toCheckboxPaymentType } from "../services/checkbox.js";

const router = Router();
const getOrg = (req: any) => req.user?.organizationId;

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
    let conditions: any[] = [eq(fbItemsTable.organizationId, orgId)];
    if (categoryId) conditions.push(eq(fbItemsTable.categoryId, parseInt(categoryId as string)));
    if (available === "true") conditions.push(eq(fbItemsTable.isAvailable, true));

    const items = await db.select({
      id: fbItemsTable.id, name: fbItemsTable.name, description: fbItemsTable.description,
      price: fbItemsTable.price, cookMinutes: fbItemsTable.cookMinutes, categoryId: fbItemsTable.categoryId,
      isAvailable: fbItemsTable.isAvailable, isPopular: fbItemsTable.isPopular, isVegetarian: fbItemsTable.isVegetarian,
      allergens: fbItemsTable.allergens, tags: fbItemsTable.tags, sortOrder: fbItemsTable.sortOrder,
      categoryName: fbCategoriesTable.name, categoryEmoji: fbCategoriesTable.emoji,
    })
      .from(fbItemsTable)
      .leftJoin(fbCategoriesTable, eq(fbItemsTable.categoryId, fbCategoriesTable.id))
      .where(and(...conditions))
      .orderBy(asc(fbCategoriesTable.sortOrder), asc(fbItemsTable.sortOrder));
    res.json({ items });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/items", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { name, description, price, categoryId, cookMinutes, isAvailable = true, isPopular = false, isVegetarian = false,
      allergens, tags, sortOrder = 0, imageUrl,
      vat_rate = 20, is_alcohol = false, alcohol_volume_pct, uktzed_code, excise_code,
      station = "kitchen_general", legal_entity_id,
    } = req.body;
    const db_ = (db as any).$client;
    const r = await db_.query(
      `INSERT INTO fb_items (organization_id, name, description, price, category_id, cook_minutes,
         is_available, is_popular, is_vegetarian, allergens, tags, sort_order, image_url,
         vat_rate, is_alcohol, alcohol_volume_pct, uktzed_code, excise_code,
         station, legal_entity_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [orgId, name, description||null, price, categoryId||null, cookMinutes||15,
       isAvailable, isPopular, isVegetarian, allergens||null, tags||null, sortOrder, imageUrl||null,
       vat_rate||20, is_alcohol||false, alcohol_volume_pct||null, uktzed_code||null, excise_code||null,
       station||"kitchen_general", legal_entity_id||null]
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
      station, legal_entity_id,
    } = req.body;
    const db_ = (db as any).$client;
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
         image_url          = COALESCE($10, image_url),
         vat_rate           = COALESCE($11, vat_rate),
         is_alcohol         = COALESCE($12, is_alcohol),
         alcohol_volume_pct = COALESCE($13, alcohol_volume_pct),
         uktzed_code        = COALESCE($14, uktzed_code),
         excise_code        = COALESCE($15, excise_code),
         station            = COALESCE($16, station),
         legal_entity_id    = COALESCE($17, legal_entity_id),
         updated_at         = NOW()
       WHERE id = $18 AND organization_id = $19 RETURNING *`,
      [name||null, description||null, price??null, categoryId||null, cookMinutes??null,
       isAvailable??null, isPopular??null, isVegetarian??null, sortOrder??null, imageUrl||null,
       vat_rate??null, is_alcohol??null, alcohol_volume_pct??null, uktzed_code||null, excise_code||null,
       station||null, legal_entity_id||null,
       id, orgId]
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

    const orderItems = await db.select().from(fbOrderItemsTable)
      .where(eq(fbOrderItemsTable.orderId, orderId))
      .orderBy(asc(fbOrderItemsTable.createdAt));

    res.json({ order, items: orderItems });
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

// GET current open session
router.get("/cashbox/session", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const db_ = (db as any).$client;
    const r = await db_.query(
      `SELECT cs.*, u.name AS cashier_name FROM cashbox_sessions cs
       LEFT JOIN users u ON u.id = cs.cashier_id
       WHERE cs.organization_id = $1 AND cs.status = 'open'
       ORDER BY cs.opened_at DESC LIMIT 1`, [orgId]
    );
    res.json({ session: r.rows[0] || null });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST open session
router.post("/cashbox/session", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const cashierId = req.user?.userId;
    const { openingBalance = 0, cashboxName = "Каса 1" } = req.body;
    const db_ = (db as any).$client;
    // Check if already open
    const existing = await db_.query(
      `SELECT id FROM cashbox_sessions WHERE organization_id = $1 AND status = 'open' LIMIT 1`, [orgId]
    );
    if (existing.rows.length) {
      res.status(409).json({ error: "Зміна вже відкрита", sessionId: existing.rows[0].id });
      return;
    }
    const r = await db_.query(
      `INSERT INTO cashbox_sessions (organization_id, cashier_id, cashbox_name, opening_balance, expected_balance, cash_in, cash_out, status)
       VALUES ($1, $2, $3, $4, $4, 0, 0, 'open') RETURNING *`,
      [orgId, cashierId, cashboxName, Number(openingBalance)]
    );
    res.status(201).json({ session: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH close session
router.patch("/cashbox/session/:id/close", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
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
      tipAmount = 0, tipPct = 0, legalEntityId,
    } = req.body;
    const db_ = (db as any).$client;

    // Get order
    const orderRow = await db_.query(
      `SELECT * FROM fb_orders WHERE id = $1 AND organization_id = $2`, [orderId, orgId]
    );
    if (!orderRow.rows.length) { res.status(404).json({ error: "Order not found" }); return; }
    const order = orderRow.rows[0];

    if (order.status === "closed" || order.status === "cancelled") {
      res.status(400).json({ error: "Order already closed" }); return;
    }

    const baseAmount  = Number(order.total_amount) - Number(discountAmount);
    const tip         = Number(tipAmount) || 0;
    const finalAmount = baseAmount + tip;

    // Generate receipt number
    const cnt = await db_.query(
      `SELECT COUNT(*)::int AS cnt FROM fb_orders WHERE organization_id = $1 AND receipt_number IS NOT NULL`, [orgId]
    );
    const receiptNum = `R-${orgId}-${String((cnt.rows[0]?.cnt || 0) + 1).padStart(5, "0")}`;

    // Update order (includes tip + legal entity)
    const r = await db_.query(
      `UPDATE fb_orders SET
         status = 'closed', paid_amount = $1, payment_method = $2,
         discount_amount = $3, receipt_number = $4, closed_at = NOW(),
         tip_amount = $5, tip_pct = $6,
         legal_entity_id = COALESCE($7, legal_entity_id),
         notes = COALESCE($8, notes), updated_at = NOW()
       WHERE id = $9 AND organization_id = $10 RETURNING *`,
      [paidAmount ?? finalAmount, paymentMethod, discountAmount, receiptNum,
       tip, tipPct || 0, legalEntityId || null, notes || null, orderId, orgId]
    );

    // Free the table
    if (order.table_id) {
      await db_.query(
        `UPDATE restaurant_tables SET status = 'free', current_order_id = NULL, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`, [order.table_id, orgId]
      );
    }

    // Update cashbox session if cash payment (include tip in cash flow)
    if (paymentMethod === "cash") {
      const cashIn = paidAmount ?? finalAmount;
      await db_.query(
        `UPDATE cashbox_sessions SET
           cash_in = cash_in + $1, expected_balance = expected_balance + $1, updated_at = NOW()
         WHERE organization_id = $2 AND status = 'open'`,
        [cashIn, orgId]
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

    res.json({
      order:         updatedOrder,
      receiptNumber: receiptNum,
      tipAmount:     tip,
      fiscal:        fiscalResult,
      change: paymentMethod === "cash" && paidAmount
        ? Math.max(0, Number(paidAmount) - finalAmount)
        : 0,
    });
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

export default router;
