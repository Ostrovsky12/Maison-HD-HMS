import { Router } from "express";
import { db } from "@workspace/db";
import { discountTypesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

const DEFAULT_DISCOUNTS = [
  { name: "День народження", code: "birthday", value: "10", valueType: "percent" },
  { name: "УБД", code: "ubd", value: "10", valueType: "percent" },
  { name: "Постійний гість", code: "loyal", value: "5", valueType: "percent" },
];

router.get("/", requireAuth, async (req, res) => {
  try {
    const { organizationId } = (req as any).user;
    if (!organizationId) return res.status(403).json({ error: "No organization" });

    let discounts = await db
      .select()
      .from(discountTypesTable)
      .where(and(eq(discountTypesTable.organizationId, organizationId), eq(discountTypesTable.isActive, true)));

    if (discounts.length === 0) {
      const inserted = await db.insert(discountTypesTable)
        .values(DEFAULT_DISCOUNTS.map(d => ({ ...d, organizationId, value: d.value, valueType: d.valueType as "percent" | "fixed" })))
        .returning();
      discounts = inserted;
    }

    res.json(discounts);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { organizationId } = (req as any).user;
    if (!organizationId) return res.status(403).json({ error: "No organization" });
    const { name, code, value, valueType } = req.body;
    if (!name || !code) return res.status(400).json({ error: "name and code required" });
    const [discount] = await db.insert(discountTypesTable)
      .values({ organizationId, name, code, value: value || "0", valueType: valueType || "percent" })
      .returning();
    res.status(201).json(discount);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const { organizationId } = (req as any).user;
    const id = Number(req.params.id);
    const { name, value, valueType, isActive } = req.body;
    const [updated] = await db.update(discountTypesTable)
      .set({ name, value, valueType, isActive })
      .where(and(eq(discountTypesTable.id, id), eq(discountTypesTable.organizationId, organizationId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { organizationId } = (req as any).user;
    const id = Number(req.params.id);
    await db.update(discountTypesTable)
      .set({ isActive: false })
      .where(and(eq(discountTypesTable.id, id), eq(discountTypesTable.organizationId, organizationId)));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
