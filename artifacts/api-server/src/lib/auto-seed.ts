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
import { eq, sql } from "drizzle-orm";
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

    // ─── Super Admin (no org) ─────────────────────────────────────────────────
    const saEmail = process.env.SUPER_ADMIN_EMAIL || "owner@maisonhd.com";
    const saPassword = process.env.SUPER_ADMIN_PASSWORD || "Maison2026!";
    await db.insert(usersTable).values({
      email: saEmail,
      name: "Super Admin",
      passwordHash: await hp(saPassword),
      role: "super_admin",
      organizationId: null,
    });

    // ─── Org 1: Котеджний комплекс ДОГОДА ─────────────────────────────────────
    const [dogodaOrg] = await db.insert(organizationsTable).values({
      name: "Котеджний комплекс ДОГОДА",
      slug: "dogoda",
      plan: "pro",
      maxUnits: 200,
      maxUsers: 20,
    }).returning();

    await db.insert(usersTable).values([
      {
        email: "admin@dogoda.com.ua",
        name: "Дмитро Головко",
        passwordHash: await hp("Dogoda2026!"),
        role: "owner",
        organizationId: dogodaOrg.id,
      },
      {
        email: "reception@dogoda.com.ua",
        name: "Рецепція ДОГОДА",
        passwordHash: await hp("reception123"),
        role: "reception",
        organizationId: dogodaOrg.id,
      },
    ]);

    // Property: Котеджний комплекс ДОГОДА (с. Дзвінкове, Київська обл.)
    const [dogodaProp] = await db.insert(propertiesTable).values({
      organizationId: dogodaOrg.id,
      name: "Котеджний комплекс ДОГОДА",
      type: "house",
      description: "Котеджний комплекс у с. Дзвінкове, Київська обл., 08620",
      address: "с. Дзвінкове, Київська обл., 08620",
    }).returning();

    // 12 cottages matching Servio structure
    const cottages = [
      { name: "Котедж 1 (STD)", category: "STD Стандарт", capacity: 4, basePrice: "2800" },
      { name: "Котедж 2 (STD)", category: "STD Стандарт", capacity: 4, basePrice: "2800" },
      { name: "Котедж 3 (STD)", category: "STD Стандарт", capacity: 4, basePrice: "2800" },
      { name: "Котедж 4 (DLX)", category: "DLX Делюкс",  capacity: 6, basePrice: "3800" },
      { name: "Котедж 5 (DLX)", category: "DLX Делюкс",  capacity: 6, basePrice: "3800" },
      { name: "Котедж 6 (DLX)", category: "DLX Делюкс",  capacity: 6, basePrice: "3800" },
      { name: "Котедж 7 (VIP)", category: "VIP",          capacity: 8, basePrice: "5500" },
      { name: "Котедж 8 (VIP)", category: "VIP",          capacity: 8, basePrice: "5500" },
      { name: "Котедж 9 (VIP)", category: "VIP",          capacity: 8, basePrice: "5500" },
      { name: "Котедж 10 (EUR)", category: "EUR Євро",    capacity: 10, basePrice: "7200" },
      { name: "Котедж 11 (EUR)", category: "EUR Євро",    capacity: 10, basePrice: "7200" },
      { name: "Котедж 12 (EUR)", category: "EUR Євро",    capacity: 10, basePrice: "7200" },
    ];

    const dogodaUnits = await db.insert(unitsTable).values(
      cottages.map(c => ({ propertyId: dogodaProp.id, ...c }))
    ).returning();

    // Addons
    await db.insert(addonsTable).values([
      { organizationId: dogodaOrg.id, name: "Баня/сауна", description: "Приватна баня на 2 год", price: "500", unit: "per session" },
      { organizationId: dogodaOrg.id, name: "Барбекю-набір", description: "Мангал + вугілля", price: "200", unit: "per session" },
      { organizationId: dogodaOrg.id, name: "Трансфер Коломия", description: "Трансфер від/до Коломиї", price: "600", unit: "per trip" },
    ]);

    // Guests
    const dogodaGuests = await db.insert(guestsTable).values([
      { organizationId: dogodaOrg.id, firstName: "Андрій", lastName: "Кравченко", phone: "+380501234501" },
      { organizationId: dogodaOrg.id, firstName: "Олена", lastName: "Бондаренко", phone: "+380671234502" },
      { organizationId: dogodaOrg.id, firstName: "Василь", lastName: "Ткаченко", phone: "+380631234503" },
      { organizationId: dogodaOrg.id, firstName: "Наталія", lastName: "Мороз", phone: "+380991234504" },
      { organizationId: dogodaOrg.id, firstName: "Ігор", lastName: "Лисенко", phone: "+380661234505" },
      { organizationId: dogodaOrg.id, firstName: "Тетяна", lastName: "Гончаренко", phone: "+380731234506" },
      { organizationId: dogodaOrg.id, firstName: "Михайло", lastName: "Савченко", phone: "+380971234507" },
      { organizationId: dogodaOrg.id, firstName: "Людмила", lastName: "Яременко", phone: "+380501234508" },
    ]).returning();

    const d = (offset: number) => {
      const dt = new Date();
      dt.setHours(0, 0, 0, 0);
      dt.setDate(dt.getDate() + offset);
      return dt.toISOString().split("T")[0];
    };

    const u = dogodaUnits;
    const g = dogodaGuests;

    await db.insert(bookingsTable).values([
      {
        unitId: u[0].id, guestId: g[0].id,
        checkIn: d(-3), checkOut: d(2),
        status: "checked_in", paymentStatus: "partial", source: "direct",
        guestsCount: 4, totalAmount: "14000", paidAmount: "7000",
        lastName: g[0].lastName, firstName: g[0].firstName,
      },
      {
        unitId: u[3].id, guestId: g[1].id,
        checkIn: d(1), checkOut: d(5),
        status: "confirmed", paymentStatus: "unpaid", source: "booking",
        guestsCount: 5, totalAmount: "15200", paidAmount: "0",
        lastName: g[1].lastName, firstName: g[1].firstName,
      },
      {
        unitId: u[6].id, guestId: g[2].id,
        checkIn: d(-1), checkOut: d(3),
        status: "checked_in", paymentStatus: "paid", source: "direct",
        guestsCount: 6, totalAmount: "22000", paidAmount: "22000",
        lastName: g[2].lastName, firstName: g[2].firstName,
      },
      {
        unitId: u[9].id, guestId: g[3].id,
        checkIn: d(-7), checkOut: d(-2),
        status: "checked_out", paymentStatus: "paid", source: "airbnb",
        guestsCount: 8, totalAmount: "36000", paidAmount: "36000",
        lastName: g[3].lastName, firstName: g[3].firstName,
      },
      {
        unitId: u[1].id, guestId: g[4].id,
        checkIn: d(5), checkOut: d(9),
        status: "confirmed", paymentStatus: "partial", source: "direct",
        guestsCount: 3, totalAmount: "11200", paidAmount: "5600",
        lastName: g[4].lastName, firstName: g[4].firstName,
      },
      {
        unitId: u[4].id, guestId: g[5].id,
        checkIn: d(3), checkOut: d(7),
        status: "confirmed", paymentStatus: "unpaid", source: "booking",
        guestsCount: 4, totalAmount: "15200", paidAmount: "0",
        lastName: g[5].lastName, firstName: g[5].firstName,
      },
      {
        unitId: u[7].id, guestId: g[6].id,
        checkIn: d(10), checkOut: d(15),
        status: "pending", paymentStatus: "unpaid", source: "direct",
        guestsCount: 7, totalAmount: "27500", paidAmount: "0",
        lastName: g[6].lastName, firstName: g[6].firstName,
      },
      {
        unitId: u[10].id, guestId: g[7].id,
        checkIn: d(2), checkOut: d(6),
        status: "confirmed", paymentStatus: "paid", source: "direct",
        guestsCount: 9, totalAmount: "28800", paidAmount: "28800",
        lastName: g[7].lastName, firstName: g[7].firstName,
      },
      {
        unitId: u[2].id, guestId: g[0].id,
        checkIn: d(12), checkOut: d(16),
        status: "pending", paymentStatus: "unpaid", source: "direct",
        guestsCount: 4, totalAmount: "11200", paidAmount: "0",
        lastName: g[0].lastName, firstName: g[0].firstName,
      },
      {
        unitId: u[5].id, guestId: g[2].id,
        checkIn: d(8), checkOut: d(13),
        status: "confirmed", paymentStatus: "partial", source: "direct",
        guestsCount: 5, totalAmount: "19000", paidAmount: "9500",
        lastName: g[2].lastName, firstName: g[2].firstName,
      },
    ]);

    // ─── Org 2: Maison HD Demo ─────────────────────────────────────────────────
    const [maisonOrg] = await db.insert(organizationsTable).values({
      name: "Maison HD",
      slug: "maisonhd",
      plan: "enterprise",
      maxUnits: 9999,
      maxUsers: 9999,
    }).returning();

    await db.insert(usersTable).values([
      {
        email: "owner@maisonhd.com",
        name: "Maison HD Owner",
        passwordHash: await hp("Owner2026!"),
        role: "owner",
        organizationId: maisonOrg.id,
      },
    ]);

    const [maisonProp] = await db.insert(propertiesTable).values({
      organizationId: maisonOrg.id,
      name: "Maison HD Demo Hotel",
      type: "hotel",
      description: "Demo property for Maison HD platform",
    }).returning();

    await db.insert(unitsTable).values(
      Array.from({ length: 10 }, (_, i) => ({
        propertyId: maisonProp.id,
        name: `Room ${101 + i}`,
        category: i < 6 ? "Standard" : i < 9 ? "Deluxe" : "Suite",
        capacity: i < 9 ? 2 : 4,
        basePrice: i < 6 ? "1800" : i < 9 ? "2800" : "5000",
      }))
    );

    logger.info(
      "Auto-seed complete.\n" +
      `  SuperAdmin: ${process.env.SUPER_ADMIN_EMAIL || "owner@maisonhd.com"} / [SUPER_ADMIN_PASSWORD env]\n` +
      "  ДОГОДА owner: admin@dogoda.com.ua / Dogoda2026!\n" +
      "  ДОГОДА reception: reception@dogoda.com.ua / reception123\n" +
      "  Maison HD owner: owner@maisonhd.com / Owner2026!"
    );
  } catch (err) {
    logger.error({ err }, "Auto-seed failed");
  }
}

