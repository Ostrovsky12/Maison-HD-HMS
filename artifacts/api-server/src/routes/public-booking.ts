import { Router } from "express";
import { randomBytes } from "crypto";
import rateLimit from "express-rate-limit";
import { db, pool } from "@workspace/db";
import {
  propertiesTable, unitsTable, bookingsTable, organizationsTable,
  fbCategoriesTable, fbItemsTable, fbTablesTable, fbOrdersTable, fbOrderItemsTable,
  ratesTable, channelRateSettingsTable,
} from "@workspace/db";
import { eq, and, or, gte, lte, lt, gt, ne, inArray, notInArray, sql, asc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateLiqPayForm, verifyLiqPayCallback, parseLiqPayData } from "../lib/liqpay.js";
import { fireBookingEvent } from "../lib/automation-runner.js";
import { sendGuestConfirmationEmail, sendGuestConfirmationSms, notifyBookingCreated } from "../lib/notify.js";
import { orchestrateFiscalization, isSubmissionEligible } from "../services/prro-orchestrator.js";
import { submitDocument } from "./prro.js";
import { engineConfig, engineSalesGuard, engineQuote, validBookingDates } from "../lib/booking-engine.js";
import { linkBookingDraft } from "../lib/booking-drafts.js";
import { createHash } from "node:crypto";
import { parseBookingParty } from "../lib/booking-party.js";
import { BOOKING_TARIFF_POLICY, acceptsBookingTariff, bookingMerchant } from "../lib/booking-tariff.js";
import { bookingCheckoutRouter, bookingPaymentOrigin } from "./booking-checkout.js";

const router = Router();
router.use("/booking-engine", bookingCheckoutRouter(retryPublicBookingFiscalization));

// ─── Rate limiters for public endpoints ──────────────────────────────────────
const bookingCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // max 10 booking attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Забагато спроб. Спробуйте через 15 хвилин." },
});

const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: 20,                   // 20 AI messages per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Занадто багато запитів. Зачекайте хвилину." },
});

const menuScrapeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,             // 60 menu loads per minute per IP (generous for real users, blocks scrapers)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Занадто багато запитів." },
});

const PUBLIC_PACKAGES: Record<string, { perStay?: number; perNight?: number }> = {
  romance: { perStay: 2400 },
  family: { perNight: 400 },
  wellness: { perNight: 800 },
  business: { perStay: 1200 },
};

const PUBLIC_ADDONS: Record<string, { perStay?: number; perNight?: number; perPersonPerNight?: number }> = {
  breakfast: { perPersonPerNight: 320 },
  spa: { perNight: 450 },
  transfer: { perStay: 900 },
  pet: { perNight: 200 },
  parking: { perNight: 150 },
  early_ci: { perStay: 350 },
  late_co: { perStay: 350 },
  baby_bed: { perStay: 0 },
};

const PUBLIC_PROMOS: Record<string, { percent?: number; fixed?: number }> = {
  WELCOME10: { percent: 10 },
  DOGODA20: { percent: 20 },
  SUMMER500: { fixed: 500 },
};

