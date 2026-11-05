import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "@workspace/db";
import {
  SearchPublicServioBookingBody, SearchPublicServioBookingResponse,
  CreatePublicServioBookingBody, CreatePublicServioBookingResponse,
  CreateBookingServioReservationBody,
} from "@workspace/api-zod";
import { engineConfig, engineIssues } from "../lib/booking-engine.js";
import { servioSalesReadiness, servioSearchReadiness } from "../lib/servio-sales.js";
import { servioBaseUrl, servioHotelId } from "../lib/servio-connection.js";
import { validServioSearch, searchServioAvailability } from "../lib/servio-availability.js";
import { acceptsBookingTariff } from "../lib/booking-tariff.js";
import { decrypt } from "../lib/encrypt.js";
import { bookingPaymentOrigin } from "./booking-checkout.js";
import {
  createServioReservation, hashReservationRequest, reservationView, type Attempt,
} from "../lib/servio-reservations.js";
import { decodeServioGuestAccess } from "../lib/servio-guest-access.js";
import { servioInventoryError, applyServioLocalCapacity } from "../lib/servio-inventory.js";
import { linkBookingDraft } from "../lib/booking-drafts.js";

const router = Router();
router.use("/:slug/servio", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer"); next();
});
const searchLimit = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const createLimit = rateLimit({ windowMs: 60_000, max: 4, standardHeaders: true, legacyHeaders: false });
const readOrg = async (slug: string) => (await pool.query(
  "SELECT id,name,slug,phone,email,booking_engine_config FROM organizations WHERE slug=$1 AND is_active=true", [slug])).rows[0];
const normalizedSearch = (input: any) => ({
  checkIn: input.checkIn, checkOut: input.checkOut, adults: input.adults, childAges: input.childAges,
  useExtraBed: false, companyId: 0, companyCodeId: 0, conditionId: 0,
});
export function eligibleServioRate(rate: any, category: any, currency: string | null) {
  return !!category && category.freeRooms > 0 && !!rate && rate.nonRefundable === true && rate.saleAllowed === true
    && rate.total > 0 && !!currency && ["UAH", "ГРН", "ГРН.", "₴"].includes(currency.trim().toUpperCase());
}
function response(row: Attempt) {
  const access = decodeServioGuestAccess(row);
  return CreatePublicServioBookingResponse.parse({
    reservation: reservationView(row),
    url: access && Date.parse(access.expiresAt) > Date.now()
      ? `${access.returnPath}#access=${access.token}` : null,
  });
}

router.post("/:slug/servio/search", searchLimit, async (req, res) => {
  const parsed = SearchPublicServioBookingBody.safeParse(req.body);
  if (!parsed.success || !validServioSearch(normalizedSearch(parsed.data))
    || parsed.data.adults + parsed.data.childAges.length > 20
    || parsed.data.checkIn < new Date().toISOString().slice(0, 10)) {
    res.status(400).json({ error: "Перевірте дати (до 31 ночі), кількість гостей та вік дітей." }); return;
  }
  try {
    const org = await readOrg(String(req.params.slug));
    const config = org && engineConfig(org);
    if (!org || !config || config.provider !== "servio" || !config.published) {
      res.status(404).json({ error: "Онлайн-бронювання ще не відкрите." }); return;
    }
    const ready = servioSearchReadiness(config);
    if (ready.issues.length) {
      res.status(503).json({ error: "Пошук тимчасово недоступний: готелю потрібно перевірити підключення Servio." }); return;
    }
    const token = decrypt(config.servioToken);
    if (!token) throw new Error("connection_unavailable");
    const snapshot = await searchServioAvailability({
      base: servioBaseUrl(config.servioBaseUrl), token, hotelId: servioHotelId(config.servioHotelId),
      checkInTime: config.checkInTime, checkOutTime: config.checkOutTime,
    }, normalizedSearch(parsed.data), ready.categories);
    await applyServioLocalCapacity(snapshot, { base: servioBaseUrl(config.servioBaseUrl), hotelId: servioHotelId(config.servioHotelId) });
    // Provider quotes can be viewed without making them eligible for checkout.
    const excludedReasons = new Set<string>();
    for (const category of snapshot.categories.filter(category => category.freeRooms > 0)) {
      for (const rate of category.rates) {
        if (rate.nonRefundable !== true) excludedReasons.add("не підтверджено неповоротність тарифу");
        if (rate.saleAllowed === null) excludedReasons.add("не вдалося перевірити всі обмеження Servio");
        if (rate.saleAllowed === false) excludedReasons.add("умови Servio не дозволяють продаж на обрані дати");
        if (!(rate.total > 0)) excludedReasons.add("немає додатної підтвердженої ціни");
      }
    }
    if (!snapshot.currency || !["UAH", "ГРН", "ГРН.", "₴"].includes(snapshot.currency.trim().toUpperCase()))
      excludedReasons.add("валюта тарифу не підтримується для оплати");
    snapshot.categories = snapshot.categories.map(category => ({
      ...category, rates: category.rates.filter(rate => category.freeRooms > 0
        && Number.isFinite(rate.total) && rate.total > 0 && !!snapshot.currency
        && ["UAH", "ГРН", "ГРН.", "₴"].includes(snapshot.currency.trim().toUpperCase())),
    }));
    if (snapshot.categories.some(category => category.freeRooms > 0)
      && !snapshot.categories.some(category => category.rates.length)) {
      snapshot.status = "partial";
      snapshot.code = "no_eligible_rates";
      snapshot.message = `Вільні місця є, але онлайн-тариф недоступний: ${[...excludedReasons].join("; ") || "Servio не повернув підтверджених цін"}. Зверніться до готелю.`;
    } else if (snapshot.categories.some(category => category.rates.length)
      && !snapshot.categories.some(category => category.rates.some(rate => eligibleServioRate(rate, category, snapshot.currency)))) {
      snapshot.code = "view_only_rates";
      snapshot.message = "Ціни отримані із Servio для перегляду. Умови цих тарифів ще не дозволяють онлайн-оформлення.";
    }
    res.json(SearchPublicServioBookingResponse.parse(snapshot));
  } catch {
    res.status(503).json({ error: "Не вдалося отримати актуальні дані Servio. Спробуйте пізніше." });
  }
});

