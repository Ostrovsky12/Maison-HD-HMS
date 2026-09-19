import { pgTable, serial, integer, timestamp, text, numeric, pgEnum, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingsTable } from "./bookings";

export const guestOrderStatusEnum = pgEnum("guest_order_status", ["pending", "confirmed", "preparing", "delivered", "cancelled"]);
export const guestOrderTypeEnum = pgEnum("guest_order_type", ["service", "food", "rental", "spa", "activity", "other"]);

export const guestServiceOrdersTable = pgTable("guest_service_orders", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id),
  addonId: integer("addon_id"),
  orderType: guestOrderTypeEnum("order_type").notNull().default("service"),
  serviceName: varchar("service_name", { length: 255 }).notNull(),
  serviceDescription: text("service_description"),
  quantity: integer("quantity").notNull().default(1),
  pricePerUnit: numeric("price_per_unit", { precision: 10, scale: 2 }).default("0"),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).default("0"),
  requestedFor: timestamp("requested_for"),
  guestNotes: text("guest_notes"),
  staffNotes: text("staff_notes"),
  status: guestOrderStatusEnum("status").notNull().default("pending"),
  metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGuestServiceOrderSchema = createInsertSchema(guestServiceOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGuestServiceOrder = z.infer<typeof insertGuestServiceOrderSchema>;
export type GuestServiceOrder = typeof guestServiceOrdersTable.$inferSelect;
