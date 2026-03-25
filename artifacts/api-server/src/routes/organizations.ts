import { Router } from "express";
import { db } from "@workspace/db";
import { organizationsTable, usersTable, propertiesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireRole, hashPassword } from "../lib/auth.js";

const router = Router();

const PLAN_LIMITS: Record<string, { maxUnits: number; maxUsers: number }> = {
  basic: { maxUnits: 30, maxUsers: 5 },
  pro: { maxUnits: 100, maxUsers: 20 },
  enterprise: { maxUnits: 9999, maxUsers: 9999 },
};

router.get("/", requireAuth, requireRole("super_admin"), async (_req, res) => {
  const orgs = await db.select().from(organizationsTable);
  res.json(orgs);
});

router.post("/", requireAuth, requireRole("super_admin"), async (req, res) => {
  const { name, slug, plan, ownerEmail, ownerName, ownerPassword } = req.body;
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.basic;

  const [org] = await db.insert(organizationsTable).values({
    name,
    slug,
    plan,
    maxUnits: limits.maxUnits,
    maxUsers: limits.maxUsers,
  }).returning();

  const passwordHash = await hashPassword(ownerPassword);
  await db.insert(usersTable).values({
    email: ownerEmail,
    name: ownerName,
    passwordHash,
    role: "owner",
    organizationId: org.id,
  });

  res.status(201).json(org);
});

router.get("/:orgId", requireAuth, async (req, res) => {
  const orgId = parseInt(req.params.orgId);
  const user = (req as any).user;
  if (user.role !== "super_admin" && user.organizationId !== orgId) {
    res.status(403).json({ error: "Forbidden", message: "Access denied" });
    return;
  }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
  if (!org) {
    res.status(404).json({ error: "Not Found", message: "Organization not found" });
    return;
  }
  res.json(org);
});

export default router;
