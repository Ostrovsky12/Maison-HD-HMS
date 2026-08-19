import { Router } from "express";
import rateLimit from "express-rate-limit";
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

// Rate limiter for access-code endpoints — prevents brute-force of 10-char codes
const accessCodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // 20 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Забагато спроб. Спробуйте пізніше." },
});

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

// ── Helper: resolve the organization that owns a booking (via unit→property) ─
async function getBookingOrgId(bookingId: number): Promise<number | null> {
  const [row] = await db
    .select({ orgId: propertiesTable.organizationId })
    .from(bookingsTable)
    .innerJoin(unitsTable, eq(bookingsTable.unitId, unitsTable.id))
    .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
    .where(eq(bookingsTable.id, bookingId))
    .limit(1);
  return row?.orgId ?? null;
}

// ── Helper: assert caller has an organizationId; return 403 if not ────────────
function requireOrgId(orgId: number | null | undefined, res: any): orgId is number {
  if (!orgId) {
    res.status(403).json({ error: "Forbidden", message: "organizationId is required" });
    return false;
  }
  return true;
}

// ── Helper: parse and validate a numeric id param, return 400 on failure ─────
function parseId(val: string, res: any): number | null {
  const n = parseInt(val, 10);
  if (!Number.isFinite(n) || n <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return null;
  }
  return n;
}

