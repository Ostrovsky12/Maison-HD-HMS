import { Router } from "express";
import { db } from "@workspace/db";
import { demoRequestsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { name, email, phone, company, propertiesCount, message } = req.body;

    if (!name || !email || !company) {
      return res.status(400).json({ error: "Поля name, email та company є обов'язковими" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Невірний формат email" });
    }

    const [request] = await db
      .insert(demoRequestsTable)
      .values({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        company: company.trim(),
        propertiesCount: propertiesCount ? Number(propertiesCount) : 1,
        message: message?.trim() || null,
        status: "new",
      })
      .returning();

    res.status(201).json({ success: true, id: request.id, message: "Заявку отримано! Ми зв'яжемось з вами найближчим часом." });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/", requireAuth, requireRole("super_admin"), async (_req, res) => {
  try {
    const requests = await db
      .select()
      .from(demoRequestsTable)
      .orderBy(desc(demoRequestsTable.createdAt));

    res.json({ requests });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/:id", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, notes } = req.body;

    const [updated] = await db
      .update(demoRequestsTable)
      .set({ status, notes, updatedAt: new Date() })
      .where(eq(demoRequestsTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Not found" });

    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
