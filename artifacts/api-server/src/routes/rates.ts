import { Router } from "express";
import { db } from "@workspace/db";
import { ratesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const { propertyId } = req.query;
  const rates = propertyId
    ? await db.select().from(ratesTable).where(eq(ratesTable.propertyId, parseInt(propertyId as string)))
    : await db.select().from(ratesTable);

  res.json(rates.map(r => ({
    ...r,
    pricePerNight: Number(r.pricePerNight),
    discountPercent: r.discountPercent ? Number(r.discountPercent) : null,
  })));
});

router.post("/", requireAuth, async (req, res) => {
  const { propertyId, unitCategory, name, pricePerNight, minNights, dateFrom, dateTo, isStopSale, promoCode, discountPercent } = req.body;
  const [rate] = await db.insert(ratesTable).values({
    propertyId,
    unitCategory,
    name,
    pricePerNight: String(pricePerNight),
    minNights: minNights || 1,
    dateFrom,
    dateTo,
    isStopSale: isStopSale || false,
    promoCode,
    discountPercent: discountPercent ? String(discountPercent) : null,
  }).returning();
  res.status(201).json({
    ...rate,
    pricePerNight: Number(rate.pricePerNight),
    discountPercent: rate.discountPercent ? Number(rate.discountPercent) : null,
  });
});

router.put("/:rateId", requireAuth, async (req, res) => {
  const rateId = parseInt(req.params.rateId);
  const { propertyId, unitCategory, name, pricePerNight, minNights, dateFrom, dateTo, isStopSale, promoCode, discountPercent } = req.body;
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
    updatedAt: new Date(),
  }).where(eq(ratesTable.id, rateId)).returning();
  if (!rate) {
    res.status(404).json({ error: "Not Found", message: "Rate not found" });
    return;
  }
  res.json({
    ...rate,
    pricePerNight: Number(rate.pricePerNight),
    discountPercent: rate.discountPercent ? Number(rate.discountPercent) : null,
  });
});

router.delete("/:rateId", requireAuth, async (req, res) => {
  const rateId = parseInt(req.params.rateId);
  await db.delete(ratesTable).where(eq(ratesTable.id, rateId));
  res.json({ success: true, message: "Rate deleted" });
});

export default router;
