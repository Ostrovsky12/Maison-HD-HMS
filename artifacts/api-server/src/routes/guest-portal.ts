import { Router } from "express";
import { db } from "@workspace/db";
import {
  bookingsTable, unitsTable, propertiesTable, guestServiceOrdersTable, organizationsTable,
  guestLoyaltyTable, loyaltyTransactionsTable, guestReviewsTable,
  guestPortalMessagesTable, guestSpecialOffersTable, guestCommunicationLogTable,
  addonsTable, notificationsTable, usersTable, legalEntitiesTable,
} from "@workspace/db";
import { eq, and, desc, asc, ne, sql, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { requireAuth } from "../lib/auth.js";
import { sendPushToOrg } from "./push.js";
import { sendTelegram } from "../lib/notify.js";

// ── Helper: notify all staff of an org about a guest portal action ──────────
async function notifyOrgStaff(
  orgId: number,
  bookingId: number,
  type: "checkin" | "alert",
  title: string,
  message: string,
) {
  try {
    // Push notification to all staff devices
    sendPushToOrg(orgId, { title, body: message }).catch(() => {});
    // Telegram notification
    sendTelegram(orgId, `🔔 <b>${title}</b>\n${message}\n#бронювання${bookingId}`).catch(() => {});
    // In-app notifications for all staff of this org
    const staffUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.organizationId, orgId), eq(usersTable.isActive, true)));
    if (staffUsers.length > 0) {
      await db.insert(notificationsTable).values(
        staffUsers.map(u => ({
          userId: u.id,
          bookingId,
          type: type as any,
          title,
          message,
          priority: "normal" as const,
        }))
      ).catch(() => {});
    }
  } catch { /* fire-and-forget */ }
}

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

