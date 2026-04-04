import { Router } from "express";
import { db } from "@workspace/db";
import { propertiesTable, unitsTable } from "@workspace/db/schema";
import { eq, and, count, asc, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.role === "super_admin" ? undefined : user.organizationId;

  const rows = await db.execute<any>(
    sql`SELECT *, COALESCE(tourist_tax_rate, 0)::numeric as tourist_tax_rate FROM properties ${orgId ? sql`WHERE organization_id = ${orgId}` : sql``} ORDER BY COALESCE(sort_order, 0), id`
  );

  const unitCounts = await db.select({
    propertyId: unitsTable.propertyId,
    count: count()
  }).from(unitsTable).groupBy(unitsTable.propertyId);
  const countMap = Object.fromEntries(unitCounts.map(r => [r.propertyId, Number(r.count)]));

  res.json(rows.rows.map((p: any) => ({ ...p, unitCount: countMap[p.id] || 0 })));
});

router.post("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  if (!orgId) {
    res.status(400).json({ error: "Bad Request", message: "No organization" });
    return;
  }
  const { name, type, address, description, sortOrder } = req.body;
  // Get max sort_order for this org
  const maxRes = await db.execute<any>(sql`SELECT COALESCE(MAX(sort_order), -1) as mx FROM properties WHERE organization_id = ${orgId}`);
  const nextOrder = (maxRes.rows[0]?.mx ?? -1) + 1;
  const [prop] = await db.insert(propertiesTable).values({
    organizationId: orgId,
    name,
    type: type || "house",
    address,
    description,
  }).returning();
  // Set sort_order via raw SQL since schema might not have it
  await db.execute(sql`UPDATE properties SET sort_order = ${sortOrder ?? nextOrder} WHERE id = ${prop.id}`);
  res.status(201).json({ ...prop, sort_order: sortOrder ?? nextOrder, unitCount: 0 });
});

// PATCH /properties/bulk-sort — reorder groups (must be before /:propertyId to avoid Express eating "bulk-sort")
router.patch("/bulk-sort", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { orders } = req.body;
  if (!Array.isArray(orders)) { res.status(400).json({ error: "orders required" }); return; }
  for (const { id, sortOrder } of orders) {
    await db.execute(sql`UPDATE properties SET sort_order = ${sortOrder} WHERE id = ${id} AND organization_id = ${user.organizationId}`);
  }
  res.json({ ok: true });
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

router.patch("/:propertyId", requireAuth, async (req, res) => {
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
  if (!["super_admin", "owner", "manager"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden", message: "Insufficient permissions" });
    return;
  }
  const { name, address, type, description, sortOrder, touristTaxRate } = req.body;
  const [updated] = await db.update(propertiesTable).set({
    ...(name !== undefined && { name }),
    ...(address !== undefined && { address }),
    ...(type !== undefined && { type }),
    ...(description !== undefined && { description }),
  }).where(eq(propertiesTable.id, propertyId)).returning();
  if (sortOrder !== undefined) {
    await db.execute(sql`UPDATE properties SET sort_order = ${sortOrder} WHERE id = ${propertyId}`);
  }
  if (touristTaxRate !== undefined) {
    await db.execute(sql`UPDATE properties SET tourist_tax_rate = ${parseFloat(String(touristTaxRate))} WHERE id = ${propertyId}`);
  }
  const [unitCountRow] = await db.select({ count: count() }).from(unitsTable).where(eq(unitsTable.propertyId, propertyId));
  const taxRate = touristTaxRate ?? (updated as any).tourist_tax_rate ?? 0;
  res.json({ ...updated, sort_order: sortOrder, tourist_tax_rate: taxRate, unitCount: Number(unitCountRow?.count || 0) });
});

router.delete("/:propertyId", requireAuth, async (req, res) => {
  const propertyId = parseInt(req.params.propertyId);
  const user = (req as any).user;
  if (!["super_admin", "owner", "manager"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const [prop] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, propertyId)).limit(1);
  if (!prop || (user.role !== "super_admin" && prop.organizationId !== user.organizationId)) {
    res.status(404).json({ error: "Not found" }); return;
  }
  const [unitCountRow] = await db.select({ count: count() }).from(unitsTable).where(eq(unitsTable.propertyId, propertyId));
  if (Number(unitCountRow?.count || 0) > 0) {
    res.status(400).json({ error: "Група має юніти. Спочатку перемістіть їх до іншої групи." }); return;
  }
  await db.delete(propertiesTable).where(eq(propertiesTable.id, propertyId));
  res.json({ ok: true });
});

export default router;
