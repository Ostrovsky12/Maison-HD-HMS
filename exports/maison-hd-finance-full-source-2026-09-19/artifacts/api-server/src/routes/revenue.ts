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

// GET /units — returns units with base prices for the org
router.get("/units", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    const units = await db.select({ id: unitsTable.id, name: unitsTable.name, basePrice: unitsTable.basePrice })
      .from(unitsTable)
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(propertiesTable.organizationId, orgId))
      .orderBy(asc(unitsTable.name));
    res.json({ units });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /calendar?unitId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
// Calculates effective price for each date in range applying all active rules
router.get("/calendar", requireAuth, async (req: any, res) => {
  try {
    const orgId = getOrg(req);
    await seedDemoRevenue(orgId);

    const unitId = req.query.unitId ? parseInt(req.query.unitId as string) : null;
    const fromStr = (req.query.from as string) || new Date().toISOString().slice(0, 10);
    const toStr = (req.query.to as string) || (() => { const d = new Date(); d.setDate(d.getDate() + 29); return d.toISOString().slice(0, 10); })();

    // Load unit base price
    let basePrice = 2800;
    if (unitId) {
      const unit = await db.select({ basePrice: unitsTable.basePrice }).from(unitsTable).where(eq(unitsTable.id, unitId)).limit(1);
      if (unit[0]?.basePrice) basePrice = parseFloat(unit[0].basePrice);
    }

    // Load all active rules for the org
    const rules = await db.select().from(pricingRulesTable)
      .where(and(eq(pricingRulesTable.organizationId, orgId), eq(pricingRulesTable.isActive, true)))
      .orderBy(desc(pricingRulesTable.priority));

    // Load overrides for date range
    const overrides = await db.select({
      overrideDate: pricingOverridesTable.overrideDate,
      customPrice: pricingOverridesTable.customPrice,
      isClosed: pricingOverridesTable.isClosed,
      reason: pricingOverridesTable.reason,
    }).from(pricingOverridesTable)
      .where(and(
        eq(pricingOverridesTable.organizationId, orgId),
        gte(pricingOverridesTable.overrideDate, fromStr),
        lte(pricingOverridesTable.overrideDate, toStr),
        unitId ? eq(pricingOverridesTable.unitId, unitId) : sql`true`,
      ));
    const overrideMap = new Map(overrides.map(o => [o.overrideDate, o]));

    // Load existing bookings for this period to calculate occupancy
    const allUnitsCount = await db.select({ count: sql<number>`count(*)` })
      .from(unitsTable).innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(propertiesTable.organizationId, orgId));
    const totalUnits = Number(allUnitsCount[0]?.count || 1);

    // Generate date range
    const days: any[] = [];
    const cur = new Date(fromStr + "T00:00:00Z");
    const end = new Date(toStr + "T00:00:00Z");
    while (cur <= end) {
      const dateStr = cur.toISOString().slice(0, 10);
      const dayOfWeek = cur.getUTCDay(); // 0=Sun,1=Mon,...,6=Sat
      const month = cur.getUTCMonth() + 1;

      const override = overrideMap.get(dateStr);
      if (override?.isClosed) {
        days.push({ date: dateStr, basePrice, finalPrice: 0, modifier: 0, isClosed: true, reason: override.reason, appliedRules: [], isOverride: true });
        cur.setDate(cur.getDate() + 1);
        continue;
      }
      if (override?.customPrice) {
        days.push({ date: dateStr, basePrice, finalPrice: parseFloat(override.customPrice), modifier: 0, isClosed: false, reason: override.reason, appliedRules: [{ name: "Ціна вручну", modifier: 0 }], isOverride: true });
        cur.setDate(cur.getDate() + 1);
        continue;
      }

      // Apply pricing rules
      let totalModifier = 0;
      const appliedRules: { name: string; modifier: number; icon: string }[] = [];

      for (const rule of rules) {
        const cond: any = rule.conditions || {};
        const modVal = parseFloat(rule.modifierValue || "0");
        let applies = false;

        if (rule.ruleType === "day_of_week" && cond.days && Array.isArray(cond.days)) {
          applies = cond.days.includes(dayOfWeek);
        } else if (rule.ruleType === "season" && cond.months && Array.isArray(cond.months)) {
          applies = cond.months.includes(month);
          if (applies && rule.validFrom && rule.validTo) {
            applies = dateStr >= rule.validFrom && dateStr <= rule.validTo;
          }
        } else if (rule.ruleType === "event") {
          if (cond.date) applies = cond.date === dateStr;
          else if (cond.dates && Array.isArray(cond.dates)) applies = cond.dates.includes(dateStr);
          if (applies && rule.validFrom && rule.validTo) {
            applies = dateStr >= rule.validFrom && dateStr <= rule.validTo;
          }
        } else if (rule.ruleType === "early_bird") {
          const daysAhead = Math.floor((cur.getTime() - Date.now()) / 86400000);
          applies = cond.daysAhead && daysAhead >= cond.daysAhead;
        } else if (rule.ruleType === "last_minute") {
          const daysAhead = Math.floor((cur.getTime() - Date.now()) / 86400000);
          applies = cond.daysAhead && daysAhead >= 0 && daysAhead <= cond.daysAhead;
        }

        if (applies) {
          totalModifier += modVal;
          appliedRules.push({ name: rule.name, modifier: modVal, icon: MODIFIER_ICONS[rule.ruleType] || "⚙️" });
        }
      }

      const finalPrice = Math.round(basePrice * (1 + totalModifier / 100));
      days.push({ date: dateStr, basePrice, finalPrice, modifier: totalModifier, isClosed: false, appliedRules, isOverride: false });
      cur.setDate(cur.getDate() + 1);
    }

    res.json({ days, basePrice, totalUnits });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
