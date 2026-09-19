import { pgTable, serial, integer, timestamp, text, boolean, jsonb, varchar, numeric, date } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export const packagesTable = pgTable("packages", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizationsTable.id),
  tenantId: integer("tenant_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull().default("custom"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  originalPrice: numeric("original_price", { precision: 10, scale: 2 }),
  durationNights: integer("duration_nights").notNull().default(1),
  maxGuests: integer("max_guests").default(2),
  inclusions: jsonb("inclusions").$type<string[]>().default([]),
  imageUrl: text("image_url"),
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),
  bookingsCount: integer("bookings_count").default(0),
  tags: jsonb("tags").$type<string[]>().default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Package = typeof packagesTable.$inferSelect;
export type InsertPackage = typeof packagesTable.$inferInsert;
