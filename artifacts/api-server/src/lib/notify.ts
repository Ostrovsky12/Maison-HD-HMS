/**
 * Notification service — Email (SMTP/nodemailer) + Telegram Bot API + SMS (generic HTTP API)
 * Config stored per-org in tenant_settings (module = "notifications")
 */

import nodemailer from "nodemailer";
import { db } from "@workspace/db";
import { tenantSettings } from "../db/schema/platform.js";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "./encrypt.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
  adminEmails: string[];   // who gets booking/event notifications
}

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;          // admin chat/group ID
}

export interface SmsConfig {
  enabled: boolean;
  provider: string;        // "smsclub" | "alphasms" | "twilio" | "generic"
  apiKey: string;
  senderId: string;        // alpha name shown to recipient
  apiUrl: string;          // API endpoint URL
  adminPhones: string[];   // who gets admin SMS alerts
  guestSmsEnabled: boolean; // send confirmation SMS to guests
}

// ─── Config helpers ───────────────────────────────────────────────────────────

async function getSetting(orgId: number, key: string): Promise<any | null> {
  const [row] = await db.select()
    .from(tenantSettings)
    .where(and(eq(tenantSettings.tenantId, orgId), eq(tenantSettings.module, "notifications"), eq(tenantSettings.key, key)))
    .limit(1);
  return row?.valueJson ?? null;
}

async function upsertSetting(orgId: number, key: string, value: any) {
  await db.insert(tenantSettings)
    .values({ tenantId: orgId, module: "notifications", key, valueJson: value, isSecret: true, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [tenantSettings.tenantId, tenantSettings.module, tenantSettings.key],
      set: { valueJson: value, updatedAt: new Date() },
    });
}

function encryptEmailCfg(cfg: EmailConfig): any {
  return { ...cfg, pass: encrypt(cfg.pass) };
}

function decryptEmailCfg(raw: any): EmailConfig | null {
  if (!raw) return null;
  return { ...raw, pass: decrypt(raw.pass) ?? raw.pass };
}

function encryptTgCfg(cfg: TelegramConfig): any {
  return { ...cfg, botToken: encrypt(cfg.botToken) };
}

function decryptTgCfg(raw: any): TelegramConfig | null {
  if (!raw) return null;
  return { ...raw, botToken: decrypt(raw.botToken) ?? raw.botToken };
}

function encryptSmsCfg(cfg: SmsConfig): any {
  return { ...cfg, apiKey: encrypt(cfg.apiKey) };
}

function decryptSmsCfg(raw: any): SmsConfig | null {
  if (!raw) return null;
  return { ...raw, apiKey: decrypt(raw.apiKey) ?? raw.apiKey };
}

export async function getEmailConfig(orgId: number): Promise<EmailConfig | null> {
  return decryptEmailCfg(await getSetting(orgId, "email"));
}

export async function getTelegramConfig(orgId: number): Promise<TelegramConfig | null> {
  return decryptTgCfg(await getSetting(orgId, "telegram"));
}

export async function getSmsConfig(orgId: number): Promise<SmsConfig | null> {
  return decryptSmsCfg(await getSetting(orgId, "sms"));
}

export async function saveEmailConfig(orgId: number, cfg: EmailConfig) {
  await upsertSetting(orgId, "email", encryptEmailCfg(cfg));
}

export async function saveTelegramConfig(orgId: number, cfg: TelegramConfig) {
  await upsertSetting(orgId, "telegram", encryptTgCfg(cfg));
}

export async function saveSmsConfig(orgId: number, cfg: SmsConfig) {
  await upsertSetting(orgId, "sms", encryptSmsCfg(cfg));
}

// ─── Email sender ─────────────────────────────────────────────────────────────

export interface SendEmailOpts {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(orgId: number, opts: SendEmailOpts): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getEmailConfig(orgId);
  if (!cfg?.enabled) return { ok: false, error: "Email не налаштовано або вимкнено" };
  if (!cfg.host || !cfg.user || !cfg.pass) return { ok: false, error: "Неповна конфігурація SMTP" };

  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port || 587,
      secure: cfg.secure ?? false,
      auth: { user: cfg.user, pass: cfg.pass },
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: `"${cfg.fromName || "Maison HD"}" <${cfg.from || cfg.user}>`,
      to: Array.isArray(opts.to) ? opts.to.join(", ") : opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });

    return { ok: true };
  } catch (err: any) {
    console.error("[notify] email error:", err.message);
    return { ok: false, error: err.message };
  }
}

// ─── Telegram sender ──────────────────────────────────────────────────────────

