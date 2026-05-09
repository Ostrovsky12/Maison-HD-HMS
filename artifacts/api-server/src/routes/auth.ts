import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { signToken, hashPassword, comparePassword, requireAuth } from "../lib/auth.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Bad Request", message: "Email and password required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user || !user.isActive) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }
  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }
  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    propertyId: user.propertyId,
  });
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      propertyId: user.propertyId,
      isActive: user.isActive,
      createdAt: user.createdAt,
    },
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const { userId } = (req as any).user;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    propertyId: user.propertyId,
    isActive: user.isActive,
    createdAt: user.createdAt,
  });
});

router.patch("/me/profile", requireAuth, async (req, res) => {
  const { userId } = (req as any).user;
  const { name, currentPassword, newPassword } = req.body;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Not Found", message: "User not found" });
    return;
  }

  const updates: any = { updatedAt: new Date() };

  if (name !== undefined && name.trim()) {
    updates.name = name.trim();
  }

  if (newPassword) {
    if (!currentPassword) {
      res.status(400).json({ error: "Bad Request", message: "Потрібен поточний пароль" });
      return;
    }
    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: "Bad Request", message: "Поточний пароль невірний" });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: "Bad Request", message: "Новий пароль має бути мінімум 6 символів" });
      return;
    }
    updates.passwordHash = await hashPassword(newPassword);
  }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  res.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    organizationId: updated.organizationId,
    propertyId: updated.propertyId,
    isActive: updated.isActive,
    createdAt: updated.createdAt,
  });
});

router.post("/logout", requireAuth, (_req, res) => {
  res.json({ success: true, message: "Logged out" });
});

// ── Admin: upsert user (protected by SUPER_ADMIN_PASSWORD) ────────────────────
router.post("/admin-upsert-user", async (req, res) => {
  const pw = req.headers["x-admin-password"] || req.body?.adminPassword;
  if (!pw || pw !== process.env["SUPER_ADMIN_PASSWORD"]) {
    res.status(401).json({ error: "Unauthorized" }); return;
  }
  const { email, password, role, organizationId, name } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "email and password required" }); return;
  }
  try {
    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(usersTable).values({
      email,
      passwordHash,
      name: name || email.split("@")[0],
      role: role || "owner",
      organizationId: organizationId || null,
      isActive: true,
    } as any).onConflictDoUpdate({
      target: usersTable.email,
      set: { passwordHash, role: role || "owner", organizationId: organizationId || null, isActive: true },
    }).returning();
    res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
