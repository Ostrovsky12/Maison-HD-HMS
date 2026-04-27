import { pgTable, serial, integer, timestamp, numeric, text, date, pgEnum, varchar, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";
import { guestsTable } from "./guests";
import { organizationsTable } from "./organizations";

export const bookingStatusEnum = pgEnum("booking_status", ["pending", "confirmed", "checked_in", "checked_out", "cancelled", "draft"]);
export const paymentStatusEnum = pgEnum("payment_status", ["unpaid", "partial", "paid"]);
export const bookingSourceEnum = pgEnum("booking_source", [
  "direct", "phone", "walk_in", "instagram", "telegram", "viber",
  "booking", "airbnb", "expedia", "olx", "email",
  "corporate", "agent", "referral", "repeat", "other",
]);

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id),
  guestId: integer("guest_id").references(() => guestsTable.id),

  // Multi-tenancy — denormalized for fast org-scoped queries
  organizationId: integer("organization_id").references(() => organizationsTable.id),

  // Dates & times
  checkIn: date("check_in").notNull(),
  checkOut: date("check_out").notNull(),
  checkinTime: varchar("checkin_time", { length: 5 }).default("14:00"),
  checkoutTime: varchar("checkout_time", { length: 5 }).default("12:00"),
  actualCheckIn: timestamp("actual_check_in", { withTimezone: true }),
  actualCheckOut: timestamp("actual_check_out", { withTimezone: true }),
  noShowAt: timestamp("no_show_at", { withTimezone: true }),

  // Status
  status: bookingStatusEnum("status").notNull().default("pending"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("unpaid"),

  // Source & channel
  source: bookingSourceEnum("source").notNull().default("direct"),
  sourceId: integer("source_id"),
  confirmationNo: text("confirmation_no"),
  externalId: text("external_id"),
  channelConfirmNo: text("channel_confirm_no"),
  ratePlanCode: text("rate_plan_code"),
  currency: text("currency").default("UAH"),

  // Rate
  rateId: integer("rate_id"),
  rateName: varchar("rate_name", { length: 255 }),

  // Guests
  adults: integer("adults").notNull().default(1),
  childrenUnder6: integer("children_under_6").notNull().default(0),
  childrenOver6: integer("children_over_6").notNull().default(0),
  extraBeds: integer("extra_beds").notNull().default(0),
  guestsCount: integer("guests_count").notNull().default(1),
  withPets: boolean("with_pets").notNull().default(false),

  // Guest info (if no guest record)
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  middleName: varchar("middle_name", { length: 100 }),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 255 }),

  // Guest analytics
  isRepeatGuest: boolean("is_repeat_guest").default(false),
  repeatBookingCount: integer("repeat_booking_count").default(0),

  // Financials
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  discountId: integer("discount_id"),
  discountValue: numeric("discount_value", { precision: 10, scale: 2 }),
  discountType: varchar("discount_type", { length: 50 }),
  addonIds: jsonb("addon_ids").$type<number[]>().default([]),
  selectedAddons: jsonb("selected_addons").$type<Record<string, boolean | string>>().default({}),
  payOnArrival: boolean("pay_on_arrival").notNull().default(false),
  folioId: integer("folio_id"),

  // References
  bookingRef: varchar("booking_ref", { length: 20 }).unique(),
  legalEntityId: integer("legal_entity_id"),

  // Payment
  paymentLink: text("payment_link"),

  // Guest portal
  guestAccessCode: varchar("guest_access_code", { length: 20 }).unique(),
  checkinFormSubmitted: boolean("checkin_form_submitted").default(false),
  checkinFormData: jsonb("checkin_form_data").$type<Record<string, string>>().default({}),

  // Marketing attribution
  utmSource: varchar("utm_source", { length: 255 }),
  utmMedium: varchar("utm_medium", { length: 255 }),
  utmCampaign: varchar("utm_campaign", { length: 255 }),
  referralCode: varchar("referral_code", { length: 100 }),

  // Notes
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  tags: jsonb("tags").$type<string[]>().default([]),

  // Group booking (multiple units in one reservation)
  groupBookingId: varchar("group_booking_id", { length: 36 }),

  // Draft
  draftExpiresAt: timestamp("draft_expires_at"),

  // Cancellation
  cancelledBy: integer("cancelled_by"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  cancellationPolicy: text("cancellation_policy"),

  // Audit
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
