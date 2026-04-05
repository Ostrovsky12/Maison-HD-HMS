import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { packagesTable } from "@workspace/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";

const router = Router();

const getOrgId = (req: any): number | null => req.user?.organizationId ?? null;

// GET /packages — list active packages for org
router.get("/", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const rows = await db
      .select()
      .from(packagesTable)
      .where(and(eq(packagesTable.tenantId, orgId), eq(packagesTable.isActive, true)))
      .orderBy(asc(packagesTable.sortOrder), desc(packagesTable.createdAt));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: `Failed query: ${e.message}` });
  }
});

// GET /packages/all — include inactive (managers)
router.get("/all", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const rows = await db
      .select()
      .from(packagesTable)
      .where(eq(packagesTable.tenantId, orgId))
      .orderBy(asc(packagesTable.sortOrder), desc(packagesTable.createdAt));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: `Failed query: ${e.message}` });
  }
});

// POST /packages — create
router.post("/", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(401).json({ error: "Unauthorized" });
  const { name, description, category, price, originalPrice, durationNights, maxGuests, inclusions, imageUrl, validFrom, validTo, isFeatured, tags, notes } = req.body;
  if (!name || !price) return res.status(400).json({ error: "name та price обов'язкові" });
  try {
    const [pkg] = await db.insert(packagesTable).values({
      tenantId: orgId,
      organizationId: orgId,
      name,
      description: description || null,
      category: category || "custom",
      price: String(price),
      originalPrice: originalPrice ? String(originalPrice) : null,
      durationNights: durationNights || 1,
      maxGuests: maxGuests || 2,
      inclusions: Array.isArray(inclusions) ? inclusions : [],
      imageUrl: imageUrl || null,
      validFrom: validFrom || null,
      validTo: validTo || null,
      isFeatured: isFeatured ?? false,
      tags: Array.isArray(tags) ? tags : [],
      notes: notes || null,
    }).returning();
    res.status(201).json(pkg);
  } catch (e: any) {
    res.status(500).json({ error: `Failed insert: ${e.message}` });
  }
});

// PATCH /packages/:id — update
router.patch("/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params.id);
  const { name, description, category, price, originalPrice, durationNights, maxGuests, inclusions, imageUrl, validFrom, validTo, isFeatured, isActive, sortOrder, tags, notes } = req.body;
  try {
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (price !== undefined) updateData.price = String(price);
    if (originalPrice !== undefined) updateData.originalPrice = originalPrice ? String(originalPrice) : null;
    if (durationNights !== undefined) updateData.durationNights = durationNights;
    if (maxGuests !== undefined) updateData.maxGuests = maxGuests;
    if (inclusions !== undefined) updateData.inclusions = inclusions;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (validFrom !== undefined) updateData.validFrom = validFrom || null;
    if (validTo !== undefined) updateData.validTo = validTo || null;
    if (isFeatured !== undefined) updateData.isFeatured = isFeatured;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (tags !== undefined) updateData.tags = tags;
    if (notes !== undefined) updateData.notes = notes;

    const [pkg] = await db.update(packagesTable)
      .set(updateData)
      .where(and(eq(packagesTable.id, id), eq(packagesTable.tenantId, orgId)))
      .returning();

    if (!pkg) return res.status(404).json({ error: "Пакет не знайдено" });
    res.json(pkg);
  } catch (e: any) {
    res.status(500).json({ error: `Failed update: ${e.message}` });
  }
});

// DELETE /packages/:id — soft delete
router.delete("/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params.id);
  try {
    const [pkg] = await db.update(packagesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(packagesTable.id, id), eq(packagesTable.tenantId, orgId)))
      .returning();
    if (!pkg) return res.status(404).json({ error: "Пакет не знайдено" });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: `Failed delete: ${e.message}` });
  }
});

export default router;