export async function sendTelegram(orgId: number, message: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getTelegramConfig(orgId);
  if (!cfg?.enabled) return { ok: false, error: "Telegram не налаштовано або вимкнено" };
  if (!cfg.botToken || !cfg.chatId) return { ok: false, error: "Неповна конфігурація Telegram" };

  try {
    const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text: message, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(10000),
    });

    const json = await res.json() as any;
    if (!json.ok) {
      const errDesc = json.description || "Telegram API error";
      console.error("[notify] telegram API error:", errDesc, "chatId:", cfg.chatId);
      return { ok: false, error: errDesc };
    }
    return { ok: true };
  } catch (err: any) {
    const msg = err.name === "TimeoutError" ? "Telegram API не відповідає (timeout 10s)" : err.message;
    console.error("[notify] telegram error:", msg);
    return { ok: false, error: msg };
  }
}

// ─── SMS sender ──────────────────────────────────────────────────────────────
// Supports generic HTTP API (SMSclub, AlphaSMS, Twilio, etc.)
// The admin configures API URL, key, and sender ID.
// For SMSclub: POST https://im.smsclub.mobi/sms/send
//   body: { phone: ["380XXXXXXXXX"], message, src_addr }
//   auth: Authorization: Bearer {apiKey}

export async function sendSms(orgId: number, phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getSmsConfig(orgId);
  if (!cfg?.enabled) return { ok: false, error: "SMS не налаштовано або вимкнено" };
  if (!cfg.apiKey || !cfg.apiUrl) return { ok: false, error: "Неповна конфігурація SMS" };

  // Normalize phone: ensure starts with 380 for UA
  const normalizedPhone = phone.replace(/\D/g, "").replace(/^0/, "380").replace(/^8/, "380");

  try {
    // Generic JSON API call — adapt based on provider
    const isSmsCLub = cfg.provider === "smsclub" || cfg.apiUrl.includes("smsclub");
    const isAlphaSms = cfg.provider === "alphasms" || cfg.apiUrl.includes("alphasms");
    const isTwilio = cfg.provider === "twilio" || cfg.apiUrl.includes("twilio");

    let body: any;
    let headers: Record<string, string> = { "Content-Type": "application/json" };

    if (isSmsCLub) {
      body = JSON.stringify({ phone: [`+${normalizedPhone}`], message, src_addr: cfg.senderId || "Maison" });
      headers["Authorization"] = `Bearer ${cfg.apiKey}`;
    } else if (isAlphaSms) {
      body = JSON.stringify({ key: cfg.apiKey, phone: `+${normalizedPhone}`, message, name: cfg.senderId || "Maison" });
    } else if (isTwilio) {
      headers = { "Content-Type": "application/x-www-form-urlencoded" };
      const [accSid, authToken] = cfg.apiKey.split(":");
      headers["Authorization"] = `Basic ${Buffer.from(`${accSid}:${authToken}`).toString("base64")}`;
      body = new URLSearchParams({ From: cfg.senderId || "+380000000000", To: `+${normalizedPhone}`, Body: message }).toString();
    } else {
      // Generic: POST {apiUrl} with { apiKey, phone, message, senderId }
      body = JSON.stringify({ apiKey: cfg.apiKey, phone: `+${normalizedPhone}`, message, senderId: cfg.senderId || "Maison" });
    }

    const res = await fetch(cfg.apiUrl, {
      method: "POST",
      headers,
      body: body as string,
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `SMS API error ${res.status}: ${errText.slice(0, 100)}` };
    }
    return { ok: true };
  } catch (err: any) {
    console.error("[notify] sms error:", err.message);
    return { ok: false, error: err.message };
  }
}

// ─── HTML email templates ─────────────────────────────────────────────────────

