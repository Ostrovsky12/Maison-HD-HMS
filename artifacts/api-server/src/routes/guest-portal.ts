import { Router } from "express";
import { db } from "@workspace/db";
import { bookingsTable, unitsTable, propertiesTable, guestServiceOrdersTable, organizationsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { requireAuth } from "../lib/auth.js";

const router = Router();

function generateAccessCode(): string {
  return randomBytes(5).toString("hex").toUpperCase();
}

// ── Generate or get guest access link (staff, authenticated) ──────────────
router.post("/generate/:bookingId", requireAuth, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });

    let code = booking.guestAccessCode;
    if (!code) {
      code = generateAccessCode();
      await db.update(bookingsTable).set({ guestAccessCode: code, updatedAt: new Date() }).where(eq(bookingsTable.id, bookingId));
    }

    res.json({ code, url: `/guest/${code}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// ── All public routes below — no auth required ────────────────────────────

// GET /api/guest/:code — full booking info for guest portal
router.get("/:code", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db
      .select({
        id: bookingsTable.id,
        checkIn: bookingsTable.checkIn,
        checkOut: bookingsTable.checkOut,
        checkinTime: bookingsTable.checkinTime,
        checkoutTime: bookingsTable.checkoutTime,
        status: bookingsTable.status,
        paymentStatus: bookingsTable.paymentStatus,
        totalAmount: bookingsTable.totalAmount,
        paidAmount: bookingsTable.paidAmount,
        adults: bookingsTable.adults,
        childrenUnder6: bookingsTable.childrenUnder6,
        childrenOver6: bookingsTable.childrenOver6,
        extraBeds: bookingsTable.extraBeds,
        firstName: bookingsTable.firstName,
        lastName: bookingsTable.lastName,
        phone: bookingsTable.phone,
        notes: bookingsTable.notes,
        paymentLink: bookingsTable.paymentLink,
        checkinFormSubmitted: bookingsTable.checkinFormSubmitted,
        checkinFormData: bookingsTable.checkinFormData,
        selectedAddons: bookingsTable.selectedAddons,
        unitName: unitsTable.name,
        unitCategory: unitsTable.category,
        unitDescription: unitsTable.description,
        unitCapacity: unitsTable.capacity,
        unitHasBalcony: unitsTable.hasBalcony,
        unitHasView: unitsTable.hasView,
        unitSquareMeters: unitsTable.squareMeters,
        propertyName: propertiesTable.name,
        propertyAddress: propertiesTable.address,
        orgName: organizationsTable.name,
      })
      .from(bookingsTable)
      .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .innerJoin(organizationsTable, eq(propertiesTable.organizationId, organizationsTable.id))
      .where(eq(bookingsTable.guestAccessCode, code));

    if (!booking) return res.status(404).json({ error: "Посилання недійсне або бронювання не знайдено" });
    if (booking.status === "cancelled") return res.status(410).json({ error: "Бронювання скасовано" });

    // Get service orders for this booking
    const orders = await db
      .select()
      .from(guestServiceOrdersTable)
      .where(eq(guestServiceOrdersTable.bookingId, booking.id))
      .orderBy(guestServiceOrdersTable.createdAt);

    res.json({ booking, orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// POST /api/guest/:code/checkin — submit online check-in form
router.post("/:code/checkin", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.guestAccessCode, code));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });
    if (booking.status === "cancelled") return res.status(410).json({ error: "Бронювання скасовано" });

    const {
      firstName, lastName, middleName, phone, email,
      passportType, passportNumber, nationality, birthDate,
      arrivalTime, specialRequests, extraServices,
    } = req.body;

    const formData: Record<string, string> = {
      firstName: firstName || "",
      lastName: lastName || "",
      middleName: middleName || "",
      phone: phone || "",
      email: email || "",
      passportType: passportType || "passport",
      passportNumber: passportNumber || "",
      nationality: nationality || "UA",
      birthDate: birthDate || "",
      arrivalTime: arrivalTime || booking.checkinTime || "14:00",
      specialRequests: specialRequests || "",
      extraServices: extraServices || "",
      submittedAt: new Date().toISOString(),
    };

    await db.update(bookingsTable).set({
      checkinFormSubmitted: true,
      checkinFormData: formData,
      checkinTime: arrivalTime || booking.checkinTime || "14:00",
      updatedAt: new Date(),
    }).where(eq(bookingsTable.guestAccessCode, code));

    res.json({ success: true, message: "Форма заїзду успішно подана" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// GET /api/guest/:code/services — list of available upsell services
router.get("/:code/services", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.guestAccessCode, code));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });

    // Curated service catalog for upsell
    const services = [
      {
        id: "spa_massage_60",
        type: "spa",
        icon: "🧖",
        name: "Масаж 60 хв",
        description: "Класичний розслаблюючий масаж у нашому SPA",
        price: 800,
        currency: "UAH",
        available: true,
        slots: ["10:00", "12:00", "14:00", "16:00", "18:00"],
      },
      {
        id: "spa_massage_90",
        type: "spa",
        icon: "🧖",
        name: "Масаж 90 хв",
        description: "Тайський або аромамасаж — на ваш вибір",
        price: 1200,
        currency: "UAH",
        available: true,
        slots: ["10:00", "12:00", "14:00", "16:00"],
      },
      {
        id: "spa_jacuzzi",
        type: "spa",
        icon: "🛁",
        name: "Джакузі (1 год)",
        description: "Приватне джакузі з ароматичними солями",
        price: 600,
        currency: "UAH",
        available: true,
        slots: ["09:00", "11:00", "13:00", "15:00", "17:00", "19:00"],
      },
      {
        id: "spa_sauna",
        type: "spa",
        icon: "🔥",
        name: "Сауна (2 год)",
        description: "Фінська сауна з купіллю до 4 осіб",
        price: 900,
        currency: "UAH",
        available: true,
        slots: ["10:00", "13:00", "16:00", "19:00"],
      },
      {
        id: "rental_bicycle",
        type: "rental",
        icon: "🚲",
        name: "Оренда велосипеда",
        description: "Прогулянковий велосипед на повний день",
        price: 250,
        currency: "UAH",
        available: true,
        perDay: true,
      },
      {
        id: "rental_sup",
        type: "rental",
        icon: "🏄",
        name: "Оренда SUP-дошки",
        description: "Сап-борд з веслом та страховкою",
        price: 400,
        currency: "UAH",
        available: true,
        slots: ["09:00", "11:00", "13:00", "15:00"],
      },
      {
        id: "rental_kayak",
        type: "rental",
        icon: "🛶",
        name: "Оренда каяку",
        description: "Двомісний каяк на 2 години",
        price: 350,
        currency: "UAH",
        available: true,
        slots: ["09:00", "11:00", "13:00", "15:00"],
      },
      {
        id: "activity_fishing",
        type: "activity",
        icon: "🎣",
        name: "Рибалка (комплект)",
        description: "Вудка, наживка, підсак — на весь день",
        price: 300,
        currency: "UAH",
        available: true,
        perDay: true,
      },
      {
        id: "food_breakfast",
        type: "food",
        icon: "🍳",
        name: "Сніданок на двох",
        description: "Континентальний або гарячий сніданок в номер",
        price: 450,
        currency: "UAH",
        available: true,
      },
      {
        id: "food_romantic",
        type: "food",
        icon: "🍷",
        name: "Романтична вечеря",
        description: "Вечеря на двох зі свічками та вином",
        price: 1800,
        currency: "UAH",
        available: true,
      },
      {
        id: "service_late_checkout",
        type: "service",
        icon: "⏰",
        name: "Пізній виїзд (до 15:00)",
        description: "Залишіться на 3 години довше",
        price: 500,
        currency: "UAH",
        available: true,
      },
      {
        id: "service_early_checkin",
        type: "service",
        icon: "🌅",
        name: "Ранній заїзд (від 10:00)",
        description: "Заїдьте на 4 години раніше",
        price: 500,
        currency: "UAH",
        available: true,
      },
      {
        id: "service_transfer",
        type: "service",
        icon: "🚗",
        name: "Трансфер від/до",
        description: "Комфортне таксі до міста або аеропорту",
        price: 700,
        currency: "UAH",
        available: true,
      },
    ];

    res.json(services);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// POST /api/guest/:code/service-order — order a service
router.post("/:code/service-order", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.guestAccessCode, code));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });
    if (booking.status === "cancelled") return res.status(410).json({ error: "Бронювання скасовано" });

    const { serviceId, serviceName, serviceType, quantity, requestedTime, guestNotes, price } = req.body;

    if (!serviceName) return res.status(400).json({ error: "Назва послуги обов'язкова" });

    const qty = parseInt(quantity) || 1;
    const pricePerUnit = parseFloat(price) || 0;
    const totalPrice = pricePerUnit * qty;

    const requestedFor = requestedTime ? new Date(requestedTime) : undefined;

    const [order] = await db.insert(guestServiceOrdersTable).values({
      bookingId: booking.id,
      orderType: (serviceType || "service") as any,
      serviceName,
      quantity: qty,
      pricePerUnit: pricePerUnit.toString(),
      totalPrice: totalPrice.toString(),
      requestedFor,
      guestNotes: guestNotes || null,
      status: "pending",
      metadata: { serviceId: serviceId || "" },
    }).returning();

    res.json({ success: true, order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// POST /api/guest/:code/checkout-request — request checkout
router.post("/:code/checkout-request", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.guestAccessCode, code));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });

    const { preferredTime, luggageStorage, feedbackRating, feedbackComment } = req.body;

    // Log checkout request as a service order
    await db.insert(guestServiceOrdersTable).values({
      bookingId: booking.id,
      orderType: "other",
      serviceName: "Запит на виїзд",
      quantity: 1,
      guestNotes: `Час виїзду: ${preferredTime || "стандартний"}. ${luggageStorage ? "Потрібне зберігання багажу." : ""} ${feedbackComment || ""}`,
      status: "pending",
      metadata: {
        type: "checkout_request",
        preferredTime: preferredTime || "",
        luggageStorage: luggageStorage ? "yes" : "no",
        feedbackRating: feedbackRating?.toString() || "",
      },
    });

    res.json({ success: true, message: "Запит на виїзд прийнято. Адміністратор зв'яжеться з вами." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// GET /api/guest/:code/orders — get guest's service orders
router.get("/:code/orders", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db.select({ id: bookingsTable.id }).from(bookingsTable).where(eq(bookingsTable.guestAccessCode, code));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });

    const orders = await db
      .select()
      .from(guestServiceOrdersTable)
      .where(eq(guestServiceOrdersTable.bookingId, booking.id))
      .orderBy(guestServiceOrdersTable.createdAt);

    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

export default router;
