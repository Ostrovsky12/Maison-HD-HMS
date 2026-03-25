import { Router } from "express";
import { db } from "@workspace/db";
import { addonsTable, bookingAddonsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const addons = orgId
    ? await db.select().from(addonsTable).where(eq(addonsTable.organizationId, orgId))
    : await db.select().from(addonsTable);

  res.json(addons.map(a => ({ ...a, price: Number(a.price) })));
});

router.post("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  if (!orgId) {
    res.status(400).json({ error: "Bad Request", message: "No organization" });
    return;
  }
  const { name, description, price, unit, maxQuantity } = req.body;
  const [addon] = await db.insert(addonsTable).values({
    organizationId: orgId,
    name,
    description,
    price: String(price),
    unit: unit || "per day",
    maxQuantity,
  }).returning();
  res.status(201).json({ ...addon, price: Number(addon.price) });
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