export function buildGuestConfirmationEmail(booking: {
  bookingRef: string;
  guestName: string;
  unitName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: number | string;
  guestsCount: number;
  orgEmail?: string;
  orgPhone?: string;
  orgName?: string;
}): { html: string; text: string } {
  const { bookingRef, guestName, unitName, propertyName, checkIn, checkOut, nights, totalAmount, guestsCount, orgName, orgEmail, orgPhone } = booking;

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });
    } catch { return d; }
  };

  const html = `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Підтвердження бронювання</title></head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px;text-align:center">
            <p style="margin:0 0 8px;font-size:28px">🏨</p>
            <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">Бронювання підтверджено!</h1>
            <p style="margin:8px 0 0;color:#c4b5fd;font-size:15px">${orgName || propertyName}</p>
          </td>
        </tr>
        <!-- Booking ref banner -->
        <tr>
          <td style="background:#f5f3ff;padding:16px 32px;text-align:center;border-bottom:1px solid #ede9fe">
            <p style="margin:0;font-size:12px;color:#6d28d9;text-transform:uppercase;letter-spacing:1px;font-weight:600">Номер бронювання</p>
            <p style="margin:4px 0 0;font-size:28px;font-weight:800;color:#4f46e5;letter-spacing:2px">${bookingRef}</p>
          </td>
        </tr>
        <!-- Greeting -->
        <tr>
          <td style="padding:28px 32px 0">
            <p style="margin:0;font-size:16px;color:#1e1b4b">Вітаємо, <b>${guestName}</b>!</p>
            <p style="margin:8px 0 0;color:#6b7280;font-size:15px;line-height:1.6">
              Ваше бронювання прийнято. Нижче деталі вашого перебування.
            </p>
          </td>
        </tr>
        <!-- Details -->
        <tr>
          <td style="padding:20px 32px">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
              ${[
                ["🏠 Об'єкт", propertyName],
                ["🛏️ Номер / Котедж", unitName],
                ["📅 Заїзд", `<b>${formatDate(checkIn)}</b> (з 14:00)`],
                ["📅 Виїзд", `<b>${formatDate(checkOut)}</b> (до 12:00)`],
                ["🌙 Кількість ночей", `${nights} ${nights === 1 ? "ніч" : nights < 5 ? "ночі" : "ночей"}`],
                ["👥 Гостей", `${guestsCount}`],
                ["💰 До оплати", `<b style="color:#059669">${Math.round(Number(totalAmount)).toLocaleString("uk-UA")} ₴</b>`],
              ].map(([label, value], i) => `
              <tr style="border-top:${i > 0 ? "1px solid #e5e7eb" : "none"}">
                <td style="padding:11px 16px;font-size:13px;color:#6b7280;white-space:nowrap">${label}</td>
                <td style="padding:11px 16px;font-size:14px;color:#111827;font-weight:500">${value}</td>
              </tr>`).join("")}
            </table>
          </td>
        </tr>
        <!-- Info -->
        <tr>
          <td style="padding:0 32px 24px">
            <div style="background:#eff6ff;border-radius:10px;padding:14px 16px;border-left:4px solid #3b82f6">
              <p style="margin:0;font-size:13px;color:#1e40af;font-weight:600">ℹ️ Важлива інформація</p>
              <ul style="margin:8px 0 0;padding:0 0 0 16px;font-size:13px;color:#1d4ed8;line-height:1.8">
                <li>Заїзд з 14:00, виїзд до 12:00 (ранній/пізній заїзд за домовленістю)</li>
                <li>При заїзді пред'явіть документ і підтвердження бронювання</li>
                <li>Для скасування зв'яжіться з адміністрацією за 24 год</li>
              </ul>
            </div>
          </td>
        </tr>
        <!-- Contact -->
        ${(orgEmail || orgPhone) ? `
        <tr>
          <td style="padding:0 32px 24px">
            <p style="margin:0;font-size:13px;color:#6b7280">Питання? Зв'яжіться з нами:</p>
            <p style="margin:4px 0 0;font-size:14px;color:#1e1b4b">
              ${orgPhone ? `📞 ${orgPhone}` : ""}${orgPhone && orgEmail ? " · " : ""}${orgEmail ? `✉️ ${orgEmail}` : ""}
            </p>
          </td>
        </tr>` : ""}
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:12px;color:#9ca3af">Powered by <b>Maison HD</b> Hospitality OS · Це автоматичний лист, не відповідайте на нього</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Підтвердження бронювання ${bookingRef}
${guestName}, ваше бронювання підтверджено!
Об'єкт: ${propertyName}
Номер: ${unitName}
Заїзд: ${formatDate(checkIn)} (з 14:00)
Виїзд: ${formatDate(checkOut)} (до 12:00)
Ночей: ${nights}
Гостей: ${guestsCount}
Сума: ${Math.round(Number(totalAmount)).toLocaleString("uk-UA")} ₴
${orgPhone ? `Тел.: ${orgPhone}` : ""}
${orgEmail ? `Email: ${orgEmail}` : ""}`;

  return { html, text };
}

// ─── High-level notification helpers ─────────────────────────────────────────

