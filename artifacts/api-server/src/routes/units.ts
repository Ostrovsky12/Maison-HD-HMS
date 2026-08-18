import { Router } from "express";
import { db } from "@workspace/db";
import { unitsTable, propertiesTable, bookingsTable } from "@workspace/db/schema";
import { eq, and, inArray, or, lt, gt, notInArray, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

async function resolvePropertyIds(user: any, propertyId: string | undefined, res: any): Promise<number[] | null> {
  if (propertyId) {
    const propId = parseInt(propertyId as string);
    if (isNaN(propId)) { res.status(400).json({ error: "Invalid propertyId" }); return null; }
    if (user.role !== "super_admin" && user.organizationId) {
      const [prop] = await db.select({ id: propertiesTable.id })
        .from(propertiesTable)
        .where(and(eq(propertiesTable.id, propId), eq(propertiesTable.organizationId, user.organizationId)))
        .limit(1);
      if (!prop) { res.status(403).json({ error: "Forbidden", message: "Access denied" }); return null; }
    }
    return [propId];
  } else if (user.role !== "super_admin" && user.organizationId) {
    const props = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, user.organizationId));
    return props.map((p: any) => p.id);
  }
  return [];
}

router.get("/availability", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { checkIn, checkOut, propertyId, category } = req.query;

  if (!checkIn || !checkOut) {
    res.status(400).json({ error: "Bad Request", message: "checkIn and checkOut are required" });
    return;
  }

  const checkInDate = new Date(checkIn as string);
  const checkOutDate = new Date(checkOut as string);

  if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
    res.status(400).json({ error: "Bad Request", message: "Invalid date format. Use YYYY-MM-DD" });
    return;
  }

  if (checkOutDate <= checkInDate) {
    res.status(400).json({ error: "Bad Request", message: "checkOut must be after checkIn" });
    return;
  }

  const propIds = await resolvePropertyIds(user, propertyId as string | undefined, res);
  if (propIds === null) return;

  const unitConditions: any[] = [];
  if (propIds.length > 0) unitConditions.push(inArray(unitsTable.propertyId, propIds));
  if (category) unitConditions.push(eq(unitsTable.category, category as string));
  unitConditions.push(eq(unitsTable.status, "active"));
  unitConditions.push(sql`COALESCE(${unitsTable.isHidden}, false) = false`);

  const units = unitConditions.length > 0
    ? await db.select().from(unitsTable).where(and(...unitConditions))
    : await db.select().from(unitsTable);

  const blockedBookings = await db
    .select({ unitId: bookingsTable.unitId, id: bookingsTable.id })
    .from(bookingsTable)
    .where(
      and(
        inArray(bookingsTable.unitId, units.map(u => u.id)),
        or(
          and(
            lt(bookingsTable.checkIn, checkOut as string),
            gt(bookingsTable.checkOut, checkIn as string),
          )
        )!,
        or(
          eq(bookingsTable.status, "confirmed"),
          eq(bookingsTable.status, "checked_in"),
        )!
      )
    );

  const blockedMap = new Map<number, number>();
  for (const b of blockedBookings) {
    blockedMap.set(b.unitId, b.id);
  }

  const results = units.map(u => ({
    unit: { ...u, basePrice: u.basePrice ? Number(u.basePrice) : null, squareMeters: u.squareMeters ? Number(u.squareMeters) : null },
    isAvailable: !blockedMap.has(u.id),
    blockingBookingId: blockedMap.get(u.id) ?? null,
  }));

  const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));

  res.json({
    checkIn: checkIn,
    checkOut: checkOut,
    nights,
    results,
    availableCount: results.filter(r => r.isAvailable).length,
    totalCount: results.length,
  });
});

