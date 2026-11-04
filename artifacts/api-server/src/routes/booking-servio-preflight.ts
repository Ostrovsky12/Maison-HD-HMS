import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "@workspace/db";
import { CheckBookingServioPreflightBody, CheckBookingServioPreflightResponse, GetBookingServioStatusResponse, SearchBookingServioAvailabilityBody } from "@workspace/api-zod";
import { requireRole } from "../lib/auth.js";
import { engineConfig } from "../lib/booking-engine.js";
import { decrypt } from "../lib/encrypt.js";
import { liqpayCredentialFingerprint } from "../lib/liqpay-connection.js";
import { servioBaseUrl, servioHotelId, servioFingerprint } from "../lib/servio-connection.js";
import { searchServioAvailability, validServioSearch } from "../lib/servio-availability.js";
import { servioPreflight } from "../lib/servio-preflight.js";
import { bookingPaymentOrigin } from "./booking-checkout.js";

const router = Router();
const limiter = rateLimit({ windowMs: 60_000, max: 4, standardHeaders: true, legacyHeaders: false });
const orgSql = "SELECT name,booking_engine_config FROM organizations WHERE id=$1 AND is_active=true";
const sellerSql = `SELECT p.id,p.legal_entity_id,le.id AS seller_id,le.liqpay_public_key,le.liqpay_private_key
  FROM properties p LEFT JOIN legal_entities le ON le.id=p.legal_entity_id
    AND le.organization_id=p.organization_id AND le.is_active=true
  WHERE p.id=$1 AND p.organization_id=$2`;

// Parent router authenticates the organization; this route only reads it and
// invokes GetRooms/GetPrices. It cannot call a provider write operation.
router.post("/", requireRole("super_admin", "owner", "admin"), limiter, async (req: any, res): Promise<void> => {
  const parsed = CheckBookingServioPreflightBody.safeParse(req.body);
  if (!parsed.success || !validServioSearch(parsed.data)) {
    res.status(400).json({ error: "Оберіть коректні дати, склад гостей, категорію, тариф та об’єкт готелю." }); return;
  }
  const input = parsed.data, orgId = req.user.organizationId;
  const org = (await pool.query(orgSql, [orgId])).rows[0];
  if (!org) { res.status(404).json({ error: "Готель не знайдено." }); return; }
  const config = engineConfig(org);
  const verified = config.servioVerification?.fingerprint === servioFingerprint(config)
    ? GetBookingServioStatusResponse.safeParse(config.servioVerification.result) : null;
  if (config.provider !== "servio" || !config.servioToken || !verified?.success
    || verified.data.status !== "connected" || !verified.data.categories.length) {
    res.status(400).json({ error: "Спочатку успішно перевірте поточне підключення Servio." }); return;
  }
  let base: string, hotelId: number, token: string | null;
  try {
    base = servioBaseUrl(config.servioBaseUrl); hotelId = servioHotelId(config.servioHotelId); token = decrypt(config.servioToken);
  } catch { res.status(400).json({ error: "Перевірте збережені реквізити Servio." }); return; }
  if (!token || /[\r\n]/.test(token)) { res.status(400).json({ error: "Збережіть коректний AccessToken Servio." }); return; }
  const seller = (await pool.query(sellerSql, [input.propertyId, orgId])).rows[0];
  const hasKeys = !!seller?.liqpay_public_key && !!seller?.liqpay_private_key;
  const savedCheck = seller ? config.liqpayVerification?.[String(seller.legal_entity_id)] : null;
  const authenticated = hasKeys && savedCheck?.status === "connected"
    && savedCheck.fingerprint === liqpayCredentialFingerprint(seller.liqpay_public_key, seller.liqpay_private_key);
  const snapshot = await searchServioAvailability({
    base, token, hotelId, checkInTime: config.checkInTime, checkOutTime: config.checkOutTime,
  }, SearchBookingServioAvailabilityBody.parse(input), verified.data.categories);
  const currentOrg = (await pool.query(orgSql, [orgId])).rows[0];
  const currentSeller = (await pool.query(sellerSql, [input.propertyId, orgId])).rows[0];
  if (!currentOrg || JSON.stringify(engineConfig(currentOrg)) !== JSON.stringify(config)
    || JSON.stringify(currentSeller) !== JSON.stringify(seller)) {
    res.status(409).json({ error: "Налаштування Servio або продавця змінилися під час перевірки. Повторіть її." }); return;
  }
  const result = servioPreflight(input, snapshot, config, {
    mapped: !!seller?.seller_id,
    hasKeys, authenticated: !!authenticated,
    mode: seller?.liqpay_public_key ? seller.liqpay_public_key.startsWith("sandbox_") ? "test" : "live" : null,
  }, !!bookingPaymentOrigin());
  req.log.info({ organizationId: orgId, inputChecksPassed: result.inputChecksPassed }, "Servio read-only checkout preflight completed");
  res.json(CheckBookingServioPreflightResponse.parse(result));
});
export default router;
