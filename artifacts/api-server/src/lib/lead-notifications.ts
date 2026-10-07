import { ReplitConnectors } from "@replit/connectors-sdk";
import { randomUUID } from "node:crypto";
import { logger } from "./logger.js";

// Platform landing leads only. Never use this mailbox for tenant notifications.
export interface LandingLead {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  company: string;
  message?: string | null;
}

type DeliveryStatus = "sent" | "not_configured" | "failed" | "unknown";
export interface DeliveryResult {
  status: DeliveryStatus;
  httpStatus?: number;
  messageId?: string;
}

export function leadText(lead: LandingLead): string {
  return [
    `Нова заявка Maison HD #${lead.id}`,
    "",
    `Ім'я: ${lead.name}`,
    `Компанія: ${lead.company}`,
    `Email: ${lead.email}`,
    lead.phone ? `Телефон: ${lead.phone}` : null,
    "",
    "Ваш біль або задача:",
    lead.message || "Не вказано",
  ].filter((line) => line !== null).join("\n");
}

const validEmail = (value: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);

export function leadEmailRaw(lead: LandingLead, recipient: string, sender: string): string {
  if (![recipient, sender, lead.email].every(validEmail)) {
    throw new Error("Invalid notification email address");
  }
  const subject = Buffer.from(`Нова заявка Maison HD #${lead.id}`).toString("base64");
  const body = Buffer.from(leadText(lead)).toString("base64").match(/.{1,76}/g)!.join("\r\n");
  return Buffer.from([
    `From: Maison HD <${sender}>`,
    `To: ${recipient}`,
    `Reply-To: ${lead.email}`,
    `Subject: =?UTF-8?B?${subject}?=`,
    `Message-ID: <maison-lead-${lead.id}-${randomUUID()}@maison-hd.com>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].join("\r\n")).toString("base64url");
}

export async function sendLeadEmail(lead: LandingLead): Promise<DeliveryResult> {
  const recipient = process.env.MAISONHD_LEADS_EMAIL?.trim();
  if (process.env.MAISONHD_LEADS_EMAIL_ENABLED !== "true" || !recipient) {
    return { status: "not_configured" };
  }
  if (!validEmail(recipient)) return { status: "failed" };
  let submitting = false;
  try {
    // Fresh authorization is obtained by the SDK for every request.
    const gmail = new ReplitConnectors().createProxyFetch("google-mail");
    const signal = AbortSignal.timeout(10_000);
    const profileResponse = await gmail("/gmail/v1/users/me/profile", { signal });
    if (!profileResponse.ok) return { status: "failed", httpStatus: profileResponse.status };
    const profile = await profileResponse.json() as { emailAddress: string };
    const raw = leadEmailRaw(lead, recipient, profile.emailAddress);
    submitting = true;
    const response = await gmail("/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
      signal,
    });
    if (!response.ok) return { status: "failed", httpStatus: response.status };
    const message = await response.json() as { id?: string };
    return message.id ? { status: "sent", messageId: message.id } : { status: "unknown" };
  } catch {
    // A lost send response may mean delivered. Do not retry blindly.
    // Do not log SDK/fetch errors: they may contain authorization or bot URLs.
    return { status: submitting ? "unknown" : "failed" };
  }
}

export async function sendLeadTelegram(lead: LandingLead): Promise<DeliveryResult> {
  const token = process.env.MAISONHD_TG_BOT_TOKEN;
  const chatId = process.env.MAISONHD_TG_CHAT_ID;
  if (!token || !chatId) return { status: "not_configured" };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Plain text: names/task descriptions cannot break Telegram Markdown.
      body: JSON.stringify({ chat_id: chatId, text: leadText(lead).slice(0, 4000) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { status: "failed", httpStatus: response.status };
    const result = await response.json() as { ok?: boolean };
    return { status: result.ok === true ? "sent" : "failed" };
  } catch {
    return { status: "unknown" };
  }
}

export async function notifyLandingLead(lead: LandingLead): Promise<void> {
  const results = await Promise.allSettled([sendLeadEmail(lead), sendLeadTelegram(lead)]);
  results.forEach((outcome, index) => {
    const result = outcome.status === "fulfilled" ? outcome.value : { status: "unknown" };
    const fields = { leadId: lead.id, channel: index === 0 ? "gmail" : "telegram", ...result };
    if (result.status === "sent") logger.info(fields, "Landing lead notification delivered");
    else logger.warn(fields, "Landing lead notification not confirmed; lead remains saved");
  });
}
