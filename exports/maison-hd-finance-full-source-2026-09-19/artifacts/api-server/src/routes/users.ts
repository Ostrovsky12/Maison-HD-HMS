import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole, hashPassword } from "../lib/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const canSeeRaw = user.role === "super_admin" || user.role === "owner";
  const users = user.role === "super_admin"
    ? await db.select().from(usersTable)
    : await db.select().from(usersTable).where(eq(usersTable.organizationId, user.organizationId!));

  res.json(users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    organizationId: u.organizationId,
    propertyId: u.propertyId,
    isActive: u.isActive,
    displayPassword: canSeeRaw ? (u.displayPassword || null) : undefined,
    createdAt: u.createdAt,
  })));
});

router.post("/", requireAuth, requireRole("super_admin", "owner", "manager"), async (req, res) => {
  const user = (req as any).user;
  const { email, name, password, role, organizationId, propertyId } = req.body;

  // super_admin can create users for any org — but must supply a valid orgId
  const orgId = user.role === "super_admin" ? organizationId : user.organizationId;
  if (!orgId) {
    res.status(400).json({ error: "organizationId is required" });
    return;
  }

  // Prevent privilege escalation: only super_admin can create super_admin users
  if (role === "super_admin" && user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden", message: "Cannot create super_admin users" });
    return;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Validation", message: "Valid email is required" });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({ error: "Validation", message: "Password must be at least 8 characters" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [newUser] = await db.insert(usersTable).values({
    email,
    name,
    passwordHash,
    role,
    organizationId: orgId,
    propertyId,
  }).returning();
  res.status(201).json({
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
    role: newUser.role,
    organizationId: newUser.organizationId,
    propertyId: newUser.propertyId,
    isActive: newUser.isActive,
    createdAt: newUser.createdAt,
  });
});

router.put("/:userId", requireAuth, requireRole("super_admin", "owner", "manager"), async (req, res) => {
  const userId = parseInt(req.params.userId);
  const { name, role, isActive, propertyId, password } = req.body;
  const passwordHash = password ? await hashPassword(password) : undefined;
  const actor = (req as any).user;
  const canSeeRaw = actor.role === "super_admin" || actor.role === "owner";
  const [updatedUser] = await db.update(usersTable).set({
    ...(name !== undefined && { name }),
    ...(role !== undefined && { role }),
    ...(isActive !== undefined && { isActive }),
    ...(propertyId !== undefined && { propertyId }),
    ...(passwordHash && { passwordHash }),
    ...(password && canSeeRaw && { displayPassword: password }),
    updatedAt: new Date(),
  }).where(eq(usersTable.id, userId)).returning();
  if (!updatedUser) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }
  res.json({
    id: updatedUser.id,
    email: updatedUser.email,
    name: updatedUser.name,
    role: updatedUser.role,
    organizationId: updatedUser.organizationId,
    propertyId: updatedUser.propertyId,
    isActive: updatedUser.isActive,
    createdAt: updatedUser.createdAt,
  });
});

router.delete("/:userId", requireAuth, requireRole("super_admin", "owner"), async (req, res) => {
  const userId = parseInt(req.params.userId);
  await db.update(usersTable).set({ isActive: false }).where(eq(usersTable.id, userId));
  res.json({ success: true, message: "User deactivated" });
});

export default router;
