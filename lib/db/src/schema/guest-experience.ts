import { pgTable, serial, integer, text, numeric, boolean, timestamp, date, pgEnum } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { bookingsTable } from "./bookings";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const loyaltyTierEnum = pgEnum("loyalty_tier", ["bronze", "silver", "gold", "platinum"]);
export const guestMessageDirectionEnum = pgEnum("guest_message_direction", ["guest_to_hotel", "hotel_to_guest"]);
export const offerStatusEnum = pgEnum("offer_status_ge", ["active", "expired", "used"]);

// Loyalty program — one account per email per organization
export const guestLoyaltyTable = pgTable("guest_loyalty", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  tier: loyaltyTierEnum("tier").notNull().default("bronze"),
  points: integer("points").notNull().default(0),
  totalPoints: integer("total_points").notNull().default(0),
  totalSpend: numeric("total_spend", { precision: 12, scale: 2 }).notNull().default("0"),
  visitsCount: integer("visits_count").notNull().default(0),
  lastVisitDate: date("last_visit_date"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
});

// Points transaction log
export const loyaltyTransactionsTable = pgTable("loyalty_transactions", {
  id: serial("id").primaryKey(),
  loyaltyId: integer("loyalty_id").notNull().references(() => guestLoyaltyTable.id),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  type: text("type").notNull(), // earn, redeem, bonus, expiry
  points: integer("points").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Post-stay reviews & NPS
export const guestReviewsTable = pgTable("guest_reviews", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  guestEmail: text("guest_email"),
  guestName: text("guest_name"),
  accessCode: text("access_code"),
  overallRating: integer("overall_rating"),
  cleanlinessRating: integer("cleanliness_rating"),
  serviceRating: integer("service_rating"),
  locationRating: integer("location_rating"),
  valueRating: integer("value_rating"),
  reviewText: text("review_text"),
  npsScore: integer("nps_score"),
  wouldReturn: boolean("would_return"),
  recommendToFriend: boolean("recommend_to_friend"),
  isPublished: boolean("is_published").notNull().default(false),
  staffResponse: text("staff_response"),
  requestSentAt: timestamp("request_sent_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Guest portal messages (two-way chat per booking)
export const guestPortalMessagesTable = pgTable("guest_portal_messages", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id),
  direction: guestMessageDirectionEnum("direction").notNull(),
  senderName: text("sender_name"),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Special offers / promo codes for guests
export const guestSpecialOffersTable = pgTable("guest_special_offers", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  title: text("title").notNull(),
  description: text("description"),
  promoCode: text("promo_code"),
  discountPct: integer("discount_pct"),
  discountFixed: numeric("discount_fixed", { precision: 10, scale: 2 }),
  validFrom: date("valid_from"),
  validUntil: date("valid_until"),
  targetAudience: text("target_audience").default("all"), // all, returning, vip, new
  minNights: integer("min_nights"),
  status: offerStatusEnum("status").notNull().default("active"),
  usageLimit: integer("usage_limit"),
  usageCount: integer("usage_count").notNull().default(0),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Pre-arrival & post-stay communication log
export const guestCommunicationLogTable = pgTable("guest_communication_log", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id),
  type: text("type").notNull(), // pre_checkin_reminder, upsell_offer, post_stay_review, special_offer, welcome
  channel: text("channel").notNull().default("portal"), // portal, email, sms, whatsapp
  subject: text("subject"),
  content: text("content"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  clickedAt: timestamp("clicked_at", { withTimezone: true }),
});

export const insertGuestLoyaltySchema = createInsertSchema(guestLoyaltyTable).omit({ id: true, joinedAt: true });
export const insertGuestReviewSchema = createInsertSchema(guestReviewsTable).omit({ id: true, createdAt: true });
export const insertGuestPortalMessageSchema = createInsertSchema(guestPortalMessagesTable).omit({ id: true, createdAt: true });
export const insertGuestSpecialOfferSchema = createInsertSchema(guestSpecialOffersTable).omit({ id: true, createdAt: true });

export type GuestLoyalty = typeof guestLoyaltyTable.$inferSelect;
export type GuestReview = typeof guestReviewsTable.$inferSelect;
export type GuestPortalMessage = typeof guestPortalMessagesTable.$inferSelect;
export type GuestSpecialOffer = typeof guestSpecialOffersTable.$inferSelect;
