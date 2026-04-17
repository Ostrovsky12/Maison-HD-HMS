import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import {
  getEmailConfig, saveEmailConfig, getTelegramConfig, saveTelegramConfig,
  getSmsConfig, saveSmsConfig,
  sendEmail, sendTelegram, sendSms,
  EmailConfig, TelegramConfig, SmsConfig,
} from "../lib/notify.js";

const router = Router();

// ─── In-app notifications ──────────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const unreadOnly = req.query.unreadOnly === "true";
  const limit = Math.min(parseInt(req.query.limit as string || "50"), 100);

  const uid = user.userId ?? user.id;
  const conditions: any[] = [eq(notificationsTable.userId, uid)];
  if (unreadOnly) conditions.push(eq(notificationsTable.isRead, false));

  const notifications = await db.select().from(notificationsTable)
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit);

  const allUnread = await db.select({ id: notificationsTable.id }).from(notificationsTable)
    .where(and(eq(notificationsTable.userId, uid), eq(notificationsTable.isRead, false)));

  res.json({ notifications, unreadCount: allUnread.length });
});

router.post("/read-all", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const uid = user.userId ?? user.id;
  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, uid));
  res.json({ success: true, message: "Всі сповіщення позначено як прочитані" });
});

router.post("/:notificationId/read", requireAuth, async (req, res) => {
  const notificationId = parseInt(req.params.notificationId);
  const user = (req as any).user;
  const uid = user.userId ?? user.id;
  const [updated] = await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(
      eq(notificationsTable.id, notificationId),
      eq(notificationsTable.userId, uid),
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

  const [email, telegram, sms] = await Promise.all([
    getEmailConfig(orgId),
    getTelegramConfig(orgId),
    getSmsConfig(orgId),
  ]);

  const emailMasked = email ? { ...email, pass: email.pass ? "••••••••" : "" } : null;
  const telegramMasked = telegram ? { ...telegram, botToken: telegram.botToken ? telegram.botToken.slice(0, 8) + "••••••••" : "" } : null;
  const smsMasked = sms ? { ...sms, apiKey: sms.apiKey ? sms.apiKey.slice(0, 6) + "••••••••" : "" } : null;

  res.json({ email: emailMasked, telegram: telegramMasked, sms: smsMasked });
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

// PUT /notifications/channels/sms — зберегти SMS конфіг
router.put("/channels/sms", requireAuth, async (req: any, res) => {
  const orgId = req.user.organizationId;
  if (!orgId) { res.status(400).json({ error: "No organization" }); return; }

  const body = req.body as SmsConfig;
  let cfg = body;
  if (body.apiKey?.includes("••••••••")) {
    const existing = await getSmsConfig(orgId);
    cfg = { ...body, apiKey: existing?.apiKey || "" };
  }

  await saveSmsConfig(orgId, cfg);
  res.json({ ok: true, message: "SMS конфігурацію збережено" });
});

// POST /notifications/test — надіслати тестове повідомлення
router.post("/test", requireAuth, async (req: any, res) => {
  const orgId = req.user.organizationId;
  if (!orgId) { res.status(400).json({ error: "No organization" }); return; }

  const { channel } = req.body as { channel: "email" | "telegram" | "sms" };

  if (channel === "sms") {
    const cfg = await getSmsConfig(orgId);
    if (!cfg?.adminPhones?.length) {
      res.status(400).json({ ok: false, error: "Вкажіть хоча б один номер телефону адміністратора" });
      return;
    }
    const results = await Promise.all(
      cfg.adminPhones.map(phone => sendSms(orgId, phone, `✅ Тест Maison HD — SMS сповіщення працює! ${new Date().toLocaleString("uk-UA")}`))
    );
    const failed = results.filter(r => !r.ok);
    if (failed.length > 0) {
      res.status(400).json({ ok: false, error: failed[0].error });
      return;
    }
    res.json({ ok: true });
    return;
  }

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
