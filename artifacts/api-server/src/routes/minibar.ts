import { Router } from "express";
import { db } from "@workspace/db";
import {
  minibarItemsTable, minibarChargesTable,
  bookingsTable, unitsTable, propertiesTable, guestsTable,
} from "@workspace/db/schema";
import { eq, and, inArray, desc, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// ── ADMIN: Items CRUD ─────────────────────────────────────────────

router.get("/items", requireAuth, async (req: any, res) => {
  const orgId = req.user.organizationId;
  const items = await db.select().from(minibarItemsTable)
    .where(eq(minibarItemsTable.organizationId, orgId))
    .orderBy(minibarItemsTable.sortOrder, minibarItemsTable.id);
  res.json(items);
});

router.post("/items", requireAuth, async (req: any, res) => {
  const orgId = req.user.organizationId;
  const { name, description, price, category, emoji, propertyId, isActive, sortOrder } = req.body;
  if (!name || !price) { res.status(400).json({ error: "name та price обов'язкові" }); return; }
  const [item] = await db.insert(minibarItemsTable).values({
    organizationId: orgId,
    propertyId: propertyId || null,
    name,
    description: description || null,
    price: String(price),
    category: category || "drinks",
    emoji: emoji || "🍺",
    isActive: isActive !== false,
    sortOrder: sortOrder || 0,
  }).returning();
  res.json(item);
});

router.put("/items/:id", requireAuth, async (req: any, res) => {
  const orgId = req.user.organizationId;
  const id = parseInt(req.params.id);
  const { name, description, price, category, emoji, propertyId, isActive, sortOrder } = req.body;
  const [item] = await db.update(minibarItemsTable)
    .set({ name, description, price: String(price), category, emoji, propertyId: propertyId || null, isActive, sortOrder })
    .where(and(eq(minibarItemsTable.id, id), eq(minibarItemsTable.organizationId, orgId)))
    .returning();
  if (!item) { res.status(404).json({ error: "Позицію не знайдено" }); return; }
  res.json(item);
});

router.delete("/items/:id", requireAuth, async (req: any, res) => {
  const orgId = req.user.organizationId;
  const id = parseInt(req.params.id);
  await db.delete(minibarItemsTable)
    .where(and(eq(minibarItemsTable.id, id), eq(minibarItemsTable.organizationId, orgId)));
  res.json({ ok: true });
});

// ── ADMIN: Charges per booking ────────────────────────────────────

router.get("/bookings/:bookingId/charges", requireAuth, async (req: any, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const charges = await db.select().from(minibarChargesTable)
    .where(eq(minibarChargesTable.bookingId, bookingId))
    .orderBy(desc(minibarChargesTable.chargedAt));
  const total = charges.reduce((s, c) => s + parseFloat(c.totalAmount), 0);
  res.json({ charges, total: Math.round(total * 100) / 100 });
});

router.post("/bookings/:bookingId/charges", requireAuth, async (req: any, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const { itemId, quantity, note } = req.body;
  const orgId = req.user.organizationId;

  const [item] = await db.select().from(minibarItemsTable)
    .where(and(eq(minibarItemsTable.id, itemId), eq(minibarItemsTable.organizationId, orgId)));
  if (!item) { res.status(404).json({ error: "Позицію не знайдено" }); return; }

  const qty = parseInt(quantity) || 1;
  const total = parseFloat(item.price) * qty;
  const [charge] = await db.insert(minibarChargesTable).values({
    bookingId,
    itemId: item.id,
    itemName: item.name,
    itemPrice: item.price,
    quantity: qty,
    totalAmount: String(total),
    chargedBy: "staff",
    note: note || null,
  }).returning();
  res.json(charge);
});

router.delete("/charges/:id", requireAuth, async (req: any, res) => {
  const id = parseInt(req.params.id);
  await db.delete(minibarChargesTable).where(eq(minibarChargesTable.id, id));
  res.json({ ok: true });
});

// ── PUBLIC: Guest self-service ────────────────────────────────────

// GET /minibar/public/:unitId — returns active booking + items (no auth)
router.get("/public/:unitId", async (req, res) => {
  try {
    const unitId = parseInt(req.params.unitId);
    const today = new Date().toISOString().slice(0, 10);

    // Find the unit's org
    const [unit] = await db.select({ id: unitsTable.id, name: unitsTable.name, propertyId: unitsTable.propertyId })
      .from(unitsTable).where(eq(unitsTable.id, unitId));
    if (!unit) { res.status(404).json({ error: "Будинок не знайдено" }); return; }

    const [property] = await db.select({ id: propertiesTable.id, organizationId: propertiesTable.organizationId, name: propertiesTable.name })
      .from(propertiesTable).where(eq(propertiesTable.id, unit.propertyId));
    if (!property) { res.status(404).json({ error: "Помилка конфігурації" }); return; }

    // Find active booking for this unit (checked_in or confirmed)
    const bookingRows = await db.select({
      id: bookingsTable.id,
      checkIn: bookingsTable.checkIn,
      checkOut: bookingsTable.checkOut,
      guestId: bookingsTable.guestId,
      firstName: guestsTable.firstName,
      lastName: guestsTable.lastName,
    }).from(bookingsTable)
      .leftJoin(guestsTable, eq(guestsTable.id, bookingsTable.guestId))
      .where(and(
        eq(bookingsTable.unitId, unitId),
        lte(bookingsTable.checkIn, today),
        gte(bookingsTable.checkOut, today),
      ))
      .orderBy(desc(bookingsTable.checkIn))
      .limit(1);

    const bookingRow = bookingRows[0];
    const booking = bookingRow ? {
      id: bookingRow.id,
      checkIn: bookingRow.checkIn,
      checkOut: bookingRow.checkOut,
      guestName: [bookingRow.firstName, bookingRow.lastName].filter(Boolean).join(" ") || "Гість",
    } : null;

    // Get minibar items for this org+property
    const items = await db.select().from(minibarItemsTable)
      .where(and(
        eq(minibarItemsTable.organizationId, property.organizationId),
        eq(minibarItemsTable.isActive, true),
      ))
      .orderBy(minibarItemsTable.sortOrder, minibarItemsTable.id);

    // Get existing charges for this booking
    const charges = booking
      ? await db.select().from(minibarChargesTable)
          .where(eq(minibarChargesTable.bookingId, booking.id))
          .orderBy(desc(minibarChargesTable.chargedAt))
      : [];

    res.json({
      unit: { id: unit.id, name: unit.name },
      property: { name: property.name },
      booking: booking || null,
      items,
      charges,
      totalCharged: charges.reduce((s, c) => s + parseFloat(c.totalAmount), 0),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /minibar/public/:unitId/charge — guest adds charge (no auth)
router.post("/public/:unitId/charge", async (req, res) => {
  try {
    const unitId = parseInt(req.params.unitId);
    const today = new Date().toISOString().slice(0, 10);
    const { items: selectedItems } = req.body as { items: Array<{ itemId: number; quantity: number }> };

    if (!selectedItems?.length) { res.status(400).json({ error: "Не обрано жодної позиції" }); return; }

    // Find active booking (confirmed or checked_in)
    const [booking] = await db.select({ id: bookingsTable.id })
      .from(bookingsTable)
      .where(and(
        eq(bookingsTable.unitId, unitId),
        lte(bookingsTable.checkIn, today),
        gte(bookingsTable.checkOut, today),
      ))
      .orderBy(desc(bookingsTable.checkIn))
      .limit(1);

    if (!booking) { res.status(404).json({ error: "Активне бронювання не знайдено. Зверніться до адміністратора." }); return; }

    // Validate items belong to correct org
    const [unit] = await db.select({ propertyId: unitsTable.propertyId }).from(unitsTable).where(eq(unitsTable.id, unitId));
    const [property] = await db.select({ organizationId: propertiesTable.organizationId }).from(propertiesTable).where(eq(propertiesTable.id, unit.propertyId));

    const itemIds = selectedItems.map(i => i.itemId);
    const dbItems = await db.select().from(minibarItemsTable)
      .where(and(
        inArray(minibarItemsTable.id, itemIds),
        eq(minibarItemsTable.organizationId, property.organizationId),
        eq(minibarItemsTable.isActive, true),
      ));

    if (dbItems.length === 0) { res.status(400).json({ error: "Позиції не знайдено" }); return; }

    const inserted = await db.insert(minibarChargesTable).values(
      selectedItems
        .filter(s => s.quantity > 0)
        .map(s => {
          const dbItem = dbItems.find(i => i.id === s.itemId);
          if (!dbItem) return null;
          const qty = Math.min(s.quantity, 20);
          return {
            bookingId: booking.id,
            itemId: dbItem.id,
            itemName: dbItem.name,
            itemPrice: dbItem.price,
            quantity: qty,
            totalAmount: String(parseFloat(dbItem.price) * qty),
            chargedBy: "guest",
          };
        })
        .filter(Boolean) as any[]
    ).returning();

    const total = inserted.reduce((s, c) => s + parseFloat(c.totalAmount), 0);
    res.json({ ok: true, charges: inserted, total });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /minibar/summary — for admin dashboard
router.get("/summary", requireAuth, async (req: any, res) => {
  const orgId = req.user.organizationId;
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const fromStr = from.toISOString().slice(0, 10);

  // Get all unit IDs for this org
  const props = await db.select({ id: propertiesTable.id }).from(propertiesTable)
    .where(eq(propertiesTable.organizationId, orgId));
  const propIds = props.map(p => p.id);
  if (!propIds.length) { res.json({ total: 0, count: 0, topItems: [] }); return; }

  const units = await db.select({ id: unitsTable.id }).from(unitsTable)
    .where(inArray(unitsTable.propertyId, propIds));
  const unitIds = units.map(u => u.id);
  if (!unitIds.length) { res.json({ total: 0, count: 0, topItems: [] }); return; }

  const bookings = await db.select({ id: bookingsTable.id }).from(bookingsTable)
    .where(inArray(bookingsTable.unitId, unitIds));
  const bookingIds = bookings.map(b => b.id);
  if (!bookingIds.length) { res.json({ total: 0, count: 0, topItems: [] }); return; }

  const charges = await db.select().from(minibarChargesTable)
    .where(and(
      inArray(minibarChargesTable.bookingId, bookingIds),
      sql`DATE(${minibarChargesTable.chargedAt}) >= ${fromStr}`,
    ));

  const total = charges.reduce((s, c) => s + parseFloat(c.totalAmount), 0);
  const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  for (const c of charges) {
    if (!itemMap[c.itemName]) itemMap[c.itemName] = { name: c.itemName, qty: 0, revenue: 0 };
    itemMap[c.itemName].qty += c.quantity;
    itemMap[c.itemName].revenue += parseFloat(c.totalAmount);
  }
  const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  res.json({ total: Math.round(total), count: charges.length, topItems });
});

export default router;
