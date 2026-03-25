import { Router } from "express";
import { db } from "@workspace/db";
import { unitsTable, propertiesTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { propertyId, category, status } = req.query;

  let propIds: number[] = [];
  if (propertyId) {
    propIds = [parseInt(propertyId as string)];
  } else if (user.role !== "super_admin" && user.organizationId) {
    const props = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, user.organizationId));
    propIds = props.map(p => p.id);
  }

  let query = db.select().from(unitsTable);
  const conditions = [];
  if (propIds.length > 0) conditions.push(inArray(unitsTable.propertyId, propIds));
  if (category) conditions.push(eq(unitsTable.category, category as string));
  if (status) conditions.push(eq(unitsTable.status, status as any));

  const units = conditions.length > 0
    ? await db.select().from(unitsTable).where(and(...conditions))
    : await db.select().from(unitsTable);

  res.json(units.map(u => ({
    ...u,
    basePrice: u.basePrice ? Number(u.basePrice) : null,
  })));
});

router.post("/", requireAuth, async (req, res) => {
  const { propertyId, name, category, capacity, floor, description, basePrice } = req.body;
  const [unit] = await db.insert(unitsTable).values({
    propertyId,
    name,
    category,
    capacity: capacity || 2,
    floor,
    description,
    basePrice: basePrice ? String(basePrice) : null,
  }).returning();
  res.status(201).json({ ...unit, basePrice: unit.basePrice ? Number(unit.basePrice) : null });
});

router.get("/:unitId", requireAuth, async (req, res) => {
  const unitId = parseInt(req.params.unitId);
  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, unitId)).limit(1);
  if (!unit) {
    res.status(404).json({ error: "Not Found", message: "Unit not found" });
    return;
  }
  res.json({ ...unit, basePrice: unit.basePrice ? Number(unit.basePrice) : null });
});

router.put("/:unitId", requireAuth, async (req, res) => {
  const unitId = parseInt(req.params.unitId);
  const { name, category, capacity, status, floor, description, basePrice } = req.body;
  const [unit] = await db.update(unitsTable).set({
    ...(name !== undefined && { name }),
    ...(category !== undefined && { category }),
    ...(capacity !== undefined && { capacity }),
    ...(status !== undefined && { status }),
    ...(floor !== undefined && { floor }),
    ...(description !== undefined && { description }),
    ...(basePrice !== undefined && { basePrice: String(basePrice) }),
    updatedAt: new Date(),
  }).where(eq(unitsTable.id, unitId)).returning();
  if (!unit) {
    res.status(404).json({ error: "Not Found", message: "Unit not found" });
    return;
  }
  res.json({ ...unit, basePrice: unit.basePrice ? Number(unit.basePrice) : null });
});

export default router;
