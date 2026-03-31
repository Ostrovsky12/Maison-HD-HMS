import { db } from "@workspace/db";
import {
  organizationsTable,
  usersTable,
  propertiesTable,
  unitsTable,
  guestsTable,
  bookingsTable,
  addonsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logger } from "./logger.js";

async function hp(password: string) {
  return bcrypt.hash(password, 10);
}

export async function autoSeedIfEmpty() {
  try {
    const existing = await db.select().from(organizationsTable).limit(1);
    if (existing.length > 0) {
      logger.info("Database already seeded, skipping.");
      return;
    }

    logger.info("Empty database detected — running initial seed...");

    const [org] = await db.insert(organizationsTable).values({
      name: "Dogoda Resort",
      slug: "dogoda",
      plan: "enterprise",
      maxUnits: 9999,
      maxUsers: 9999,
    }).returning();

    await db.insert(usersTable).values([
      {
        email: "admin@hms.app",
        name: "Super Admin",
        passwordHash: await hp("admin123"),
        role: "super_admin",
        organizationId: null,
      },
      {
        email: "owner@dogoda.com",
        name: "Owner Dogoda",
        passwordHash: await hp("owner123"),
        role: "owner",
        organizationId: org.id,
      },
      {
        email: "reception@dogoda.com",
        name: "Рецепція",
        passwordHash: await hp("reception123"),
        role: "reception",
        organizationId: org.id,
      },
      {
        email: "hk@dogoda.com",
        name: "Покоївка",
        passwordHash: await hp("hk123"),
        role: "housekeeping",
        organizationId: org.id,
      },
    ]);

    const [houseProp] = await db.insert(propertiesTable).values({
      organizationId: org.id, name: "Будинки", type: "house", description: "Котеджи та будинки для сімейного відпочинку",
    }).returning();

    const [hotelProp] = await db.insert(propertiesTable).values({
      organizationId: org.id, name: "Готель", type: "hotel", description: "Готельний корпус",
    }).returning();

    const [spaProp] = await db.insert(propertiesTable).values({
      organizationId: org.id, name: "SPA-центр", type: "spa", description: "Термальна зона та SPA",
    }).returning();

    const [poolProp] = await db.insert(propertiesTable).values({
      organizationId: org.id, name: "Басейн", type: "pool", description: "Відкритий басейн",
    }).returning();

    const [bungalowProp] = await db.insert(propertiesTable).values({
      organizationId: org.id, name: "Бунгало", type: "bungalow", description: "Бунгало біля басейну",
    }).returning();

    const views = ["garden", "park", "pool", null, null, "garden", "park", null, "garden"];
    const houseUnits = [
      ...Array.from({ length: 9 }, (_, i) => ({
        propertyId: houseProp.id, name: `Будинок ${i + 1} (1 спальня)`,
        category: "Будинок 1 спальня", capacity: 3, basePrice: "2500",
        hasBalcony: i % 2 === 0, hasView: views[i] as any || null,
        squareMeters: String(42 + i * 2),
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        propertyId: houseProp.id, name: `Будинок ${i + 10} (2 спальні)`,
        category: "Будинок 2 спальні", capacity: 6, basePrice: "3800",
        hasBalcony: true, hasView: ["garden", "park", "pool", "garden", "park"][i] as any,
        squareMeters: String(68 + i * 4),
      })),
    ];
    await db.insert(unitsTable).values(houseUnits);

    const hotelUnits = [
      ...Array.from({ length: 18 }, (_, i) => ({
        propertyId: hotelProp.id, name: `Номер ${101 + i}`,
        category: "Стандарт", capacity: 2,
        floor: Math.floor(i / 6) + 1, basePrice: "1500",
        hasBalcony: i % 3 === 0, squareMeters: "24",
        hasView: (i % 4 === 0 ? "city" : i % 4 === 1 ? "garden" : null) as any,
      })),
      { propertyId: hotelProp.id, name: "Люкс 201", category: "Люкс", capacity: 4, floor: 2, basePrice: "4500", hasBalcony: true, hasView: "city" as any, squareMeters: "62" },
    ];
    await db.insert(unitsTable).values(hotelUnits);

    const spaUnits = [
      ...Array.from({ length: 16 }, (_, i) => ({
        propertyId: spaProp.id, name: `SPA-кабіна ${i + 1}`,
        category: "Термальна зона", capacity: 2, basePrice: "800",
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        propertyId: spaProp.id, name: `Outdoor Jacuzzi ${i + 1}`,
        category: "Outdoor Jacuzzi", capacity: 4, basePrice: "1200",
      })),
    ];
    await db.insert(unitsTable).values(spaUnits);

    await db.insert(unitsTable).values(
      Array.from({ length: 30 }, (_, i) => ({
        propertyId: poolProp.id, name: `Шезлонг ${i + 1}`,
        category: "Шезлонг", capacity: 1, basePrice: "300",
      }))
    );

    await db.insert(unitsTable).values(
      Array.from({ length: 14 }, (_, i) => ({
        propertyId: bungalowProp.id, name: `Бунгало ${i + 1}`,
        category: "Бунгало", capacity: 4, basePrice: "2000",
      }))
    );

    await db.insert(addonsTable).values([
      { organizationId: org.id, name: "Оренда велосипеда", description: "Велосипед на день", price: "150", unit: "per day", maxQuantity: 20 },
      { organizationId: org.id, name: "Оренда вудочки", description: "Рибальська вудочка", price: "100", unit: "per day", maxQuantity: 15 },
      { organizationId: org.id, name: "Трансфер", description: "Трансфер від/до аеропорту", price: "500", unit: "per trip" },
      { organizationId: org.id, name: "Барбекю-набір", description: "Мангал + вугілля + приналежності", price: "200", unit: "per session" },
    ]);

    const guestRows = await db.insert(guestsTable).values([
      { organizationId: org.id, firstName: "Іван", lastName: "Петренко", email: "ivan@example.com", phone: "+380501234567" },
      { organizationId: org.id, firstName: "Марія", lastName: "Коваль", email: "maria@example.com", phone: "+380671234567" },
      { organizationId: org.id, firstName: "Олег", lastName: "Сидоренко", email: "oleg@example.com", phone: "+380631234567" },
      { organizationId: org.id, firstName: "Анна", lastName: "Мельник", email: "anna@example.com", phone: "+380991234567" },
      { organizationId: org.id, firstName: "Дмитро", lastName: "Бойко", email: "dmytro@example.com", phone: "+380661234567" },
    ]).returning();

    const houses = await db.select().from(unitsTable).where(eq(unitsTable.propertyId, houseProp.id));
    const hotelUnitsDb = await db.select().from(unitsTable).where(eq(unitsTable.propertyId, hotelProp.id));

    const today = new Date();
    const d = (offset: number) => {
      const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      return dt.toISOString().split("T")[0];
    };

    await db.insert(bookingsTable).values([
      {
        unitId: houses[0].id, guestId: guestRows[0].id,
        checkIn: d(-2), checkOut: d(3),
        status: "checked_in", paymentStatus: "partial", source: "direct",
        guestsCount: 2, totalAmount: "12500", paidAmount: "6250",
      },
      {
        unitId: houses[1].id, guestId: guestRows[1].id,
        checkIn: d(1), checkOut: d(5),
        status: "confirmed", paymentStatus: "unpaid", source: "booking",
        guestsCount: 4, totalAmount: "15200", paidAmount: "0",
      },
      {
        unitId: hotelUnitsDb[0].id, guestId: guestRows[2].id,
        checkIn: d(0), checkOut: d(2),
        status: "checked_in", paymentStatus: "paid", source: "direct",
        guestsCount: 2, totalAmount: "3000", paidAmount: "3000",
      },
      {
        unitId: hotelUnitsDb[1].id, guestId: guestRows[3].id,
        checkIn: d(-5), checkOut: d(-1),
        status: "checked_out", paymentStatus: "paid", source: "airbnb",
        guestsCount: 1, totalAmount: "6000", paidAmount: "6000",
      },
      {
        unitId: houses[3].id, guestId: guestRows[4].id,
        checkIn: d(7), checkOut: d(12),
        status: "pending", paymentStatus: "unpaid", source: "direct",
        guestsCount: 3, totalAmount: "19000", paidAmount: "0",
      },
    ]);

    logger.info("Auto-seed complete. Users: owner@dogoda.com/owner123, reception@dogoda.com/reception123");
  } catch (err) {
    logger.error({ err }, "Auto-seed failed");
  }
}
