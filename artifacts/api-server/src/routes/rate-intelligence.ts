import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { eq, and, gte, lte, desc, asc, avg, min, max } from "drizzle-orm";
import { pgTable, serial, integer, smallint, varchar, text, boolean, numeric, timestamp, date } from "drizzle-orm/pg-core";

// Inline schemas
const rateCompetitorsTable = pgTable("rate_competitors", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  websiteUrl: text("website_url"),
  otaLink: text("ota_link"),
  starRating: smallint("star_rating").default(3),
  roomType: varchar("room_type", { length: 100 }),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

const competitorRatesTable = pgTable("competitor_rates", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  competitorId: integer("competitor_id").notNull(),
  checkDate: date("check_date").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  roomType: varchar("room_type", { length: 100 }),
  currency: varchar("currency", { length: 10 }).default("UAH"),
  availabilityPct: smallint("availability_pct"),
  source: varchar("source", { length: 50 }).default("manual"),
  notes: text("notes"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

const rateSnapshotsTable = pgTable("rate_snapshots", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  snapDate: date("snap_date").notNull(),
  ourPrice: numeric("our_price", { precision: 10, scale: 2 }).notNull(),
  roomType: varchar("room_type", { length: 100 }),
  currency: varchar("currency", { length: 10 }).default("UAH"),
  occupancyPct: smallint("occupancy_pct"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

const router = Router();
const getOrgId = (req: any): number => req.user?.organizationId;

// ── Competitors ───────────────────────────────────────────────────────────────
router.get("/competitors", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const rows = await db.select().from(rateCompetitorsTable)
      .where(and(eq(rateCompetitorsTable.organizationId, orgId), eq(rateCompetitorsTable.isActive, true)))
      .orderBy(asc(rateCompetitorsTable.name));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/competitors", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { name, websiteUrl, otaLink, starRating, roomType, notes } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    const [comp] = await db.insert(rateCompetitorsTable).values({ organizationId: orgId, name, websiteUrl, otaLink, starRating, roomType, notes }).returning();
    res.status(201).json(comp);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/competitors/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  const upd: any = {};
  for (const f of ["name","websiteUrl","otaLink","starRating","roomType","notes","isActive"]) {
    if (req.body[f] !== undefined) upd[f] = req.body[f];
  }
  try {
    const [comp] = await db.update(rateCompetitorsTable).set(upd)
      .where(and(eq(rateCompetitorsTable.id, id), eq(rateCompetitorsTable.organizationId, orgId))).returning();
    res.json(comp);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/competitors/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  try {
    await db.delete(rateCompetitorsTable).where(and(eq(rateCompetitorsTable.id, id), eq(rateCompetitorsTable.organizationId, orgId)));
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Competitor rates ──────────────────────────────────────────────────────────
router.get("/competitor-rates", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { from, to, competitorId } = req.query as any;
  try {
    const conds: any[] = [eq(competitorRatesTable.organizationId, orgId)];
    if (from) conds.push(gte(competitorRatesTable.checkDate, from));
    if (to) conds.push(lte(competitorRatesTable.checkDate, to));
    if (competitorId) conds.push(eq(competitorRatesTable.competitorId, parseInt(competitorId)));
    const rows = await db.select({
      id: competitorRatesTable.id,
      competitorId: competitorRatesTable.competitorId,
      checkDate: competitorRatesTable.checkDate,
      price: competitorRatesTable.price,
      roomType: competitorRatesTable.roomType,
      currency: competitorRatesTable.currency,
      notes: competitorRatesTable.notes,
      competitorName: rateCompetitorsTable.name,
    })
    .from(competitorRatesTable)
    .innerJoin(rateCompetitorsTable, eq(competitorRatesTable.competitorId, rateCompetitorsTable.id))
    .where(and(...conds))
    .orderBy(asc(competitorRatesTable.checkDate), asc(rateCompetitorsTable.name));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/competitor-rates", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { competitorId, checkDate, price, roomType, availabilityPct, notes } = req.body;
  if (!competitorId || !checkDate || price === undefined) {
    return res.status(400).json({ error: "competitorId, checkDate, price required" });
  }
  try {
    const [rate] = await db.insert(competitorRatesTable).values({
      organizationId: orgId, competitorId: parseInt(competitorId), checkDate,
      price: String(price), roomType, availabilityPct, notes,
    }).returning();
    res.status(201).json(rate);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Our rates (snapshots) ─────────────────────────────────────────────────────
router.get("/our-rates", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { from, to } = req.query as any;
  try {
    const conds: any[] = [eq(rateSnapshotsTable.organizationId, orgId)];
    if (from) conds.push(gte(rateSnapshotsTable.snapDate, from));
    if (to) conds.push(lte(rateSnapshotsTable.snapDate, to));
    const rows = await db.select().from(rateSnapshotsTable).where(and(...conds)).orderBy(asc(rateSnapshotsTable.snapDate));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/our-rates", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { snapDate, ourPrice, roomType, occupancyPct } = req.body;
  if (!snapDate || ourPrice === undefined) return res.status(400).json({ error: "snapDate, ourPrice required" });
  try {
    const [snap] = await db.insert(rateSnapshotsTable).values({
      organizationId: orgId, snapDate, ourPrice: String(ourPrice), roomType, occupancyPct,
    }).returning();
    res.status(201).json(snap);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard: market position for date range ─────────────────────────────────
router.get("/dashboard", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { from, to } = req.query as any;
  try {
    const conds: any[] = [eq(competitorRatesTable.organizationId, orgId)];
    if (from) conds.push(gte(competitorRatesTable.checkDate, from));
    if (to) conds.push(lte(competitorRatesTable.checkDate, to));

    const compRates = await db.select().from(competitorRatesTable).where(and(...conds));
    const ourRateConds: any[] = [eq(rateSnapshotsTable.organizationId, orgId)];
    if (from) ourRateConds.push(gte(rateSnapshotsTable.snapDate, from));
    if (to) ourRateConds.push(lte(rateSnapshotsTable.snapDate, to));
    const ourRates = await db.select().from(rateSnapshotsTable).where(and(...ourRateConds));
    const competitors = await db.select().from(rateCompetitorsTable).where(eq(rateCompetitorsTable.organizationId, orgId));

    const avgCompPrice = compRates.length ? compRates.reduce((s, r) => s + parseFloat(r.price), 0) / compRates.length : 0;
    const minCompPrice = compRates.length ? Math.min(...compRates.map(r => parseFloat(r.price))) : 0;
    const maxCompPrice = compRates.length ? Math.max(...compRates.map(r => parseFloat(r.price))) : 0;
    const avgOurPrice = ourRates.length ? ourRates.reduce((s, r) => s + parseFloat(r.ourPrice), 0) / ourRates.length : 0;

    const position = avgCompPrice > 0
      ? avgOurPrice >= avgCompPrice ? "above" : avgOurPrice >= avgCompPrice * 0.9 ? "parity" : "below"
      : "unknown";

    res.json({
      avgCompPrice: Math.round(avgCompPrice),
      minCompPrice: Math.round(minCompPrice),
      maxCompPrice: Math.round(maxCompPrice),
      avgOurPrice: Math.round(avgOurPrice),
      position,
      totalDataPoints: compRates.length,
      competitorCount: competitors.length,
      ourRateCount: ourRates.length,
      priceGap: Math.round(avgOurPrice - avgCompPrice),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
