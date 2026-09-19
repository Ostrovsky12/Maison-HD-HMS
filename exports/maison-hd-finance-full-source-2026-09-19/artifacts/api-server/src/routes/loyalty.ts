import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db } from "../db/index.js";
import {
  loyaltySettingsTable, loyaltyMembersTable, loyaltyMemberTxTable, guestsTable,
} from "@workspace/db/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";

const router = Router();
const getOrgId = (req: any): number => req.user?.organizationId;

// ── Tier calculation ──────────────────────────────────────────────────────────
function calcTier(lifetimePoints: number, settings: any): "bronze" | "silver" | "gold" | "platinum" {
  if (lifetimePoints >= settings.platinumThreshold) return "platinum";
  if (lifetimePoints >= settings.goldThreshold) return "gold";
  if (lifetimePoints >= settings.silverThreshold) return "silver";
  return "bronze";
}

// ── GET /settings ─────────────────────────────────────────────────────────────
router.get("/settings", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    let rows = await db.select().from(loyaltySettingsTable).where(eq(loyaltySettingsTable.organizationId, orgId));
    if (!rows.length) {
      const [created] = await db.insert(loyaltySettingsTable).values({ organizationId: orgId }).returning();
      rows = [created];
    }
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /settings ───────────────────────────────────────────────────────────
router.patch("/settings", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const { programName, pointsPerNight, pointsPerUah, pointsPerFbUah, silverThreshold, goldThreshold,
      platinumThreshold, bronzePerks, silverPerks, goldPerks, platinumPerks, pointsToUahRate, isActive } = req.body;

    let rows = await db.select().from(loyaltySettingsTable).where(eq(loyaltySettingsTable.organizationId, orgId));
    const upd: any = { updatedAt: new Date() };
    if (programName !== undefined) upd.programName = programName;
    if (pointsPerNight !== undefined) upd.pointsPerNight = pointsPerNight;
    if (pointsPerUah !== undefined) upd.pointsPerUah = String(pointsPerUah);
    if (pointsPerFbUah !== undefined) upd.pointsPerFbUah = String(pointsPerFbUah);
    if (silverThreshold !== undefined) upd.silverThreshold = silverThreshold;
    if (goldThreshold !== undefined) upd.goldThreshold = goldThreshold;
    if (platinumThreshold !== undefined) upd.platinumThreshold = platinumThreshold;
    if (bronzePerks !== undefined) upd.bronzePerks = bronzePerks;
    if (silverPerks !== undefined) upd.silverPerks = silverPerks;
    if (goldPerks !== undefined) upd.goldPerks = goldPerks;
    if (platinumPerks !== undefined) upd.platinumPerks = platinumPerks;
    if (pointsToUahRate !== undefined) upd.pointsToUahRate = String(pointsToUahRate);
    if (isActive !== undefined) upd.isActive = isActive;

    let result;
    if (!rows.length) {
      [result] = await db.insert(loyaltySettingsTable).values({ organizationId: orgId, ...upd }).returning();
    } else {
      [result] = await db.update(loyaltySettingsTable).set(upd).where(eq(loyaltySettingsTable.organizationId, orgId)).returning();
    }
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /members ──────────────────────────────────────────────────────────────
router.get("/members", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { limit = "50", offset = "0", tier, search } = req.query as any;
  try {
    const rows = await db
      .select({
        id: loyaltyMembersTable.id,
        guestId: loyaltyMembersTable.guestId,
        tier: loyaltyMembersTable.tier,
        pointsBalance: loyaltyMembersTable.pointsBalance,
        pointsLifetime: loyaltyMembersTable.pointsLifetime,
        pointsRedeemed: loyaltyMembersTable.pointsRedeemed,
        totalStays: loyaltyMembersTable.totalStays,
        totalNights: loyaltyMembersTable.totalNights,
        totalSpent: loyaltyMembersTable.totalSpent,
        joinedAt: loyaltyMembersTable.joinedAt,
        lastStayAt: loyaltyMembersTable.lastStayAt,
        notes: loyaltyMembersTable.notes,
        guestName: sql<string>`${guestsTable.firstName} || ' ' || ${guestsTable.lastName}`,
        guestEmail: guestsTable.email,
        guestPhone: guestsTable.phone,
      })
      .from(loyaltyMembersTable)
      .innerJoin(guestsTable, eq(loyaltyMembersTable.guestId, guestsTable.id))
      .where(eq(loyaltyMembersTable.organizationId, orgId))
      .orderBy(desc(loyaltyMembersTable.pointsLifetime))
      .limit(parseInt(limit))
      .offset(parseInt(offset));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST /members — enroll guest ──────────────────────────────────────────────
router.post("/members", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const { guestId, notes } = req.body;
  if (!guestId) return res.status(400).json({ error: "guestId required" });
  try {
    const existing = await db.select().from(loyaltyMembersTable)
      .where(and(eq(loyaltyMembersTable.organizationId, orgId), eq(loyaltyMembersTable.guestId, guestId)));
    if (existing.length) return res.status(409).json({ error: "Guest already enrolled" });

    const [member] = await db.insert(loyaltyMembersTable).values({ organizationId: orgId, guestId, notes }).returning();
    res.status(201).json(member);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /members/:id/transactions ─────────────────────────────────────────────
router.get("/members/:id/transactions", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const memberId = parseInt(req.params.id);
  try {
    const txs = await db.select().from(loyaltyMemberTxTable)
      .where(and(eq(loyaltyMemberTxTable.memberId, memberId), eq(loyaltyMemberTxTable.organizationId, orgId)))
      .orderBy(desc(loyaltyMemberTxTable.createdAt))
      .limit(50);
    res.json(txs);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST /members/:id/adjust — add/remove points manually ────────────────────
router.post("/members/:id/adjust", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  const memberId = parseInt(req.params.id);
  const { points, description, txType = "adjust" } = req.body;
  if (points === undefined) return res.status(400).json({ error: "points required" });
  try {
    const [member] = await db.select().from(loyaltyMembersTable)
      .where(and(eq(loyaltyMembersTable.id, memberId), eq(loyaltyMembersTable.organizationId, orgId)));
    if (!member) return res.status(404).json({ error: "Member not found" });

    const newBalance = Math.max(0, member.pointsBalance + parseInt(points));
    const newLifetime = points > 0 ? member.pointsLifetime + parseInt(points) : member.pointsLifetime;

    // Get settings for tier calc
    let settings: any = { silverThreshold: 1000, goldThreshold: 5000, platinumThreshold: 15000 };
    const settingsRows = await db.select().from(loyaltySettingsTable).where(eq(loyaltySettingsTable.organizationId, orgId));
    if (settingsRows.length) settings = settingsRows[0];

    const newTier = calcTier(newLifetime, settings);

    const [updated] = await db.update(loyaltyMembersTable)
      .set({ pointsBalance: newBalance, pointsLifetime: newLifetime, tier: newTier, updatedAt: new Date() })
      .where(eq(loyaltyMembersTable.id, memberId))
      .returning();

    await db.insert(loyaltyMemberTxTable).values({
      organizationId: orgId,
      memberId,
      txType,
      points: parseInt(points),
      balanceAfter: newBalance,
      description: description || `Ручне коригування: ${points > 0 ? "+" : ""}${points}`,
    });

    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /stats ────────────────────────────────────────────────────────────────
router.get("/stats", requireAuth, async (req: any, res) => {
  const orgId = getOrgId(req);
  try {
    const members = await db.select().from(loyaltyMembersTable).where(eq(loyaltyMembersTable.organizationId, orgId));
    const byTier = { bronze: 0, silver: 0, gold: 0, platinum: 0 };
    let totalPoints = 0;
    members.forEach(m => { byTier[m.tier] = (byTier[m.tier] || 0) + 1; totalPoints += m.pointsBalance; });
    res.json({ totalMembers: members.length, byTier, totalPointsInCirculation: totalPoints });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
