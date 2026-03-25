import { Router } from "express";
import { db } from "@workspace/db";
import { propertiesTable, unitsTable } from "@workspace/db/schema";
import { eq, and, count } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.role === "super_admin" ? undefined : user.organizationId;

  const rows = await db.select().from(propertiesTable)
    .where(orgId ? eq(propertiesTable.organizationId, orgId) : undefined);

  const unitCounts = await db.select({
    propertyId: unitsTable.propertyId,
    count: count()
  }).from(unitsTable).groupBy(unitsTable.propertyId);
  const countMap = Object.fromEntries(unitCounts.map(r => [r.propertyId, Number(r.count)]));

  res.json(rows.map(p => ({ ...p, unitCount: countMap[p.id] || 0 })));
});

router.post("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  if (!orgId) {
    res.status(400).json({ error: "Bad Request", message: "No organization" });
    return;
  }
  const { name, type, address, description } = req.body;
  const [prop] = await db.insert(propertiesTable).values({
    organizationId: orgId,
    name,
    type: type || "hotel",
    address,
    description,
  }).returning();
  res.status(201).json({ ...prop, unitCount: 0 });
});

router.get("/:propertyId", requireAuth, async (req, res) => {
  const propertyId = parseInt(req.params.propertyId);
  const user = (req as any).user;
  const [prop] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, propertyId)).limit(1);
  if (!prop) {
    res.status(404).json({ error: "Not Found", message: "Property not found" });
    return;
  }
  if (user.role !== "super_admin" && prop.organizationId !== user.organizationId) {
    res.status(403).json({ error: "Forbidden", message: "Access denied" });
    return;
  }
  const [unitCountRow] = await db.select({ count: count() }).from(unitsTable).where(eq(unitsTable.propertyId, propertyId));
  res.json({ ...prop, unitCount: Number(unitCountRow?.count || 0) });
});

export default router;
