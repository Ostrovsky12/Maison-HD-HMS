import { pgTable, serial, text, integer, boolean, timestamp, pgEnum, numeric, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const propertyTypeEnum = pgEnum("property_type", ["hotel", "house", "spa", "pool", "bungalow", "villa", "apartment", "glamping", "camping", "other"]);

export const propertiesTable = pgTable("properties", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  type: propertyTypeEnum("type").notNull().default("hotel"),
  address: text("address"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").default(0),
  touristTaxRate: numeric("tourist_tax_rate", { precision: 5, scale: 2 }).default("0"),
  checkInTime: varchar("check_in_time", { length: 5 }).default("14:00"),
  checkOutTime: varchar("check_out_time", { length: 5 }).default("12:00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPropertySchema = createInsertSchema(propertiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof propertiesTable.$inferSelect;