// ── Helper: assert booking belongs to caller's org, return 403/404 if not ────
async function assertBookingBelongsToOrg(
  bookingId: number,
  orgId: number,
  res: any,
): Promise<boolean> {
  const ownerOrgId = await getBookingOrgId(bookingId);
  if (ownerOrgId === null) {
    res.status(404).json({ error: "Бронювання не знайдено" });
    return false;
  }
  if (ownerOrgId !== orgId) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

const router = Router();

function generateAccessCode(): string {
  return randomBytes(5).toString("hex").toUpperCase();
}

// ── Staff: Generate/get guest access link ─────────────────────────────────
router.post("/generate/:bookingId", requireAuth, async (req: any, res) => {
  try {
    const bookingId = parseId(req.params.bookingId, res);
    if (bookingId === null) return;
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin) {
      if (!requireOrgId(orgId, res)) return;
      if (!(await assertBookingBelongsToOrg(bookingId, orgId!, res))) return;
    }

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
    const bookingId = parseId(req.params.bookingId, res);
    if (bookingId === null) return;
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin) {
      if (!requireOrgId(orgId, res)) return;
      if (!(await assertBookingBelongsToOrg(bookingId, orgId!, res))) return;
    }

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
    const bookingId = parseId(req.params.bookingId, res);
    if (bookingId === null) return;
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin) {
      if (!requireOrgId(orgId, res)) return;
      if (!(await assertBookingBelongsToOrg(bookingId, orgId!, res))) return;
    }

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
    const bookingId = parseId(req.params.bookingId, res);
    if (bookingId === null) return;
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin) {
      if (!requireOrgId(orgId, res)) return;
      if (!(await assertBookingBelongsToOrg(bookingId, orgId!, res))) return;
    }

    const [booking] = await db.select({
      guestEmail: bookingsTable.email,
      firstName: bookingsTable.firstName,
      lastName: bookingsTable.lastName,
      guestAccessCode: bookingsTable.guestAccessCode,
    }).from(bookingsTable).where(eq(bookingsTable.id, bookingId));
    if (!booking) return res.status(404).json({ error: "Не знайдено" });

    // Resolve effective orgId for the insert (super_admin path resolves from booking)
    const effectiveOrgId = isSuperAdmin
      ? await getBookingOrgId(bookingId)
      : orgId!;
    if (effectiveOrgId === null) return res.status(404).json({ error: "Не знайдено" });

    const existing = await db.select().from(guestReviewsTable)
      .where(and(eq(guestReviewsTable.bookingId, bookingId)));
    if (existing.length === 0) {
      await db.insert(guestReviewsTable).values({
        organizationId: effectiveOrgId, bookingId,
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
    const bookingId = parseId(req.params.bookingId, res);
    if (bookingId === null) return;
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin) {
      if (!requireOrgId(orgId, res)) return;
      if (!(await assertBookingBelongsToOrg(bookingId, orgId!, res))) return;
    }

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
    const bookingId = parseId(req.params.bookingId, res);
    if (bookingId === null) return;
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin) {
      if (!requireOrgId(orgId, res)) return;
      if (!(await assertBookingBelongsToOrg(bookingId, orgId!, res))) return;
    }

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

// ── Staff: Mark message as read ─────────────────────────────────────────────
router.patch("/messages/:id/read", requireAuth, async (req: any, res) => {
  try {
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";
    const msgId = parseId(req.params.id, res);
    if (msgId === null) return;

    if (!isSuperAdmin) {
      // Non-super-admin must have an organizationId and can only mark messages
      // for bookings that belong to their organization.
      if (!requireOrgId(orgId, res)) return;
      await db.execute(sql`
        UPDATE guest_portal_messages SET is_read = true
        WHERE id = ${msgId}
          AND booking_id IN (
            SELECT b.id FROM bookings b
            JOIN units u ON u.id = b.unit_id
            JOIN properties p ON p.id = u.property_id
            WHERE p.organization_id = ${orgId}
          )
      `);
    } else {
      await db.update(guestPortalMessagesTable).set({ isRead: true })
        .where(eq(guestPortalMessagesTable.id, msgId));
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Staff: Portal threads for Inbox (all bookings with messages) ───────────
router.get("/portal-threads", requireAuth, async (req: any, res) => {
  try {
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin && !requireOrgId(orgId, res)) return;

    const rows = isSuperAdmin
      ? await db.execute(sql`
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
          GROUP BY b.id, b.booking_ref, b.guest_access_code, b.check_in, b.check_out,
                   b.status, b.first_name, b.last_name, b.phone, u.name
          ORDER BY last_message_at DESC
        `)
      : await db.execute(sql`
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
    const bookingId = parseId(req.params.bookingId, res);
    if (bookingId === null) return;
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin) {
      if (!requireOrgId(orgId, res)) return;
      if (!(await assertBookingBelongsToOrg(bookingId, orgId!, res))) return;
    }

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
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin && !requireOrgId(orgId, res)) return;

    const accounts = isSuperAdmin
      ? await db.select().from(guestLoyaltyTable).orderBy(desc(guestLoyaltyTable.totalPoints))
      : await db.select().from(guestLoyaltyTable)
          .where(eq(guestLoyaltyTable.organizationId, orgId!))
          .orderBy(desc(guestLoyaltyTable.totalPoints));
    res.json({ accounts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Staff: All reviews ─────────────────────────────────────────────────────
router.get("/reviews", requireAuth, async (req: any, res) => {
  try {
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin && !requireOrgId(orgId, res)) return;

    const reviews = isSuperAdmin
      ? await db.select().from(guestReviewsTable).orderBy(desc(guestReviewsTable.createdAt))
      : await db.select().from(guestReviewsTable)
          .where(eq(guestReviewsTable.organizationId, orgId!))
          .orderBy(desc(guestReviewsTable.createdAt));
    res.json({ reviews });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/reviews/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";
    const id = parseId(req.params.id, res);
    if (id === null) return;

    if (!isSuperAdmin && !requireOrgId(orgId, res)) return;

    const { isPublished, staffResponse } = req.body;
    const [rev] = await db.select({ revOrgId: guestReviewsTable.organizationId })
      .from(guestReviewsTable).where(eq(guestReviewsTable.id, id)).limit(1);
    if (!rev) return res.status(404).json({ error: "Review not found" });
    if (!isSuperAdmin && rev.revOrgId !== orgId) return res.status(403).json({ error: "Forbidden" });

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
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin && !requireOrgId(orgId, res)) return;

    const offers = isSuperAdmin
      ? await db.select().from(guestSpecialOffersTable).orderBy(desc(guestSpecialOffersTable.createdAt))
      : await db.select().from(guestSpecialOffersTable)
          .where(eq(guestSpecialOffersTable.organizationId, orgId!))
          .orderBy(desc(guestSpecialOffersTable.createdAt));
    res.json({ offers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/offers", requireAuth, async (req: any, res) => {
  try {
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin && !requireOrgId(orgId, res)) return;

    // Super-admin must supply organizationId in the body; regular staff use their own.
    const effectiveOrgId: number | null = isSuperAdmin
      ? (req.body.organizationId ? parseInt(req.body.organizationId) : null)
      : orgId!;
    if (!effectiveOrgId) return res.status(400).json({ error: "organizationId is required" });

    const { title, description, promoCode, discountPct, discountFixed, validFrom, validUntil, targetAudience, minNights, usageLimit } = req.body;
    const [offer] = await db.insert(guestSpecialOffersTable).values({
      organizationId: effectiveOrgId, title, description, promoCode,
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
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin && !requireOrgId(orgId, res)) return;

    // Verify ownership before updating
    const [existing] = await db.select({ offOrgId: guestSpecialOffersTable.organizationId })
      .from(guestSpecialOffersTable).where(eq(guestSpecialOffersTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Offer not found" });
    if (!isSuperAdmin && existing.offOrgId !== orgId) return res.status(403).json({ error: "Forbidden" });

    const { status, title, description, discountPct, validUntil } = req.body;
    const updated = await db.update(guestSpecialOffersTable)
      .set({ status: status ?? undefined, title: title ?? undefined, description: description ?? undefined,
        discountPct: discountPct ?? undefined, validUntil: validUntil ?? undefined })
      .where(eq(guestSpecialOffersTable.id, id))
      .returning();
    res.json({ offer: updated[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/offers/:id", requireAuth, async (req: any, res) => {
  try {
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";
    const id = parseId(req.params.id, res);
    if (id === null) return;

    if (!isSuperAdmin && !requireOrgId(orgId, res)) return;

    // Verify ownership before deleting
    const [existing] = await db.select({ offOrgId: guestSpecialOffersTable.organizationId })
      .from(guestSpecialOffersTable).where(eq(guestSpecialOffersTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Offer not found" });
    if (!isSuperAdmin && existing.offOrgId !== orgId) return res.status(403).json({ error: "Forbidden" });

    await db.delete(guestSpecialOffersTable).where(eq(guestSpecialOffersTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Staff: Guest communications history ────────────────────────────────────
router.get("/communications/:bookingId", requireAuth, async (req: any, res) => {
  try {
    const bookingId = parseId(req.params.bookingId, res);
    if (bookingId === null) return;
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin) {
      if (!requireOrgId(orgId, res)) return;
      if (!(await assertBookingBelongsToOrg(bookingId, orgId!, res))) return;
    }

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
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin && !requireOrgId(orgId, res)) return;

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
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin && !requireOrgId(orgId, res)) return;

    const propIds = isSuperAdmin
      ? await db.select({ id: propertiesTable.id }).from(propertiesTable)
      : await db.select({ id: propertiesTable.id }).from(propertiesTable)
          .where(eq(propertiesTable.organizationId, orgId!));
    const pIds = propIds.map(p => p.id);
    if (pIds.length === 0) return res.json([]);

    const unitRows = await db.select({ id: unitsTable.id, name: unitsTable.name })
      .from(unitsTable).where(inArray(unitsTable.propertyId, pIds));
    const uIds = unitRows.map(u => u.id);
    const unitMap = Object.fromEntries(unitRows.map(u => [u.id, u.name]));

    if (uIds.length === 0) return res.json([]);

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
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin && !requireOrgId(orgId, res)) return;

    const propIds = isSuperAdmin
      ? await db.select({ id: propertiesTable.id }).from(propertiesTable)
      : await db.select({ id: propertiesTable.id }).from(propertiesTable)
          .where(eq(propertiesTable.organizationId, orgId!));
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
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin && !requireOrgId(orgId, res)) return;

    const { bookingId: rawBookingId, serviceName, serviceType, quantity, requestedTime, guestNotes, price, totalPrice } = req.body;
    if (!rawBookingId || !serviceName) return res.status(400).json({ error: "bookingId and serviceName required" });

    const bookingId = parseInt(rawBookingId);
    if (!Number.isFinite(bookingId) || bookingId <= 0) return res.status(400).json({ error: "Invalid bookingId" });

    if (!isSuperAdmin) {
      if (!(await assertBookingBelongsToOrg(bookingId, orgId!, res))) return;
    }

    const [order] = await db.insert(guestServiceOrdersTable).values({
      bookingId,
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
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin && !requireOrgId(orgId, res)) return;

    const { status, limit: lim } = req.query;
    const limitN = parseInt(lim as string) || 100;

    const propIds = isSuperAdmin
      ? await db.select({ id: propertiesTable.id }).from(propertiesTable)
      : await db.select({ id: propertiesTable.id }).from(propertiesTable)
          .where(eq(propertiesTable.organizationId, orgId!));
    const pIds = propIds.map(p => p.id);
    if (pIds.length === 0) return res.json([]);

    const unitRows = await db.select({ id: unitsTable.id, name: unitsTable.name, propertyId: unitsTable.propertyId })
      .from(unitsTable).where(inArray(unitsTable.propertyId, pIds));
    const uIds = unitRows.map(u => u.id);
    if (uIds.length === 0) return res.json([]);

    const unitMap = Object.fromEntries(unitRows.map(u => [u.id, u.name]));

    const bookingRows = await db.select({
        id: bookingsTable.id, unitId: bookingsTable.unitId,
        firstName: bookingsTable.firstName, lastName: bookingsTable.lastName,
      })
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
      const booking = o.bookingId != null ? bookingMap[o.bookingId] : null;
      return {
        ...o,
        guestName: booking ? [booking.firstName, booking.lastName].filter(Boolean).join(" ") || "—" : "—",
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
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";
    const id = parseId(req.params.id, res);
    if (id === null) return;

    if (!isSuperAdmin && !requireOrgId(orgId, res)) return;

    // Resolve the booking that owns this order and verify org ownership
    if (!isSuperAdmin) {
      const [orderRow] = await db.select({ bookingId: guestServiceOrdersTable.bookingId })
        .from(guestServiceOrdersTable).where(eq(guestServiceOrdersTable.id, id)).limit(1);
      if (!orderRow) return res.status(404).json({ error: "Order not found" });
      if (orderRow.bookingId === null) return res.status(404).json({ error: "Order has no booking" });
      if (!(await assertBookingBelongsToOrg(orderRow.bookingId, orgId!, res))) return;
    }

    const { status, staffNote } = req.body;
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
router.get("/:code", accessCodeLimiter, async (req, res) => {
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
      orgPaymentUrl: organizationsTable.paymentUrl,
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
router.post("/:code/checkin", accessCodeLimiter, async (req, res) => {
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

    // Auto-create or update loyalty account — only award points on FIRST checkin submission
    const alreadySubmitted = (booking as any).checkinFormSubmitted;
    if (email && !alreadySubmitted) {
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
            // Add checkin bonus points (only once — guarded by alreadySubmitted above)
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
router.post("/:code/service-order", accessCodeLimiter, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.guestAccessCode, code));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });
    if (booking.status === "cancelled") return res.status(410).json({ error: "Бронювання скасовано" });

    const { serviceId, addonId, serviceName, serviceType, quantity, requestedTime, guestNotes, price } = req.body;
    if (!serviceName) return res.status(400).json({ error: "Назва послуги обов'язкова" });

    // Validate quantity — must be a positive integer
    const qty = Math.max(1, Math.min(99, parseInt(quantity) || 1));

    // Price must come from the server-side catalog when an addonId is supplied.
    // For free-form service requests (no addonId), price is informational and clamped to non-negative.
    let pricePerUnit = 0;
    if (addonId) {
      const addonRow = await db.execute(sql`
        SELECT price FROM unit_addons WHERE id = ${parseInt(addonId)} LIMIT 1
      `);
      pricePerUnit = addonRow.rows.length ? parseFloat(String(addonRow.rows[0].price)) || 0 : 0;
    } else {
      // Free-form request: accept the submitted price only as a non-negative hint
      const submitted = parseFloat(price);
      pricePerUnit = Number.isFinite(submitted) && submitted >= 0 ? submitted : 0;
    }

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
router.post("/:code/checkout-request", accessCodeLimiter, async (req, res) => {
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

// POST /api/guest/:code/payment-notify — guest notifies about online payment (public)
router.post("/:code/payment-notify", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const [booking] = await db.select({
      id: bookingsTable.id,
      firstName: bookingsTable.firstName,
      lastName: bookingsTable.lastName,
      totalAmount: bookingsTable.totalAmount,
      paidAmount: bookingsTable.paidAmount,
      unitId: bookingsTable.unitId,
    }).from(bookingsTable).where(eq(bookingsTable.guestAccessCode, code));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });

    const guestName = [booking.firstName, booking.lastName].filter(Boolean).join(" ") || "Гість";
    const debt = Math.max(0, parseFloat(booking.totalAmount || "0") - parseFloat(booking.paidAmount || "0"));

    const msgText = `💸 PAYMENT_CLAIM|bookingId=${booking.id}|amount=${debt}\nГість підтверджує онлайн-оплату ${debt.toLocaleString("uk-UA")} ₴. Перевірте надходження та підтвердіть.`;
    await db.insert(guestPortalMessagesTable).values({
      bookingId: booking.id, direction: "guest_to_hotel" as any,
      senderName: guestName, message: msgText, isRead: false,
    });

    db.select({ orgId: propertiesTable.organizationId, unitName: unitsTable.name })
      .from(unitsTable).innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(unitsTable.id, booking.unitId)).limit(1)
      .then(([ctx]) => {
        if (ctx) notifyOrgStaff(ctx.orgId, booking.id, "alert",
          "💸 Оплата від гостя",
          `${guestName} підтверджує оплату ${debt.toLocaleString("uk-UA")} ₴. Перевірте та натисніть «Підтвердити» у чаті порталу.`
        );
      }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// POST /api/guest/payment-confirm/:bookingId — staff confirms guest payment (auth required)
router.post("/payment-confirm/:bookingId", requireAuth, async (req: any, res) => {
  try {
    const bookingId = parseId(req.params.bookingId, res);
    if (bookingId === null) return;
    const orgId: number | null = req.user?.organizationId ?? null;
    const isSuperAdmin = req.user?.role === "super_admin";

    if (!isSuperAdmin) {
      if (!requireOrgId(orgId, res)) return;
      if (!(await assertBookingBelongsToOrg(bookingId, orgId!, res))) return;
    }

    const [booking] = await db.select().from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId));
    if (!booking) return res.status(404).json({ error: "Бронювання не знайдено" });

    const total = parseFloat(booking.totalAmount || "0");
    const paid = parseFloat(booking.paidAmount || "0");
    const debt = Math.max(0, total - paid);
    if (debt <= 0) return res.json({ success: true, message: "Вже повністю сплачено" });

    await db.update(bookingsTable).set({
      paidAmount: String(total),
      paymentStatus: "paid",
      updatedAt: new Date(),
    }).where(eq(bookingsTable.id, bookingId));

    await db.execute(sql`
      INSERT INTO payments (booking_id, amount, method, status, description, payment_type, currency)
      VALUES (${bookingId}, ${debt}, 'card', 'completed', 'Онлайн-оплата (підтверджено рецепцією)', 'payment', 'UAH')
    `);

    const guestName = [booking.firstName, booking.lastName].filter(Boolean).join(" ") || "Гість";
    await db.insert(guestPortalMessagesTable).values({
      bookingId,
      direction: "hotel_to_guest" as any,
      senderName: "Рецепція",
      message: `✅ Оплату ${debt.toLocaleString("uk-UA")} ₴ підтверджено! Ваш баланс: 0 ₴. Дякуємо!`,
      isRead: false,
    });

    res.json({ success: true, confirmedAmount: debt, guestName });
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
      if (!prop?.orgId) return res.status(404).json({ error: "Організацію не знайдено" });
      await db.insert(guestReviewsTable).values({
        organizationId: prop.orgId, bookingId: booking.id, guestName, guestEmail: booking.email,
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

// GET /api/guest/:code/documents/:type/download — generate printable HTML document
router.get("/:code/documents/:type/download", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const type = req.params.type;

    const [booking] = await db.select({
      id: bookingsTable.id, bookingRef: bookingsTable.bookingRef,
      firstName: bookingsTable.firstName, lastName: bookingsTable.lastName,
      checkIn: bookingsTable.checkIn, checkOut: bookingsTable.checkOut,
      totalAmount: bookingsTable.totalAmount, paidAmount: bookingsTable.paidAmount,
      paymentStatus: bookingsTable.paymentStatus, checkinFormSubmitted: bookingsTable.checkinFormSubmitted,
      checkinFormData: bookingsTable.checkinFormData, unitId: bookingsTable.unitId,
      adults: bookingsTable.adults, phone: bookingsTable.phone, email: bookingsTable.email,
    }).from(bookingsTable).where(eq(bookingsTable.guestAccessCode, code));
    if (!booking) return res.status(404).send("<h1>Не знайдено</h1>");

    const [unit] = await db.select({ name: unitsTable.name, propertyId: unitsTable.propertyId })
      .from(unitsTable).where(eq(unitsTable.id, booking.unitId!));
    const [property] = unit ? await db.select({ name: propertiesTable.name, address: propertiesTable.address, organizationId: propertiesTable.organizationId })
      .from(propertiesTable).where(eq(propertiesTable.id, unit.propertyId)) : [null];
    const [org] = property ? await db.select({ name: organizationsTable.name })
      .from(organizationsTable).where(eq(organizationsTable.id, property.organizationId)) : [null];

    const guestName = `${booking.firstName || ""} ${booking.lastName || ""}`.trim() || "Гість";
    const ref = booking.bookingRef || `#${booking.id}`;
    const propName = property?.name || "";
    const orgName = org?.name || "";
    const total = parseFloat(booking.totalAmount || "0");
    const paid = parseFloat(booking.paidAmount || "0");
    const balance = Math.max(0, total - paid);
    const fd = (booking.checkinFormData as Record<string, string>) || {};
    const checkIn = booking.checkIn ? new Date(booking.checkIn).toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" }) : "—";
    const checkOut = booking.checkOut ? new Date(booking.checkOut).toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" }) : "—";
    const today = new Date().toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" });

    const css = `
      body{font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:32px;color:#1a1a1a;font-size:14px}
      .logo{font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#4f46e5}
      .subtitle{color:#6b7280;font-size:12px;margin-top:2px}
      h1{font-size:20px;font-weight:700;margin:24px 0 4px}
      .doc-type{display:inline-block;background:#f0f0ff;color:#4f46e5;font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;margin:12px 0}
      td{padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:13px}
      td:first-child{color:#6b7280;width:45%}
      td:last-child{font-weight:600;text-align:right}
      .total{background:#f8f8ff;border-radius:10px;padding:14px 16px;margin:16px 0}
      .total-row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
      .total-row.debt{color:#dc2626;font-weight:700;font-size:15px;border-top:1px solid #e5e7eb;margin-top:8px;padding-top:8px}
      .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center}
      .stamp{display:inline-block;border:2px solid #16a34a;color:#16a34a;padding:6px 18px;border-radius:6px;font-weight:700;font-size:13px;transform:rotate(-3deg);margin-top:8px}
      @media print{.no-print{display:none}body{padding:16px}}
    `;
    const printBtn = `<div class="no-print" style="margin-bottom:24px"><button onclick="window.print()" style="background:#4f46e5;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">🖨️ Друкувати / Зберегти PDF</button></div>`;
    const header = `<div class="logo">${orgName || "Maison HD"}</div><div class="subtitle">${propName}</div>`;
    const footerHtml = `<div class="footer">${orgName} · ${propName} · ${property?.address || ""}<br>Дата формування: ${today}</div>`;
    const autoprint = `<script>window.onload=function(){if(document.referrer){}}</script>`;

    let body = "";

    if (type === "confirmation") {
      body = `
        <h1>Підтвердження бронювання</h1>
        <span class="doc-type">📄 Підтвердження</span>
        <table>
          <tr><td>Номер бронювання</td><td>${ref}</td></tr>
          <tr><td>Гість</td><td>${guestName}</td></tr>
          <tr><td>Телефон</td><td>${booking.phone || "—"}</td></tr>
          <tr><td>Email</td><td>${booking.email || "—"}</td></tr>
          <tr><td>Номер</td><td>${unit?.name || "—"}</td></tr>
          <tr><td>Заїзд</td><td>${checkIn}</td></tr>
          <tr><td>Виїзд</td><td>${checkOut}</td></tr>
          <tr><td>Кількість гостей</td><td>${booking.adults || 1}</td></tr>
        </table>
        <div class="stamp">✓ ПІДТВЕРДЖЕНО</div>
      `;
    } else if (type === "invoice") {
      body = `
        <h1>Рахунок-фактура</h1>
        <span class="doc-type">🧾 Рахунок</span>
        <table>
          <tr><td>Номер рахунку</td><td>INV-${ref}</td></tr>
          <tr><td>Гість</td><td>${guestName}</td></tr>
          <tr><td>Бронювання</td><td>${ref}</td></tr>
          <tr><td>Номер</td><td>${unit?.name || "—"}</td></tr>
          <tr><td>Заїзд</td><td>${checkIn}</td></tr>
          <tr><td>Виїзд</td><td>${checkOut}</td></tr>
          <tr><td>Дата рахунку</td><td>${today}</td></tr>
        </table>
        <div class="total">
          <div class="total-row"><span>Сума за проживання</span><span>${total.toLocaleString("uk-UA")} ₴</span></div>
          <div class="total-row"><span>Оплачено</span><span>${paid.toLocaleString("uk-UA")} ₴</span></div>
          ${balance > 0 ? `<div class="total-row debt"><span>До сплати</span><span>${balance.toLocaleString("uk-UA")} ₴</span></div>` : '<div class="total-row" style="color:#16a34a;font-weight:700"><span>ОПЛАЧЕНО</span><span>✓</span></div>'}
        </div>
      `;
    } else if (type === "registration") {
      const fields = [
        ["Ім'я", fd.firstName || booking.firstName],
        ["Прізвище", fd.lastName || booking.lastName],
        ["По-батькові", fd.middleName],
        ["Телефон", fd.phone || booking.phone],
        ["Email", fd.email || booking.email],
        ["Дата народження", fd.birthDate],
        ["Тип документа", fd.passportType],
        ["Номер документа", fd.passportNumber],
        ["Час заїзду", fd.arrivalTime],
        ["Номер авто", fd.carNumber],
        ["Особливі побажання", fd.specialRequests],
      ].filter(([, v]) => v);
      body = `
        <h1>Реєстраційна картка гостя</h1>
        <span class="doc-type">📋 Чекін</span>
        <table>
          ${fields.map(([l, v]) => `<tr><td>${l}</td><td>${v}</td></tr>`).join("")}
          <tr><td>Бронювання</td><td>${ref}</td></tr>
          <tr><td>Заїзд</td><td>${checkIn}</td></tr>
          <tr><td>Виїзд</td><td>${checkOut}</td></tr>
        </table>
        <div class="stamp">✓ ЗАРЕЄСТРОВАНО</div>
      `;
    } else if (type === "receipt") {
      body = `
        <h1>Квитанція про оплату</h1>
        <span class="doc-type">💳 Квитанція</span>
        <table>
          <tr><td>Квитанція №</td><td>RCP-${ref}</td></tr>
          <tr><td>Гість</td><td>${guestName}</td></tr>
          <tr><td>Бронювання</td><td>${ref}</td></tr>
          <tr><td>Номер</td><td>${unit?.name || "—"}</td></tr>
          <tr><td>Дата</td><td>${today}</td></tr>
        </table>
        <div class="total">
          <div class="total-row"><span>Загальна сума</span><span>${total.toLocaleString("uk-UA")} ₴</span></div>
          <div class="total-row" style="color:#16a34a;font-weight:700"><span>Оплачено</span><span>${paid.toLocaleString("uk-UA")} ₴</span></div>
        </div>
        <div class="stamp">✓ ОПЛАЧЕНО</div>
      `;
    } else {
      return res.status(404).send("<h1>Документ не знайдено</h1>");
    }

    const html = `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><title>${orgName}</title><style>${css}</style></head><body>${printBtn}${header}${body}${footerHtml}${autoprint}</body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("<h1>Помилка сервера</h1>");
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
