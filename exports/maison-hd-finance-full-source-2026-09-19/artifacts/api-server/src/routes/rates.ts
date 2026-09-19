import { Router } from "express";
import { db } from "@workspace/db";
import { ratesTable, channelRateSettingsTable, propertiesTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { sql } from "drizzle-orm";

const router = Router();

const formatRate = (r: any) => ({
  ...r,
  pricePerNight: Number(r.pricePerNight),
  discountPercent: r.discountPercent ? Number(r.discountPercent) : null,
  unitPrices: r.unitPrices || null,
});

async function getOrgPropertyIds(user: any): Promise<number[]> {
  if (user.role === "super_admin" || !user.organizationId) return [];
  const props = await db.select({ id: propertiesTable.id })
    .from(propertiesTable)
    .where(eq(propertiesTable.organizationId, user.organizationId));
  return props.map((p: any) => p.id);
}

async function assertPropertyOwnership(user: any, propertyId: number, res: any): Promise<boolean> {
  if (user.role === "super_admin" || !user.organizationId) return true;
  const [prop] = await db.select({ id: propertiesTable.id })
    .from(propertiesTable)
    .where(and(eq(propertiesTable.id, propertyId), eq(propertiesTable.organizationId, user.organizationId)))
    .limit(1);
  if (!prop) { res.status(403).json({ error: "Forbidden", message: "Access denied" }); return false; }
  return true;
}

async function assertRateOwnership(user: any, rateId: number, res: any): Promise<boolean> {
  if (user.role === "super_admin" || !user.organizationId) return true;
  const orgPropIds = await getOrgPropertyIds(user);
  const [rate] = await db.select({ propertyId: ratesTable.propertyId })
    .from(ratesTable).where(eq(ratesTable.id, rateId)).limit(1);
  if (!rate || !orgPropIds.includes(rate.propertyId)) {
    res.status(403).json({ error: "Forbidden", message: "Access denied" }); return false;
  }
  return true;
}

// ─── Channel Rate Settings (MUST come before /:rateId to avoid route conflict) ─

router.get("/channel-settings", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { propertyId } = req.query;
    if (!propertyId) return res.status(400).json({ error: "propertyId required" });
    const propId = parseInt(propertyId as string);
    if (!(await assertPropertyOwnership(user, propId, res))) return;

    const settings = await db.select().from(channelRateSettingsTable)
      .where(eq(channelRateSettingsTable.propertyId, propId));
    res.json(settings);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/channel-settings", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { propertyId, channel, rateId, isActive } = req.body;
    if (!propertyId || !channel) return res.status(400).json({ error: "propertyId and channel required" });
    if (!(await assertPropertyOwnership(user, propertyId, res))) return;

    await db.execute(sql`
      INSERT INTO channel_rate_settings (property_id, channel, rate_id, is_active, updated_at)
      VALUES (${propertyId}, ${channel}, ${rateId ?? null}, ${isActive ?? true}, NOW())
      ON CONFLICT (property_id, channel)
      DO UPDATE SET rate_id = ${rateId ?? null}, is_active = ${isActive ?? true}, updated_at = NOW()
    `);

    const [setting] = await db.select().from(channelRateSettingsTable)
      .where(and(
        eq(channelRateSettingsTable.propertyId, propertyId),
        eq(channelRateSettingsTable.channel, channel)
      ));
    res.json(setting);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Rates CRUD ────────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { propertyId } = req.query;

  if (propertyId) {
    const propId = parseInt(propertyId as string);
    if (!(await assertPropertyOwnership(user, propId, res))) return;
    const rates = await db.select().from(ratesTable).where(eq(ratesTable.propertyId, propId));
    return res.json(rates.map(formatRate));
  }

  const orgPropIds = await getOrgPropertyIds(user);
  if (user.role !== "super_admin" && orgPropIds.length === 0) return res.json([]);
  const rates = orgPropIds.length > 0
    ? await db.select().from(ratesTable).where(inArray(ratesTable.propertyId, orgPropIds))
    : await db.select().from(ratesTable);
  res.json(rates.map(formatRate));
});

router.post("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { propertyId, unitCategory, name, pricePerNight, minNights, dateFrom, dateTo, isStopSale, promoCode, discountPercent, unitPrices } = req.body;
  if (!(await assertPropertyOwnership(user, propertyId, res))) return;
  const [rate] = await db.insert(ratesTable).values({
    propertyId,
    unitCategory,
    name,
    pricePerNight: String(pricePerNight || 0),
    minNights: minNights || 1,
    dateFrom,
    dateTo,
    isStopSale: isStopSale || false,
    promoCode,
    discountPercent: discountPercent ? String(discountPercent) : null,
    unitPrices: unitPrices || null,
  } as any).returning();
  res.status(201).json(formatRate(rate));
});

router.put("/:rateId", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const rateId = parseInt(req.params.rateId);
  if (!(await assertRateOwnership(user, rateId, res))) return;
  const { propertyId, unitCategory, name, pricePerNight, minNights, dateFrom, dateTo, isStopSale, promoCode, discountPercent, unitPrices } = req.body;
  const [rate] = await db.update(ratesTable).set({
    ...(propertyId !== undefined && { propertyId }),
    ...(unitCategory !== undefined && { unitCategory }),
    ...(name !== undefined && { name }),
    ...(pricePerNight !== undefined && { pricePerNight: String(pricePerNight) }),
    ...(minNights !== undefined && { minNights }),
    ...(dateFrom !== undefined && { dateFrom }),
    ...(dateTo !== undefined && { dateTo }),
    ...(isStopSale !== undefined && { isStopSale }),
    ...(promoCode !== undefined && { promoCode }),
    ...(discountPercent !== undefined && { discountPercent: discountPercent ? String(discountPercent) : null }),
    ...(unitPrices !== undefined && { unitPrices }),
    updatedAt: new Date(),
  } as any).where(eq(ratesTable.id, rateId)).returning();
  if (!rate) {
    res.status(404).json({ error: "Not Found", message: "Rate not found" });
    return;
  }
  res.json(formatRate(rate));
});

router.delete("/:rateId", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const rateId = parseInt(req.params.rateId);
  if (!(await assertRateOwnership(user, rateId, res))) return;
  await db.delete(ratesTable).where(eq(ratesTable.id, rateId));
  res.json({ success: true, message: "Rate deleted" });
});

export default router;
