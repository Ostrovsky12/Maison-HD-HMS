import { Router } from "express";
import { db } from "@workspace/db";
import { demoRequestsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { rateLimit } from "express-rate-limit";
import { notifyLandingLead } from "../lib/lead-notifications.js";

const router = Router();
const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Bound public-form mail volume without trusting spoofable proxy IP headers.
  keyGenerator: () => "maison-platform-leads",
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Забагато заявок. Спробуйте пізніше." },
});

router.post("/", leadLimiter, async (req, res) => {
  try {
    const { name, email, phone, company, propertiesCount, message } = req.body;

    if (![name, email, company].every((value) => typeof value === "string" && value.trim())) {
      return res.status(400).json({ error: "Поля name, email та company є обов'язковими" });
    }

    if ([name, email, company].some((value) => value.length > 255)
      || (phone != null && (typeof phone !== "string" || phone.length > 50))
      || (message != null && (typeof message !== "string" || message.length > 10_000))) {
      return res.status(400).json({ error: "Перевірте довжину та формат полів заявки" });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim()) || /[<>\r\n]/.test(email)) {
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

    // Save first; delivery failures must never discard an accepted lead.
    await notifyLandingLead(request).catch(() => {
      req.log?.warn({ leadId: request.id }, "Landing lead notification failed; lead remains saved");
    });

    return res.status(201).json({ success: true, id: request.id, message: "Заявку отримано! Ми зв'яжемось з вами найближчим часом." });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
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