router.post("/:slug/servio/reservations", createLimit, async (req: any, res) => {
  const parsed = CreatePublicServioBookingBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.agreeTerms || !acceptsBookingTariff(parsed.data)
    || !parsed.data.firstName.trim() || !parsed.data.lastName.trim()
    || !validServioSearch(normalizedSearch(parsed.data))
    || parsed.data.adults + parsed.data.childAges.length > 20) {
    res.status(400).json({ error: "Перевірте дані гостя, email, телефон, дати та окремо погодьте умови тарифу." }); return;
  }
  try {
    const org = await readOrg(String(req.params.slug));
    const config = org && engineConfig(org);
    if (!org || !config || config.provider !== "servio") {
      res.status(404).json({ error: "Готель не знайдено." }); return;
    }
    const data = parsed.data;
    // The seller and corporate pricing IDs are never accepted from a public caller.
    const input = CreateBookingServioReservationBody.parse({
      ...data, ...normalizedSearch(data), propertyId: config.servioSellerPropertyId, authorizeProviderWrite: true,
    });
    const prior = (await pool.query(
      "SELECT * FROM servio_booking_attempts WHERE organization_id=$1 AND request_id=$2", [org.id, input.requestId])).rows[0];
    if (prior) {
      if (prior.request_hash !== hashReservationRequest(input)) {
        res.status(409).json({ error: "Цю спробу вже використано з іншими даними. Зверніться до готелю." }); return;
      }
      await linkBookingDraft(org.id, req.get("X-Booking-Draft"), { attemptId: prior.id }, req.log);
      res.json(response(prior)); return;
    }
    if (!config.published || data.checkIn < new Date().toISOString().slice(0, 10)) {
      res.status(409).json({ error: "Продажі закриті або дати вже минули. Нову бронь не створено." }); return;
    }
    const ready = await servioSalesReadiness(org.id, org.slug, config);
    if (ready.issues.length || engineIssues(config, 0, 0).length || !ready.seller || !ready.mailbox)
      throw new Error("not_ready");
    const token = decrypt(config.servioToken), secretKey = decrypt(ready.seller.liqpay_private_key);
    const origin = bookingPaymentOrigin();
    if (!token || !secretKey || !origin) throw new Error("connection_unavailable");
    const base = servioBaseUrl(config.servioBaseUrl), hotelId = servioHotelId(config.servioHotelId);
    const snapshot = await searchServioAvailability({
      base, token, hotelId, checkInTime: config.checkInTime, checkOutTime: config.checkOutTime,
    }, normalizedSearch(data), ready.categories);
    const category = snapshot.categories.find(c => c.id === input.categoryId);
    const rate = category?.rates.find(r => r.priceListId === input.priceListId && r.conditionId === input.rateConditionId);
    if (!eligibleServioRate(rate, category, snapshot.currency) || !rate
      || Math.round(rate.total * 100) !== Math.round(input.expectedTotal * 100)) {
      res.status(409).json({ error: "Наявність, ціна або умови змінилися. Повторіть пошук. Бронювання не створено.", code: "PRICE_CHANGED" }); return;
    }
    const latest = await readOrg(String(req.params.slug));
    const latestReady = latest && await servioSalesReadiness(org.id, org.slug, engineConfig(latest));
    if (!latest || JSON.stringify(engineConfig(latest)) !== JSON.stringify(config)
      || !latestReady || latestReady.issues.length
      || JSON.stringify(latestReady.seller) !== JSON.stringify(ready.seller)) throw new Error("settings_changed");
    const row = await createServioReservation(org.id, input, {
      base, token, hotelId, publicKey: ready.seller.liqpay_public_key, secretKey, origin,
      propertyId: input.propertyId, legalEntityId: ready.seller.legal_entity_id, mode: "live",
      checkInTime: config.checkInTime, checkOutTime: config.checkOutTime, terms: config.terms, privacy: config.privacy,
      guestHotel: { slug: org.slug, hotelName: config.displayName, sellerName: ready.seller.name,
        phone: config.phone, email: config.email },
      notificationMailbox: ready.mailbox,
      paymentWindowText: config.paymentWindowText,
    }, category!.name, rate);
    req.log.info({ organizationId: org.id, attemptId: row.id, state: row.state }, "Public Servio reservation processed");
    await linkBookingDraft(org.id, req.get("X-Booking-Draft"), { attemptId: row.id }, req.log);
    res.json(response(row));
  } catch (error) {
    const conflict = servioInventoryError(error);
    if (conflict) { res.status(409).json(conflict); return; }
    res.status(503).json({ error: "Результат операції ще не підтверджено. Повторіть запит із тими самими даними, не створюйте іншу спробу й не платіть повторно." });
  }
});
export default router;
