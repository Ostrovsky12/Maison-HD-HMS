import { Router } from "express";
import { db } from "@workspace/db";
import { legalEntitiesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { organizationId } = (req as any).user;
    if (!organizationId) return res.status(403).json({ error: "No organization" });
    const entities = await db
      .select()
      .from(legalEntitiesTable)
      .where(and(eq(legalEntitiesTable.organizationId, organizationId), eq(legalEntitiesTable.isActive, true)));
    res.json(entities);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { organizationId } = (req as any).user;
    if (!organizationId) return res.status(403).json({ error: "No organization" });
    const { name, type, edrpou, iban, bank, mfo, address, liqpayPublicKey, liqpayPrivateKey, fondyMerchantId, fondySecretKey, isDefault } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });

    if (isDefault) {
      await db.update(legalEntitiesTable)
        .set({ isDefault: false })
        .where(eq(legalEntitiesTable.organizationId, organizationId));
    }

    const [entity] = await db.insert(legalEntitiesTable).values({
      organizationId, name, type: type || "fop", edrpou, iban, bank, mfo, address,
      liqpayPublicKey, liqpayPrivateKey, fondyMerchantId, fondySecretKey,
      isDefault: isDefault || false,
    }).returning();
    res.status(201).json(entity);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const { organizationId } = (req as any).user;
    if (!organizationId) return res.status(403).json({ error: "No organization" });
    const id = Number(req.params.id);
    const { name, type, edrpou, iban, bank, mfo, address, liqpayPublicKey, liqpayPrivateKey, fondyMerchantId, fondySecretKey, isDefault, isActive } = req.body;

    if (isDefault) {
      await db.update(legalEntitiesTable)
        .set({ isDefault: false })
        .where(eq(legalEntitiesTable.organizationId, organizationId));
    }

    const [updated] = await db.update(legalEntitiesTable)
      .set({ name, type, edrpou, iban, bank, mfo, address, liqpayPublicKey, liqpayPrivateKey, fondyMerchantId, fondySecretKey, isDefault, isActive, updatedAt: new Date() })
      .where(and(eq(legalEntitiesTable.id, id), eq(legalEntitiesTable.organizationId, organizationId)))
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
    await db.update(legalEntitiesTable)
      .set({ isActive: false })
      .where(and(eq(legalEntitiesTable.id, id), eq(legalEntitiesTable.organizationId, organizationId)));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
