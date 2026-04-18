import { Router } from "express";
import { db } from "@workspace/db";
import { addonsTable, bookingAddonsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const addons = orgId
    ? await db.select().from(addonsTable).where(eq(addonsTable.organizationId, orgId))
    : await db.select().from(addonsTable);

  res.json(addons.map((a: any) => ({
    ...a,
    price: Number(a.price),
    timeSlots: Array.isArray(a.timeSlots) ? a.timeSlots : [],
  })));
});

router.post("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  if (!orgId) {
    res.status(400).json({ error: "Bad Request", message: "No organization" });
    return;
  }
  const { name, description, price, unit, category, icon, timeSlots, sortOrder, propertyId, maxQuantity, legalEntityId } = req.body;
  const [addon] = await db.insert(addonsTable).values({
    organizationId: orgId,
    name,
    description: description || null,
    price: String(price),
    unit: unit || "per session",
    category: category || "service",
    icon: icon || "🔧",
    timeSlots: Array.isArray(timeSlots) ? timeSlots : [],
    sortOrder: sortOrder ?? 0,
    propertyId: propertyId || null,
    maxQuantity: maxQuantity || null,
    legalEntityId: legalEntityId || null,
  } as any).returning();
  res.status(201).json({ ...addon, price: Number(addon.price) });
});

router.patch("/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const id = parseInt(req.params.id);
  const { name, description, price, unit, category, icon, timeSlots, sortOrder, propertyId, maxQuantity, isActive, legalEntityId } = req.body;

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (price !== undefined) updates.price = String(price);
  if (unit !== undefined) updates.unit = unit;
  if (category !== undefined) updates.category = category;
  if (icon !== undefined) updates.icon = icon;
  if (timeSlots !== undefined) updates.timeSlots = Array.isArray(timeSlots) ? timeSlots : [];
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;
  if (propertyId !== undefined) updates.propertyId = propertyId || null;
  if (maxQuantity !== undefined) updates.maxQuantity = maxQuantity || null;
  if (isActive !== undefined) updates.isActive = isActive;
  if (legalEntityId !== undefined) (updates as any).legalEntityId = legalEntityId || null;

  const [addon] = await db.update(addonsTable)
    .set(updates)
    .where(and(eq(addonsTable.id, id), eq(addonsTable.organizationId, orgId)))
    .returning();

  if (!addon) { res.status(404).json({ error: "Not Found" }); return; }
  res.json({ ...addon, price: Number(addon.price) });
});

router.delete("/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const id = parseInt(req.params.id);
  await db.delete(addonsTable).where(and(eq(addonsTable.id, id), eq(addonsTable.organizationId, orgId)));
  res.json({ success: true });
});

router.get("/:bookingId/addons", requireAuth, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const rows = await db.select({
    id: bookingAddonsTable.id,
    bookingId: bookingAddonsTable.bookingId,
    addonId: bookingAddonsTable.addonId,
    quantity: bookingAddonsTable.quantity,
    priceEach: bookingAddonsTable.priceEach,
    totalPrice: bookingAddonsTable.totalPrice,
    addonName: addonsTable.name,
  }).from(bookingAddonsTable)
    .leftJoin(addonsTable, eq(bookingAddonsTable.addonId, addonsTable.id))
    .where(eq(bookingAddonsTable.bookingId, bookingId));

  res.json(rows.map(r => ({
    ...r,
    priceEach: Number(r.priceEach),
    totalPrice: Number(r.totalPrice),
  })));
});

router.post("/:bookingId/addons", requireAuth, async (req, res) => {
  const bookingId = parseInt(req.params.bookingId);
  const { addonId, quantity } = req.body;

  const [addon] = await db.select().from(addonsTable).where(eq(addonsTable.id, addonId)).limit(1);
  if (!addon) {
    res.status(404).json({ error: "Not Found", message: "Addon not found" });
    return;
  }
  const priceEach = Number(addon.price);
  const totalPrice = priceEach * quantity;

  const [bookingAddon] = await db.insert(bookingAddonsTable).values({
    bookingId,
    addonId,
    quantity,
    priceEach: String(priceEach),
    totalPrice: String(totalPrice),
  }).returning();

  res.status(201).json({
    ...bookingAddon,
    priceEach: Number(bookingAddon.priceEach),
    totalPrice: Number(bookingAddon.totalPrice),
    addonName: addon.name,
  });
});

export default router;
