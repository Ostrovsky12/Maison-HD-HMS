import { pgTable, serial, integer, varchar, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { propertiesTable } from "./properties";
import { bookingsTable } from "./bookings";

export const minibarCategoryEnum = pgEnum("minibar_category", ["drinks", "alcohol", "snacks", "personal_care", "other"]);

export const minibarItemsTable = pgTable("minibar_items", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  propertyId: integer("property_id").references(() => propertiesTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 500 }),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  category: minibarCategoryEnum("category").notNull().default("drinks"),
  emoji: varchar("emoji", { length: 8 }).default("🍺"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const minibarChargesTable = pgTable("minibar_charges", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => minibarItemsTable.id, { onDelete: "set null" }),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  itemPrice: numeric("item_price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  chargedBy: varchar("charged_by", { length: 20 }).notNull().default("guest"),
  note: varchar("note", { length: 500 }),
  chargedAt: timestamp("charged_at").notNull().defaultNow(),
});
