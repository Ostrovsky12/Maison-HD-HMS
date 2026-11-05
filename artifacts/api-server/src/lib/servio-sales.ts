import { pool } from "@workspace/db";
import { GetBookingServioStatusResponse } from "@workspace/api-zod";
import { servioFingerprint } from "./servio-connection.js";
import { liqpayCredentialFingerprint } from "./liqpay-connection.js";
import type { EmailConfig } from "./notify.js";
import type { BookingEngineConfig } from "./booking-engine.js";
import { bookingPaymentOrigin } from "../routes/booking-checkout.js";

export function bookingMailbox(slug: string, cfg: EmailConfig | null): string | null {
  if (!cfg?.enabled || !cfg.host || !cfg.user || !cfg.pass) return null;
  const from = (cfg.from || cfg.user).trim().toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)) return null;
  // This is a tenant-owned SMTP account, never the platform Gmail connector.
  return slug === "dogoda" && from !== "welcome@dogoda.ua" ? null : from;
}

export async function servioSalesReadiness(orgId: number, slug: string, config: BookingEngineConfig, client: any = pool) {
  const issues: string[] = [];
  const fingerprint = servioFingerprint(config);
  const check = config.servioVerification?.fingerprint === fingerprint
    ? GetBookingServioStatusResponse.safeParse(config.servioVerification.result) : null;
  if (!config.servioToken || !check?.success || check.data.status !== "connected" || !check.data.categories.length)
    issues.push("Перевірте поточне підключення й категорії Servio.");
  if (!config.servioSellerPropertyId || config.servioSellerFingerprint !== fingerprint)
    issues.push("Збережіть явну прив’язку продавця до поточного готелю Servio.");
  const seller = config.servioSellerPropertyId ? (await client.query(`SELECT p.id,p.legal_entity_id,
    le.name,le.liqpay_public_key,le.liqpay_private_key FROM properties p
    JOIN legal_entities le ON le.id=p.legal_entity_id AND le.organization_id=p.organization_id AND le.is_active=true
    WHERE p.id=$1 AND p.organization_id=$2`, [config.servioSellerPropertyId, orgId])).rows[0] : null;
  const verified = seller ? config.liqpayVerification?.[String(seller.legal_entity_id)] : null;
  if (!seller?.name?.trim() || !seller?.liqpay_public_key || !seller?.liqpay_private_key
    || verified?.status !== "connected"
    || verified.fingerprint !== liqpayCredentialFingerprint(seller.liqpay_public_key, seller.liqpay_private_key))
    issues.push("Потрібен продавець із юридичною назвою та перевіреними поточними ключами LiqPay.");
  if (seller?.liqpay_public_key?.startsWith("sandbox_")) issues.push("Тестові ключі LiqPay не відкривають реальні продажі.");
  if (!bookingPaymentOrigin()) issues.push("Налаштуйте HTTPS-адресу повернення та повідомлень LiqPay.");
  const { getEmailConfig } = await import("./notify.js");
  const mailbox = bookingMailbox(slug, await getEmailConfig(orgId));
  if (!mailbox) issues.push(slug === "dogoda"
    ? "Налаштуйте SMTP готелю з відправником welcome@dogoda.ua для листів гостю й адміністраторам."
    : "Налаштуйте вихідну пошту готелю для підтверджень гостю й адміністраторам.");
  return { issues, seller, mailbox, categories: check?.success ? check.data.categories : [] };
}
