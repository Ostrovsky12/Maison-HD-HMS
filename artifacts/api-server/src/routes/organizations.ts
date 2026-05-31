import { Router } from "express";
import { db } from "@workspace/db";
import { organizationsTable, organizationMembersTable, usersTable, propertiesTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireRole, hashPassword } from "../lib/auth.js";

const router = Router();

const PLAN_LIMITS: Record<string, { maxUnits: number; maxUsers: number }> = {
  basic: { maxUnits: 30, maxUsers: 5 },
  pro: { maxUnits: 100, maxUsers: 20 },
  enterprise: { maxUnits: 9999, maxUsers: 9999 },
};

const ROLE_LABEL: Record<string, string> = {
  owner: "Власник",
  admin: "Адміністратор",
  reception: "Адміністратор рецепції",
  housekeeper: "Покоївка",
  accountant: "Бухгалтер",
};

// ── SUPER ADMIN: list all orgs ─────────────────────────────────────
router.get("/", requireAuth, requireRole("super_admin"), async (_req, res) => {
  const orgs = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      slug: organizationsTable.slug,
      plan: organizationsTable.plan,
      subscriptionStatus: organizationsTable.subscriptionStatus,
      email: organizationsTable.email,
      phone: organizationsTable.phone,
      address: organizationsTable.address,
      maxUnits: organizationsTable.maxUnits,
      maxUsers: organizationsTable.maxUsers,
      isActive: organizationsTable.isActive,
      createdAt: organizationsTable.createdAt,
      trialEndsAt: organizationsTable.trialEndsAt,
      userCount: sql<number>`(SELECT COUNT(*) FROM users WHERE organization_id = ${organizationsTable.id})`.mapWith(Number),
      propertyCount: sql<number>`(SELECT COUNT(*) FROM properties WHERE organization_id = ${organizationsTable.id})`.mapWith(Number),
    })
    .from(organizationsTable)
    .orderBy(organizationsTable.createdAt);
  res.json(orgs);
});

// ── SUPER ADMIN: create org + owner user ───────────────────────────
router.post("/", requireAuth, requireRole("super_admin"), async (req, res) => {
  const {
    name, slug, plan = "basic",
    email, phone, address,
    ownerEmail, ownerName, ownerPassword,
    trialDays = 30,
  } = req.body;

  if (!name || !slug || !ownerEmail || !ownerName || !ownerPassword) {
    res.status(400).json({ error: "Bad Request", message: "Обов'язкові поля: name, slug, ownerEmail, ownerName, ownerPassword" });
    return;
  }

  // Check slug uniqueness
  const existingSlug = await db.select({ id: organizationsTable.id })
    .from(organizationsTable).where(eq(organizationsTable.slug, slug)).limit(1);
  if (existingSlug.length > 0) {
    res.status(409).json({ error: "Conflict", message: `Slug "${slug}" вже зайнятий. Оберіть інший.` });
    return;
  }

  // Check owner email uniqueness
  const existingEmail = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.email, ownerEmail)).limit(1);
  if (existingEmail.length > 0) {
    res.status(409).json({ error: "Conflict", message: `Email "${ownerEmail}" вже використовується іншим користувачем.` });
    return;
  }

  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.basic;
  const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

  const [org] = await db.insert(organizationsTable).values({
    name,
    slug,
    plan,
    email,
    phone,
    address,
    maxUnits: limits.maxUnits,
    maxUsers: limits.maxUsers,
    subscriptionStatus: "trial",
    trialEndsAt,
  }).returning();

  const passwordHash = await hashPassword(ownerPassword);
  const [owner] = await db.insert(usersTable).values({
    email: ownerEmail,
    name: ownerName,
    passwordHash,
    role: "owner",
    organizationId: org.id,
  }).returning();

  res.status(201).json({
    organization: org,
    owner: { id: owner.id, email: owner.email, name: owner.name },
  });
});

// ── GET current user's org (owner/manager/reception) ──────────────
router.get("/me", requireAuth, async (req, res) => {
  const user = (req as any).user;
  if (!user.organizationId) {
    res.status(404).json({ error: "Not Found", message: "Організацію не знайдено" });
    return;
  }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, user.organizationId)).limit(1);
  if (!org) {
    res.status(404).json({ error: "Not Found", message: "Організацію не знайдено" });
    return;
  }
  res.json(org);
});

// ── GET org by id ──────────────────────────────────────────────────
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

// ── UPDATE org ────────────────────────────────────────────────────
router.patch("/:orgId", requireAuth, async (req, res) => {
  const orgId = parseInt(req.params.orgId);
  const user = (req as any).user;
  if (user.role !== "super_admin" && user.organizationId !== orgId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const allowed = ["name", "email", "phone", "address", "website", "logo", "primaryColor", "timezone", "currency", "isActive", "plan", "subscriptionStatus", "guestCardRules", "paymentUrl"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (req.body.plan && PLAN_LIMITS[req.body.plan]) {
    const limits = PLAN_LIMITS[req.body.plan];
    updates.maxUnits = limits.maxUnits;
    updates.maxUsers = limits.maxUsers;
  }
  const [updated] = await db.update(organizationsTable).set(updates as any).where(eq(organizationsTable.id, orgId)).returning();
  res.json(updated);
});

// ── LIST members ───────────────────────────────────────────────────
router.get("/:orgId/members", requireAuth, async (req, res) => {
  const orgId = parseInt(req.params.orgId);
  const user = (req as any).user;
  if (user.role !== "super_admin" && user.organizationId !== orgId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const members = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.organizationId, orgId))
    .orderBy(usersTable.createdAt);
  res.json(members);
});

// ── INVITE (create) member ─────────────────────────────────────────
router.post("/:orgId/invite", requireAuth, requireRole("super_admin", "owner", "manager"), async (req, res) => {
  const orgId = parseInt(req.params.orgId);
  const user = (req as any).user;
  if (user.role !== "super_admin" && user.organizationId !== orgId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { email, name, role = "reception", password } = req.body;
  if (!email || !name) {
    res.status(400).json({ error: "Bad Request", message: "Обов'язкові поля: email, name" });
    return;
  }

  const drizzleRole = role === "housekeeper" ? "housekeeping" : role === "accountant" ? "manager" : role;
  const generatedPassword = password || Math.random().toString(36).slice(-8) + "!H1";
  const passwordHash = await hashPassword(generatedPassword);

  const [newUser] = await db.insert(usersTable).values({
    email,
    name,
    passwordHash,
    role: drizzleRole as any,
    organizationId: orgId,
  }).returning();

  res.status(201).json({
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
    role: newUser.role,
    temporaryPassword: generatedPassword,
    organizationId: orgId,
  });
});

// ── REMOVE member ─────────────────────────────────────────────────
router.delete("/:orgId/members/:userId", requireAuth, requireRole("super_admin", "owner"), async (req, res) => {
  const orgId = parseInt(req.params.orgId);
  const userId = parseInt(req.params.userId);
  const user = (req as any).user;
  if (user.role !== "super_admin" && user.organizationId !== orgId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.update(usersTable).set({ isActive: false }).where(and(eq(usersTable.id, userId), eq(usersTable.organizationId, orgId)));
  res.status(204).send();
});

export default router;
