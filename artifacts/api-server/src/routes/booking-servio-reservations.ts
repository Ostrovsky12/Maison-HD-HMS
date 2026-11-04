import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "@workspace/db";
import {
  CreateBookingServioReservationBody, CreateBookingServioReservationResponse,
  CheckoutBookingServioReservationBody, CheckoutBookingServioReservationResponse,
  CancelBookingServioReservationResponse, ListBookingServioReservationsResponse,
  SearchBookingServioAvailabilityBody, GetBookingServioStatusResponse,
} from "@workspace/api-zod";
import { requireRole } from "../lib/auth.js";
import { engineConfig } from "../lib/booking-engine.js";
import { acceptsBookingTariff } from "../lib/booking-tariff.js";
import { decrypt } from "../lib/encrypt.js";
import { servioFingerprint, servioBaseUrl, servioHotelId } from "../lib/servio-connection.js";
import { searchServioAvailability, validServioSearch } from "../lib/servio-availability.js";
import { liqpayCredentialFingerprint } from "../lib/liqpay-connection.js";
import { bookingPaymentOrigin } from "./booking-checkout.js";
import { issueServioGuestLink } from "./booking-servio-guest.js";
import {
  attemptStore, createServioReservation, reservationView, hashReservationRequest,
  checkoutServioReservation, cancelServioReservation, validServioCallback, recordServioPayment,
} from "../lib/servio-reservations.js";

const router = Router();
router.use(requireRole("super_admin", "owner", "admin"));
router.post("/:id/guest-link", rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false }), issueServioGuestLink);
const limiter = rateLimit({ windowMs: 60_000, max: 4, standardHeaders: true, legacyHeaders: false });
const uuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const orgSql = "SELECT name,booking_engine_config FROM organizations WHERE id=$1 AND is_active=true";
const sellerSql = `SELECT p.id,p.legal_entity_id,le.liqpay_public_key,le.liqpay_private_key
  FROM properties p JOIN legal_entities le ON le.id=p.legal_entity_id
    AND le.organization_id=p.organization_id AND le.is_active=true
  WHERE p.id=$1 AND p.organization_id=$2`;