// ─── GET /properties — slug is required to prevent exposing all tenants ───────
router.get("/properties", async (req, res) => {
  try {
    const { slug } = req.query as any;

    // Slug is mandatory — returning all organizations' properties to the public
    // would expose the full tenant list, which is a multi-tenant data leak.
    if (!slug) {
      return res.status(400).json({ error: "slug query parameter is required" });
    }

    let orgs: any[] = [];
    if (slug) {
      orgs = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, slug));
      if (!orgs.length) return res.status(404).json({ error: "Organization not found" });
    }

    const orgCond = orgs.length ? eq(propertiesTable.organizationId, orgs[0].id) : sql`true`;

    const props = await db.select({
      id: propertiesTable.id,
      name: propertiesTable.name,
      address: propertiesTable.address,
      organizationId: propertiesTable.organizationId,
      orgName: organizationsTable.name,
      orgSlug: organizationsTable.slug,
    }).from(propertiesTable)
      .innerJoin(organizationsTable, eq(propertiesTable.organizationId, organizationsTable.id))
      .where(orgCond)
      .orderBy(propertiesTable.id);

    const organization = orgs.length ? {
      id: orgs[0].id,
      name: orgs[0].name,
      slug: orgs[0].slug,
      email: orgs[0].email,
      phone: orgs[0].phone,
      website: orgs[0].website,
      logo: orgs[0].logo,
      checkInTime: "14:00",
      checkOutTime: "12:00",
    } : null;

    return res.json({ properties: props, organization });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ─── GET /availability — slug required; propertyId must belong to that slug ──
router.get("/availability", async (req, res) => {
  try {
    const { slug, propertyId, checkIn, checkOut, guests = "1" } = req.query as any;

    // slug is mandatory for tenant isolation
    if (!slug) return res.status(400).json({ error: "slug query parameter is required" });
    const engineMode = req.query.engine === "1";
    const salesBlock = await engineSalesGuard(String(slug), engineMode);
    if (salesBlock) return res.status(salesBlock.status).json({ error: salesBlock.error });
    if (!checkIn || !checkOut) return res.status(400).json({ error: "checkIn and checkOut required" });
    if (engineMode && (!validBookingDates(String(checkIn), String(checkOut))
      || !Number.isInteger(Number(guests)) || Number(guests) < 1 || Number(guests) > 20)) {
      return res.status(400).json({ error: "Перевірте дати та кількість гостей (1–20)." });
    }
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (!Number.isFinite(checkInDate.getTime()) || !Number.isFinite(checkOutDate.getTime()) || checkInDate >= checkOutDate) {
      return res.status(400).json({ error: "Invalid date range" });
    }

    // Resolve org from slug
    const orgs = await db.select({ id: organizationsTable.id, bookingEngineConfig: organizationsTable.bookingEngineConfig })
      .from(organizationsTable).where(eq(organizationsTable.slug, slug));
    if (!orgs.length) return res.status(404).json({ error: "Organization not found" });
    const orgId = orgs[0].id;

    // Resolve property IDs — always scoped to the org
    let propIds: number[] = [];
    if (propertyId) {
      const parsedPropertyId = parseInt(propertyId, 10);
      if (!Number.isFinite(parsedPropertyId) || parsedPropertyId <= 0) {
        return res.status(400).json({ error: "Invalid propertyId" });
      }
      // Verify the requested propertyId belongs to this org
      const props = await db.select({ id: propertiesTable.id })
        .from(propertiesTable)
        .where(and(eq(propertiesTable.id, parsedPropertyId), eq(propertiesTable.organizationId, orgId)));
      if (!props.length) return res.status(404).json({ error: "Property not found for this organization" });
      propIds = props.map(p => p.id);
    } else {
      const orgProps = await db.select({ id: propertiesTable.id })
        .from(propertiesTable).where(eq(propertiesTable.organizationId, orgId));
      propIds = orgProps.map(p => p.id);
    }
    if (propIds.length === 0) return res.json({ units: [], nights: 0, checkIn, checkOut, guests });

    // Half-open interval overlap: booking [checkIn, checkOut) overlaps search [checkIn, checkOut)
    // when: booking.checkIn < search.checkOut AND booking.checkOut > search.checkIn
    const bookedRows = await db.select({ unitId: bookingsTable.unitId }).from(bookingsTable)
      .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
      .where(and(
        inArray(unitsTable.propertyId, propIds),
        ne(bookingsTable.status, "cancelled" as any),
        sql`NOT (coalesce(${bookingsTable}.utm_source,'')='maison_hd_booking' AND ${bookingsTable}.status::text='pending'
          AND coalesce(${bookingsTable}.paid_amount,0)=0 AND ${bookingsTable}.draft_expires_at IS NOT NULL
          AND ${bookingsTable}.draft_expires_at<NOW())`,
        lt(bookingsTable.checkIn, checkOut),
        gt(bookingsTable.checkOut, checkIn),
      ));
    const bookedIds: number[] = bookedRows.map(r => r.unitId).filter(Boolean) as number[];

    // Get available units
    const whereConds: any[] = [
      inArray(unitsTable.propertyId, propIds),
      ne(unitsTable.status, "maintenance" as any),
      ne(unitsTable.status, "inactive" as any),
      sql`NOT EXISTS (
        SELECT 1 FROM accommodation_blocks ab
        WHERE ab.organization_id = ${orgId}
          AND ab.is_active = true
          AND ${unitsTable.id} = ANY(ARRAY(SELECT jsonb_array_elements_text(ab.unit_ids))::int[])
          AND ab.start_date < ${checkOut}::date
          AND ab.end_date > ${checkIn}::date
      )`,
    ];
    if (bookedIds.length > 0) whereConds.push(notInArray(unitsTable.id, bookedIds));
    if (parseInt(guests) > 1) whereConds.push(gte(unitsTable.capacity, parseInt(guests)));

    const units = await db.select({
      id: unitsTable.id,
      name: unitsTable.name,
      category: unitsTable.category,
      floor: unitsTable.floor,
      capacity: unitsTable.capacity,
      maxCapacity: unitsTable.maxCapacity,
      basePrice: unitsTable.basePrice,
      description: unitsTable.description,
      hasView: unitsTable.hasView,
      hasBalcony: unitsTable.hasBalcony,
      squareMeters: unitsTable.squareMeters,
      propertyId: unitsTable.propertyId,
      propertyName: propertiesTable.name,
      propertyAddress: propertiesTable.address,
    }).from(unitsTable)
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(and(...whereConds))
      .orderBy(unitsTable.name);

    const cin = new Date(checkIn);
    const cout = new Date(checkOut);
    const nights = Math.max(1, Math.round((cout.getTime() - cin.getTime()) / 86400000));

    let result = units.map(u => ({
      ...u,
      basePrice: parseFloat(String(u.basePrice || 0)),
      nights,
      totalPrice: parseFloat(String(u.basePrice || 0)) * nights,
    }));
    if (engineMode) {
      const media = engineConfig({ booking_engine_config: orgs[0].bookingEngineConfig }).unitMedia ?? {};
      const quoted = await Promise.all(result.map(async u => {
        const quote = await engineQuote(u.id, checkIn, checkOut, Number(guests));
        const content = media[String(u.id)];
        return quote ? { ...u, basePrice: quote.nightlyRate, totalPrice: quote.totalPrice,
          photos: content?.photos ?? [], videoUrl: content?.videoUrl ?? "",
          description: content?.description.trim() ? content.description : u.description } : null;
      }));
      result = quoted.filter((u): u is NonNullable<typeof u> => u !== null);
    }

    return res.json({ units: result, nights, checkIn, checkOut, guests, totalUnits: result.length });
  } catch (e: any) { console.error("AVAILABILITY ERROR:", e); return res.status(500).json({ error: e.message }); }
});

// ─── POST /bookings — create booking (no auth, rate-limited) ─────────────────
// slug is required; unitId must belong to a property in that org
router.post("/bookings", bookingCreateLimiter, async (req, res) => {
  try {
    const {
      slug, unitId, checkIn, checkOut, firstName, lastName, email, phone,
      guestsCount, specialRequests, adults, children, packageId, addonIds, promoCode,
    } = req.body;
    if (!slug) {
      return res.status(400).json({ error: "slug is required" });
    }
    const engineMode = req.body.bookingEngine === true;
    const salesBlock = await engineSalesGuard(String(slug), engineMode);
    if (salesBlock) return res.status(salesBlock.status).json({ error: salesBlock.error });
    if (engineMode && !acceptsBookingTariff(req.body)) {
      return res.status(400).json({ error: "Потрібна окрема згода з неповоротним тарифом, 100% передоплатою та відсутністю зміни дат." });
    }
    if (engineMode && (!validBookingDates(String(checkIn), String(checkOut))
      || req.body.agreeTerms !== true
      || (!String(email || "").trim() && !String(phone || "").trim())
      || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email)))
      || typeof firstName !== "string" || firstName.trim().length > 100
      || typeof lastName !== "string" || lastName.trim().length > 100
      || String(phone || "").length > 60
      || String(email || "").length > 180
      || String(req.body.specialRequests || "").length > 2000
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(req.body.bookingRequestId || "")))) {
      return res.status(400).json({ error: "Перевірте дати, контактні дані та згоду з умовами." });
    }
    if (engineMode && (req.body.packageId || req.body.promoCode || req.body.addonIds?.length)) {
      return res.status(400).json({ error: "Пакети та промокоди ще не підключені до цього модуля." });
    }
    if (!unitId || !checkIn || !checkOut || !firstName || !lastName) {
      return res.status(400).json({ error: "Заповніть всі обов'язкові поля" });
    }
    const parsedUnitId = parseInt(String(unitId), 10);
    if (!Number.isFinite(parsedUnitId) || parsedUnitId <= 0) {
      return res.status(400).json({ error: "Некоректний unitId" });
    }
    // Validate dates: must be valid ISO dates, checkIn must be < checkOut
    const ciDate = new Date(checkIn);
    const coDate = new Date(checkOut);
    if (isNaN(ciDate.getTime()) || isNaN(coDate.getTime())) {
      return res.status(400).json({ error: "Некоректний формат дат" });
    }
    if (ciDate >= coDate) {
      return res.status(400).json({ error: "Дата виїзду повинна бути пізніше дати заїзду" });
    }
    // Prevent bookings starting in the past (allow same-day)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (ciDate < today) {
      return res.status(400).json({ error: "Дата заїзду не може бути в минулому" });
    }

    // Verify org exists by slug
    const [org] = await db.select({ id: organizationsTable.id, name: organizationsTable.name, bookingEngineConfig: organizationsTable.bookingEngineConfig })
      .from(organizationsTable).where(eq(organizationsTable.slug, slug));
    if (!org) return res.status(404).json({ error: "Organization not found" });
    if (!engineMode && org.bookingEngineConfig) {
      return res.status(409).json({ error: "Скористайтеся новим модулем бронювання зі згодою на тариф і 100% передоплатою." });
    }

    // Get unit info — and verify it belongs to a property in this org
    const [unit] = await db.select({
      id: unitsTable.id, basePrice: unitsTable.basePrice, propertyId: unitsTable.propertyId,
      name: unitsTable.name, status: unitsTable.status,
    }).from(unitsTable)
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(and(
        eq(unitsTable.id, parsedUnitId),
        eq(propertiesTable.organizationId, org.id),
      ));
    if (!unit) return res.status(404).json({ error: "Юніт не знайдено" });
    if (engineMode) {
      const merchant = await bookingMerchant(org.id, parsedUnitId, pool);
      if (!merchant?.liqpay_public_key || !merchant?.liqpay_private_key || !bookingPaymentOrigin()) {
        return res.status(503).json({ error: "Готель ще не налаштував онлайн-оплату цього об’єкта. Для цього тарифу потрібна 100% передоплата; оплата при заїзді недоступна." });
      }
    }
    if (unit.status && !["active", "available"].includes(unit.status as string)) {
      return res.status(409).json({ error: "Номер недоступний для бронювання" });
    }

    const [prop] = await db.select({ id: propertiesTable.id, name: propertiesTable.name, organizationId: propertiesTable.organizationId })
      .from(propertiesTable).where(eq(propertiesTable.id, unit.propertyId));

    const nights = Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));
    const totalAdults = parseInt(String(adults || guestsCount || 1), 10);
    const totalChildren = parseInt(String(children || 0), 10);
    if (!Number.isFinite(totalAdults) || totalAdults < 1 || totalAdults > 20
      || !Number.isFinite(totalChildren) || totalChildren < 0 || totalChildren > 20) {
      return res.status(400).json({ error: "Некоректна кількість гостей" });
    }
    const totalGuests = parseInt(String(guestsCount || totalAdults + totalChildren), 10);
    const engineParty = engineMode ? parseBookingParty(adults, children, guestsCount, req.body.childrenAges) : null;
    if (engineMode && !engineParty) {
      return res.status(400).json({ error: "Вкажіть дорослих і вік кожної дитини (0–17 років). Загальна кількість гостей має збігатися та не перевищувати 20." });
    }

    let nightlyRate = parseFloat(String(unit.basePrice || 0));
    const [channelSetting] = await db.select().from(channelRateSettingsTable)
      .where(and(
        eq(channelRateSettingsTable.propertyId, unit.propertyId),
        eq(channelRateSettingsTable.channel, "online"),
        eq(channelRateSettingsTable.isActive, true),
      ));
    if (channelSetting?.rateId) {
      const [rate] = await db.select().from(ratesTable)
        .where(and(eq(ratesTable.id, channelSetting.rateId), eq(ratesTable.isStopSale, false)));
      const rateIsValid = rate
        && (!rate.dateFrom || checkIn >= rate.dateFrom)
        && (!rate.dateTo || checkOut <= rate.dateTo);
      if (rateIsValid) {
        nightlyRate = Number((rate.unitPrices as any)?.[String(parsedUnitId)] ?? rate.pricePerNight);
      }
    }
    if (!Number.isFinite(nightlyRate) || nightlyRate < 0) {
      return res.status(409).json({ error: "Для номера не налаштовано коректний тариф" });
    }

    const normalizedAddonIds = Array.isArray(addonIds)
      ? Array.from(new Set(addonIds.map((id: unknown) => String(id))))
      : [];
    if (normalizedAddonIds.some((id) => !PUBLIC_ADDONS[id])) {
      return res.status(400).json({ error: "Невідома додаткова послуга" });
    }
    if (packageId && !PUBLIC_PACKAGES[String(packageId)]) {
      return res.status(400).json({ error: "Невідомий пакет" });
    }

    const packagePrice = packageId
      ? (PUBLIC_PACKAGES[String(packageId)].perStay || 0)
        + (PUBLIC_PACKAGES[String(packageId)].perNight || 0) * nights
      : 0;
    const addonsPrice = normalizedAddonIds.reduce((sum, id) => {
      const addon = PUBLIC_ADDONS[id];
      return sum
        + (addon.perStay || 0)
        + (addon.perNight || 0) * nights
        + (addon.perPersonPerNight || 0) * nights * totalGuests;
    }, 0);
    const subtotal = nightlyRate * nights + packagePrice + addonsPrice;
    const normalizedPromoCode = promoCode ? String(promoCode).trim().toUpperCase() : "";
    if (normalizedPromoCode && !PUBLIC_PROMOS[normalizedPromoCode]) {
      return res.status(400).json({ error: "Промокод не знайдено або застарів" });
    }
    const promo = normalizedPromoCode ? PUBLIC_PROMOS[normalizedPromoCode] : null;
    const discount = promo
      ? (promo.percent ? subtotal * promo.percent / 100 : promo.fixed || 0)
      : 0;
    let totalAmount = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
    if (engineMode) {
      const quote = await engineQuote(parsedUnitId, checkIn, checkOut, totalGuests);
      if (!quote) return res.status(409).json({ error: "Обраний номер або тариф більше недоступний. Оновіть пошук." });
      totalAmount = quote.totalPrice;
      if (totalAmount <= 0) return res.status(409).json({ error: "Для 100% передоплати потрібен коректний додатний тариф." });
      if (typeof req.body.expectedTotal !== "number" || Math.abs(req.body.expectedTotal - totalAmount) > 0.005) {
        return res.status(409).json({ error: "Вартість змінилася. Оновіть пошук і підтвердьте актуальну ціну.", code: "PRICE_CHANGED" });
      }
    }

    const refNum = Math.floor(100000 + Math.random() * 900000);
    const bookingRef = `BK-${refNum}`;
    const guestAccessCode = randomBytes(engineMode ? 10 : 5).toString("hex").toUpperCase();
    const normalizedEmail = typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
    const normalizedPhone = typeof phone === "string" && phone.trim() ? phone.trim() : null;
    const requestFingerprint = engineMode ? createHash("sha256").update(JSON.stringify([
      parsedUnitId, checkIn, checkOut, totalGuests, firstName.trim(), lastName.trim(),
      normalizedEmail, normalizedPhone, req.body.expectedTotal, req.body.specialRequests || "",
      BOOKING_TARIFF_POLICY.version,
      // Keep adult-only fingerprints stable across upgrades, but bind every family detail.
      ...(engineParty?.children ? [[engineParty.adults, engineParty.childrenAges]] : []),
    ])).digest("hex") : null;

    const client = await pool.connect();
    let booking: any;
    try {
      await client.query("BEGIN");
      if (engineMode) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`booking-engine:${org.id}:${req.body.bookingRequestId}`]);
        const previous = (await client.query(
          "SELECT * FROM bookings WHERE organization_id=$1 AND utm_source='maison_hd_booking' AND utm_content=$2 LIMIT 1",
          [org.id, req.body.bookingRequestId])).rows[0];
        if (previous) {
          await client.query("COMMIT");
          if (previous.utm_campaign !== requestFingerprint) return res.status(409).json({ error: "Запит із цим номером уже використано для іншого бронювання." });
          await linkBookingDraft(org.id, req.get("X-Booking-Draft"), { bookingId: previous.id }, req.log);
          return res.status(200).json({ booking: {
            id: previous.id, bookingRef: previous.booking_ref, guestAccessCode: previous.guest_access_code,
            firstName: previous.first_name, lastName: previous.last_name, email: previous.email,
            checkIn, checkOut, nights, totalAmount: Number(previous.total_amount),
            propertyName: prop?.name, unitName: unit.name, status: previous.status,
          } });
        }
        const blocked = await engineSalesGuard(String(slug), true, client, true);
        if (blocked) { await client.query("ROLLBACK"); return res.status(blocked.status).json({ error: blocked.error }); }
      }
      const lockedUnit = await client.query(
        "SELECT id FROM units WHERE id = $1 FOR UPDATE",
        [parsedUnitId],
      );
      if (!lockedUnit.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Юніт не знайдено" });
      }
      if (engineMode) await client.query(`UPDATE bookings SET status='cancelled',updated_at=NOW()
        WHERE unit_id=$1 AND utm_source='maison_hd_booking' AND status::text='pending' AND coalesce(paid_amount,0)=0
          AND draft_expires_at IS NOT NULL AND draft_expires_at<NOW()`, [parsedUnitId]);
      if (engineMode) {
        const quote = await engineQuote(parsedUnitId, checkIn, checkOut, totalGuests, client);
        if (!quote || Math.abs(quote.totalPrice - totalAmount) > 0.005) {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "Тариф або доступність змінилися. Оновіть пошук." });
        }
      }

      const conflict = await client.query(
        `SELECT id FROM bookings
          WHERE unit_id = $1
            AND status::text <> 'cancelled'
            AND check_in < $3::date
            AND check_out > $2::date
          LIMIT 1`,
        [parsedUnitId, checkIn, checkOut],
      );
      if (conflict.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Номер вже заброньований на ці дати" });
      }

      const blockConflict = await client.query(
        `SELECT id FROM accommodation_blocks
          WHERE organization_id = $1
            AND is_active = true
            AND $2 = ANY(ARRAY(SELECT jsonb_array_elements_text(unit_ids))::int[])
            AND start_date < $4::date
            AND end_date > $3::date
          LIMIT 1`,
        [org.id, parsedUnitId, checkIn, checkOut],
      );
      if (blockConflict.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Номер заблокований на вибрані дати" });
      }

      const contactLocks = [
        normalizedPhone ? `guest-phone:${org.id}:${normalizedPhone}` : null,
        normalizedEmail ? `guest-email:${org.id}:${normalizedEmail}` : null,
      ].filter((value): value is string => Boolean(value)).sort();
      for (const contactLock of contactLocks) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [contactLock]);
      }

      const existingGuests = await client.query(
        `SELECT id, phone, lower(email) AS email
         FROM guests
         WHERE organization_id = $1
           AND (($2::text IS NOT NULL AND phone = $2)
             OR ($3::text IS NOT NULL AND lower(email) = lower($3)))
         ORDER BY id
         FOR UPDATE`,
        [org.id, normalizedPhone, normalizedEmail],
      );
      const matchedGuestIds = new Set<number>(
        existingGuests.rows
          .filter((guest: any) => (normalizedPhone && guest.phone === normalizedPhone)
            || (normalizedEmail && guest.email === normalizedEmail))
          .map((guest: any) => Number(guest.id)),
      );
      if (matchedGuestIds.size > 1) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Контактні дані відповідають різним профілям гостей. Перевірте телефон та email.",
          code: "GUEST_IDENTITY_CONFLICT",
        });
      }
      let guestId = [...matchedGuestIds][0];
      if (!guestId) {
        const createdGuest = await client.query(
          `INSERT INTO guests (organization_id, first_name, last_name, email, phone, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING id`,
          [org.id, firstName.trim(), lastName.trim(), normalizedEmail, normalizedPhone],
        );
        guestId = createdGuest.rows[0].id;
      }

      const inserted = await client.query(
        `INSERT INTO bookings (
           organization_id, unit_id, guest_id, first_name, last_name, email, phone,
           guests_count, adults, children_under_6, children_over_6,
           check_in, check_out, status, payment_status, total_amount, paid_amount,
           notes, booking_ref, guest_access_code, source, created_at, updated_at
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12::date, $13::date, 'pending', 'unpaid', $14, 0,
            $15, $16, $17, 'direct', NOW(), NOW()
         )
         RETURNING *`,
        [
          org.id, parsedUnitId, guestId, firstName.trim(), lastName.trim(),
          normalizedEmail, normalizedPhone,
          totalGuests, totalAdults, engineParty?.under6 ?? Math.ceil(totalChildren / 2), engineParty?.over6 ?? Math.floor(totalChildren / 2),
          checkIn, checkOut, totalAmount.toFixed(2), specialRequests || null,
          bookingRef, guestAccessCode,
        ],
      );
      booking = inserted.rows[0];
      if (engineMode) {
        await client.query("UPDATE bookings SET utm_source='maison_hd_booking',utm_content=$2,utm_campaign=$3 WHERE id=$1",
          [booking.id, req.body.bookingRequestId, requestFingerprint]);
        const brand = engineConfig({ name: org.name, booking_engine_config: org.bookingEngineConfig });
        const receipt = {
          ...BOOKING_TARIFF_POLICY, acceptedAt: new Date().toISOString(), bookingRequestId: req.body.bookingRequestId,
          termsText: brand.terms, privacyText: brand.privacy,
          unitId: parsedUnitId, checkIn, checkOut, guestsCount: totalGuests, amountMinor: Math.round(totalAmount * 100), currency: "UAH",
          ...(engineParty?.children ? { adults: engineParty.adults, children: engineParty.children, childrenAges: engineParty.childrenAges } : {}),
        };
        await client.query("UPDATE bookings SET booking_policy_receipt=$2::jsonb,draft_expires_at=NOW()+INTERVAL '30 minutes' WHERE id=$1",
          [booking.id, JSON.stringify(receipt)]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    if (engineMode) await linkBookingDraft(org.id, req.get("X-Booking-Draft"), { bookingId: booking.id }, req.log);

    // Fire automation event + notifications (non-blocking)
    if ((booking as any).id) {
      const moduleBrand = engineMode ? engineConfig({ name: org.name, booking_engine_config: (org as any).bookingEngineConfig }) : null;
      const [unitWithProp] = await db.select({
        orgId: propertiesTable.organizationId,
        orgEmail: organizationsTable.email,
        orgPhone: organizationsTable.phone,
        orgName: organizationsTable.name,
      })
        .from(unitsTable)
        .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
        .innerJoin(organizationsTable, eq(propertiesTable.organizationId, organizationsTable.id))
        .where(eq(unitsTable.id, unit.id)).limit(1).catch(() => []);

      if (unitWithProp?.orgId) {
        const orgId = unitWithProp.orgId;

        // Fire automation engine (non-blocking)
        fireBookingEvent("booking_created", orgId, (booking as any).id).catch(() => {});

        // Notify admin (email + telegram + SMS) (non-blocking)
        notifyBookingCreated(orgId, {
          id: (booking as any).id,
          guestName: `${firstName} ${lastName}`,
          unitName: unit.name,
          checkIn, checkOut,
          totalAmount: Math.round(totalAmount),
        }).catch(() => {});

        // Guest confirmation email (non-blocking)
        if (email) {
          sendGuestConfirmationEmail(orgId, email, {
            bookingRef,
            guestName: `${firstName} ${lastName}`,
            unitName: unit.name,
            propertyName: prop?.name || "Готель",
            checkIn, checkOut, nights,
            totalAmount: Math.round(totalAmount),
            guestsCount: totalGuests,
            pending: engineMode,
            checkInTime: moduleBrand?.checkInTime,
            checkOutTime: moduleBrand?.checkOutTime,
            orgName: unitWithProp.orgName || undefined,
            orgEmail: unitWithProp.orgEmail || undefined,
            orgPhone: unitWithProp.orgPhone || undefined,
          }).catch(() => {});
        }

        // Guest confirmation SMS (non-blocking)
        if (phone) {
          sendGuestConfirmationSms(orgId, phone, {
            pending: engineMode,
            bookingRef,
            propertyName: prop?.name || "Готель",
            checkIn, checkOut,
            totalAmount: Math.round(totalAmount),
          }).catch(() => {});
        }
      }
    }

    return res.status(engineMode ? 201 : 200).json({
      booking: {
        id: booking.id,
        bookingRef: (booking as any).bookingRef || bookingRef,
        guestAccessCode: (booking as any).guestAccessCode || guestAccessCode,
        firstName, lastName, email,
        checkIn, checkOut, nights,
        totalAmount, propertyName: prop?.name,
        unitName: unit.name,
        status: "pending",
      },
    });
  } catch (e: any) { console.error("POST BOOKING ERROR:", e.message, e.stack); return res.status(500).json({ error: e.message }); }
});

