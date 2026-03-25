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

async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

async function seed() {
  console.log("🌱 Starting seed...");

  const existing = await db.select().from(organizationsTable).limit(1);
  if (existing.length > 0) {
    console.log("✅ Already seeded. Skipping.");
    process.exit(0);
  }

  const [org] = await db.insert(organizationsTable).values({
    name: "Dogoda Resort",
    slug: "dogoda",
    plan: "enterprise",
    maxUnits: 9999,
    maxUsers: 9999,
  }).returning();
  console.log("✅ Organization created:", org.name);

  const superAdminHash = await hashPassword("admin123");
  await db.insert(usersTable).values({
    email: "admin@hms.app",
    name: "Super Admin",
    passwordHash: superAdminHash,
    role: "super_admin",
    organizationId: null,
  });

  const ownerHash = await hashPassword("owner123");
  const [owner] = await db.insert(usersTable).values({
    email: "owner@dogoda.com",
    name: "Owner Dogoda",
    passwordHash: ownerHash,
    role: "owner",
    organizationId: org.id,
  }).returning();

  const receptionHash = await hashPassword("reception123");
  await db.insert(usersTable).values({
    email: "reception@dogoda.com",
    name: "Рецепція",
    passwordHash: receptionHash,
    role: "reception",
    organizationId: org.id,
  });

  const hkHash = await hashPassword("hk123");
  await db.insert(usersTable).values({
    email: "hk@dogoda.com",
    name: "Покоївка",
    passwordHash: hkHash,
    role: "housekeeping",
    organizationId: org.id,
  });
  console.log("✅ Users created");

  const [houseProp] = await db.insert(propertiesTable).values({
    organizationId: org.id,
    name: "Будинки",
    type: "house",
    description: "Котеджи та будинки для сімейного відпочинку",
  }).returning();

  const [hotelProp] = await db.insert(propertiesTable).values({
    organizationId: org.id,
    name: "Готель",
    type: "hotel",
    description: "Готельний корпус",
  }).returning();

  const [spaProp] = await db.insert(propertiesTable).values({
    organizationId: org.id,
    name: "SPA-центр",
    type: "spa",
    description: "Термальна зона та SPA",
  }).returning();

  const [poolProp] = await db.insert(propertiesTable).values({
    organizationId: org.id,
    name: "Басейн",
    type: "pool",
    description: "Відкритий басейн",
  }).returning();

  const [bungalowProp] = await db.insert(propertiesTable).values({
    organizationId: org.id,
    name: "Бунгало",
    type: "bungalow",
    description: "Бунгало біля басейну",
  }).returning();
  console.log("✅ Properties created");

  const houseUnits = [];
  for (let i = 1; i <= 9; i++) {
    houseUnits.push({
      propertyId: houseProp.id,
      name: `Будинок ${i} (1 спальня)`,
      category: "Будинок 1 спальня",
      capacity: 3,
      basePrice: "2500",
    });
  }
  for (let i = 10; i <= 14; i++) {
    houseUnits.push({
      propertyId: houseProp.id,
      name: `Будинок ${i} (2 спальні)`,
      category: "Будинок 2 спальні",
      capacity: 6,
      basePrice: "3800",
    });
  }
  await db.insert(unitsTable).values(houseUnits);
  console.log("✅ House units created (14 будинків)");

  const hotelUnits = [];
  for (let i = 101; i <= 118; i++) {
    hotelUnits.push({
      propertyId: hotelProp.id,
      name: `Номер ${i}`,
      category: "Стандарт",
      capacity: 2,
      floor: Math.floor((i - 100) / 6) + 1,
      basePrice: "1500",
    });
  }
  hotelUnits.push({
    propertyId: hotelProp.id,
    name: "Люкс 201",
    category: "Люкс",
    capacity: 4,
    floor: 2,
    basePrice: "4500",
  });
  await db.insert(unitsTable).values(hotelUnits);
  console.log("✅ Hotel units created (18 стандарт + 1 люкс)");

  const spaUnits = [];
  for (let i = 1; i <= 16; i++) {
    spaUnits.push({
      propertyId: spaProp.id,
      name: `SPA-кабіна ${i}`,
      category: "Термальна зона",
      capacity: 2,
      basePrice: "800",
    });
  }
  for (let i = 1; i <= 2; i++) {
    spaUnits.push({
      propertyId: spaProp.id,
      name: `Outdoor Jacuzzi ${i}`,
      category: "Outdoor Jacuzzi",
      capacity: 4,
      basePrice: "1200",
    });
  }
  await db.insert(unitsTable).values(spaUnits);
  console.log("✅ SPA units created (16 + 2 jacuzzi)");

  const poolUnits = [];
  for (let i = 1; i <= 30; i++) {
    poolUnits.push({
      propertyId: poolProp.id,
      name: `Шезлонг ${i}`,
      category: "Шезлонг",
      capacity: 1,
      basePrice: "300",
    });
  }
  await db.insert(unitsTable).values(poolUnits);
  console.log("✅ Pool units created (30 шезлонгів)");

  const bungalowUnits = [];
  for (let i = 1; i <= 14; i++) {
    bungalowUnits.push({
      propertyId: bungalowProp.id,
      name: `Бунгало ${i}`,
      category: "Бунгало",
      capacity: 4,
      basePrice: "2000",
    });
  }
  await db.insert(unitsTable).values(bungalowUnits);
  console.log("✅ Bungalow units created (14 бунгало)");

  await db.insert(addonsTable).values([
    {
      organizationId: org.id,
      name: "Оренда велосипеда",
      description: "Велосипед на день",
      price: "150",
      unit: "per day",
      maxQuantity: 20,
    },
    {
      organizationId: org.id,
      name: "Оренда вудочки",
      description: "Рибальська вудочка",
      price: "100",
      unit: "per day",
      maxQuantity: 15,
    },
    {
      organizationId: org.id,
      name: "Трансфер",
      description: "Трансфер від/до аеропорту",
      price: "500",
      unit: "per trip",
    },
    {
      organizationId: org.id,
      name: "Барбекю-набір",
      description: "Мангал + вугілля + приналежності",
      price: "200",
      unit: "per session",
    },
  ]);
  console.log("✅ Add-ons created");

  const guestData = [
    { firstName: "Іван", lastName: "Петренко", email: "ivan@example.com", phone: "+380501234567" },
    { firstName: "Марія", lastName: "Коваль", email: "maria@example.com", phone: "+380671234567" },
    { firstName: "Олег", lastName: "Сидоренко", email: "oleg@example.com", phone: "+380631234567" },
    { firstName: "Анна", lastName: "Мельник", email: "anna@example.com", phone: "+380991234567" },
    { firstName: "Дмитро", lastName: "Бойко", email: "dmytro@example.com", phone: "+380661234567" },
  ];
  const guests = await db.insert(guestsTable).values(
    guestData.map(g => ({ ...g, organizationId: org.id }))
  ).returning();
  console.log("✅ Sample guests created");

  const houses = await db.select().from(unitsTable).where(eq(unitsTable.propertyId, houseProp.id));
  const hotelUnitsDb = await db.select().from(unitsTable).where(eq(unitsTable.propertyId, hotelProp.id));

  const today = new Date();
  const bookingData = [
    {
      unitId: houses[0].id,
      guestId: guests[0].id,
      checkIn: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2).toISOString().split("T")[0],
      checkOut: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3).toISOString().split("T")[0],
      status: "checked_in" as const,
      paymentStatus: "partial" as const,
      source: "direct" as const,
      guestsCount: 2,
      totalAmount: "12500",
      paidAmount: "6250",
    },
    {
      unitId: houses[1].id,
      guestId: guests[1].id,
      checkIn: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString().split("T")[0],
      checkOut: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5).toISOString().split("T")[0],
      status: "confirmed" as const,
      paymentStatus: "unpaid" as const,
      source: "booking" as const,
      guestsCount: 4,
      totalAmount: "15200",
      paidAmount: "0",
    },
    {
      unitId: hotelUnitsDb[0].id,
      guestId: guests[2].id,
      checkIn: new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString().split("T")[0],
      checkOut: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2).toISOString().split("T")[0],
      status: "checked_in" as const,
      paymentStatus: "paid" as const,
      source: "direct" as const,
      guestsCount: 2,
      totalAmount: "3000",
      paidAmount: "3000",
    },
    {
      unitId: hotelUnitsDb[1].id,
      guestId: guests[3].id,
      checkIn: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5).toISOString().split("T")[0],
      checkOut: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).toISOString().split("T")[0],
      status: "checked_out" as const,
      paymentStatus: "paid" as const,
      source: "airbnb" as const,
      guestsCount: 1,
      totalAmount: "6000",
      paidAmount: "6000",
    },
    {
      unitId: houses[3].id,
      guestId: guests[4].id,
      checkIn: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7).toISOString().split("T")[0],
      checkOut: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 12).toISOString().split("T")[0],
      status: "pending" as const,
      paymentStatus: "unpaid" as const,
      source: "direct" as const,
      guestsCount: 3,
      totalAmount: "19000",
      paidAmount: "0",
    },
  ];
  await db.insert(bookingsTable).values(bookingData);
  console.log("✅ Sample bookings created");

  console.log("\n🎉 Seed complete!");
  console.log("\n📝 Login credentials:");
  console.log("  Super Admin: admin@hms.app / admin123");
  console.log("  Owner:       owner@dogoda.com / owner123");
  console.log("  Reception:   reception@dogoda.com / reception123");
  console.log("  Housekeeping: hk@dogoda.com / hk123");
}

seed().then(() => process.exit(0)).catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
