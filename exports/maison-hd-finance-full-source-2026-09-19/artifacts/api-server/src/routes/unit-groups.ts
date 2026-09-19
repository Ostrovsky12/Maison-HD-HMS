import { Router } from "express";
import { db } from "@workspace/db";
import { unitGroupsTable, unitsTable } from "@workspace/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// GET /unit-groups?propertyId=X — list groups for a property
router.get("/", requireAuth, async (req, res) => {
  const { propertyId } = req.query;
  if (!propertyId) { res.status(400).json({ error: "propertyId required" }); return; }
  const groups = await db.select().from(unitGroupsTable)
    .where(eq(unitGroupsTable.propertyId, parseInt(propertyId as string)))
    .orderBy(asc(unitGroupsTable.sortOrder), asc(unitGroupsTable.name));
  res.json(groups);
});

// POST /unit-groups — create a new group
router.post("/", requireAuth, async (req, res) => {
  const { propertyId, name, description, sortOrder } = req.body;
  if (!propertyId || !name?.trim()) { res.status(400).json({ error: "propertyId and name required" }); return; }
  const [group] = await db.insert(unitGroupsTable).values({
    propertyId: parseInt(propertyId),
    name: name.trim(),
    description: description || null,
    sortOrder: sortOrder ?? 0,
  }).returning();
  res.status(201).json(group);
});

// PUT /unit-groups/:id — update a group (org-scoped)
router.put("/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const id = parseInt(req.params.id);
  // Validate ownership via property join
  if (orgId) {
    const [existing] = await db.select({ orgId: unitGroupsTable.organizationId })
      .from(unitGroupsTable).where(eq(unitGroupsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Group not found" }); return; }
    if (existing.orgId !== orgId) { res.status(403).json({ error: "Forbidden" }); return; }
  }
  const { name, description, sortOrder } = req.body;
  const [group] = await db.update(unitGroupsTable).set({
    ...(name !== undefined && { name: name.trim() }),
    ...(description !== undefined && { description: description || null }),
    ...(sortOrder !== undefined && { sortOrder }),
    updatedAt: new Date(),
  }).where(eq(unitGroupsTable.id, id)).returning();
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  res.json(group);
});

// DELETE /unit-groups/:id — delete a group (unlinks units first, org-scoped)
router.delete("/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const id = parseInt(req.params.id);
  // Validate ownership
  if (orgId) {
    const [existing] = await db.select({ orgId: unitGroupsTable.organizationId })
      .from(unitGroupsTable).where(eq(unitGroupsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Group not found" }); return; }
    if (existing.orgId !== orgId) { res.status(403).json({ error: "Forbidden" }); return; }
  }
  // Unlink units from this group first
  await db.update(unitsTable).set({ unitGroupId: null, updatedAt: new Date() })
    .where(eq(unitsTable.unitGroupId, id));
  await db.delete(unitGroupsTable).where(eq(unitGroupsTable.id, id));
  res.json({ ok: true });
});

export default router;