// ─── POST /liqpay/:bookingId — generate payment form (public, guestAccessCode required) ──
router.post("/liqpay/:bookingId", async (req, res) => {
  try {
    const source = (await pool.query("SELECT utm_source FROM bookings WHERE id=$1", [Number(req.params.bookingId)])).rows[0];
    if (source?.utm_source === "maison_hd_booking") {
      return res.status(409).json({ error: "Для цього бронювання потрібна згода з неповоротним тарифом та оплата через його модуль." });
    }
    if (!process.env.LIQPAY_PUBLIC_KEY || !process.env.LIQPAY_PRIVATE_KEY) {
      return res.status(503).json({
        error: "liqpay_not_configured",
        message: "Онлайн-оплата тимчасово недоступна. Оплатіть при заїзді.",
      });
    }

    const bookingId = parseInt(req.params.bookingId);
    const { guestAccessCode } = req.body;

    const [result] = await db.select({
      id: bookingsTable.id,
      bookingRef: sql<string>`${bookingsTable}.booking_ref`,
      totalAmount: bookingsTable.totalAmount,
      paidAmount: bookingsTable.paidAmount,
      paymentStatus: bookingsTable.paymentStatus,
      firstName: bookingsTable.firstName,
      lastName: bookingsTable.lastName,
      email: bookingsTable.email,
      guestAccessCode: bookingsTable.guestAccessCode,
    }).from(bookingsTable)
      .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(bookingsTable.id, bookingId)).limit(1);

    if (!result) return res.status(404).json({ error: "Бронювання не знайдено" });

    // Validate guest access code — prevents anyone with a bookingId from generating payment forms
    if (!result.guestAccessCode || !guestAccessCode || guestAccessCode !== result.guestAccessCode) {
      return res.status(403).json({ error: "Forbidden", message: "Невірний код доступу" });
    }

    if (result.paymentStatus === "paid") return res.status(400).json({ error: "Бронювання вже оплачено" });

    const amount = Math.max(
      0,
      parseFloat(result.totalAmount?.toString() || "0") - parseFloat(result.paidAmount?.toString() || "0"),
    );
    if (amount <= 0) return res.status(400).json({ error: "Сума до оплати = 0" });

    const configuredBaseUrl = process.env.PUBLIC_APP_URL
      || process.env.PUBLIC_APP_ORIGIN
      || process.env.FRONTEND_URL
      || (process.env.NODE_ENV !== "production" && process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : "");
    const baseUrl = configuredBaseUrl.replace(/\/$/, "");
    if (!baseUrl.startsWith("https://")) {
      return res.status(503).json({
        error: "liqpay_callback_origin_not_configured",
        message: "Онлайн-оплата тимчасово недоступна.",
      });
    }
    // order_id format: "booking_<id>" — parsed in callback with exact regex
    const { data, signature } = generateLiqPayForm({
      action: "pay",
      amount,
      currency: "UAH",
      description: `Бронювання ${result.bookingRef || result.id} — ${result.firstName} ${result.lastName}`,
      orderId: `booking_${result.id}`,
      serverUrl: `${baseUrl}/api/public/liqpay/callback`,
    });

    return res.json({ data, signature, amount });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

async function retryPublicBookingFiscalization(liqpayOrderId: string, bookingId: number) {
  const paymentLookup = await pool.query(
    `SELECT p.id, p.amount, b.organization_id, coalesce(p.legal_entity_id,b.legal_entity_id) AS legal_entity_id,
            pr.legal_entity_id AS property_legal_entity_id
       FROM payments p
       JOIN bookings b ON b.id = p.booking_id
       LEFT JOIN units u ON u.id = b.unit_id
       LEFT JOIN properties pr ON pr.id = u.property_id
      WHERE p.liqpay_order_id = $1
      ORDER BY p.id DESC LIMIT 1`,
    [liqpayOrderId],
  );
  const paidPayment = paymentLookup.rows[0];
  if (!paidPayment) return null;
  const result = await orchestrateFiscalization({
    organizationId: Number(paidPayment.organization_id),
    sourceType: "booking",
    sourceId: `payment:${paidPayment.id}`,
    defaultLegalEntityId: paidPayment.legal_entity_id || paidPayment.property_legal_entity_id,
    items: [{
      name: `Оплата бронювання #${bookingId}`,
      quantity: 1,
      unitPrice: Number(paidPayment.amount),
      amount: Number(paidPayment.amount),
      legalEntityId: paidPayment.legal_entity_id || paidPayment.property_legal_entity_id,
    }],
    totalAmount: Number(paidPayment.amount),
    itemKind: "service",
    paymentChannel: "online_card",
    idempotencyKey: `booking-payment:${paidPayment.organization_id}:${paidPayment.id}`,
  });
  const documents = [];
  for (const document of result.documents) {
    documents.push(isSubmissionEligible(document.status)
      ? await submitDocument(Number(paidPayment.organization_id), Number(document.id))
      : document);
  }
  return { ...result, documents };
}

// ─── POST /liqpay/callback — LiqPay server callback (public) ─────────────────
// Hardened: exact order_id format, positive finite amount, amount <= outstanding,
// idempotent (deduplicates by liqpay_order_id in payments table), atomic update.
router.post("/liqpay/callback", async (req, res) => {
  try {
    const { data, signature } = req.body;
    if (!verifyLiqPayCallback(data, signature)) {
      return res.status(400).json({ error: "invalid_signature" });
    }

    const parsed = parseLiqPayData(data);
    if (!parsed?.order_id) return res.status(400).json({ error: "no_order_id" });

    // Exact format: "booking_<digits>" — no other patterns accepted
    const orderIdMatch = /^booking_(\d+)$/.exec(String(parsed.order_id));
    if (!orderIdMatch) return res.status(400).json({ error: "invalid_order_id" });
    const bookingId = parseInt(orderIdMatch[1], 10);
    if (!bookingId) return res.status(400).json({ error: "invalid_order_id" });

    // Only process successful payments
    if (parsed.status !== "success" && parsed.status !== "sandbox") {
      return res.json({ ok: true });
    }

    // Validate amount: must be a positive, finite number
    const paid = parseFloat(parsed.amount?.toString() || "0");
    if (!isFinite(paid) || paid <= 0) {
      return res.status(400).json({ error: "invalid_amount" });
    }

    const liqpayOrderId = String(parsed.order_id);
    if (String(parsed.currency || "UAH") !== "UAH") {
      return res.status(400).json({ error: "invalid_currency" });
    }

    const client = await pool.connect();
    let clientReleased = false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [liqpayOrderId]);

      const existing = await client.query(
        "SELECT id FROM payments WHERE liqpay_order_id = $1 LIMIT 1",
        [liqpayOrderId],
      );
      if (existing.rows.length > 0) {
        await client.query("ROLLBACK");
        client.release();
        clientReleased = true;
        let fiscalization: any = null;
        try {
          fiscalization = await retryPublicBookingFiscalization(liqpayOrderId, bookingId);
        } catch (error: any) {
          fiscalization = { error: error instanceof Error ? error.message : "Фіскалізація не виконана" };
        }
        return res.json({ ok: true, replayed: true, fiscalization });
      }

      const bookingResult = await client.query(
        `SELECT id, total_amount, paid_amount
           FROM bookings
          WHERE id = $1
          FOR UPDATE`,
        [bookingId],
      );
      const booking = bookingResult.rows[0];
      if (!booking) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "booking_not_found" });
      }

      const total = parseFloat(booking.total_amount || "0");
      const prevPaid = parseFloat(booking.paid_amount || "0");
      const outstanding = Math.max(0, total - prevPaid);
      if (Math.abs(paid - outstanding) > 0.01) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "amount_mismatch" });
      }

      const paymentResult = await client.query(
        `INSERT INTO payments (
           booking_id, amount, net_amount, fee_amount, currency, method, status,
           payment_type, liqpay_order_id, liqpay_status, external_id,
           description, processed_at, created_at, updated_at
         )
         VALUES ($1, $2, $2, 0, 'UAH', 'liqpay', 'completed', 'payment',
                 $3, $4, $5, $6, NOW(), NOW(), NOW())
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          bookingId,
          paid.toFixed(2),
          liqpayOrderId,
          String(parsed.status),
          parsed.payment_id ? String(parsed.payment_id) : null,
          `LiqPay callback for booking ${bookingId}`,
        ],
      );
      if (paymentResult.rows.length === 0) {
        await client.query("ROLLBACK");
        client.release();
        clientReleased = true;
        let fiscalization: any = null;
        try {
          fiscalization = await retryPublicBookingFiscalization(liqpayOrderId, bookingId);
        } catch (error: any) {
          fiscalization = { error: error instanceof Error ? error.message : "Фіскалізація не виконана" };
        }
        return res.json({ ok: true, replayed: true, fiscalization });
      }

      const newPaid = prevPaid + paid;
      await client.query(
        `UPDATE bookings
            SET paid_amount = $1,
                payment_status = CASE WHEN $1 >= total_amount - 0.01 THEN 'paid' ELSE 'partial' END,
                updated_at = NOW()
          WHERE id = $2`,
        [newPaid.toFixed(2), bookingId],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      if (!clientReleased) client.release();
    }

    // Fiscalization is idempotent by the persisted payment id. A repeated
    // callback can therefore safely retry allocation without another receipt.
    let fiscalization: any = null;
    try {
      fiscalization = await retryPublicBookingFiscalization(liqpayOrderId, bookingId);
    } catch (error: any) {
      fiscalization = { error: error instanceof Error ? error.message : "Фіскалізація не виконана" };
    }
    return res.json({ ok: true, fiscalization });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ─── GET /menu/:orgSlug — public F&B menu for QR ordering ────────────────────
router.get("/menu/:orgSlug", menuScrapeLimiter, async (req, res) => {
  try {
    const { orgSlug } = req.params;
    const orgs = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, orgSlug));
    if (!orgs.length) return res.status(404).json({ error: "Organization not found" });
    const orgId = orgs[0].id;

    const cats = await db.select().from(fbCategoriesTable)
      .where(and(eq(fbCategoriesTable.organizationId, orgId), eq(fbCategoriesTable.isActive, true)))
      .orderBy(asc(fbCategoriesTable.sortOrder));

    // Keep the public menu query deliberately narrow. Some existing tenants
    // predate newer fb_items columns represented in the shared Drizzle schema.
    const { rows: items } = await pool.query(
      `SELECT id, category_id AS "categoryId", name, description, price,
              cook_minutes AS "cookMinutes", is_vegetarian AS "isVegetarian",
              is_popular AS "isPopular", allergens, image_url AS "imageUrl"
       FROM fb_items
       WHERE organization_id = $1
         AND is_available = true
         AND (is_stop_list IS NULL OR is_stop_list = false)
       ORDER BY sort_order ASC NULLS LAST, name ASC`,
      [orgId],
    );

    // Modifier tables are intentionally read separately: they are not part of
    // the old Drizzle schema and the public payload needs only available options.
    const { rows: modifierRows } = await pool.query(
      `SELECT mg.id AS group_id, mg.item_id, mg.name AS group_name,
              mg.is_required, mg.min_select, mg.max_select, mg.sort_order AS group_sort_order,
              mo.id AS option_id, mo.name AS option_name, mo.price_delta,
              mo.sort_order AS option_sort_order
       FROM fb_modifier_groups mg
       LEFT JOIN fb_modifier_options mo
         ON mo.group_id = mg.id
        AND mo.organization_id = mg.organization_id
        AND mo.is_available = true
       WHERE mg.organization_id = $1
       ORDER BY mg.sort_order, mo.sort_order`,
      [orgId],
    );
    const modifierGroupsByItem: Record<number, any[]> = {};
    for (const row of modifierRows) {
      const groups = modifierGroupsByItem[row.item_id] || (modifierGroupsByItem[row.item_id] = []);
      let group = groups.find((g: any) => g.id === row.group_id);
      if (!group) {
        group = {
          id: row.group_id, name: row.group_name, is_required: row.is_required,
          min_select: row.min_select, max_select: row.max_select,
          sort_order: row.group_sort_order, options: [],
        };
        groups.push(group);
      }
      if (row.option_id != null) {
        group.options.push({
          id: row.option_id, name: row.option_name, price_delta: row.price_delta,
          sort_order: row.option_sort_order, is_available: true,
        });
      }
    }

    const catMap = cats.map(cat => ({
      ...cat,
      items: items
        .filter(i => i.categoryId === cat.id)
        .map(item => ({ ...item, modifier_groups: modifierGroupsByItem[item.id] || [] })),
    }));

    return res.json({ org: { id: orgId, name: orgs[0].name, slug: orgs[0].slug }, categories: catMap });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ─── GET /table/:orgSlug/:tableId — get table info ───────────────────────────
router.get("/table/:orgSlug/:tableId", async (req, res) => {
  try {
    const { orgSlug, tableId } = req.params;
    const orgs = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, orgSlug));
    if (!orgs.length) return res.status(404).json({ error: "Organization not found" });
    const orgId = orgs[0].id;

    const tables = await db.select().from(fbTablesTable)
      .where(and(eq(fbTablesTable.organizationId, orgId), eq(fbTablesTable.id, parseInt(tableId)), eq(fbTablesTable.isActive, true)));
    if (!tables.length) return res.status(404).json({ error: "Table not found" });

    return res.json({ table: tables[0], org: { name: orgs[0].name } });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ─── POST /menu-order — place QR order from guest ────────────────────────────
router.post("/menu-order", async (req, res) => {
  let client: any;
  try {
    const { orgSlug, tableId, guestName, guestCount, items, notes, guestPhone, tipPct } = req.body;
    if (typeof orgSlug !== "string" || !Array.isArray(items) || items.length < 1 || items.length > 50) {
      return res.status(400).json({ error: "orgSlug та від 1 до 50 позицій обов'язкові" });
    }
    const integer = (value: unknown, maximum: number) =>
      (typeof value === "number" || typeof value === "string") &&
      /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) &&
      Number(value) > 0 && Number(value) <= maximum ? Number(value) : null;
    const requestedTip = tipPct == null || tipPct === "" ? 0 : Number(tipPct);
    if (!Number.isFinite(requestedTip) || requestedTip < 0 || requestedTip > 50) {
      return res.status(400).json({ error: "Некоректний відсоток чайових" });
    }
    const safeTipPct = Math.round(requestedTip * 100) / 100;

    client = await pool.connect();
    await client.query("BEGIN");
    const { rows: orgs } = await client.query(
      "SELECT id, name, slug FROM organizations WHERE slug = $1 LIMIT 1 FOR UPDATE", [orgSlug],
    );
    if (!orgs[0]) throw Object.assign(new Error("Organization not found"), { status: 404 });
    const orgId = orgs[0].id;

    let tableRecord: any = null;
    if (tableId != null && tableId !== "") {
      const validTableId = integer(tableId, 2_147_483_647);
      if (!validTableId) throw Object.assign(new Error("Некоректний стіл"), { status: 400 });
      const { rows } = await client.query(
        `SELECT id, number, current_order_id FROM fb_tables
         WHERE id = $1 AND organization_id = $2 AND is_active = true FOR UPDATE`,
        [validTableId, orgId],
      );
      if (!rows[0]) throw Object.assign(new Error("Table not found"), { status: 404 });
      tableRecord = rows[0];
    }

    const validatedItems: any[] = [];
    let subtotalCents = 0;
    for (const requested of items) {
      const itemId = integer(requested?.itemId ?? requested?.id, 2_147_483_647);
      const quantity = integer(requested?.quantity, 100);
      if (!itemId || !quantity) throw Object.assign(new Error("Некоректна позиція або кількість"), { status: 400 });
      const { rows: itemRows } = await client.query(
        `SELECT id, name, price FROM fb_items
         WHERE id = $1 AND organization_id = $2 AND is_available = true
           AND (is_stop_list IS NULL OR is_stop_list = false) LIMIT 1 FOR UPDATE`,
        [itemId, orgId],
      );
      const item = itemRows[0];
      if (!item) throw Object.assign(new Error("Позиція недоступна"), { status: 400 });
      const { rows: modifierGroups } = await client.query(
        `SELECT id AS group_id, name AS group_name, is_required, min_select, max_select
         FROM fb_modifier_groups
         WHERE organization_id = $1 AND item_id = $2
         FOR UPDATE`,
        [orgId, item.id],
      );
      const { rows: modifierOptions } = await client.query(
        `SELECT mo.group_id, mo.id AS option_id, mo.name AS option_name, mo.price_delta
         FROM fb_modifier_options mo
         JOIN fb_modifier_groups mg ON mg.id = mo.group_id AND mg.organization_id = mo.organization_id
         WHERE mo.organization_id = $1 AND mg.item_id = $2 AND mo.is_available = true
         FOR UPDATE OF mo`,
        [orgId, item.id],
      );
      const groups = new Map<number, any>();
      for (const row of modifierGroups) {
        groups.set(row.group_id, { ...row, options: new Map<number, any>() });
      }
      for (const row of modifierOptions) {
        const group = groups.get(row.group_id);
        if (group) group.options.set(row.option_id, row);
      }
      if (requested.modifiers != null && !Array.isArray(requested.modifiers)) {
        throw Object.assign(new Error("Некоректні модифікатори"), { status: 400 });
      }
      const selections = requested.modifiers || [];
      const selectedByGroup = new Map<number, any[]>();
      for (const selection of selections) {
        const groupId = integer(selection?.groupId ?? selection?.group_id, 2_147_483_647);
        const optionId = integer(selection?.optionId ?? selection?.option_id ?? selection?.id, 2_147_483_647);
        const group = groupId && groups.get(groupId);
        const option = group && optionId && group.options.get(optionId);
        if (!group || !option) throw Object.assign(new Error("Некоректний або недоступний модифікатор"), { status: 400 });
        const selected = selectedByGroup.get(groupId) || [];
        if (selected.some(s => s.optionId === optionId)) throw Object.assign(new Error("Модифікатор обрано двічі"), { status: 400 });
        selected.push({ groupId, groupName: group.group_name, optionId, optionName: option.option_name, priceDelta: String(option.price_delta) });
        selectedByGroup.set(groupId, selected);
      }
      for (const [groupId, group] of groups) {
        const count = selectedByGroup.get(groupId)?.length || 0;
        const minimum = Math.max(group.is_required ? 1 : 0, Number(group.min_select) || 0);
        const maximum = Number(group.max_select);
        if (count < minimum || (Number.isFinite(maximum) && count > maximum)) {
          throw Object.assign(new Error("Не виконано обов'язкові умови модифікаторів"), { status: 400 });
        }
      }
      const toCents = (amount: unknown) => {
        const parsed = Number(amount);
        if (!Number.isFinite(parsed)) throw new Error("Некоректна ціна");
        return Math.round(parsed * 100);
      };
      const modifiers = [...selectedByGroup.values()].flat();
      const unitCents = toCents(item.price) + modifiers.reduce((sum, mod) => sum + toCents(mod.priceDelta), 0);
      if (unitCents < 0 || subtotalCents + unitCents * quantity > 9_999_999_999) {
        throw Object.assign(new Error("Некоректна сума замовлення"), { status: 400 });
      }
      const totalCents = unitCents * quantity;
      subtotalCents += totalCents;
      validatedItems.push({ item, quantity, modifiers, unitCents, totalCents, notes: typeof requested.notes === "string" ? requested.notes.slice(0, 2000) : null });
    }
    const tipCents = Math.round(subtotalCents * safeTipPct / 100);
    const money = (cents: number) => (cents / 100).toFixed(2);
    const shared = tableRecord?.current_order_id
      ? (await client.query(`SELECT * FROM fb_orders WHERE id=$1 AND organization_id=$2 AND table_id=$3
          AND status NOT IN ('billed','cancelled') FOR UPDATE`, [tableRecord.current_order_id, orgId, tableRecord.id])).rows[0]
      : null;
    if (shared && Number(shared.paid_amount || 0) > 0)
      throw Object.assign(new Error("Рахунок уже оплачується. Зверніться до офіціанта."), { status: 409 });
    const { rows: orderRows } = shared ? { rows: [shared] } : await client.query(
      `INSERT INTO fb_orders (organization_id, table_id, order_type, guest_name, guest_count, room_number,
        status, total_amount, tip_amount, tip_pct, notes)
       VALUES ($1,$2,$3,$4,$5,$6,'new_guest',$7,$8,$9,$10) RETURNING id`,
      [orgId, tableRecord?.id || null, tableRecord ? "dine_in" : "room_service", guestName || "Гість (QR)",
       integer(guestCount, 100) || 1, tableRecord ? `Стіл ${tableRecord.number}` : null,
       money(subtotalCents), money(tipCents), String(safeTipPct), typeof notes === "string" ? notes.slice(0, 5000) : null],
    );
    const order = orderRows[0];
    for (const row of validatedItems) {
      await client.query(
        `INSERT INTO fb_order_items (order_id, item_id, organization_id, name, price, quantity, total_price, notes, modifiers, requires_confirmation)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,
        [order.id, row.item.id, orgId, row.item.name, money(row.unitCents), row.quantity,
          money(row.totalCents),
          [row.notes, shared && row === validatedItems[0] && typeof notes === "string" ? notes : null].filter(Boolean).join("\n").slice(0, 2000) || null,
          row.modifiers.length ? JSON.stringify(row.modifiers) : null],
      );
    }
    if (shared) await client.query(`UPDATE fb_orders SET total_amount=(
      SELECT coalesce(sum(total_price::numeric),0) FROM fb_order_items WHERE order_id=$1 AND status<>'cancelled'),
      updated_at=now() WHERE id=$1 AND organization_id=$2`, [order.id, orgId]);
    if (tableRecord) await client.query(
      "UPDATE fb_tables SET status = 'occupied', current_order_id = $1 WHERE id = $2 AND organization_id = $3",
      [order.id, tableRecord.id, orgId],
    );
    if (typeof guestPhone === "string" && guestPhone.trim()) {
      const history = [{ order_id: order.id, date: new Date().toISOString(),
        items: validatedItems.map(row => ({ name: row.item.name, qty: row.quantity, price: money(row.unitCents) })),
        total: Number(money(subtotalCents + tipCents)) }];
      await client.query(
        `INSERT INTO fb_customers (organization_id, name, phone, visits_count, total_spent, last_visit_at, order_history)
         VALUES ($1,$2,$3,1,$4,NOW(),$5::jsonb)
         ON CONFLICT (organization_id, phone) DO UPDATE SET name=COALESCE(EXCLUDED.name,fb_customers.name),
           visits_count=fb_customers.visits_count+1, total_spent=fb_customers.total_spent+$4,
           last_visit_at=NOW(), order_history=(COALESCE(fb_customers.order_history,'[]'::jsonb)||$5::jsonb)`,
        [orgId, guestName || null, guestPhone.trim(), money(subtotalCents + tipCents), JSON.stringify(history)],
      );
    }
    await client.query("COMMIT");
    return res.status(201).json({ orderId: order.id, orderNumber: order.id,
      subtotal: Number(money(subtotalCents)), tip: Number(money(tipCents)), total: Number(money(subtotalCents + tipCents)) });
  } catch (e: any) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client?.release();
  }
});

