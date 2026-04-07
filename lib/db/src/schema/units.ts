import { pgTable, serial, text, integer, boolean, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";

export const unitStatusEnum = pgEnum("unit_status", ["active", "inactive", "maintenance"]);
export const housekeepingStatusEnum = pgEnum("housekeeping_status", ["clean", "dirty", "in_progress"]);

export const unitsTable = pgTable("units", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().references(() => propertiesTable.id),
  name: text("name").notNull(),
  category: text("category").notNull(),
  capacity: integer("capacity").notNull().default(2),
  maxCapacity: integer("max_capacity"),
  status: unitStatusEnum("status").notNull().default("active"),
  floor: integer("floor"),
  description: text("description"),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }),
  baseGuests: integer("base_guests").default(2),
  extraGuestPrice: numeric("extra_guest_price", { precision: 10, scale: 2 }).default("0"),
  housekeepingStatus: housekeepingStatusEnum("housekeeping_status").notNull().default("clean"),
  hasView: text("has_view"),
  hasBalcony: boolean("has_balcony").default(false),
  squareMeters: numeric("square_meters", { precision: 6, scale: 1 }),
  isHidden: boolean("is_hidden").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUnitSchema = createInsertSchema(unitsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUnit = z.infer<typeof insertUnitSchema>;
export type Unit = typeof unitsTable.$inferSelect;