router.get("/categories", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { propertyId } = req.query;

  const propIds = await resolvePropertyIds(user, propertyId as string | undefined, res);
  if (propIds === null) return;

  const conditions: any[] = [eq(unitsTable.status, "active")];
  if (propIds.length > 0) conditions.push(inArray(unitsTable.propertyId, propIds));

  const units = await db.select({
    category: unitsTable.category,
    basePrice: unitsTable.basePrice,
    housekeepingStatus: unitsTable.housekeepingStatus,
  }).from(unitsTable).where(and(...conditions));

  const categoryMap = new Map<string, { total: number; available: number; basePrice: number | null }>();
  for (const u of units) {
    const existing = categoryMap.get(u.category) || { total: 0, available: 0, basePrice: u.basePrice ? Number(u.basePrice) : null };
    existing.total++;
    if (u.housekeepingStatus === "clean") existing.available++;
    categoryMap.set(u.category, existing);
  }

  const result = Array.from(categoryMap.entries()).map(([category, stats]) => ({
    category,
    ...stats,
  }));

  res.json(result);
});

router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { propertyId, category, status, showHidden } = req.query;

  const propIds = await resolvePropertyIds(user, propertyId as string | undefined, res);
  if (propIds === null) return;

  const conditions: any[] = [];
  if (propIds.length > 0) conditions.push(inArray(unitsTable.propertyId, propIds));
  if (category) conditions.push(eq(unitsTable.category, category as string));
  if (status) conditions.push(eq(unitsTable.status, status as any));
  // By default exclude hidden units; pass ?showHidden=1 to include them (e.g. units management page)
  if (showHidden !== "1") conditions.push(sql`COALESCE(${unitsTable.isHidden}, false) = false`);

  const units = conditions.length > 0
    ? await db.select().from(unitsTable).where(and(...conditions))
    : await db.select().from(unitsTable);

  res.json(units.map(u => ({
    ...u,
    basePrice: u.basePrice ? Number(u.basePrice) : null,
    baseGuests: u.baseGuests ?? 2,
    extraGuestPrice: Number(u.extraGuestPrice || 0),
    squareMeters: u.squareMeters ? Number(u.squareMeters) : null,
  })));
});

router.post("/", requireAuth, async (req, res) => {
  const { propertyId, name, category, capacity, maxCapacity, baseGuests, extraGuestPrice, floor, description, basePrice, hasView, hasBalcony, squareMeters, bedrooms, unitGroupId } = req.body;
  const [unit] = await db.insert(unitsTable).values({
    propertyId,
    name,
    category,
    capacity: capacity || 2,
    maxCapacity: maxCapacity || null,
    baseGuests: baseGuests != null ? Number(baseGuests) : (capacity || 2),
    extraGuestPrice: extraGuestPrice != null ? String(extraGuestPrice) : "0",
    floor,
    description,
    basePrice: basePrice ? String(basePrice) : null,
    hasView: hasView || null,
    hasBalcony: hasBalcony ?? false,
    squareMeters: squareMeters ? String(squareMeters) : null,
    bedrooms: bedrooms ? parseInt(bedrooms) : null,
    unitGroupId: unitGroupId ? parseInt(unitGroupId) : null,
  }).returning();
  res.status(201).json({ ...unit, basePrice: unit.basePrice ? Number(unit.basePrice) : null, extraGuestPrice: Number(unit.extraGuestPrice || 0), squareMeters: unit.squareMeters ? Number(unit.squareMeters) : null });
});

router.get("/:unitId", requireAuth, async (req, res) => {
  const unitId = parseInt(req.params.unitId);
  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, unitId)).limit(1);
  if (!unit) {
    res.status(404).json({ error: "Not Found", message: "Unit not found" });
    return;
  }
  res.json({ ...unit, basePrice: unit.basePrice ? Number(unit.basePrice) : null, baseGuests: unit.baseGuests ?? 2, extraGuestPrice: Number(unit.extraGuestPrice || 0), squareMeters: unit.squareMeters ? Number(unit.squareMeters) : null });
});