// ─── GET /bookings/:ref — get by reference + guestAccessCode (required) ───────
// guestAccessCode is mandatory — never expose PII based on bookingRef alone.
router.get("/bookings/:ref", async (req, res) => {
  try {
    const { guestAccessCode } = req.query as any;
    if (!guestAccessCode) {
      return res.status(400).json({ error: "guestAccessCode query parameter is required" });
    }

    // Fetch only non-PII fields plus guestAccessCode for verification
    const results = await db.select({
      id: bookingsTable.id,
      firstName: bookingsTable.firstName, lastName: bookingsTable.lastName,
      email: bookingsTable.email, phone: bookingsTable.phone,
      checkIn: bookingsTable.checkIn, checkOut: bookingsTable.checkOut,
      status: bookingsTable.status, totalAmount: bookingsTable.totalAmount,
      paymentStatus: bookingsTable.paymentStatus,
      guestAccessCode: bookingsTable.guestAccessCode,
      unitName: unitsTable.name,
      propertyName: propertiesTable.name, propertyAddress: propertiesTable.address,
    }).from(bookingsTable)
      .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(sql`${bookingsTable}.booking_ref = ${req.params.ref}`)
      .limit(1);

    if (!results.length) return res.status(404).json({ error: "Бронювання не знайдено" });

    const booking = results[0];

    // Verify guest access code before returning any PII
    if (!booking.guestAccessCode || guestAccessCode !== booking.guestAccessCode) {
      return res.status(403).json({ error: "Forbidden", message: "Невірний код доступу" });
    }

    // Strip guestAccessCode from the response
    const { guestAccessCode: _omit, ...safeBooking } = booking;
    return res.json({ booking: safeBooking });
  } catch (e: any) { console.error("GET BOOKING ERROR:", e.message); return res.status(500).json({ error: e.message }); }
});

