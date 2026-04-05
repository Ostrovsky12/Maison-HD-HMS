import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { eq, and, gte, lte, desc, asc } from "drizzle-orm";
import { pgTable, serial, integer, smallint, varchar, text, boolean, numeric, timestamp, date } from "drizzle-orm/pg-core";

const esgMetricsTable = pgTable("esg_metrics", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  metricDate: date("metric_date").notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  metricName: varchar("metric_name", { length: 100 }).notNull(),
  value: numeric("value", { precision: 12, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 30 }).notNull(),
  notes: text("notes"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

const esgGoalsTable = pgTable("esg_goals", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  metricName: varchar("metric_name", { length: 100 }).notNull(),
  targetValue: numeric("target_value", { precision: 12, scale: 2 }).notNull(),
  targetUnit: varchar("target_unit", { length: 30 }).notNull(),
  targetYear: smallint("target_year").notNull().default(2025),
  currentValue: numeric("current_value", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

const greenInitiativesTable = pgTable("green_initiatives", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull().default("energy"),
  status: varchar("status", { length: 20 }).notNull().default("planned"),
  impactScore: smallint("impact_score").default(3),
  startDate: date("start_date"),
  completedAt: date("completed_at"),
  estimatedSavings: numeric("estimated_savings", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

const router = Router();
const getOrgId = (req: any) => req.user?.organizationId;

// ── Metrics ───────────────────────────────────────────────────────────────────
router.get("/metrics", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { from, to, category } = req.query as any;
  try {
    const conds: any[] = [eq(esgMetricsTable.organizationId, orgId)];
    if (from) conds.push(gte(esgMetricsTable.metricDate, from));
    if (to) conds.push(lte(esgMetricsTable.metricDate, to));
    if (category) conds.push(eq(esgMetricsTable.category, category));
    const rows = await db.select().from(esgMetricsTable).where(and(...conds)).orderBy(asc(esgMetricsTable.metricDate));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/metrics", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { metricDate, category, metricName, value, unit, notes } = req.body;
  if (!metricDate || !category || !metricName || value === undefined || !unit) {
    return res.status(400).json({ error: "metricDate, category, metricName, value, unit required" });
  }
  try {
    const [m] = await db.insert(esgMetricsTable).values({ organizationId: orgId, metricDate, category, metricName, value: String(value), unit, notes }).returning();
    res.status(201).json(m);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Goals ─────────────────────────────────────────────────────────────────────
router.get("/goals", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const rows = await db.select().from(esgGoalsTable).where(eq(esgGoalsTable.organizationId, orgId)).orderBy(asc(esgGoalsTable.category));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/goals/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  const upd: any = {};
  for (const f of ["targetValue","currentValue","notes","targetYear"]) {
    if (req.body[f] !== undefined) upd[f] = req.body[f];
  }
  try {
    const [g] = await db.update(esgGoalsTable).set(upd)
      .where(and(eq(esgGoalsTable.id, id), eq(esgGoalsTable.organizationId, orgId))).returning();
    res.json(g);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Green initiatives ─────────────────────────────────────────────────────────
router.get("/initiatives", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const rows = await db.select().from(greenInitiativesTable)
      .where(eq(greenInitiativesTable.organizationId, orgId))
      .orderBy(asc(greenInitiativesTable.status), desc(greenInitiativesTable.impactScore));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/initiatives", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { title, description, category, status, impactScore, startDate, estimatedSavings } = req.body;
  if (!title || !category) return res.status(400).json({ error: "title, category required" });
  try {
    const [init] = await db.insert(greenInitiativesTable).values({ organizationId: orgId, title, description, category, status: status || "planned", impactScore, startDate, estimatedSavings }).returning();
    res.status(201).json(init);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/initiatives/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  const upd: any = {};
  for (const f of ["title","description","category","status","impactScore","startDate","completedAt","estimatedSavings"]) {
    if (req.body[f] !== undefined) upd[f] = req.body[f];
  }
  if (req.body.status === "completed" && !upd.completedAt) upd.completedAt = new Date().toISOString().split("T")[0];
  try {
    const [init] = await db.update(greenInitiativesTable).set(upd)
      .where(and(eq(greenInitiativesTable.id, id), eq(greenInitiativesTable.organizationId, orgId))).returning();
    res.json(init);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/initiatives/:id", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const id = parseInt(req.params.id);
  try {
    await db.delete(greenInitiativesTable).where(and(eq(greenInitiativesTable.id, id), eq(greenInitiativesTable.organizationId, orgId)));
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── ESG Dashboard ─────────────────────────────────────────────────────────────
router.get("/dashboard", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const metrics = await db.select().from(esgMetricsTable).where(eq(esgMetricsTable.organizationId, orgId));
    const goals = await db.select().from(esgGoalsTable).where(eq(esgGoalsTable.organizationId, orgId));
    const initiatives = await db.select().from(greenInitiativesTable).where(eq(greenInitiativesTable.organizationId, orgId));

    const byCategory: Record<string, { latest: number; trend: number; unit: string }> = {};
    const cats = [...new Set(metrics.map(m => m.category))];
    for (const cat of cats) {
      const catMetrics = metrics.filter(m => m.category === cat).sort((a, b) => a.metricDate.localeCompare(b.metricDate));
      if (catMetrics.length >= 2) {
        const last = parseFloat(catMetrics[catMetrics.length - 1].value);
        const prev = parseFloat(catMetrics[catMetrics.length - 2].value);
        byCategory[cat] = { latest: last, trend: Math.round(((last - prev) / prev) * 100), unit: catMetrics[catMetrics.length - 1].unit };
      } else if (catMetrics.length === 1) {
        byCategory[cat] = { latest: parseFloat(catMetrics[0].value), trend: 0, unit: catMetrics[0].unit };
      }
    }

    const completedCount = initiatives.filter(i => i.status === "completed").length;
    const esgScore = Math.min(100, Math.round(
      (completedCount / Math.max(1, initiatives.length)) * 50 +
      (goals.filter(g => g.currentValue !== null && parseFloat(g.currentValue!) <= parseFloat(g.targetValue)).length / Math.max(1, goals.length)) * 50
    ));

    res.json({ byCategory, goals, initiatives: initiatives.slice(0, 5), esgScore, totalInitiatives: initiatives.length, completedInitiatives: completedCount });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
