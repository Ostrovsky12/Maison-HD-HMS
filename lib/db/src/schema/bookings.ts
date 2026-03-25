import { pgTable, serial, integer, timestamp, numeric, text, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";
import { guestsTable } from "./guests";

export const bookingStatusEnum = pgEnum("booking_status", ["pending", "confirmed", "checked_in", "checked_out", "cancelled"]);
export const paymentStatusEnum = pgEnum("payment_status", ["unpaid", "partial", "paid"]);
export const bookingSourceEnum = pgEnum("booking_source", ["direct", "booking", "airbnb", "other"]);

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id),
  guestId: integer("guest_id").notNull().references(() => guestsTable.id),
  checkIn: date("check_in").notNull(),
  checkOut: date("check_out").notNull(),
  status: bookingStatusEnum("status").notNull().default("pending"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("unpaid"),
  source: bookingSourceEnum("source").notNull().default("direct"),
  guestsCount: integer("guests_count").notNull().default(1),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