export async function notifyBookingCreated(orgId: number, booking: {
  id: number;
  guestName: string;
  unitName?: string;
  checkIn: string;
  checkOut: string;
  totalAmount?: number | string;
}) {
  const { guestName, unitName, checkIn, checkOut, totalAmount } = booking;
  const amount = totalAmount ? ` · ₴ ${totalAmount}` : "";

  const emailHtml = `
    <div style="font-family:sans-serif;max-width:520px">
      <h2 style="color:#4f46e5">📋 Нове бронювання #${booking.id}</h2>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:6px 0;color:#666">Гість</td><td><b>${guestName}</b></td></tr>
        ${unitName ? `<tr><td style="padding:6px 0;color:#666">Номер</td><td>${unitName}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#666">Заїзд</td><td>${checkIn}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Виїзд</td><td>${checkOut}</td></tr>
        ${totalAmount ? `<tr><td style="padding:6px 0;color:#666">Сума</td><td><b>₴ ${totalAmount}</b></td></tr>` : ""}
      </table>
      <p style="margin-top:16px;color:#888;font-size:12px">Maison HD Hospitality OS</p>
    </div>
  `;

  const tgText = `📋 <b>Нове бронювання #${booking.id}</b>\n👤 Гість: ${guestName}${unitName ? `\n🏠 Номер: ${unitName}` : ""}\n📅 ${checkIn} → ${checkOut}${amount}`;

  const emailCfg = await getEmailConfig(orgId);
  if (emailCfg?.enabled && emailCfg.adminEmails?.length) {
    await sendEmail(orgId, { to: emailCfg.adminEmails, subject: `Нове бронювання #${booking.id} — ${guestName}`, html: emailHtml });
  }
  await sendTelegram(orgId, tgText);

  // SMS to admin phones
  const smsCfg = await getSmsConfig(orgId);
  if (smsCfg?.enabled && smsCfg.adminPhones?.length) {
    const smsText = `Нове бронювання #${booking.id}: ${guestName}, ${unitName || ""}, ${checkIn}→${checkOut}${amount ? `, ₴${totalAmount}` : ""}`;
    for (const phone of smsCfg.adminPhones) {
      await sendSms(orgId, phone, smsText).catch(() => {});
    }
  }
}

export async function notifyCheckIn(orgId: number, guestName: string, unitName: string, bookingId: number) {
  const emailHtml = `
    <div style="font-family:sans-serif;max-width:520px">
      <h2 style="color:#059669">✅ Заїзд сьогодні</h2>
      <p>Гість <b>${guestName}</b> заїжджає до <b>${unitName}</b> (бронювання #${bookingId})</p>
      <p style="color:#888;font-size:12px">Maison HD Hospitality OS</p>
    </div>
  `;
  const tgText = `✅ <b>Заїзд сьогодні</b>\n👤 ${guestName} → 🏠 ${unitName} (#${bookingId})`;

  const emailCfg = await getEmailConfig(orgId);
  if (emailCfg?.enabled && emailCfg.adminEmails?.length) {
    await sendEmail(orgId, { to: emailCfg.adminEmails, subject: `Заїзд: ${guestName} — ${unitName}`, html: emailHtml });
  }
  await sendTelegram(orgId, tgText);
}

export async function notifyPaymentReceived(orgId: number, booking: {
  id: number;
  guestName: string;
  amount: number | string;
  method?: string;
}) {
  const tgText = `💳 <b>Оплата отримана</b>\n👤 ${booking.guestName} · бронювання #${booking.id}\n💰 ₴ ${booking.amount}${booking.method ? ` (${booking.method})` : ""}`;
  await sendTelegram(orgId, tgText);
}

// ─── Guest confirmation (called from public booking route) ────────────────────

export async function sendGuestConfirmationEmail(orgId: number, guestEmail: string, booking: Parameters<typeof buildGuestConfirmationEmail>[0] & { orgName?: string; orgEmail?: string; orgPhone?: string }) {
  if (!guestEmail) return { ok: false, error: "Немає email гостя" };

  const cfg = await getEmailConfig(orgId);
  if (!cfg?.enabled) return { ok: false, error: "Email не налаштовано" };

  const { html, text } = buildGuestConfirmationEmail(booking);

  return sendEmail(orgId, {
    to: guestEmail,
    subject: `✅ Бронювання ${booking.bookingRef} підтверджено — ${booking.propertyName}`,
    html,
    text,
  });
}

export async function sendGuestConfirmationSms(orgId: number, guestPhone: string, booking: {
  bookingRef: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  totalAmount: number | string;
}) {
  const cfg = await getSmsConfig(orgId);
  if (!cfg?.enabled || !cfg.guestSmsEnabled) return { ok: false, error: "SMS для гостей вимкнено" };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("uk-UA", { day: "numeric", month: "short" }); } catch { return d; }
  };

  const text = `${booking.propertyName}: бронювання ${booking.bookingRef} підтверджено! Заїзд ${formatDate(booking.checkIn)}, виїзд ${formatDate(booking.checkOut)}. Сума: ${Math.round(Number(booking.totalAmount)).toLocaleString("uk-UA")} грн.`;
  return sendSms(orgId, guestPhone, text);
}
