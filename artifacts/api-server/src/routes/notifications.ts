import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const unreadOnly = req.query.unreadOnly === "true";
  const limit = Math.min(parseInt(req.query.limit as string || "50"), 100);

  const conditions: any[] = [eq(notificationsTable.userId, user.id)];
  if (unreadOnly) conditions.push(eq(notificationsTable.isRead, false));

  const notifications = await db.select().from(notificationsTable)
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit);

  const allUnread = await db.select({ id: notificationsTable.id }).from(notificationsTable)
    .where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.isRead, false)));

  res.json({ notifications, unreadCount: allUnread.length });
});

router.post("/read-all", requireAuth, async (req, res) => {
  const user = (req as any).user;
  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, user.id));
  res.json({ success: true, message: "Всі сповіщення позначено як прочитані" });
});

router.post("/:notificationId/read", requireAuth, async (req, res) => {
  const notificationId = parseInt(req.params.notificationId);
  const user = (req as any).user;
  const [updated] = await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(
      eq(notificationsTable.id, notificationId),
      eq(notificationsTable.userId, user.id),
    ))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not Found" });
    return;
  }
  res.json(updated);
});

export default router;