router.put("/:unitId", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const unitId = parseInt(req.params.unitId);
  if (user.role !== "super_admin" && user.organizationId) {
    const [existing] = await db.select({ orgId: propertiesTable.organizationId })
      .from(unitsTable)
      .innerJoin(propertiesTable, eq(propertiesTable.id, unitsTable.propertyId))
      .where(eq(unitsTable.id, unitId)).limit(1);
    if (!existing || existing.orgId !== user.organizationId) {
      res.status(403).json({ error: "Forbidden", message: "Access denied" });
      return;
    }
  }
  const { name, category, capacity, maxCapacity, baseGuests, extraGuestPrice, status, floor, description, basePrice, hasView, hasBalcony, squareMeters, bedrooms, propertyId, sortOrder, isHidden, unitGroupId } = req.body;
  const [unit] = await db.update(unitsTable).set({
    ...(name !== undefined && { name }),
    ...(category !== undefined && { category }),
    ...(capacity !== undefined && { capacity }),
    ...(maxCapacity !== undefined && { maxCapacity }),
    ...(baseGuests !== undefined && { baseGuests: Number(baseGuests) }),
    ...(extraGuestPrice !== undefined && { extraGuestPrice: String(extraGuestPrice) }),
    ...(status !== undefined && { status }),
    ...(floor !== undefined && { floor }),
    ...(description !== undefined && { description }),
    ...(basePrice !== undefined && { basePrice: String(basePrice) }),
    ...(hasView !== undefined && { hasView }),
    ...(hasBalcony !== undefined && { hasBalcony }),
    ...(squareMeters !== undefined && { squareMeters: squareMeters ? String(squareMeters) : null }),
    ...(bedrooms !== undefined && { bedrooms: bedrooms ? parseInt(bedrooms) : null }),
    ...(propertyId !== undefined && { propertyId: Number(propertyId) }),
    ...(isHidden !== undefined && { isHidden: Boolean(isHidden) }),
    ...(unitGroupId !== undefined && { unitGroupId: unitGroupId ? parseInt(unitGroupId) : null }),
    updatedAt: new Date(),
  }).where(eq(unitsTable.id, unitId)).returning();
  if (!unit) {
    res.status(404).json({ error: "Not Found", message: "Unit not found" });
    return;
  }
  if (sortOrder !== undefined) {
    await db.execute(sql`UPDATE units SET sort_order = ${sortOrder} WHERE id = ${unitId}`);
  }
  res.json({ ...unit, basePrice: unit.basePrice ? Number(unit.basePrice) : null, baseGuests: unit.baseGuests ?? 2, extraGuestPrice: Number(unit.extraGuestPrice || 0), squareMeters: unit.squareMeters ? Number(unit.squareMeters) : null });
});

// PATCH /units/bulk-sort — reorder units within a property (org-scoped)
router.patch("/bulk-sort", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const { orders } = req.body; // [{ id, sortOrder }]
  if (!Array.isArray(orders)) { res.status(400).json({ error: "orders required" }); return; }
  for (const { id, sortOrder } of orders) {
    // Only update units that belong to the caller's org (via property join)
    if (orgId) {
      await db.execute(sql`
        UPDATE units SET sort_order = ${sortOrder}
        WHERE id = ${id}
          AND property_id IN (SELECT id FROM properties WHERE organization_id = ${orgId})
      `);
    } else if (user.role === "super_admin") {
      await db.execute(sql`UPDATE units SET sort_order = ${sortOrder} WHERE id = ${id}`);
    }
  }
  res.json({ ok: true });
});

// PATCH /units/bulk-visibility — bulk hide/show units (org-scoped)
router.patch("/bulk-visibility", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const orgId = user.organizationId;
  const { ids, isHidden } = req.body; // { ids: number[], isHidden: boolean }
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids required" }); return; }
  const idList = sql.join(ids.map((id: number) => sql`${id}`), sql`, `);
  if (orgId) {
    // Only update units belonging to the caller's org
    await db.execute(sql`
      UPDATE units SET is_hidden = ${Boolean(isHidden)}, updated_at = NOW()
      WHERE id = ANY(ARRAY[${idList}]::int[])
        AND property_id IN (SELECT id FROM properties WHERE organization_id = ${orgId})
    `);
  } else if (user.role === "super_admin") {
    await db.execute(sql`UPDATE units SET is_hidden = ${Boolean(isHidden)}, updated_at = NOW() WHERE id = ANY(ARRAY[${idList}]::int[])`);
  }
  res.json({ ok: true, updated: ids.length });
});

export default router;
