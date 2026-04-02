import { Router } from "express";
import { db } from "@workspace/db";
import {
  bookingsTable, unitsTable, propertiesTable, guestServiceOrdersTable, organizationsTable,
  guestLoyaltyTable, loyaltyTransactionsTable, guestReviewsTable,
  guestPortalMessagesTable, guestSpecialOffersTable, guestCommunicationLogTable,
} from "@workspace/db";
import { eq, and, desc, asc, ne, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { requireAuth } from "../lib/auth.js";

const router = Router();

function generateAccessCode(): string {
  return randomBytes(5).toString("hex").toUpperCase();
}

// ── Staff: Generate/get guest access link ─────────────────────────────────
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

// ── Staff: Send communication log entry ──────────────────────────────────
router.post("/communicate/:bookingId", requireAuth, async (req: any, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const { type, channel, subject, content } = req.body;
    await db.insert(guestCommunicationLogTable).values({
      bookingId, type, channel: channel || "portal", subject, content,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Staff: Send message to guest ──────────────────────────────────────────
router.post("/message/:bookingId", requireAuth, async (req: any, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const { message } = req.body;
    const senderName = req.user?.name || req.user?.email || "Адміністратор";
    await db.insert(guestPortalMessagesTable).values({
      bookingId, direction: "hotel_to_guest", senderName, message, isRead: false,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Staff: Send review request ─────────────────────────────────────────────
router.post("/review-request/:bookingId", requireAuth, async (req: any, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const orgId = req.user?.organizationId;
    const [booking] = await db.select({
      guestEmail: bookingsTable.email,
      firstName: bookingsTable.firstName,
      lastName: bookingsTable.lastName,
      guestAccessCode: bookingsTable.guestAccessCode,
    }).from(bookingsTable).where(eq(bookingsTable.id, bookingId));
    if (!booking) return res.status(404).json({ error: "Не знайдено" });

    const existing = await db.select().from(guestReviewsTable)
      .where(and(eq(guestReviewsTable.bookingId, bookingId)));
    if (existing.length === 0) {
      await db.insert(guestReviewsTable).values({
        organizationId: orgId, bookingId,
        guestEmail: booking.guestEmail,
        guestName: [booking.firstName, booking.lastName].filter(Boolean).join(" "),
        accessCode: booking.guestAccessCode,
        requestSentAt: new Date(),
      });
    } else {
      await db.update(guestReviewsTable).set({ requestSentAt: new Date() })
        .where(eq(guestReviewsTable.bookingId, bookingId));
    }
    await db.insert(guestCommunicationLogTable).values({
      bookingId, type: "post_stay_review", channel: "portal",
      subject: "Запит на відгук",
      content: "Надіслано запит на залишення відгуку через гостьовий портал",
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Staff: Loyalty overview ────────────────────────────────────────────────
router.get("/loyalty-overview", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const accounts = await db.select().from(guestLoyaltyTable)
      .where(eq(guestLoyaltyTable.organizationId, orgId))
      .orderBy(desc(guestLoyaltyTable.totalPoints));
    res.json({ accounts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Staff: All reviews ─────────────────────────────────────────────────────
router.get("/reviews", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const reviews = await db.select().from(guestReviewsTable)
      .where(eq(guestReviewsTable.organizationId, orgId))
      .orderBy(desc(guestReviewsTable.createdAt));
    res.json({ reviews });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/reviews/:id", requireAuth, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const { isPublished, staffResponse } = req.body;
    const updated = await db.update(guestReviewsTable)
      .set({ isPublished: isPublished ?? undefined, staffResponse: staffResponse ?? undefined })
      .where(eq(guestReviewsTable.id, id)).returning();
    res.json({ review: updated[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Staff: Special offers CRUD ─────────────────────────────────────────────
router.get("/offers", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const offers = await db.select().from(guestSpecialOffersTable)
      .where(eq(guestSpecialOffersTable.organizationId, orgId))
      .orderBy(desc(guestSpecialOffersTable.createdAt));
    res.json({ offers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/offers", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { title, description, promoCode, discountPct, discountFixed, validFrom, validUntil, targetAudience, minNights, usageLimit } = req.body;
    const [offer] = await db.insert(guestSpecialOffersTable).values({
      organizationId: orgId, title, description, promoCode,
      discountPct: discountPct || null, discountFixed: discountFixed?.toString() || null,
      validFrom: validFrom || null, validUntil: validUntil || null,
      targetAudience: targetAudience || "all", minNights: minNights || null,
      usageLimit: usageLimit || null,
    }).returning();
    res.json({ offer });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/offers/:id", requireAuth, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const orgId = req.user?.organizationId;
    const { status, title, description, discountPct, validUntil } = req.body;
    const updated = await db.update(guestSpecialOffersTable)
      .set({ status: status ?? undefined, title: title ?? undefined, description: description ?? undefined,
        discountPct: discountPct ?? undefined, validUntil: validUntil ?? undefined })
      .where(and(eq(guestSpecialOffersTable.id, id), eq(guestSpecialOffersTable.organizationId, orgId)))
      .returning();
    res.json({ offer: updated[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/offers/:id", requireAuth, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(guestSpecialOffersTable).where(eq(guestSpecialOffersTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Staff: Guest communications history ────────────────────────────────────
router.get("/communications/:bookingId", requireAuth, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const logs = await db.select().from(guestCommunicationLogTable)
      .where(eq(guestCommunicationLogTable.bookingId, bookingId))
      .orderBy(desc(guestCommunicationLogTable.sentAt));
    const messages = await db.select().from(guestPortalMessagesTable)
      .where(eq(guestPortalMessagesTable.bookingId, bookingId))
      .orderBy(asc(guestPortalMessagesTable.createdAt));
    res.json({ logs, messages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Guest Experience Summary (for dashboard) ───────────────────────────────
router.get("/summary", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const [loyaltyCount, reviewCount, avgRating, offersCount, unreadMessages] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) as cnt, SUM(points) as total_pts FROM guest_loyalty WHERE organization_id = ${orgId}`),
      db.execute(sql`SELECT COUNT(*) as cnt, AVG(overall_rating)::numeric(3,1) as avg FROM guest_reviews WHERE organization_id = ${orgId} AND submitted_at IS NOT NULL`),
      db.execute(sql`SELECT COUNT(*) as cnt FROM guest_reviews WHERE organization_id = ${orgId} AND overall_rating >= 4 AND submitted_at IS NOT NULL`),
      db.execute(sql`SELECT COUNT(*) as cnt FROM guest_special_offers WHERE organization_id = ${orgId} AND status = 'active'`),
      db.execute(sql`SELECT COUNT(*) as cnt FROM guest_portal_messages gpm JOIN bookings b ON b.id = gpm.booking_id JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id WHERE p.organization_id = ${orgId} AND gpm.direction = 'guest_to_hotel' AND gpm.is_read = false`),
    ]);
    res.json({
      loyaltyAccounts: parseInt((loyaltyCount.rows[0] as any)?.cnt || "0"),
      totalLoyaltyPoints: parseInt((loyaltyCount.rows[0] as any)?.total_pts || "0"),
      reviewsCount: parseInt((reviewCount.rows[0] as any)?.cnt || "0"),
      avgRating: parseFloat((reviewCount.rows[0] as any)?.avg || "0"),
      positiveReviews: parseInt((avgRating.rows[0] as any)?.cnt || "0"),
      activeOffers: parseInt((offersCount.rows[0] as any)?.cnt || "0"),
      unreadMessages: parseInt((unreadMessages.rows[0] as any)?.cnt || "0"),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC GUEST PORTAL ROUTES (no auth required)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/guest/:code — full booking info
router.get("/:code", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db.select({
      id: bookingsTable.id, checkIn: bookingsTable.checkIn, checkOut: bookingsTable.checkOut,
      checkinTime: bookingsTable.checkinTime, checkoutTime: bookingsTable.checkoutTime,
      status: bookingsTable.status, paymentStatus: bookingsTable.paymentStatus,
      totalAmount: bookingsTable.totalAmount, paidAmount: bookingsTable.paidAmount,
      adults: bookingsTable.adults, childrenUnder6: bookingsTable.childrenUnder6, childrenOver6: bookingsTable.childrenOver6,
      extraBeds: bookingsTable.extraBeds, firstName: bookingsTable.firstName, lastName: bookingsTable.lastName,
      phone: bookingsTable.phone, email: bookingsTable.email, notes: bookingsTable.notes,
      paymentLink: bookingsTable.paymentLink, checkinFormSubmitted: bookingsTable.checkinFormSubmitted,
      checkinFormData: bookingsTable.checkinFormData, selectedAddons: bookingsTable.selectedAddons,
      bookingRef: bookingsTable.bookingRef,
      unitName: unitsTable.name, unitCategory: unitsTable.category,
      unitDescription: unitsTable.description, unitCapacity: unitsTable.capacity,
      unitHasBalcony: unitsTable.hasBalcony, unitHasView: unitsTable.hasView, unitSquareMeters: unitsTable.squareMeters,
      propertyName: propertiesTable.name, propertyAddress: propertiesTable.address,
      orgName: organizationsTable.name, orgId: organizationsTable.id,
    }).from(bookingsTable)
      .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .innerJoin(organizationsTable, eq(propertiesTable.organizationId, organizationsTable.id))
      .where(eq(bookingsTable.guestAccessCode, code));

    if (!booking) return res.status(404).json({ error: "Посилання недійсне або бронювання не знайдено" });
    if (booking.status === "cancelled") return res.status(410).json({ error: "Бронювання скасовано" });

    const orders = await db.select().from(guestServiceOrdersTable)
      .where(eq(guestServiceOrdersTable.bookingId, booking.id))
      .orderBy(guestServiceOrdersTable.createdAt);

    // Get loyalty info by email
    let loyalty = null;
    if (booking.email) {
      const [la] = await db.select().from(guestLoyaltyTable)
        .where(and(eq(guestLoyaltyTable.organizationId, booking.orgId), eq(guestLoyaltyTable.email, booking.email)));
      loyalty = la || null;
    }

    // Get portal messages
    const messages = await db.select().from(guestPortalMessagesTable)
      .where(eq(guestPortalMessagesTable.bookingId, booking.id))
      .orderBy(asc(guestPortalMessagesTable.createdAt));

    // Get review for this booking
    const [review] = await db.select().from(guestReviewsTable)
      .where(eq(guestReviewsTable.bookingId, booking.id));

    // Get active special offers
    const todayStr = new Date().toISOString().split("T")[0];
    const offers = await db.select().from(guestSpecialOffersTable)
      .where(and(
        eq(guestSpecialOffersTable.organizationId, booking.orgId),
        eq(guestSpecialOffersTable.status, "active" as any),
      )).limit(4);

    res.json({ booking, orders, loyalty, messages, review: review || null, offers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// POST /api/guest/:code/checkin
router.post("/:code/checkin", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.guestAccessCode, code));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });
    if (booking.status === "cancelled") return res.status(410).json({ error: "Бронювання скасовано" });

    const { firstName, lastName, middleName, phone, email, passportType, passportNumber, nationality, birthDate, arrivalTime, specialRequests, extraServices } = req.body;

    const formData: Record<string, string> = {
      firstName: firstName || "", lastName: lastName || "", middleName: middleName || "",
      phone: phone || "", email: email || "", passportType: passportType || "passport",
      passportNumber: passportNumber || "", nationality: nationality || "UA",
      birthDate: birthDate || "", arrivalTime: arrivalTime || booking.checkinTime || "14:00",
      specialRequests: specialRequests || "", extraServices: extraServices || "",
      submittedAt: new Date().toISOString(),
    };

    await db.update(bookingsTable).set({
      checkinFormSubmitted: true, checkinFormData: formData,
      checkinTime: arrivalTime || booking.checkinTime || "14:00",
      firstName: firstName || booking.firstName, lastName: lastName || booking.lastName,
      phone: phone || booking.phone, email: email || booking.email,
      updatedAt: new Date(),
    }).where(eq(bookingsTable.guestAccessCode, code));

    // Auto-create or update loyalty account
    if (email) {
      const [unit] = await db.select({ propertyId: unitsTable.propertyId }).from(unitsTable).where(eq(unitsTable.id, booking.unitId));
      if (unit) {
        const [prop] = await db.select({ organizationId: propertiesTable.organizationId }).from(propertiesTable).where(eq(propertiesTable.id, unit.propertyId));
        if (prop) {
          const [existing] = await db.select().from(guestLoyaltyTable)
            .where(and(eq(guestLoyaltyTable.organizationId, prop.organizationId), eq(guestLoyaltyTable.email, email)));
          if (!existing) {
            await db.insert(guestLoyaltyTable).values({
              organizationId: prop.organizationId, email,
              firstName: firstName || "", lastName: lastName || "", phone: phone || "",
              tier: "bronze", points: 50, totalPoints: 50,
            });
          } else {
            // Add checkin bonus points
            await db.update(guestLoyaltyTable).set({
              points: sql`${guestLoyaltyTable.points} + 50`,
              totalPoints: sql`${guestLoyaltyTable.totalPoints} + 50`,
              firstName: firstName || existing.firstName,
            }).where(eq(guestLoyaltyTable.id, existing.id));
          }
        }
      }
    }

    // Log communication
    await db.insert(guestCommunicationLogTable).values({
      bookingId: booking.id, type: "pre_checkin_reminder", channel: "portal",
      subject: "Онлайн чекін завершено",
      content: `Гість ${firstName} ${lastName} заповнив форму онлайн чекіну`,
    });

    res.json({ success: true, message: "Форму заїзду успішно подано. Вам нараховано 50 балів лояльності!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// GET /api/guest/:code/services
router.get("/:code/services", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.guestAccessCode, code));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });

    const services = [
      { id: "spa_massage_60", type: "spa", icon: "🧖", name: "Масаж 60 хв", description: "Класичний розслаблюючий масаж у нашому SPA", price: 800, currency: "UAH", available: true, slots: ["10:00","12:00","14:00","16:00","18:00"] },
      { id: "spa_massage_90", type: "spa", icon: "🧖", name: "Масаж 90 хв", description: "Тайський або аромамасаж — на ваш вибір", price: 1200, currency: "UAH", available: true, slots: ["10:00","12:00","14:00","16:00"] },
      { id: "spa_jacuzzi", type: "spa", icon: "🛁", name: "Джакузі (1 год)", description: "Приватне джакузі з ароматичними солями", price: 600, currency: "UAH", available: true, slots: ["09:00","11:00","13:00","15:00","17:00","19:00"] },
      { id: "spa_sauna", type: "spa", icon: "🔥", name: "Сауна (2 год)", description: "Фінська сауна з купіллю до 4 осіб", price: 900, currency: "UAH", available: true, slots: ["10:00","13:00","16:00","19:00"] },
      { id: "rental_bicycle", type: "rental", icon: "🚲", name: "Оренда велосипеда", description: "Прогулянковий велосипед на повний день", price: 250, currency: "UAH", available: true, perDay: true },
      { id: "rental_sup", type: "rental", icon: "🏄", name: "Оренда SUP-дошки", description: "Сап-борд з веслом та страховкою", price: 400, currency: "UAH", available: true, slots: ["09:00","11:00","13:00","15:00"] },
      { id: "rental_kayak", type: "rental", icon: "🛶", name: "Оренда каяку", description: "Двомісний каяк на 2 години", price: 350, currency: "UAH", available: true, slots: ["09:00","11:00","13:00","15:00"] },
      { id: "activity_fishing", type: "activity", icon: "🎣", name: "Рибалка (комплект)", description: "Вудка, наживка, підсак — на весь день", price: 300, currency: "UAH", available: true, perDay: true },
      { id: "food_breakfast", type: "food", icon: "🍳", name: "Сніданок на двох", description: "Континентальний або гарячий сніданок в номер", price: 450, currency: "UAH", available: true },
      { id: "food_romantic", type: "food", icon: "🍷", name: "Романтична вечеря", description: "Вечеря на двох зі свічками та вином", price: 1800, currency: "UAH", available: true },
      { id: "service_late_checkout", type: "service", icon: "⏰", name: "Пізній виїзд (до 15:00)", description: "Залишіться на 3 години довше", price: 500, currency: "UAH", available: true },
      { id: "service_early_checkin", type: "service", icon: "🌅", name: "Ранній заїзд (від 10:00)", description: "Заїдьте на 4 години раніше", price: 500, currency: "UAH", available: true },
      { id: "service_transfer", type: "service", icon: "🚗", name: "Трансфер від/до", description: "Комфортне таксі до міста або аеропорту", price: 700, currency: "UAH", available: true },
      { id: "service_flowers", type: "service", icon: "💐", name: "Квіти та декор", description: "Сюрприз-декор до номеру (квіти, кулі, серці)", price: 800, currency: "UAH", available: true },
      { id: "service_photographer", type: "activity", icon: "📸", name: "Фотосесія", description: "Фотограф на 1 год — пейзаж, пара, сім'я", price: 1500, currency: "UAH", available: true },
    ];

    res.json(services);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// POST /api/guest/:code/service-order
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

    const [order] = await db.insert(guestServiceOrdersTable).values({
      bookingId: booking.id, orderType: (serviceType || "service") as any,
      serviceName, quantity: qty, pricePerUnit: pricePerUnit.toString(),
      totalPrice: (pricePerUnit * qty).toString(),
      requestedFor: requestedTime ? new Date(requestedTime) : undefined,
      guestNotes: guestNotes || null, status: "pending",
      metadata: { serviceId: serviceId || "" },
    }).returning();

    res.json({ success: true, order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// POST /api/guest/:code/checkout-request
router.post("/:code/checkout-request", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.guestAccessCode, code));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });

    const { preferredTime, luggageStorage, feedbackRating, feedbackComment } = req.body;
    await db.insert(guestServiceOrdersTable).values({
      bookingId: booking.id, orderType: "other", serviceName: "Запит на виїзд", quantity: 1,
      guestNotes: `Час виїзду: ${preferredTime || "стандартний"}. ${luggageStorage ? "Потрібне зберігання багажу." : ""} ${feedbackComment || ""}`,
      status: "pending",
      metadata: { type: "checkout_request", preferredTime: preferredTime || "", luggageStorage: luggageStorage ? "yes" : "no", feedbackRating: feedbackRating?.toString() || "" },
    });
    res.json({ success: true, message: "Запит на виїзд прийнято. Адміністратор зв'яжеться з вами." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// GET /api/guest/:code/orders
router.get("/:code/orders", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db.select({ id: bookingsTable.id }).from(bookingsTable).where(eq(bookingsTable.guestAccessCode, code));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });
    const orders = await db.select().from(guestServiceOrdersTable)
      .where(eq(guestServiceOrdersTable.bookingId, booking.id))
      .orderBy(guestServiceOrdersTable.createdAt);
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// POST /api/guest/:code/message — guest sends message
router.post("/:code/message", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db.select({ id: bookingsTable.id, firstName: bookingsTable.firstName, lastName: bookingsTable.lastName })
      .from(bookingsTable).where(eq(bookingsTable.guestAccessCode, code));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });

    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Повідомлення пусте" });

    const guestName = [booking.firstName, booking.lastName].filter(Boolean).join(" ") || "Гість";
    const [msg] = await db.insert(guestPortalMessagesTable).values({
      bookingId: booking.id, direction: "guest_to_hotel", senderName: guestName, message: message.trim(),
    }).returning();
    res.json({ success: true, message: msg });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// POST /api/guest/:code/review — guest submits review
router.post("/:code/review", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db.select({ id: bookingsTable.id, firstName: bookingsTable.firstName, lastName: bookingsTable.lastName, email: bookingsTable.email })
      .from(bookingsTable).where(eq(bookingsTable.guestAccessCode, code));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });

    const { overallRating, cleanlinessRating, serviceRating, locationRating, valueRating, reviewText, npsScore, wouldReturn, recommendToFriend } = req.body;

    const existing = await db.select().from(guestReviewsTable).where(eq(guestReviewsTable.bookingId, booking.id));
    if (existing.length > 0 && existing[0].submittedAt) {
      return res.status(409).json({ error: "Відгук вже залишено" });
    }

    const guestName = [booking.firstName, booking.lastName].filter(Boolean).join(" ") || "Гість";
    if (existing.length > 0) {
      await db.update(guestReviewsTable).set({
        overallRating, cleanlinessRating, serviceRating, locationRating, valueRating,
        reviewText, npsScore, wouldReturn, recommendToFriend, submittedAt: new Date(),
        guestName, guestEmail: booking.email,
      }).where(eq(guestReviewsTable.id, existing[0].id));
    } else {
      const [unit] = await db.select({ propertyId: unitsTable.propertyId }).from(unitsTable).innerJoin(bookingsTable, eq(bookingsTable.unitId, unitsTable.id)).where(eq(bookingsTable.id, booking.id));
      const [prop] = unit ? await db.select({ orgId: propertiesTable.organizationId }).from(propertiesTable).where(eq(propertiesTable.id, unit.propertyId)) : [null];
      await db.insert(guestReviewsTable).values({
        organizationId: prop?.orgId || 1, bookingId: booking.id, guestName, guestEmail: booking.email,
        accessCode: code, overallRating, cleanlinessRating, serviceRating, locationRating, valueRating,
        reviewText, npsScore, wouldReturn, recommendToFriend, submittedAt: new Date(),
      });
    }

    // Add loyalty points for review
    if (booking.email) {
      const [unit2] = await db.select({ propertyId: unitsTable.propertyId }).from(unitsTable).where(eq(unitsTable.id, booking.id));
      // Give 100 points for review
      try {
        await db.execute(sql`
          UPDATE guest_loyalty SET points = points + 100, total_points = total_points + 100
          WHERE email = ${booking.email} LIMIT 1
        `);
      } catch {}
    }

    res.json({ success: true, message: "Дякуємо за відгук! Вам нараховано 100 балів." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// GET /api/guest/:code/documents — digital documents
router.get("/:code/documents", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db.select({
      id: bookingsTable.id, bookingRef: bookingsTable.bookingRef,
      firstName: bookingsTable.firstName, lastName: bookingsTable.lastName,
      checkIn: bookingsTable.checkIn, checkOut: bookingsTable.checkOut,
      totalAmount: bookingsTable.totalAmount, paidAmount: bookingsTable.paidAmount,
      paymentStatus: bookingsTable.paymentStatus, checkinFormSubmitted: bookingsTable.checkinFormSubmitted,
    }).from(bookingsTable).where(eq(bookingsTable.guestAccessCode, code));
    if (!booking) return res.status(404).json({ error: "Не знайдено" });

    const documents = [
      {
        id: "confirmation",
        type: "confirmation",
        title: "Підтвердження бронювання",
        icon: "📄",
        description: `Бронювання ${booking.bookingRef || `#${booking.id}`} · ${booking.checkIn} — ${booking.checkOut}`,
        available: true,
        generatedAt: new Date().toISOString(),
      },
      {
        id: "invoice",
        type: "invoice",
        title: "Рахунок-фактура",
        icon: "🧾",
        description: `Сума: ${parseFloat(booking.totalAmount || "0").toLocaleString("uk")} ₴`,
        available: booking.paymentStatus !== "unpaid",
        generatedAt: booking.paymentStatus !== "unpaid" ? new Date().toISOString() : null,
      },
      {
        id: "registration_form",
        type: "registration",
        title: "Реєстраційна картка гостя",
        icon: "📋",
        description: `${booking.firstName || ""} ${booking.lastName || ""}`.trim(),
        available: booking.checkinFormSubmitted,
        generatedAt: booking.checkinFormSubmitted ? new Date().toISOString() : null,
      },
      {
        id: "receipt",
        type: "receipt",
        title: "Квитанція про оплату",
        icon: "💳",
        description: `Оплачено: ${parseFloat(booking.paidAmount || "0").toLocaleString("uk")} ₴`,
        available: parseFloat(booking.paidAmount || "0") > 0,
        generatedAt: parseFloat(booking.paidAmount || "0") > 0 ? new Date().toISOString() : null,
      },
    ];

    res.json({ documents });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

export default router;
