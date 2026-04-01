import { pgTable, serial, integer, timestamp, numeric, text, date, pgEnum, varchar, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";
import { guestsTable } from "./guests";

export const bookingStatusEnum = pgEnum("booking_status", ["pending", "confirmed", "checked_in", "checked_out", "cancelled", "draft"]);
export const paymentStatusEnum = pgEnum("payment_status", ["unpaid", "partial", "paid"]);
export const bookingSourceEnum = pgEnum("booking_source", ["direct", "booking", "airbnb", "other"]);

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id),
  guestId: integer("guest_id").references(() => guestsTable.id),
  checkIn: date("check_in").notNull(),
  checkOut: date("check_out").notNull(),
  checkinTime: varchar("checkin_time", { length: 5 }).default("14:00"),
  checkoutTime: varchar("checkout_time", { length: 5 }).default("12:00"),
  status: bookingStatusEnum("status").notNull().default("pending"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("unpaid"),
  source: bookingSourceEnum("source").notNull().default("direct"),
  rateId: integer("rate_id"),
  rateName: varchar("rate_name", { length: 255 }),
  adults: integer("adults").notNull().default(1),
  childrenUnder6: integer("children_under_6").notNull().default(0),
  childrenOver6: integer("children_over_6").notNull().default(0),
  extraBeds: integer("extra_beds").notNull().default(0),
  guestsCount: integer("guests_count").notNull().default(1),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  middleName: varchar("middle_name", { length: 100 }),
  phone: varchar("phone", { length: 30 }),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  discountId: integer("discount_id"),
  discountValue: numeric("discount_value", { precision: 10, scale: 2 }),
  discountType: varchar("discount_type", { length: 50 }),
  addonIds: jsonb("addon_ids").$type<number[]>().default([]),
  selectedAddons: jsonb("selected_addons").$type<Record<string, boolean | string>>().default({}),
  email: varchar("email", { length: 255 }),
  bookingRef: varchar("booking_ref", { length: 20 }).unique(),
  notes: text("notes"),
  draftExpiresAt: timestamp("draft_expires_at"),
  paymentLink: text("payment_link"),
  legalEntityId: integer("legal_entity_id"),
  guestAccessCode: varchar("guest_access_code", { length: 20 }).unique(),
  checkinFormSubmitted: boolean("checkin_form_submitted").default(false),
  checkinFormData: jsonb("checkin_form_data").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