// ─── GET /rates — active rate for a property & channel (public, no auth) ──────
// Returns the rate configured for a specific channel (default: 'online').
// If no channel config, returns null. The booking form applies price from this rate.
router.get("/rates", async (req, res) => {
  try {
    const { slug, propertyId, unitId, checkIn, checkOut, channel = "online" } = req.query as any;
    if (!slug || !propertyId) return res.status(400).json({ error: "slug and propertyId required" });
    const parsedPropertyId = parseInt(propertyId, 10);
    if (!Number.isFinite(parsedPropertyId) || parsedPropertyId <= 0) {
      return res.status(400).json({ error: "Invalid propertyId" });
    }

    const [property] = await db.select({ id: propertiesTable.id })
      .from(propertiesTable)
      .innerJoin(organizationsTable, eq(propertiesTable.organizationId, organizationsTable.id))
      .where(and(
        eq(propertiesTable.id, parsedPropertyId),
        eq(organizationsTable.slug, slug),
      ));
    if (!property) return res.status(404).json({ error: "Property not found for this organization" });

    if (unitId) {
      const parsedUnitId = parseInt(unitId, 10);
      if (!Number.isFinite(parsedUnitId) || parsedUnitId <= 0) {
        return res.status(400).json({ error: "Invalid unitId" });
      }
      const [unit] = await db.select({ id: unitsTable.id }).from(unitsTable)
        .where(and(eq(unitsTable.id, parsedUnitId), eq(unitsTable.propertyId, parsedPropertyId)));
      if (!unit) return res.status(404).json({ error: "Unit not found for this property" });
    }

    // Look up channel rate setting for this property & channel
    const [setting] = await db.select().from(channelRateSettingsTable)
      .where(and(
        eq(channelRateSettingsTable.propertyId, parsedPropertyId),
        eq(channelRateSettingsTable.channel, channel),
        eq(channelRateSettingsTable.isActive, true),
      ));

    // No active channel setting or no rate assigned → no rate
    if (!setting || !setting.rateId) {
      return res.json(null);
    }

    // Fetch the configured rate
    const [rate] = await db.select().from(ratesTable)
      .where(and(
        eq(ratesTable.id, setting.rateId),
        eq(ratesTable.isStopSale, false),
      ));

    if (!rate) return res.json(null);

    // Check date validity
    const today = new Date().toISOString().slice(0, 10);
    const checkDate = checkIn || today;
    if (rate.dateFrom && checkDate < rate.dateFrom) return res.json(null);
    if (rate.dateTo && (checkOut || checkDate) > rate.dateTo) return res.json(null);

    // Unit-specific price
    const unitPrice = unitId && rate.unitPrices && (rate.unitPrices as any)[String(unitId)]
      ? Number((rate.unitPrices as any)[String(unitId)])
      : Number(rate.pricePerNight);

    return res.json({
      id: rate.id,
      name: rate.name,
      pricePerNight: Number(rate.pricePerNight),
      minNights: rate.minNights,
      dateFrom: rate.dateFrom,
      dateTo: rate.dateTo,
      discountPercent: rate.discountPercent ? Number(rate.discountPercent) : null,
      unitPrices: rate.unitPrices || null,
      unitPrice,
    });
  } catch (e: any) { console.error("GET PUBLIC RATES ERROR:", e.message); return res.status(500).json({ error: e.message }); }
});