// ── Staff: Get messages for a booking ─────────────────────────────────────
router.get("/messages/:bookingId", requireAuth, async (req: any, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const msgs = await db.select().from(guestPortalMessagesTable)
      .where(eq(guestPortalMessagesTable.bookingId, bookingId))
      .orderBy(asc(guestPortalMessagesTable.createdAt));
    res.json(msgs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Staff: Get checkin form data for a booking ─────────────────────────────
router.get("/checkin-data/:bookingId", requireAuth, async (req: any, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const [booking] = await db.select({
      checkinFormSubmitted: bookingsTable.checkinFormSubmitted,
      checkinFormData: bookingsTable.checkinFormData,
      guestAccessCode: bookingsTable.guestAccessCode,
    }).from(bookingsTable).where(eq(bookingsTable.id, bookingId));
    if (!booking) return res.status(404).json({ error: "Не знайдено" });
    res.json(booking);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Staff: Mark message as read ────────────────────────────────────────────
router.patch("/messages/:id/read", requireAuth, async (req: any, res) => {
  try {
    await db.update(guestPortalMessagesTable).set({ isRead: true })
      .where(eq(guestPortalMessagesTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Staff: Portal threads for Inbox (all bookings with messages) ───────────
router.get("/portal-threads", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const rows = await db.execute(sql`
      SELECT
        b.id                                                        AS booking_id,
        b.booking_ref,
        b.guest_access_code,
        b.check_in,
        b.check_out,
        b.status                                                    AS booking_status,
        COALESCE(b.first_name || ' ' || b.last_name, 'Гість')      AS guest_name,
        b.phone,
        u.name                                                      AS unit_name,
        COUNT(m.id)                                                 AS total_messages,
        COUNT(CASE WHEN m.direction='guest_to_hotel' AND m.is_read=false THEN 1 END) AS unread_count,
        MAX(m.created_at)                                           AS last_message_at,
        (SELECT m2.message FROM guest_portal_messages m2
          WHERE m2.booking_id = b.id ORDER BY m2.created_at DESC LIMIT 1)
                                                                    AS last_message,
        (SELECT m2.direction FROM guest_portal_messages m2
          WHERE m2.booking_id = b.id ORDER BY m2.created_at DESC LIMIT 1)
                                                                    AS last_direction
      FROM bookings b
      JOIN units u ON u.id = b.unit_id
      JOIN properties p ON p.id = u.property_id
      JOIN guest_portal_messages m ON m.booking_id = b.id
      WHERE p.organization_id = ${orgId}
      GROUP BY b.id, b.booking_ref, b.guest_access_code, b.check_in, b.check_out,
               b.status, b.first_name, b.last_name, b.phone, u.name
      ORDER BY last_message_at DESC
    `);
    res.json(rows.rows);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Staff: Mark all portal messages for a booking as read ──────────────────
router.patch("/portal-threads/:bookingId/read-all", requireAuth, async (req: any, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    await db.update(guestPortalMessagesTable).set({ isRead: true })
      .where(and(
        eq(guestPortalMessagesTable.bookingId, bookingId),
        eq(guestPortalMessagesTable.direction, "guest_to_hotel" as any),
      ));
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

// ── Admin: List online checkin submissions ────────────────────────────────
router.get("/checkins", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const propIds = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, orgId));
    const pIds = propIds.map(p => p.id);
    if (pIds.length === 0) return res.json([]);

    const unitRows = await db.select({ id: unitsTable.id, name: unitsTable.name })
      .from(unitsTable).where(inArray(unitsTable.propertyId, pIds));
    const uIds = unitRows.map(u => u.id);
    const unitMap = Object.fromEntries(unitRows.map(u => [u.id, u.name]));

    const rows = await db.select({
      id: bookingsTable.id,
      checkIn: bookingsTable.checkIn,
      checkOut: bookingsTable.checkOut,
      firstName: bookingsTable.firstName,
      lastName: bookingsTable.lastName,
      phone: bookingsTable.phone,
      email: bookingsTable.email,
      unitId: bookingsTable.unitId,
      status: bookingsTable.status,
      checkinFormSubmitted: bookingsTable.checkinFormSubmitted,
      checkinFormData: bookingsTable.checkinFormData,
      updatedAt: bookingsTable.updatedAt,
    }).from(bookingsTable)
      .where(and(
        inArray(bookingsTable.unitId, uIds),
        eq(bookingsTable.checkinFormSubmitted, true)
      ))
      .orderBy(desc(bookingsTable.updatedAt))
      .limit(req.query.limit ? parseInt(req.query.limit as string) : 200);

    res.json(rows.map(r => ({
      ...r,
      unitName: unitMap[r.unitId || 0] || "—",
      guestName: [r.firstName, r.lastName].filter(Boolean).join(" ") || "—",
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Get pending service orders count ───────────────────────────────
router.get("/service-orders/count", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const propIds = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, orgId));
    const pIds = propIds.map(p => p.id);
    if (pIds.length === 0) return res.json({ pending: 0 });

    const unitRows = await db.select({ id: unitsTable.id }).from(unitsTable)
      .where(inArray(unitsTable.propertyId, pIds));
    const uIds = unitRows.map(u => u.id);
    if (uIds.length === 0) return res.json({ pending: 0 });

    const bookingRows = await db.select({ id: bookingsTable.id }).from(bookingsTable)
      .where(inArray(bookingsTable.unitId, uIds));
    const bIds = bookingRows.map(b => b.id);
    if (bIds.length === 0) return res.json({ pending: 0 });

    const [row] = await db.select({ cnt: sql<number>`count(*)::int` })
      .from(guestServiceOrdersTable)
      .where(and(
        inArray(guestServiceOrdersTable.bookingId, bIds),
        eq(guestServiceOrdersTable.status, "pending")
      ));

    res.json({ pending: row?.cnt || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Add service order for a booking (staff-side) ────────────────────
router.post("/service-orders", requireAuth, async (req: any, res) => {
  try {
    const { bookingId, serviceName, serviceType, quantity, requestedTime, guestNotes, price, totalPrice } = req.body;
    if (!bookingId || !serviceName) return res.status(400).json({ error: "bookingId and serviceName required" });
    const [order] = await db.insert(guestServiceOrdersTable).values({
      bookingId: parseInt(bookingId),
      serviceName,
      serviceType: serviceType || "service",
      quantity: quantity || 1,
      requestedTime: requestedTime || null,
      guestNotes: guestNotes || null,
      price: price ? String(price) : null,
      totalPrice: totalPrice ? String(totalPrice) : (price ? String(price * (quantity || 1)) : null),
      status: "confirmed",
    }).returning();
    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: List service orders for organization ─────────────────────────────
router.get("/service-orders", requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user?.organizationId;
    const { status, limit: lim } = req.query;
    const limitN = parseInt(lim as string) || 100;

    const propIds = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.organizationId, orgId));
    const pIds = propIds.map(p => p.id);
    if (pIds.length === 0) return res.json([]);

    const unitRows = await db.select({ id: unitsTable.id, name: unitsTable.name, propertyId: unitsTable.propertyId })
      .from(unitsTable).where(inArray(unitsTable.propertyId, pIds));
    const uIds = unitRows.map(u => u.id);
    if (uIds.length === 0) return res.json([]);

    const unitMap = Object.fromEntries(unitRows.map(u => [u.id, u.name]));

    const bookingRows = await db.select({ id: bookingsTable.id, unitId: bookingsTable.unitId, guestName: bookingsTable.guestName })
      .from(bookingsTable).where(inArray(bookingsTable.unitId, uIds));
    const bIds = bookingRows.map(b => b.id);
    if (bIds.length === 0) return res.json([]);

    const bookingMap = Object.fromEntries(bookingRows.map(b => [b.id, b]));

    const conds: any[] = [inArray(guestServiceOrdersTable.bookingId, bIds)];
    if (status && status !== "all") conds.push(eq(guestServiceOrdersTable.status, status as string));

    const orders = await db.select().from(guestServiceOrdersTable)
      .where(and(...conds))
      .orderBy(desc(guestServiceOrdersTable.createdAt))
      .limit(limitN);

    const result = orders.map(o => {
      const booking = bookingMap[o.bookingId];
      return {
        ...o,
        guestName: booking?.guestName || "—",
        unitName: booking?.unitId ? unitMap[booking.unitId] || "—" : "—",
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Update service order status ──────────────────────────────────────
router.patch("/service-orders/:id", requireAuth, async (req: any, res) => {
  try {
    const { status, staffNote } = req.body;
    const id = parseInt(req.params.id);
    const update: any = { updatedAt: new Date() };
    if (status) update.status = status;
    if (staffNote !== undefined) update.staffNote = staffNote;
    const [updated] = await db.update(guestServiceOrdersTable).set(update)
      .where(eq(guestServiceOrdersTable.id, id)).returning();
    res.json(updated);
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

    // Resolve address: prefer legal entity address (same source as invoices), fallback to property address
    let resolvedAddress = booking.propertyAddress;
    const legalEntities = await db.select({
      address: legalEntitiesTable.address,
      isDefault: legalEntitiesTable.isDefault,
      isActive: legalEntitiesTable.isActive,
    }).from(legalEntitiesTable)
      .where(eq(legalEntitiesTable.organizationId, booking.orgId));
    const legalEntity = legalEntities.find(e => e.isDefault) || legalEntities.find(e => e.isActive) || legalEntities[0];
    if (legalEntity?.address) resolvedAddress = legalEntity.address;

    res.json({ booking: { ...booking, propertyAddress: resolvedAddress }, orders, loyalty, messages, review: review || null, offers });
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

    // Notify reception
    db.select({ orgId: propertiesTable.organizationId, unitName: unitsTable.name })
      .from(unitsTable).innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(unitsTable.id, booking.unitId)).limit(1)
      .then(([ctx]) => {
        if (ctx) notifyOrgStaff(ctx.orgId, booking.id, "checkin",
          "📋 Онлайн чекін заповнено",
          `${firstName || ""} ${lastName || ""} (${ctx.unitName}) заповнив форму заїзду через портал. Підтвердьте заїзд.`
        );
      }).catch(() => {});

    res.json({ success: true, message: "Форму заїзду успішно подано. Вам нараховано 50 балів лояльності!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// GET /api/guest/:code/services — fetch from addons table (org-level + property-level)
router.get("/:code/services", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();

    // Resolve booking → unit → property → org
    const [row] = await db.select({
      bookingId: bookingsTable.id,
      unitId: bookingsTable.unitId,
      propertyId: unitsTable.propertyId,
      orgId: propertiesTable.organizationId,
    }).from(bookingsTable)
      .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(bookingsTable.guestAccessCode, code));

    if (!row) return res.status(404).json({ error: "Бронювання не знайдено" });

    // Fetch addons: org-level (propertyId IS NULL) + property-specific
    const addons = await db.select().from(addonsTable)
      .where(and(
        eq(addonsTable.organizationId, row.orgId),
        eq(addonsTable.isActive, true),
      ))
      .orderBy(addonsTable.sortOrder, addonsTable.name);

    // Filter: include org-level addons + this property's addons
    const filtered = addons.filter((a: any) =>
      a.propertyId === null || a.propertyId === row.propertyId
    );

    const services = filtered.map((a: any) => ({
      id: String(a.id),
      addonId: a.id,
      type: a.category || "service",
      icon: a.icon || "🔧",
      name: a.name,
      description: a.description || "",
      price: Number(a.price),
      currency: "UAH",
      available: true,
      unit: a.unit,
      maxQuantity: a.maxQuantity,
      slots: Array.isArray(a.timeSlots) ? a.timeSlots : [],
      perDay: a.unit === "per day",
    }));

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

    const { serviceId, addonId, serviceName, serviceType, quantity, requestedTime, guestNotes, price } = req.body;
    if (!serviceName) return res.status(400).json({ error: "Назва послуги обов'язкова" });

    const qty = parseInt(quantity) || 1;
    const pricePerUnit = parseFloat(price) || 0;

    const [order] = await db.insert(guestServiceOrdersTable).values({
      bookingId: booking.id,
      addonId: addonId ? parseInt(addonId) : null,
      orderType: (serviceType || "service") as any,
      serviceName, quantity: qty, pricePerUnit: pricePerUnit.toString(),
      totalPrice: (pricePerUnit * qty).toString(),
      requestedFor: requestedTime ? new Date(requestedTime) : undefined,
      guestNotes: guestNotes || null, status: "pending",
      metadata: { serviceId: serviceId || "" },
    }).returning();

    // Notify reception
    db.select({ orgId: propertiesTable.organizationId, unitName: unitsTable.name })
      .from(unitsTable).innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(unitsTable.id, booking.unitId)).limit(1)
      .then(([ctx]) => {
        if (ctx) notifyOrgStaff(ctx.orgId, booking.id, "alert",
          "🛎 Нове замовлення від гостя",
          `${ctx.unitName}: замовлено «${serviceName}» (×${qty}${pricePerUnit ? `, ${(pricePerUnit * qty).toLocaleString("uk-UA")} грн` : ""}). Потрібне підтвердження.`
        );
      }).catch(() => {});

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

    // Notify reception
    db.select({ orgId: propertiesTable.organizationId, unitName: unitsTable.name })
      .from(unitsTable).innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(unitsTable.id, booking.unitId)).limit(1)
      .then(([ctx]) => {
        if (ctx) notifyOrgStaff(ctx.orgId, booking.id, "alert",
          "🚪 Запит на виїзд",
          `${ctx.unitName}: гість запланував виїзд о ${preferredTime || "стандартний час"}${luggageStorage ? ", зберігання багажу" : ""}. Підтвердіть виїзд.`
        );
      }).catch(() => {});

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

    // Notify reception
    db.select({ orgId: propertiesTable.organizationId, unitName: unitsTable.name })
      .from(bookingsTable)
      .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(bookingsTable.id, booking.id)).limit(1)
      .then(([ctx]) => {
        if (ctx) notifyOrgStaff(ctx.orgId, booking.id, "alert",
          "💬 Нове повідомлення від гостя",
          `${guestName} (${ctx.unitName}): «${message.trim().slice(0, 120)}${message.trim().length > 120 ? "…" : ""}»`
        );
      }).catch(() => {});

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