router.get("/", async (req: any, res) => {
  try {
    const rows = (await pool.query("SELECT * FROM servio_booking_attempts WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 50", [req.user.organizationId])).rows;
    res.json(ListBookingServioReservationsResponse.parse(rows.map(reservationView)));
  } catch { res.status(503).json({ error: "Журнал Servio тимчасово недоступний." }); }
});
router.post("/", limiter, async (req: any, res) => {
  const parsed = CreateBookingServioReservationBody.safeParse(req.body);
  if (!parsed.success || !validServioSearch(parsed.data) || !acceptsBookingTariff(parsed.data)
    || !parsed.data.agreeTerms || !parsed.data.authorizeProviderWrite
    || !parsed.data.firstName.trim() || !parsed.data.lastName.trim()
    || !/^[+0-9 ()-]{7,30}$/.test(parsed.data.phone)
    || parsed.data.checkIn < new Date().toISOString().slice(0, 10)) {
    res.status(400).json({ error: "Перевірте дані гостя й дати. Потрібні окремі згоди з правилами тарифу та явний дозвіл створити реальне бронювання в Servio." }); return;
  }
  const input = parsed.data, orgId = req.user.organizationId;
  try {
    const prior = (await pool.query("SELECT * FROM servio_booking_attempts WHERE organization_id=$1 AND request_id=$2", [orgId, input.requestId])).rows[0];
    if (prior) {
      if (prior.request_hash !== hashReservationRequest(input)) { res.status(409).json({ error: "Ідентифікатор уже використано з іншими параметрами. Не повторюйте бронювання без звірки журналу." }); return; }
      res.json(CreateBookingServioReservationResponse.parse(reservationView(prior))); return;
    }
    const org = (await pool.query(orgSql, [orgId])).rows[0];
    if (!org) { res.status(404).json({ error: "Готель не знайдено." }); return; }
    const config = engineConfig(org);
    const verified = config.servioVerification?.fingerprint === servioFingerprint(config)
      ? GetBookingServioStatusResponse.safeParse(config.servioVerification.result) : null;
    const origin = bookingPaymentOrigin();
    if (config.provider !== "servio" || !config.servioToken || !verified?.success || verified.data.status !== "connected"
      || !origin || !config.terms.trim() || !config.privacy.trim()) {
      res.status(409).json({ error: "Спочатку перевірте підключення Servio, адресу платежів та заповніть правила й політику конфіденційності." }); return;
    }
    const seller = (await pool.query(sellerSql, [input.propertyId, orgId])).rows[0];
    const checked = seller ? config.liqpayVerification?.[String(seller.legal_entity_id)] : null;
    if (!seller?.liqpay_public_key || !seller?.liqpay_private_key || checked?.status !== "connected"
      || checked.fingerprint !== liqpayCredentialFingerprint(seller.liqpay_public_key, seller.liqpay_private_key)) {
      res.status(409).json({ error: "Оберіть власний об’єкт із активним продавцем і перевіреними поточними ключами LiqPay." }); return;
    }
    const base = servioBaseUrl(config.servioBaseUrl), hotelId = servioHotelId(config.servioHotelId);
    const token = decrypt(config.servioToken), secretKey = decrypt(seller.liqpay_private_key);
    if (!token || !secretKey) throw new Error("credentials_unavailable");
    const snapshot = await searchServioAvailability({
      base, token, hotelId, checkInTime: config.checkInTime, checkOutTime: config.checkOutTime,
    }, SearchBookingServioAvailabilityBody.parse(input), verified.data.categories);
    const category = snapshot.categories.find(row => row.id === input.categoryId);
    const rate = category?.rates.find(row => row.priceListId === input.priceListId && row.conditionId === input.rateConditionId);
    if (snapshot.status === "failed" || !category || category.freeRooms < 1 || !rate || !rate.nonRefundable || rate.saleAllowed !== true
      || !snapshot.currency || !["UAH", "ГРН", "ГРН.", "₴"].includes(snapshot.currency.trim().toUpperCase())
      || rate.total <= 0 || Math.round(rate.total * 100) !== Math.round(input.expectedTotal * 100)) {
      res.status(409).json({ error: "Наявність, неповоротність, умови або ціна змінилися чи не підтверджені Servio. Повторіть пошук. Бронювання не створене." }); return;
    }
    const currentOrg = (await pool.query(orgSql, [orgId])).rows[0];
    const currentSeller = (await pool.query(sellerSql, [input.propertyId, orgId])).rows[0];
    if (!currentOrg || JSON.stringify(engineConfig(currentOrg)) !== JSON.stringify(config) || JSON.stringify(currentSeller) !== JSON.stringify(seller)) {
      res.status(409).json({ error: "Підключення або продавець змінилися. Повторіть перевірку перед створенням." }); return;
    }
    const row = await createServioReservation(orgId, input, {
      base, token, hotelId, publicKey: seller.liqpay_public_key, secretKey, origin,
      propertyId: input.propertyId, legalEntityId: seller.legal_entity_id,
      mode: seller.liqpay_public_key.startsWith("sandbox_") ? "test" : "live",
      checkInTime: config.checkInTime, checkOutTime: config.checkOutTime,
      terms: config.terms, privacy: config.privacy,
    }, category.name, rate);
    req.log.info({ organizationId: orgId, attemptId: row.id, state: row.state }, "Controlled Servio reservation attempt");
    res.json(CreateBookingServioReservationResponse.parse(reservationView(row)));
  } catch (error) {
    res.status(error instanceof Error && error.message === "request_conflict" ? 409 : 503).json({
      error: "Не вдалося завершити операцію. Спочатку перевірте журнал спроб — бронь могла бути створена. Не створюйте нову спробу навмання.",
    });
  }
});
router.post("/:id/checkout", limiter, async (req: any, res) => {
  const parsed = CheckoutBookingServioReservationBody.safeParse(req.body);
  if (!uuid(req.params.id) || !parsed.success || !acceptsBookingTariff(parsed.data)) {
    res.status(400).json({ error: "Потрібна окрема згода з остаточною сумою та умовами тарифу." }); return;
  }
  try {
    const row = await attemptStore.get(req.params.id, req.user.organizationId);
    if (!row) { res.status(404).json({ error: "Бронювання не знайдено." }); return; }
    if (!row.bill || Math.round(parsed.data.expectedTotal * 100) !== row.bill.totalMinor) {
      res.status(409).json({ error: "Сума не відповідає остаточному рахунку Servio. Перевірте її ще раз." }); return;
    }
    res.json(CheckoutBookingServioReservationResponse.parse(await checkoutServioReservation(row)));
  } catch { res.status(409).json({ error: "Цю спробу зараз не можна оплатити. Оновіть журнал; не повторюйте оплату, якщо кошти вже списано." }); }
});
router.post("/:id/cancel", limiter, async (req: any, res) => {
  if (!uuid(req.params.id)) { res.status(400).json({ error: "Некоректний ідентифікатор." }); return; }
  try {
    const row = await attemptStore.get(req.params.id, req.user.organizationId);
    if (!row) { res.status(404).json({ error: "Бронювання не знайдено." }); return; }
    res.json(CancelBookingServioReservationResponse.parse(reservationView(await cancelServioReservation(row))));
  } catch { res.status(409).json({ error: "Автоматичне скасування недоступне після видачі платіжного посилання або за невизначеного стану. Потрібна звірка." }); }
});

/** Public endpoint: immutable snapshot selects tenant and merchant, HMAC authenticates the payment. */
export const servioReservationPaymentCallback = async (req: any, res: any) => {
  res.setHeader("Cache-Control", "no-store");
  const { data, signature } = req.body ?? {};
  if (typeof data !== "string" || data.length > 30_000 || typeof signature !== "string" || signature.length > 200) {
    res.status(400).json({ error: "invalid_callback" }); return;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
    const id = typeof payload.order_id === "string" ? payload.order_id.replace(/^mhd_servio_/, "") : "";
    if (!uuid(id)) { res.status(400).json({ error: "unknown_order" }); return; }
    const row = (await pool.query("SELECT * FROM servio_booking_attempts WHERE id=$1", [id])).rows[0];
    if (!row || !validServioCallback(row, data, signature, payload)) {
      res.status(400).json({ error: "invalid_signature" }); return;
    }
    const updated = await recordServioPayment(row, payload);
    req.log.info({ organizationId: row.organization_id, attemptId: id, state: updated.state }, "Servio payment callback processed");
    res.json({ ok: true });
  } catch (error) {
    const invalid = error instanceof SyntaxError || (error instanceof Error
      && ["payment_mismatch", "invalid_payment_identity"].includes(error.message));
    res.status(invalid ? 400 : 503).json({ error: invalid ? "invalid_payment" : "payment_processing_pending" });
  }
};
export default router;