// ─── GET /ai-waiter/guest/:orgSlug/:phone — get guest session ─────────────────
router.get("/ai-waiter/guest/:orgSlug/:phone", async (req, res) => {
  try {
    const { orgSlug, phone } = req.params;
    const orgs = await db.select({ id: organizationsTable.id }).from(organizationsTable).where(eq(organizationsTable.slug, orgSlug));
    if (!orgs.length) return res.status(404).json({ error: "Not found" });
    const db_ = (db as any).$client;
    const r = await db_.query(
      `SELECT name, phone, visits_count, total_spent, last_visit_at, order_history
       FROM fb_customers WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
      [orgs[0].id, phone]
    );
    if (!r.rows.length) return res.json({ guest: null });
    return res.json({ guest: r.rows[0] });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ─── POST /ai-waiter/chat — AI waiter for QR ordering (rate-limited) ─────────
router.post("/ai-waiter/chat", aiChatLimiter, async (req, res) => {
  try {
    const { orgSlug, messages, cart, guestPhone } = req.body;
    if (!orgSlug || !Array.isArray(messages)) return res.status(400).json({ error: "orgSlug and messages required" });
    // Limit conversation length and per-message size to prevent prompt injection / cost abuse
    if (messages.length > 20) return res.status(400).json({ error: "Too many messages" });
    for (const m of messages) {
      if (typeof m?.content === "string" && m.content.length > 2000) {
        return res.status(400).json({ error: "Message too long" });
      }
    }

    const orgs = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, orgSlug));
    if (!orgs.length) return res.status(404).json({ error: "Organization not found" });
    const orgId = orgs[0].id;

    // Load AI waiter settings
    const db_ = (db as any).$client;
    const settingsRow = await db_.query(`SELECT * FROM fb_ai_waiter_settings WHERE org_id = $1`, [orgId]);
    const settings = settingsRow.rows[0] || {};
    const waiterName = settings.waiter_name || "AI Офіціант";
    const personality = settings.personality || "friendly";
    const promoText = settings.promo_text || "";
    const greetingText = settings.greeting_text || "";

    // Load guest history if phone provided
    let guestCtx = "";
    if (guestPhone) {
      const guestRow = await db_.query(
        `SELECT name, visits_count, total_spent, order_history FROM fb_customers WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
        [orgId, guestPhone]
      );
      if (guestRow.rows.length) {
        const g = guestRow.rows[0];
        const lastOrders = (g.order_history || []).slice(-3).map((o: any) =>
          `замовлення від ${new Date(o.date).toLocaleDateString("uk")}: ${o.items.map((i: any) => i.name).join(", ")} (${o.total}₴)`
        ).join("; ");
        guestCtx = `\nГОСТЬ: ${g.name || "постійний гість"}, ${g.visits_count || 1} візит(ів), витрат ${g.total_spent || 0}₴.${lastOrders ? ` Останні замовлення: ${lastOrders}.` : ""}`;
      }
    }

    // Fetch full menu
    const cats = await db.select().from(fbCategoriesTable)
      .where(and(eq(fbCategoriesTable.organizationId, orgId), eq(fbCategoriesTable.isActive, true)))
      .orderBy(asc(fbCategoriesTable.sortOrder));
    const menuItems = await db.select().from(fbItemsTable)
      .where(and(eq(fbItemsTable.organizationId, orgId), eq(fbItemsTable.isAvailable, true)));

    // Fetch recipe card ingredients for composition/allergen enrichment
    const recipeRows = await db.execute(sql`
      SELECT rc.menu_item_id, array_agg(DISTINCT i.name ORDER BY i.name) AS ingredients
      FROM fb_recipe_cards rc
      JOIN fb_recipe_card_items rci ON rci.recipe_id = rc.id
      JOIN fb_ingredients i ON i.id = rci.ingredient_id
      WHERE rc.organization_id = ${orgId} AND rc.is_active = true
      GROUP BY rc.menu_item_id
    `);
    const ingByItem: Record<number, string[]> = {};
    for (const r of recipeRows.rows as any[]) ingByItem[r.menu_item_id] = r.ingredients || [];

    // Helpers
    const toArr = (v: any): string[] => {
      if (!v) return [];
      if (Array.isArray(v)) return v.filter(Boolean);
      if (typeof v === "object") return Object.keys(v).filter(k => v[k]);
      if (typeof v === "string") return v.split(",").map((s: string) => s.trim()).filter(Boolean);
      return [];
    };

    // Build compact menu string for system prompt
    const menuCtx = cats.map(cat => {
      const items = menuItems.filter(i => i.categoryId === cat.id);
      if (!items.length) return null;
      const lines = items.map(it => {
        const parts = [`[${it.id}] ${it.name} — ${it.price}₴`];
        if (it.description) parts.push(it.description);
        const flags: string[] = [];
        if (it.isVegetarian) flags.push("🌿 вег");
        const tags = toArr(it.tags);
        if (tags.some(t => /vegan|веган/i.test(t))) flags.push("🌱 веган");
        if (tags.some(t => /gluten|глютен/i.test(t))) flags.push("без глютену");
        if (flags.length) parts.push(flags.join(", "));
        const allergens = toArr(it.allergens);
        if (allergens.length) parts.push(`⚠️ алергени: ${allergens.join(", ")}`);
        const ing = ingByItem[it.id] || [];
        if (ing.length) parts.push(`склад: ${ing.join(", ")}`);
        if (it.cookMinutes) parts.push(`~${it.cookMinutes} хв`);
        return parts.join(" | ");
      }).join("\n");
      return `**${cat.emoji || ""}${cat.name}**\n${lines}`;
    }).filter(Boolean).join("\n\n");

    // Current cart context
    const cartCtx = cart?.length
      ? `Кошик гостя:\n${cart.map((c: any) => `• ${c.name} ×${c.quantity} (${(parseFloat(c.price) * c.quantity).toFixed(2)}₴)`).join("\n")}`
      : "Кошик порожній.";

    // Time of day greeting
    const h = new Date().getHours();
    const timeHint = h < 12 ? "ранок" : h < 17 ? "день" : h < 21 ? "вечір" : "ніч";

    const personalityHint = personality === "formal" ? "Офіційний, ввічливий, стриманий." :
      personality === "fun" ? "Енергійний, трохи грайливий, використовуй emoji помірно." :
      "Теплий, лаконічний, компетентний.";

    const systemPrompt = `Ти — ${waiterName}, AI-офіціант ресторану "${orgs[0].name}". Допомагаєш гостям через QR-меню. Час: ${timeHint}.

ХАРАКТЕР: ${personalityHint} Відповідай КОРОТКО (1-3 речення). Жодних списків з усіма стравами без потреби.

МОВА: Автоматично відповідай мовою гостя (укр/англ/польськ/рос тощо).${guestCtx}
${promoText ? `\nАКЦІЯ: ${promoText}` : ""}

ПОВЕДІНКА:
• Рекомендуй 1 доповнення за раз — не будь нав'язливим
• add_to_cart — ТІЛЬКИ якщо гість явно просить або підтверджує ("так", "ок", "додай", "беру")
• Після додавання: "✅ [Назва] — у вашому замовленні!"
• Якщо гість каже "все" або "готово" → перевір кошик: є напій? хліб? десерт?
• Якщо гість — постійний (є дані ГІСТЬ) → привітай його по імені тепло, можна нагадати що він замовляв раніше
• Знаєш алергени з меню, але ЗАВЖДИ додавай: "⚠️ Уточніть у персоналу — сліди алергенів можливі"
• Ніколи не вигадуй страви яких немає в меню

СОМЕЛЬЄ-ЗНАННЯ:
• Червоне → яловичина, баранина, паста з м'ясом, витримані сири
• Біле → риба, морепродукти, птиця, легкі салати
• Рожеве → піца, салати, легкі страви
• Просекко/шампанське → закуски, устриці, десерти
• Пиво → бургери, піца, смажене
• Якщо гість п'є чай → запропонуй мед/лимон якщо є в меню

ПОТОЧНИЙ КОШИК:
${cartCtx}

МЕНЮ (формат: [ID] Назва — Ціна | опис | теги | алергени | склад):
${menuCtx}

СПЕЦ: Якщо перше повідомлення "__greet__" → це початок сесії. ${greetingText || `Привітайся (1 речення), враховуй ${timeHint} та кошик.`} Запитай чим допомогти.`;

    const tools: any[] = [
      {
        type: "function",
        function: {
          name: "add_to_cart",
          description: "Додати страву до кошика. ТІЛЬКИ якщо гість явно просить або підтверджує.",
          parameters: {
            type: "object",
            properties: {
              item_id: { type: "integer", description: "ID страви з меню (число в [квадратних дужках])" },
              quantity: { type: "integer", description: "Кількість порцій, зазвичай 1", default: 1 },
              notes: { type: "string", description: "Побажання: без часнику, добре прожарений тощо" },
            },
            required: ["item_id", "quantity"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "remove_from_cart",
          description: "Видалити страву з кошика гостя",
          parameters: {
            type: "object",
            properties: {
              item_id: { type: "integer", description: "ID страви яку видалити" },
            },
            required: ["item_id"],
          },
        },
      },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      tools,
      tool_choice: "auto",
      max_tokens: 400,
      temperature: 0.75,
    });

    const msg = completion.choices[0].message;
    const actions: any[] = [];
    let reply = msg.content || "";

    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        try { actions.push({ type: tc.function.name, ...JSON.parse(tc.function.arguments) }); } catch {}
      }
      // If no text reply alongside tool calls, generate confirmation text
      if (!reply) {
        reply = actions.map(a => {
          const item = menuItems.find(i => i.id === a.item_id);
          if (a.type === "add_to_cart") return `✅ ${item?.name || "Страву"} додано до замовлення!${a.notes ? ` (${a.notes})` : ""}`;
          if (a.type === "remove_from_cart") return `❌ ${item?.name || "Страву"} видалено.`;
          return "";
        }).filter(Boolean).join(" ");
      }
    }

    return res.json({ reply: reply || "Слухаю вас!", actions });
  } catch (e: any) {
    console.error("AI WAITER ERROR:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
