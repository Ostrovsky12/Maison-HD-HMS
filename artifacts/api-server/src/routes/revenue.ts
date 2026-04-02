import { Router } from "express";
import { db } from "@workspace/db";
import { ratePlansTable, pricingRulesTable, pricingOverridesTable, bookingsTable, unitsTable, propertiesTable } from "@workspace/db";
import { eq, and, desc, asc, gte, lte, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
const getOrg = (req: any) => req.user?.organizationId;

const RULE_TYPE_LABELS: Record<string, string> = {
  occupancy: "Завантаженість", season: "Сезонність", day_of_week: "День тижня",
  event: "Подія / Свято", last_minute: "Last Minute", early_bird: "Early Bird",
};
const MODIFIER_ICONS: Record<string, string> = {
  occupancy: "📊", season: "🌿", day_of_week: "📅",
  event: "🎉", last_minute: "⚡", early_bird: "🐦",
};

async function seedDemoRevenue(orgId: number) {
  const ex = await db.select({ id: ratePlansTable.id })
    .from(ratePlansTable).where(eq(ratePlansTable.organizationId, orgId)).limit(1);
  if (ex.length > 0) return;

  const plans = await db.insert(ratePlansTable).values([
    { organizationId: orgId, name: "Стандартний тариф", description: "Базовий тариф з гнучким скасуванням", baseModifier: "1.0", status: "active" as any, isDefault: true, cancellationPolicy: "flexible", minStay: 1, includesBreakfast: false },
    { organizationId: orgId, name: "Тариф з сніданком", description: "Включає щоденний сніданок на двох", baseModifier: "1.15", status: "active" as any, cancellationPolicy: "moderate", minStay: 1, includesBreakfast: true },
    { organizationId: orgId, name: "Невідмовний тариф", description: "Без скасування — мінімальна ціна", baseModifier: "0.85", status: "active" as any, cancellationPolicy: "strict", minStay: 2 },
    { organizationId: orgId, name: "Довгостроковий (7+ ночей)", description: "Знижка для тривалого перебування", baseModifier: "0.80", status: "active" as any, cancellationPolicy: "moderate", minStay: 7 },
  ]).returning();

  await db.insert(pricingRulesTable).values([
    { organizationId: orgId, ratePlanId: plans[0].id, name: "Висока завантаженість (>80%)", ruleType: "occupancy" as any, conditions: { min: 80, max: 100 }, modifierType: "percent", modifierValue: "20", priority: 10, isActive: true },
    { organizationId: orgId, ratePlanId: plans[0].id, name: "Низька завантаженість (<40%)", ruleType: "occupancy" as any, conditions: { min: 0, max: 40 }, modifierType: "percent", modifierValue: "-15", priority: 10, isActive: true },
    { organizationId: orgId, ratePlanId: plans[0].id, name: "Літній сезон (червень–серпень)", ruleType: "season" as any, conditions: { months: [6, 7, 8] }, modifierType: "percent", modifierValue: "30", priority: 5, isActive: true, validFrom: "2026-06-01", validTo: "2026-08-31" },
    { organizationId: orgId, ratePlanId: plans[0].id, name: "Святкові вихідні (пт–нд)", ruleType: "day_of_week" as any, conditions: { days: [5, 6, 0] }, modifierType: "percent", modifierValue: "15", priority: 3, isActive: true },
    { organizationId: orgId, ratePlanId: plans[0].id, name: "Last Minute (до 3 днів)", ruleType: "last_minute" as any, conditions: { daysAhead: 3 }, modifierType: "percent", modifierValue: "-20", priority: 8, isActive: false },
    { organizationId: orgId, ratePlanId: plans[0].id, name: "Early Bird (60+ днів наперед)", ruleType: "early_bird" as any, conditions: { daysAhead: 60 }, modifierType: "percent", modifierValue: "-10", priority: 4, isActive: true },
    { organizationId: orgId, ratePlanId: plans[0].id, name: "День незалежності", ruleType: "event" as any, conditions: { date: "2026-08-24" }, modifierType: "percent", modifierValue: "40", priority: 15, isActive: true },
    { organizationId: orgId, ratePlanId: plans[0].id, name: "Новий рік", ruleType: "event" as any, conditions: { dates: ["2026-12-31", "2027-01-01"] }, modifierType: "percent", modifierValue: "60", priority: 20, isActive: true, validFrom: "2026-12-30", validTo: "2027-01-02" },
  ]);

  // Seed a few price overrides for upcoming dates
  const units = await db.select({ id: unitsTable.id }).from(unitsTable).limit(3);
  const today = new Date();
  if (units.length > 0) {
    const overrides: any[] = [];
    for (let d = 1; d <= 10; d++) {
      const dt = new Date(today);
      dt.setDate(dt.getDate() + d);
      const dateStr = dt.toISOString().slice(0, 10);
      if (d === 5 || d === 6) {
        overrides.push({ organizationId: orgId, unitId: units[0].id, overrideDate: dateStr, customPrice: "2800", reason: "Виставка у місті" });
      }
      if (d === 8) {
        overrides.push({ organizationId: orgId, unitId: units[1]?.id || units[0].id, overrideDate: dateStr, isClosed: true, reason: "Технічне обслуговування" });
      }
    }
    if (overrides.length > 0) {
      for (const o of overrides) {
        try { await db.insert(pricingOverridesTable).values(o); } catch {}
      }
    }
  }
}

// GET /stats
router.get("/stats", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedDemoRevenue(orgId);
    const [plans, rules, overrides] = await Promise.all([
      db.select({ id: ratePlansTable.id, status: ratePlansTable.status, isDefault: ratePlansTable.isDefault })
        .from(ratePlansTable).where(eq(ratePlansTable.organizationId, orgId)),
      db.select({ id: pricingRulesTable.id, isActive: pricingRulesTable.isActive, ruleType: pricingRulesTable.ruleType })
        .from(pricingRulesTable).where(eq(pricingRulesTable.organizationId, orgId)),
      db.select({ id: pricingOverridesTable.id, isClosed: pricingOverridesTable.isClosed })
        .from(pricingOverridesTable).where(eq(pricingOverridesTable.organizationId, orgId)),
    ]);
    res.json({
      totalPlans: plans.length,
      activePlans: plans.filter(p => p.status === "active").length,
      totalRules: rules.length,
      activeRules: rules.filter(r => r.isActive).length,
      totalOverrides: overrides.length,
      closedDates: overrides.filter(o => o.isClosed).length,
      ruleTypeLabels: RULE_TYPE_LABELS,
      modifierIcons: MODIFIER_ICONS,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /plans
router.get("/plans", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedDemoRevenue(orgId);
    const plans = await db.select().from(ratePlansTable)
      .where(eq(ratePlansTable.organizationId, orgId))
      .orderBy(desc(ratePlansTable.isDefault), asc(ratePlansTable.createdAt));
    res.json({ plans });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /plans
router.post("/plans", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const [plan] = await db.insert(ratePlansTable).values({ ...req.body, organizationId: orgId, status: "active" }).returning();
    res.json({ plan });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /plans/:id
router.patch("/plans/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const [plan] = await db.update(ratePlansTable).set(req.body)
      .where(and(eq(ratePlansTable.id, parseInt(req.params.id)), eq(ratePlansTable.organizationId, orgId)))
      .returning();
    res.json({ plan });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /rules
router.get("/rules", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedDemoRevenue(orgId);
    const rules = await db.select({
      id: pricingRulesTable.id, name: pricingRulesTable.name,
      ruleType: pricingRulesTable.ruleType, conditions: pricingRulesTable.conditions,
      modifierType: pricingRulesTable.modifierType, modifierValue: pricingRulesTable.modifierValue,
      priority: pricingRulesTable.priority, isActive: pricingRulesTable.isActive,
      validFrom: pricingRulesTable.validFrom, validTo: pricingRulesTable.validTo,
      ratePlanId: pricingRulesTable.ratePlanId, planName: ratePlansTable.name,
    }).from(pricingRulesTable)
      .leftJoin(ratePlansTable, eq(pricingRulesTable.ratePlanId, ratePlansTable.id))
      .where(eq(pricingRulesTable.organizationId, orgId))
      .orderBy(desc(pricingRulesTable.priority), asc(pricingRulesTable.createdAt));
    res.json({ rules, ruleTypeLabels: RULE_TYPE_LABELS, modifierIcons: MODIFIER_ICONS });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /rules/:id
router.patch("/rules/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const [rule] = await db.update(pricingRulesTable).set(req.body)
      .where(and(eq(pricingRulesTable.id, parseInt(req.params.id)), eq(pricingRulesTable.organizationId, orgId)))
      .returning();
    res.json({ rule });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /overrides
router.get("/overrides", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const overrides = await db.select({
      id: pricingOverridesTable.id, unitId: pricingOverridesTable.unitId,
      overrideDate: pricingOverridesTable.overrideDate, customPrice: pricingOverridesTable.customPrice,
      minStay: pricingOverridesTable.minStay, isClosed: pricingOverridesTable.isClosed,
      reason: pricingOverridesTable.reason, createdAt: pricingOverridesTable.createdAt,
      unitName: unitsTable.name,
    }).from(pricingOverridesTable)
      .leftJoin(unitsTable, eq(pricingOverridesTable.unitId, unitsTable.id))
      .where(eq(pricingOverridesTable.organizationId, orgId))
      .orderBy(asc(pricingOverridesTable.overrideDate));
    res.json({ overrides });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /overrides
router.post("/overrides", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const { unitId, overrideDate, customPrice, minStay, isClosed, reason } = req.body;
    try {
      const [o] = await db.insert(pricingOverridesTable).values({
        organizationId: orgId, unitId: unitId ? parseInt(unitId) : null,
        overrideDate, customPrice: customPrice ? String(customPrice) : null,
        minStay: minStay || null, isClosed: isClosed || false, reason,
      }).returning();
      res.json({ override: o });
    } catch {
      // Update if conflict
      const [o] = await db.update(pricingOverridesTable).set({ customPrice: customPrice ? String(customPrice) : null, minStay, isClosed, reason })
        .where(and(eq(pricingOverridesTable.organizationId, orgId), eq(pricingOverridesTable.overrideDate, overrideDate)))
        .returning();
      res.json({ override: o });
    }
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /overrides/:id
router.delete("/overrides/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await db.delete(pricingOverridesTable)
      .where(and(eq(pricingOverridesTable.id, parseInt(req.params.id)), eq(pricingOverridesTable.organizationId, orgId)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
