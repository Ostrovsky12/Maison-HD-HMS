/**
 * Notification service — Email (SMTP/nodemailer) + Telegram Bot API
 * Config stored per-org in tenant_settings (module = "notifications")
 */

import nodemailer from "nodemailer";
import { db } from "@workspace/db";
import { tenantSettings } from "../db/schema/platform.js";
import { eq, and } from "drizzle-orm";

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

export async function getEmailConfig(orgId: number): Promise<EmailConfig | null> {
  return getSetting(orgId, "email");
}

export async function getTelegramConfig(orgId: number): Promise<TelegramConfig | null> {
  return getSetting(orgId, "telegram");
}

export async function saveEmailConfig(orgId: number, cfg: EmailConfig) {
  await upsertSetting(orgId, "email", cfg);
}

export async function saveTelegramConfig(orgId: number, cfg: TelegramConfig) {
  await upsertSetting(orgId, "telegram", cfg);
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
    });

    const json = await res.json() as any;
    if (!json.ok) return { ok: false, error: json.description || "Telegram API error" };
    return { ok: true };
  } catch (err: any) {
    console.error("[notify] telegram error:", err.message);
    return { ok: false, error: err.message };
  }
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
