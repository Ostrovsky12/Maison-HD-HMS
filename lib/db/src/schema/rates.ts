import { pgTable, serial, integer, text, timestamp, date, numeric, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";

export const ratesTable = pgTable("rates", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().references(() => propertiesTable.id),
  unitCategory: text("unit_category"),
  name: text("name").notNull(),
  pricePerNight: numeric("price_per_night", { precision: 10, scale: 2 }).notNull(),
  minNights: integer("min_nights").notNull().default(1),
  dateFrom: date("date_from"),
  dateTo: date("date_to"),
  isStopSale: boolean("is_stop_sale").notNull().default(false),
  promoCode: text("promo_code"),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }),
  unitPrices: jsonb("unit_prices").$type<Record<string, number>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRateSchema = createInsertSchema(ratesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRate = z.infer<typeof insertRateSchema>;
export type Rate = typeof ratesTable.$inferSelect;
