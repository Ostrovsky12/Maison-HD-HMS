import { pgTable, serial, integer, text, timestamp, numeric, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { bookingsTable } from "./bookings";

export const addonsTable = pgTable("addons", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("per session"),
  category: text("category").notNull().default("service"),
  icon: text("icon").default("🔧"),
  timeSlots: jsonb("time_slots").$type<string[]>().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  propertyId: integer("property_id"),
  maxQuantity: integer("max_quantity"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const bookingAddonsTable = pgTable("booking_addons", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id),
  addonId: integer("addon_id").notNull().references(() => addonsTable.id),
  quantity: integer("quantity").notNull().default(1),
  priceEach: numeric("price_each", { precision: 10, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAddonSchema = createInsertSchema(addonsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBookingAddonSchema = createInsertSchema(bookingAddonsTable).omit({ id: true, createdAt: true });
export type InsertAddon = z.infer<typeof insertAddonSchema>;
export type InsertBookingAddon = z.infer<typeof insertBookingAddonSchema>;
export type Addon = typeof addonsTable.$inferSelect;
export type BookingAddon = typeof bookingAddonsTable.$inferSelect;