// Runs on EVERY startup — ensures super_admin credentials match env vars
export async function syncSuperAdmin() {
  try {
    const saEmail = process.env.SUPER_ADMIN_EMAIL || "owner@maisonhd.com";
    const saPassword = process.env.SUPER_ADMIN_PASSWORD;

    // Ensure display_password column exists (safe migration for older prod DBs)
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_password varchar(255)
    `);

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.role, "super_admin"))
      .limit(1);

    if (!existing) {
      logger.warn("No super_admin found — creating one");
      await db.insert(usersTable).values({
        email: saEmail,
        name: "Super Admin",
        passwordHash: await hp(saPassword || "Maison2026!"),
        role: "super_admin",
        organizationId: null,
      });
      return;
    }

    const updates: Record<string, any> = {};

    if (existing.email !== saEmail) {
      // Free the target email if taken by another user
      await db.execute(
        sql`UPDATE users SET email = 'legacy-' || email WHERE email = ${saEmail} AND id != ${existing.id}`
      );
      updates.email = saEmail;
    }

    if (saPassword) {
      updates.passwordHash = await hp(saPassword);
    }

    if (Object.keys(updates).length > 0) {
      await db.update(usersTable).set(updates).where(eq(usersTable.id, existing.id));
      logger.info({ email: saEmail }, "Super admin credentials synced from env");
    }
  } catch (err) {
    logger.error({ err }, "syncSuperAdmin failed");
  }
}
