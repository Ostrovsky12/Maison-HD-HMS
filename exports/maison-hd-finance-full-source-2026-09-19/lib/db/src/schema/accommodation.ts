import { pgTable, serial, integer, timestamp, text, boolean, pgEnum, jsonb, numeric, varchar, date } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export const groupBookingStatusEnum = pgEnum("group_booking_status", [
  "inquiry", "confirmed", "arrived", "completed", "cancelled"
]);

export const accommodationBlockTypeEnum = pgEnum("accommodation_block_type", [
  "event", "maintenance", "owner_stay", "seasonal_close", "renovation", "other"
]);

export const groupBookingsTable = pgTable("group_bookings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  groupName: text("group_name").notNull(),
  contactName: text("contact_name"),
  contactPhone: varchar("contact_phone", { length: 30 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  company: text("company"),
  checkIn: date("check_in").notNull(),
  checkOut: date("check_out").notNull(),
  unitIds: jsonb("unit_ids").notNull().default("[]"),
  roomCount: integer("room_count").notNull().default(1),
  totalGuests: integer("total_guests").notNull().default(1),
  adults: integer("adults").notNull().default(1),
  children: integer("children").notNull().default(0),
  status: groupBookingStatusEnum("status").notNull().default("inquiry"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  source: text("source").default("direct"),
  notes: text("notes"),
  specialRequests: text("special_requests"),
  bookingRef: varchar("booking_ref", { length: 20 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accommodationBlocksTable = pgTable("accommodation_blocks", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  title: text("title").notNull(),
  blockType: accommodationBlockTypeEnum("block_type").notNull().default("other"),
  unitIds: jsonb("unit_ids").notNull().default("[]"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: text("reason"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type GroupBooking = typeof groupBookingsTable.$inferSelect;
export type AccommodationBlock = typeof accommodationBlocksTable.$inferSelect;
