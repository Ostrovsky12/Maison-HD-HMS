import { Router } from "express";
import { db } from "@workspace/db";
import { fbCategoriesTable, fbItemsTable, fbTablesTable, fbOrdersTable, fbOrderItemsTable } from "@workspace/db";
import { eq, and, desc, asc, sql, gte, ne } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

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
    const [item] = await db.insert(fbItemsTable).values({ ...req.body, organizationId: orgId }).returning();
    res.json({ item });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/items/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const [item] = await db.update(fbItemsTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(fbItemsTable.id, parseInt(req.params.id)), eq(fbItemsTable.organizationId, orgId)))
      .returning();
    res.json({ item });
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

export default router;
