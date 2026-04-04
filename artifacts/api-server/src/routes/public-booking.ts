import { Router } from "express";
import { db } from "@workspace/db";
import {
  propertiesTable, unitsTable, bookingsTable, organizationsTable,
} from "@workspace/db";
import { eq, and, or, gte, lte, ne, inArray, notInArray, sql } from "drizzle-orm";
import { generateLiqPayForm, verifyLiqPayCallback, parseLiqPayData } from "../lib/liqpay.js";
import { fireBookingEvent } from "../lib/automation-runner.js";

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
      source: "direct" as any,
    } as any).returning();

    // Fire automation event (non-blocking)
    if ((booking as any).id) {
      const [unitWithProp] = await db.select({ orgId: propertiesTable.organizationId })
        .from(unitsTable).innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
        .where(eq(unitsTable.id, unit.id)).limit(1).catch(() => []);
      if (unitWithProp?.orgId) {
        fireBookingEvent("booking_created", unitWithProp.orgId, (booking as any).id).catch(() => {});
      }
    }

    res.json({
      booking: {
        id: booking.id,
        bookingRef: (booking as any).bookingRef || bookingRef,
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

export default router;
