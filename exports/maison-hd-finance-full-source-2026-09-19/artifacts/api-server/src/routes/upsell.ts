import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { pgTable, serial, integer, varchar, text, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { organizationsTable } from "@workspace/db/schema";

// Inline schema for upsell tables (existing + new)
const upsellOffersTable = pgTable("upsell_offers", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  bookingId: integer("booking_id"),
  offerType: varchar("offer_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  shownAt: timestamp("shown_at"),
  respondedAt: timestamp("responded_at"),
  currency: varchar("currency", { length: 10 }).default("UAH"),
  imageUrl: text("image_url"),
  validUntil: timestamp("valid_until"),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  channel: varchar("channel", { length: 50 }).default("portal"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

const upsellTemplatesTable = pgTable("upsell_templates", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  offerType: varchar("offer_type", { length: 50 }).notNull().default("upgrade"),
  price: numeric("price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("UAH"),
  imageUrl: text("image_url"),
  triggerType: varchar("trigger_type", { length: 50 }).default("manual"),
  triggerDaysBefore: integer("trigger_days_before").default(1),
  channel: varchar("channel", { length: 50 }).default("portal"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").default(0),
  timesShown: integer("times_shown").notNull().default(0),
  timesAccepted: integer("times_accepted").notNull().default(0),
  revenueGenerated: numeric("revenue_generated", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

const router = Router();
const getOrgId = (req: any): number => req.user?.organizationId;

// ── Templates ─────────────────────────────────────────────────────────────────
router.get("/templates", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const templates = await db.select().from(upsellTemplatesTable)
      .where(eq(upsellTemplatesTable.organizationId, orgId))
      .orderBy(upsellTemplatesTable.sortOrder, desc(upsellTemplatesTable.timesAccepted));
    res.json(templates);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/templates", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { title, description, offerType, price, imageUrl, triggerType, triggerDaysBefore, channel } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });
  try {
    const [tpl] = await db.insert(upsellTemplatesTable).values({
      organizationId: orgId, title, description, offerType: offerType || "upgrade",
      price: price ? String(price) : null, imageUrl, triggerType: triggerType || "manual",
      triggerDaysBefore, channel: channel || "portal",
    }).returning();
    res.status(201).json(tpl);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/templates/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  const upd: any = { updatedAt: new Date() };
  const fields = ["title","description","offerType","price","imageUrl","triggerType","triggerDaysBefore","channel","isActive","sortOrder"];
  for (const f of fields) if (req.body[f] !== undefined) upd[f] = f === "price" ? String(req.body[f]) : req.body[f];
  try {
    const [tpl] = await db.update(upsellTemplatesTable).set(upd)
      .where(and(eq(upsellTemplatesTable.id, id), eq(upsellTemplatesTable.organizationId, orgId))).returning();
    if (!tpl) return res.status(404).json({ error: "Not found" });
    res.json(tpl);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/templates/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  try {
    await db.delete(upsellTemplatesTable).where(and(eq(upsellTemplatesTable.id, id), eq(upsellTemplatesTable.organizationId, orgId)));
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Offers (sent instances) ───────────────────────────────────────────────────
router.get("/offers", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { status, limit = "50" } = req.query as any;
  try {
    const conds: any[] = [eq(upsellOffersTable.organizationId, orgId)];
    if (status) conds.push(eq(upsellOffersTable.status, status));
    const offers = await db.select().from(upsellOffersTable).where(and(...conds))
      .orderBy(desc(upsellOffersTable.createdAt)).limit(parseInt(limit));
    res.json(offers);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /offers/:id/respond — accept or decline
router.post("/offers/:id/respond", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  const { action } = req.body; // "accept" | "decline"
  if (!["accept","decline"].includes(action)) return res.status(400).json({ error: "action must be accept or decline" });
  try {
    const status = action === "accept" ? "accepted" : "declined";
    const now = new Date();
    const upd: any = { status, respondedAt: now };
    if (action === "accept") upd.acceptedAt = now;
    if (action === "decline") upd.declinedAt = now;
    const [offer] = await db.update(upsellOffersTable).set(upd)
      .where(and(eq(upsellOffersTable.id, id), eq(upsellOffersTable.organizationId, orgId))).returning();
    if (!offer) return res.status(404).json({ error: "Not found" });
    res.json(offer);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /offers/send — send an offer from a template
router.post("/offers/send", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { templateId, bookingId, channel } = req.body;
  if (!templateId) return res.status(400).json({ error: "templateId required" });
  try {
    const [tpl] = await db.select().from(upsellTemplatesTable)
      .where(and(eq(upsellTemplatesTable.id, templateId), eq(upsellTemplatesTable.organizationId, orgId)));
    if (!tpl) return res.status(404).json({ error: "Template not found" });

    const [offer] = await db.insert(upsellOffersTable).values({
      organizationId: orgId,
      bookingId: bookingId || null,
      offerType: tpl.offerType,
      title: tpl.title,
      description: tpl.description,
      price: tpl.price,
      imageUrl: tpl.imageUrl,
      status: "pending",
      channel: channel || tpl.channel || "portal",
      shownAt: new Date(),
    }).returning();

    // Increment times_shown on template
    await db.update(upsellTemplatesTable)
      .set({ timesShown: sql`${upsellTemplatesTable.timesShown} + 1` })
      .where(eq(upsellTemplatesTable.id, templateId));

    res.status(201).json(offer);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /stats
router.get("/stats", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const offers = await db.select().from(upsellOffersTable).where(eq(upsellOffersTable.organizationId, orgId));
    const total = offers.length;
    const accepted = offers.filter(o => o.status === "accepted").length;
    const declined = offers.filter(o => o.status === "declined").length;
    const pending = offers.filter(o => o.status === "pending").length;
    const revenueGenerated = offers
      .filter(o => o.status === "accepted")
      .reduce((s, o) => s + parseFloat(o.price || "0"), 0);
    const acceptanceRate = total ? Math.round((accepted / total) * 100) : 0;
    res.json({ total, accepted, declined, pending, acceptanceRate, revenueGenerated });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
