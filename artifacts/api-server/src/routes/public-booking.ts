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

const router = Router();

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
    if (!checkIn || !checkOut) return res.status(400).json({ error: "checkIn and checkOut required" });
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (!Number.isFinite(checkInDate.getTime()) || !Number.isFinite(checkOutDate.getTime()) || checkInDate >= checkOutDate) {
      return res.status(400).json({ error: "Invalid date range" });
    }

    // Resolve org from slug
    const orgs = await db.select({ id: organizationsTable.id })
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
        lt(bookingsTable.checkIn, checkOut),
        gt(bookingsTable.checkOut, checkIn),
      ));
    const bookedIds: number[] = bookedRows.map(r => r.unitId).filter(Boolean) as number[];

    // Get available units
    const whereConds: any[] = [
      inArray(unitsTable.propertyId, propIds),
      ne(unitsTable.status, "maintenance" as any),
      ne(unitsTable.status, "inactive" as any),
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

    const result = units.map(u => ({
      ...u,
      basePrice: parseFloat(String(u.basePrice || 0)),
      nights,
      totalPrice: parseFloat(String(u.basePrice || 0)) * nights,
    }));

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
    const [org] = await db.select({ id: organizationsTable.id })
      .from(organizationsTable).where(eq(organizationsTable.slug, slug));
    if (!org) return res.status(404).json({ error: "Organization not found" });

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
    const totalAmount = Math.max(0, Math.round((subtotal - discount) * 100) / 100);

    const refNum = Math.floor(100000 + Math.random() * 900000);
    const bookingRef = `BK-${refNum}`;
    const guestAccessCode = randomBytes(5).toString("hex").toUpperCase();

    const client = await pool.connect();
    let booking: any;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(90421, $1)", [parsedUnitId]);

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

      const inserted = await client.query(
        `INSERT INTO bookings (
           organization_id, unit_id, first_name, last_name, email, phone,
           guests_count, adults, children_under_6, children_over_6,
           check_in, check_out, status, payment_status, total_amount, paid_amount,
           notes, booking_ref, guest_access_code, source, created_at, updated_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11::date, $12::date, 'pending', 'unpaid', $13, 0,
           $14, $15, $16, 'direct', NOW(), NOW()
         )
         RETURNING *`,
        [
          org.id, parsedUnitId, firstName.trim(), lastName.trim(),
          email?.trim() || null, phone?.trim() || null,
          totalGuests, totalAdults, Math.ceil(totalChildren / 2), Math.floor(totalChildren / 2),
          checkIn, checkOut, totalAmount.toFixed(2), specialRequests || null,
          bookingRef, guestAccessCode,
        ],
      );
      booking = inserted.rows[0];
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    // Fire automation event + notifications (non-blocking)
    if ((booking as any).id) {
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
            orgName: unitWithProp.orgName || undefined,
            orgEmail: unitWithProp.orgEmail || undefined,
            orgPhone: unitWithProp.orgPhone || undefined,
          }).catch(() => {});
        }

        // Guest confirmation SMS (non-blocking)
        if (phone) {
          sendGuestConfirmationSms(orgId, phone, {
            bookingRef,
            propertyName: prop?.name || "Готель",
            checkIn, checkOut,
            totalAmount: Math.round(totalAmount),
          }).catch(() => {});
        }
      }
    }

    return res.json({
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
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [liqpayOrderId]);

      const existing = await client.query(
        "SELECT id FROM payments WHERE liqpay_order_id = $1 LIMIT 1",
        [liqpayOrderId],
      );
      if (existing.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.json({ ok: true });
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
        return res.json({ ok: true });
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
      client.release();
    }

    return res.json({ ok: true });
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

    const items = await db.select().from(fbItemsTable)
      .where(and(eq(fbItemsTable.organizationId, orgId), eq(fbItemsTable.isAvailable, true)))
      .orderBy(asc(fbItemsTable.sortOrder));

    const catMap = cats.map(cat => ({
      ...cat,
      items: items.filter(i => i.categoryId === cat.id),
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
  try {
    const { orgSlug, tableId, guestName, guestCount, items, notes, guestPhone } = req.body;
    if (!orgSlug || !items?.length) return res.status(400).json({ error: "orgSlug та items обов'язкові" });

    const orgs = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, orgSlug));
    if (!orgs.length) return res.status(404).json({ error: "Organization not found" });
    const orgId = orgs[0].id;

    let tableRecord: any = null;
    if (tableId) {
      const tables = await db.select().from(fbTablesTable).where(and(eq(fbTablesTable.id, parseInt(tableId)), eq(fbTablesTable.organizationId, orgId)));
      tableRecord = tables[0] || null;
    }

    const totalAmount = items.reduce((s: number, i: any) => s + parseFloat(i.price || 0) * (i.quantity || 1), 0);

    const [order] = await db.insert(fbOrdersTable).values({
      organizationId: orgId,
      tableId: tableRecord?.id || null,
      orderType: tableRecord ? "dine_in" : "room_service",
      guestName: guestName || "Гість (QR)",
      guestCount: guestCount || 1,
      roomNumber: tableRecord ? `Стіл ${tableRecord.number}` : null,
      status: "open",
      totalAmount: String(totalAmount),
      notes: notes || null,
    }).returning();

    const itemValues = items.map((i: any) => ({
      orderId: order.id,
      organizationId: orgId,
      itemId: i.id || null,
      name: i.name,
      price: String(i.price),
      quantity: i.quantity || 1,
      totalPrice: String(parseFloat(i.price) * (i.quantity || 1)),
      notes: i.notes || null,
    }));
    await db.insert(fbOrderItemsTable).values(itemValues);

    if (tableRecord) {
      await db.update(fbTablesTable).set({ status: "occupied", currentOrderId: order.id }).where(eq(fbTablesTable.id, tableRecord.id));
    }

    // Upsert fb_customers + append order_history if phone provided
    if (guestPhone) {
      try {
        const db_ = (db as any).$client;
        const historyEntry = {
          order_id: order.id,
          date: new Date().toISOString(),
          items: items.map((i: any) => ({ name: i.name, qty: i.quantity || 1, price: i.price })),
          total: totalAmount,
        };
        await db_.query(`
          INSERT INTO fb_customers (organization_id, name, phone, visits_count, total_spent, last_visit_at, order_history)
          VALUES ($1, $2, $3, 1, $4, NOW(), $5::jsonb)
          ON CONFLICT (organization_id, phone) DO UPDATE SET
            name           = COALESCE(EXCLUDED.name, fb_customers.name),
            visits_count   = fb_customers.visits_count + 1,
            total_spent    = fb_customers.total_spent + $4,
            last_visit_at  = NOW(),
            order_history  = (COALESCE(fb_customers.order_history, '[]'::jsonb) || $5::jsonb)
        `, [orgId, guestName || null, guestPhone, totalAmount, JSON.stringify([historyEntry])]);
      } catch (guestErr: any) {
        console.warn("Guest upsert warn:", guestErr.message);
      }
    }

    return res.status(201).json({ orderId: order.id, orderNumber: order.id, total: totalAmount });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
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
