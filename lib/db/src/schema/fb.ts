import { pgTable, serial, integer, timestamp, text, boolean, pgEnum, jsonb, varchar, numeric, date } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { bookingsTable } from "./bookings";

export const fbOrderStatusEnum = pgEnum("fb_order_status", ["open", "in_kitchen", "ready", "served", "billed", "cancelled"]);
export const fbOrderTypeEnum = pgEnum("fb_order_type", ["dine_in", "room_service", "takeaway", "bar", "breakfast", "banquet", "corporate"]);
export const fbItemStatusEnum = pgEnum("fb_item_status", ["pending", "cooking", "ready", "served", "cancelled"]);
export const fbTableStatusEnum = pgEnum("fb_table_status", ["free", "occupied", "reserved", "cleaning"]);

export const fbCategoriesTable = pgTable("fb_categories", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: varchar("name", { length: 100 }).notNull(),
  emoji: varchar("emoji", { length: 10 }).default("🍽"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const fbItemsTable = pgTable("fb_items", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  categoryId: integer("category_id").references(() => fbCategoriesTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  priceHappy: numeric("price_happy", { precision: 10, scale: 2 }),
  cookMinutes: integer("cook_minutes").default(15),
  isAvailable: boolean("is_available").notNull().default(true),
  isPopular: boolean("is_popular").default(false),
  isVegetarian: boolean("is_vegetarian").default(false),
  allergens: jsonb("allergens").$type<string[]>().default([]),
  tags: jsonb("tags").$type<string[]>().default([]),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fbTablesTable = pgTable("fb_tables", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  number: varchar("number", { length: 20 }).notNull(),
  capacity: integer("capacity").notNull().default(4),
  location: varchar("location", { length: 100 }).default("Основний зал"),
  status: fbTableStatusEnum("status").notNull().default("free"),
  currentOrderId: integer("current_order_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const fbOrdersTable = pgTable("fb_orders", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  tableId: integer("table_id").references(() => fbTablesTable.id),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  orderType: fbOrderTypeEnum("order_type").notNull().default("dine_in"),
  guestName: varchar("guest_name", { length: 255 }),
  roomNumber: varchar("room_number", { length: 20 }),
  guestCount: integer("guest_count").default(1),
  status: fbOrderStatusEnum("status").notNull().default("open"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).default("0"),
  paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }).default("0"),
  notes: text("notes"),
  staffNotes: text("staff_notes"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fbOrderItemsTable = pgTable("fb_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => fbOrdersTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => fbItemsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  status: fbItemStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  sentAt: timestamp("sent_at"),
  readyAt: timestamp("ready_at"),
  servedAt: timestamp("served_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type FbCategory = typeof fbCategoriesTable.$inferSelect;
export type FbItem = typeof fbItemsTable.$inferSelect;
export type FbTable = typeof fbTablesTable.$inferSelect;
export type FbOrder = typeof fbOrdersTable.$inferSelect;
export type FbOrderItem = typeof fbOrderItemsTable.$inferSelect;
