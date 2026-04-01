import { Router } from "express";
import { db } from "@workspace/db";
import {
  propertiesTable, unitsTable, bookingsTable, organizationsTable,
} from "@workspace/db";
import { eq, and, or, gte, lte, ne, inArray, notInArray, sql } from "drizzle-orm";

const router = Router();

// ─── GET /properties — list all public properties ───────────────────────────
router.get("/properties", async (_req, res) => {
  try {
    const props = await db.select({
      id: propertiesTable.id,
      name: propertiesTable.name,
      address: propertiesTable.address,
      organizationId: propertiesTable.organizationId,
      orgName: organizationsTable.name,
    }).from(propertiesTable)
      .innerJoin(organizationsTable, eq(propertiesTable.organizationId, organizationsTable.id));
    res.json({ properties: props });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /availability — search available rooms ───────────────────────────────
router.get("/availability", async (req, res) => {
  try {
    const { propertyId, checkIn, checkOut, guests = "1" } = req.query as any;
    if (!checkIn || !checkOut) return res.status(400).json({ error: "checkIn and checkOut required" });

    // Find units that are booked during this period
    const bookedUnitIds = propertyId
      ? await db.select({ unitId: bookingsTable.unitId }).from(bookingsTable)
          .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
          .where(and(
            eq(unitsTable.propertyId, parseInt(propertyId)),
            ne(bookingsTable.status, "cancelled" as any),
            or(
              and(gte(bookingsTable.checkIn, checkIn), lte(bookingsTable.checkIn, checkOut)),
              and(gte(bookingsTable.checkOut, checkIn), lte(bookingsTable.checkOut, checkOut)),
              and(lte(bookingsTable.checkIn, checkIn), gte(bookingsTable.checkOut, checkOut)),
            ),
          ))
      : [];

    const bookedIds = bookedUnitIds.map(r => r.unitId);

    // Get available units
    let q = db.select({
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
      .where(and(
        ne(unitsTable.status, "maintenance" as any),
        propertyId ? eq(unitsTable.propertyId, parseInt(propertyId)) : sql`true`,
        bookedIds.length > 0 ? notInArray(unitsTable.id, bookedIds) : sql`true`,
        parseInt(guests) > 0 ? gte(unitsTable.capacity, parseInt(guests)) : sql`true`,
      ));

    const units = await q;

    // Calculate nights and total prices
    const cin = new Date(checkIn);
    const cout = new Date(checkOut);
    const nights = Math.max(1, Math.round((cout.getTime() - cin.getTime()) / 86400000));

    const result = units.map(u => ({
      ...u,
      nights,
      totalPrice: parseFloat(String(u.basePrice || 0)) * nights,
    }));

    res.json({ units: result, nights, checkIn, checkOut, guests });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── POST /bookings — create booking (no auth) ───────────────────────────────
router.post("/bookings", async (req, res) => {
  try {
    const { unitId, checkIn, checkOut, firstName, lastName, email, phone, guestsCount, specialRequests } = req.body;
    if (!unitId || !checkIn || !checkOut || !firstName || !lastName || !email) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check availability again
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

    // Get unit info for total price
    const [unit] = await db.select({
      id: unitsTable.id, basePrice: unitsTable.basePrice,
      propertyId: unitsTable.propertyId,
    }).from(unitsTable).where(eq(unitsTable.id, parseInt(unitId)));
    if (!unit) return res.status(404).json({ error: "Unit not found" });

    const [prop] = await db.select({ organizationId: propertiesTable.organizationId, name: propertiesTable.name })
      .from(propertiesTable).where(eq(propertiesTable.id, unit.propertyId));

    const nights = Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));
    const totalAmount = parseFloat(String(unit.basePrice || 0)) * nights;

    // Generate booking reference
    const refNum = Math.floor(100000 + Math.random() * 900000);
    const bookingRef = `DOG-${refNum}`;

    const [booking] = await db.insert(bookingsTable).values({
      unitId: parseInt(unitId),
      firstName, lastName, email, phone,
      guestsCount: parseInt(String(guestsCount || 1)),
      checkIn, checkOut,
      status: "pending" as any,
      totalAmount: String(totalAmount),
      notes: specialRequests || null,
      bookingRef,
    } as any).returning();

    res.json({
      booking: {
        id: booking.id,
        bookingRef: (booking as any).bookingRef || bookingRef,
        firstName, lastName, email,
        checkIn, checkOut, nights,
        totalAmount, propertyName: prop?.name,
        status: "pending",
      },
    });
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
      unitName: unitsTable.name, unitType: unitsTable.type,
      propertyName: propertiesTable.name, propertyAddress: propertiesTable.address,
    }).from(bookingsTable)
      .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(sql`${bookingsTable}.booking_ref = ${req.params.ref}`)
      .limit(1);

    if (!results.length) return res.status(404).json({ error: "Бронювання не знайдено" });
    res.json({ booking: results[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
