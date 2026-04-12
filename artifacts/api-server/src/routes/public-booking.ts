import { Router } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import {
  propertiesTable, unitsTable, bookingsTable, organizationsTable,
  fbCategoriesTable, fbItemsTable, fbTablesTable, fbOrdersTable, fbOrderItemsTable,
  ratesTable, channelRateSettingsTable,
} from "@workspace/db";
import { eq, and, or, gte, lte, ne, inArray, notInArray, sql, asc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateLiqPayForm, verifyLiqPayCallback, parseLiqPayData } from "../lib/liqpay.js";
import { fireBookingEvent } from "../lib/automation-runner.js";
import { sendGuestConfirmationEmail, sendGuestConfirmationSms, notifyBookingCreated } from "../lib/notify.js";

const router = Router();

// ─── GET /properties — by slug or all ────────────────────────────────────────
router.get("/properties", async (req, res) => {
  try {
    const { slug } = req.query as any;

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

    res.json({ properties: props, organization });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /availability — search available rooms ───────────────────────────────
router.get("/availability", async (req, res) => {
  try {
    const { slug, propertyId, checkIn, checkOut, guests = "1" } = req.query as any;
    if (!checkIn || !checkOut) return res.status(400).json({ error: "checkIn and checkOut required" });

    // Resolve org/property scope
    let propIds: number[] = [];
    if (propertyId) {
      propIds = [parseInt(propertyId)];
    } else if (slug) {
      const orgs = await db.select({ id: organizationsTable.id })
        .from(organizationsTable).where(eq(organizationsTable.slug, slug));
      if (!orgs.length) return res.status(404).json({ error: "Organization not found" });
      const orgProps = await db.select({ id: propertiesTable.id })
        .from(propertiesTable).where(eq(propertiesTable.organizationId, orgs[0].id));
      propIds = orgProps.map(p => p.id);
    }
    if (propIds.length === 0) return res.json({ units: [], nights: 0, checkIn, checkOut, guests });

    // Find booked unit IDs during this period
    const bookedRows = await db.select({ unitId: bookingsTable.unitId }).from(bookingsTable)
      .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
      .where(and(
        inArray(unitsTable.propertyId, propIds),
        ne(bookingsTable.status, "cancelled" as any),
        or(
          and(gte(bookingsTable.checkIn, checkIn), lte(bookingsTable.checkIn, checkOut)),
          and(gte(bookingsTable.checkOut, checkIn), lte(bookingsTable.checkOut, checkOut)),
          and(lte(bookingsTable.checkIn, checkIn), gte(bookingsTable.checkOut, checkOut)),
        ),
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

    res.json({ units: result, nights, checkIn, checkOut, guests, totalUnits: result.length });
  } catch (e: any) { console.error("AVAILABILITY ERROR:", e); res.status(500).json({ error: e.message }); }
});

// ─── POST /bookings — create booking (no auth) ───────────────────────────────
router.post("/bookings", async (req, res) => {
  try {
    const { unitId, checkIn, checkOut, firstName, lastName, email, phone, guestsCount, specialRequests, adults, children } = req.body;
    if (!unitId || !checkIn || !checkOut || !firstName || !lastName) {
      return res.status(400).json({ error: "Заповніть всі обов'язкові поля" });
    }

    // Check availability
    const conflicts = await db.select({ id: bookingsTable.id }).from(bookingsTable)
      .where(and(
        eq(bookingsTable.unitId, parseInt(unitId)),
        ne(bookingsTable.status, "cancelled" as any),
        or(
          and(gte(bookingsTable.checkIn, checkIn), lte(bookingsTable.checkIn, checkOut)),
          and(gte(bookingsTable.checkOut, checkIn), lte(bookingsTable.checkOut, checkOut)),
          and(lte(bookingsTable.checkIn, checkIn), gte(bookingsTable.checkOut, checkOut)),
        ),
      ));
    if (conflicts.length > 0) return res.status(409).json({ error: "Номер вже заброньований на ці дати" });

    // Get unit info
    const [unit] = await db.select({
      id: unitsTable.id, basePrice: unitsTable.basePrice, propertyId: unitsTable.propertyId, name: unitsTable.name,
    }).from(unitsTable).where(eq(unitsTable.id, parseInt(unitId)));
    if (!unit) return res.status(404).json({ error: "Юніт не знайдено" });

    const [prop] = await db.select({ id: propertiesTable.id, name: propertiesTable.name, organizationId: propertiesTable.organizationId })
      .from(propertiesTable).where(eq(propertiesTable.id, unit.propertyId));

    const nights = Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));
    const totalAmount = parseFloat(String(unit.basePrice || 0)) * nights;

    const refNum = Math.floor(100000 + Math.random() * 900000);
    const bookingRef = `BK-${refNum}`;
    const guestAccessCode = randomBytes(5).toString("hex").toUpperCase();
    const totalGuests = parseInt(String(guestsCount || adults || 1));

    const totalAdults = parseInt(String(adults || guestsCount || 1));
    const totalChildren = parseInt(String(children || 0));

    const [booking] = await db.insert(bookingsTable).values({
      unitId: parseInt(unitId),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      guestsCount: totalGuests,
      adults: totalAdults,
      childrenUnder6: Math.ceil(totalChildren / 2),
      childrenOver6: Math.floor(totalChildren / 2),
      checkIn, checkOut,
      status: "pending" as any,
      paymentStatus: "unpaid" as any,
      totalAmount: String(totalAmount),
      paidAmount: "0",
      notes: specialRequests || null,
      bookingRef,
      guestAccessCode,
      source: "direct" as any,
    } as any).returning();

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

        // Fire automation engine
        fireBookingEvent("booking_created", orgId, (booking as any).id).catch(() => {});

        // Notify admin (email + telegram + SMS)
        notifyBookingCreated(orgId, {
          id: (booking as any).id,
          guestName: `${firstName} ${lastName}`,
          unitName: unit.name,
          checkIn, checkOut,
          totalAmount: Math.round(totalAmount),
        }).catch(() => {});

        // Guest confirmation email
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

        // Guest confirmation SMS
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

    res.json({
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
  } catch (e: any) { console.error("POST BOOKING ERROR:", e.message, e.stack); res.status(500).json({ error: e.message }); }
});

// ─── POST /liqpay/:bookingId — generate payment form (public) ─────────────────
router.post("/liqpay/:bookingId", async (req, res) => {
  try {
    if (!process.env.LIQPAY_PUBLIC_KEY || !process.env.LIQPAY_PRIVATE_KEY) {
      return res.status(503).json({
        error: "liqpay_not_configured",
        message: "Онлайн-оплата тимчасово недоступна. Оплатіть при заїзді.",
      });
    }

    const bookingId = parseInt(req.params.bookingId);
    const [result] = await db.select({
      id: bookingsTable.id,
      bookingRef: sql<string>`${bookingsTable}.booking_ref`,
      totalAmount: bookingsTable.totalAmount,
      paidAmount: bookingsTable.paidAmount,
      paymentStatus: bookingsTable.paymentStatus,
      firstName: bookingsTable.firstName,
      lastName: bookingsTable.lastName,
      email: bookingsTable.email,
    }).from(bookingsTable)
      .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(bookingsTable.id, bookingId)).limit(1);

    if (!result) return res.status(404).json({ error: "Бронювання не знайдено" });
    if (result.paymentStatus === "paid") return res.status(400).json({ error: "Бронювання вже оплачено" });

    const amount = Math.max(
      0,
      parseFloat(result.totalAmount?.toString() || "0") - parseFloat(result.paidAmount?.toString() || "0"),
    );
    if (amount <= 0) return res.status(400).json({ error: "Сума до оплати = 0" });

    const baseUrl = process.env.API_BASE_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "localhost"}`;
    const { data, signature } = generateLiqPayForm({
      action: "pay",
      amount,
      currency: "UAH",
      description: `Бронювання ${result.bookingRef || result.id} — ${result.firstName} ${result.lastName}`,
      orderId: `booking_${result.id}`,
      serverUrl: `${baseUrl}/api/public/liqpay/callback`,
    });

    res.json({ data, signature, amount });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── POST /liqpay/callback — LiqPay server callback (public) ─────────────────
router.post("/liqpay/callback", async (req, res) => {
  try {
    const { data, signature } = req.body;
    if (!verifyLiqPayCallback(data, signature)) {
      return res.status(400).json({ error: "invalid_signature" });
    }

    const parsed = parseLiqPayData(data);
    if (!parsed?.order_id) return res.status(400).json({ error: "no_order_id" });

    const bookingId = parseInt(parsed.order_id.toString().replace("booking_", "").replace(/\D/g, ""));
    if (!bookingId) return res.status(400).json({ error: "invalid_order_id" });

    if (parsed.status === "success" || parsed.status === "sandbox") {
      const paid = parseFloat(parsed.amount?.toString() || "0");
      const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
      if (booking) {
        const total = parseFloat(booking.totalAmount?.toString() || "0");
        const prevPaid = parseFloat(booking.paidAmount?.toString() || "0");
        const newPaid = prevPaid + paid;
        await db.update(bookingsTable).set({
          paidAmount: newPaid.toFixed(2),
          paymentStatus: newPaid >= total - 0.01 ? "paid" as any : "partial" as any,
          updatedAt: new Date(),
        }).where(eq(bookingsTable.id, bookingId));
      }
    }

    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /menu/:orgSlug — public F&B menu for QR ordering ────────────────────
router.get("/menu/:orgSlug", async (req, res) => {
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

    res.json({ org: { id: orgId, name: orgs[0].name, slug: orgs[0].slug }, categories: catMap });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
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

    res.json({ table: tables[0], org: { name: orgs[0].name } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
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

    res.status(201).json({ orderId: order.id, orderNumber: order.id, total: totalAmount });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /bookings/:ref — get by reference ────────────────────────────────────
router.get("/bookings/:ref", async (req, res) => {
  try {
    const results = await db.select({
      id: bookingsTable.id,
      firstName: bookingsTable.firstName, lastName: bookingsTable.lastName,
      email: bookingsTable.email, phone: bookingsTable.phone,
      checkIn: bookingsTable.checkIn, checkOut: bookingsTable.checkOut,
      status: bookingsTable.status, totalAmount: bookingsTable.totalAmount,
      unitName: unitsTable.name,
      propertyName: propertiesTable.name, propertyAddress: propertiesTable.address,
    }).from(bookingsTable)
      .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(sql`${bookingsTable}.booking_ref = ${req.params.ref}`)
      .limit(1);

    if (!results.length) return res.status(404).json({ error: "Бронювання не знайдено" });
    res.json({ booking: results[0] });
  } catch (e: any) { console.error("GET BOOKING ERROR:", e.message); res.status(500).json({ error: e.message }); }
});

// ─── GET /rates — active rate for a property & channel (public, no auth) ──────
// Returns the rate configured for a specific channel (default: 'online').
// If no channel config, returns null. The booking form applies price from this rate.
router.get("/rates", async (req, res) => {
  try {
    const { propertyId, unitId, checkIn, checkOut, channel = "online" } = req.query as any;
    if (!propertyId) return res.status(400).json({ error: "propertyId required" });

    // Look up channel rate setting for this property & channel
    const [setting] = await db.select().from(channelRateSettingsTable)
      .where(and(
        eq(channelRateSettingsTable.propertyId, parseInt(propertyId)),
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

    res.json({
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
  } catch (e: any) { console.error("GET PUBLIC RATES ERROR:", e.message); res.status(500).json({ error: e.message }); }
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
    res.json({ guest: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── POST /ai-waiter/chat — AI waiter for QR ordering ────────────────────────
router.post("/ai-waiter/chat", async (req, res) => {
  try {
    const { orgSlug, messages, cart, guestPhone } = req.body;
    if (!orgSlug || !Array.isArray(messages)) return res.status(400).json({ error: "orgSlug and messages required" });

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

    res.json({ reply: reply || "Слухаю вас!", actions });
  } catch (e: any) {
    console.error("AI WAITER ERROR:", e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
