import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import {
  getEmailConfig, saveEmailConfig, getTelegramConfig, saveTelegramConfig,
  sendEmail, sendTelegram, EmailConfig, TelegramConfig,
} from "../lib/notify.js";

const router = Router();

// ─── In-app notifications ──────────────────────────────────────────────────────

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
  if (!updated) { res.status(404).json({ error: "Not Found" }); return; }
  res.json(updated);
});

// ─── Notification channel config ───────────────────────────────────────────────

// GET /notifications/channels — повертає конфіги (пароль замаскований)
router.get("/channels", requireAuth, async (req: any, res) => {
  const orgId = req.user.organizationId;
  if (!orgId) { res.status(400).json({ error: "No organization" }); return; }

  const [email, telegram] = await Promise.all([
    getEmailConfig(orgId),
    getTelegramConfig(orgId),
  ]);

  // Mask secrets before sending
  const emailMasked = email ? {
    ...email,
    pass: email.pass ? "••••••••" : "",
  } : null;
  const telegramMasked = telegram ? {
    ...telegram,
    botToken: telegram.botToken ? telegram.botToken.slice(0, 8) + "••••••••" : "",
  } : null;

  res.json({ email: emailMasked, telegram: telegramMasked });
});

// PUT /notifications/channels/email — зберегти SMTP конфіг
router.put("/channels/email", requireAuth, async (req: any, res) => {
  const orgId = req.user.organizationId;
  if (!orgId) { res.status(400).json({ error: "No organization" }); return; }

  const body = req.body as EmailConfig;

  // If pass is masked, keep the existing password
  let cfg = body;
  if (body.pass === "••••••••") {
    const existing = await getEmailConfig(orgId);
    cfg = { ...body, pass: existing?.pass || "" };
  }

  await saveEmailConfig(orgId, cfg);
  res.json({ ok: true, message: "Email конфігурацію збережено" });
});

// PUT /notifications/channels/telegram — зберегти Telegram конфіг
router.put("/channels/telegram", requireAuth, async (req: any, res) => {
  const orgId = req.user.organizationId;
  if (!orgId) { res.status(400).json({ error: "No organization" }); return; }

  const body = req.body as TelegramConfig;

  // If token is masked, keep the existing token
  let cfg = body;
  if (body.botToken?.includes("••••••••")) {
    const existing = await getTelegramConfig(orgId);
    cfg = { ...body, botToken: existing?.botToken || "" };
  }

  await saveTelegramConfig(orgId, cfg);
  res.json({ ok: true, message: "Telegram конфігурацію збережено" });
});

// POST /notifications/test — надіслати тестове повідомлення
router.post("/test", requireAuth, async (req: any, res) => {
  const orgId = req.user.organizationId;
  if (!orgId) { res.status(400).json({ error: "No organization" }); return; }

  const { channel } = req.body as { channel: "email" | "telegram" };

  if (channel === "email") {
    const cfg = await getEmailConfig(orgId);
    if (!cfg?.adminEmails?.length) {
      res.status(400).json({ ok: false, error: "Вкажіть хоча б одну адресу адміністратора" });
      return;
    }
    const result = await sendEmail(orgId, {
      to: cfg.adminEmails,
      subject: "✅ Тест Maison HD — Email сповіщення",
      html: `<div style="font-family:sans-serif;max-width:520px">
        <h2 style="color:#4f46e5">✅ Email сповіщення працює!</h2>
        <p>Це тестове повідомлення від <b>Maison HD Hospitality OS</b>.</p>
        <p>SMTP налаштовано коректно — ви будете отримувати сповіщення про нові бронювання, заїзди та платежі.</p>
        <p style="color:#888;font-size:12px">Maison HD · ${new Date().toLocaleString("uk-UA")}</p>
      </div>`,
    });
    res.json(result);
  } else if (channel === "telegram") {
    const result = await sendTelegram(orgId,
      `✅ <b>Telegram сповіщення працює!</b>\n\nMaison HD Hospitality OS підключено до вашого чату.\nВи будете отримувати сповіщення про нові бронювання, заїзди та платежі.\n\n⏰ ${new Date().toLocaleString("uk-UA")}`
    );
    res.json(result);
  } else {
    res.status(400).json({ ok: false, error: "Невідомий канал" });
  }
});

export default router;
