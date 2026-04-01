import { pgTable, serial, date, real, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const kpiHistoryTable = pgTable("kpi_history", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  occupancyRate: real("occupancy_rate").notNull().default(0),
  adr: real("adr").notNull().default(0),
  revpar: real("revpar").notNull().default(0),
  totalRevenue: real("total_revenue").notNull().default(0),
  accommodationRevenue: real("accommodation_revenue").notNull().default(0),
  checkins: integer("checkins").notNull().default(0),
  checkouts: integer("checkouts").notNull().default(0),
  avgStay: real("avg_stay").notNull().default(0),
  cancellationRate: real("cancellation_rate").notNull().default(0),
  newBookings: integer("new_bookings").notNull().default(0),
  directBookings: integer("direct_bookings").notNull().default(0),
  otaBookings: integer("ota_bookings").notNull().default(0),
  totalUnits: integer("total_units").notNull().default(0),
  totalGuests: integer("total_guests").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertKpiHistorySchema = createInsertSchema(kpiHistoryTable).omit({ id: true, createdAt: true });
export type InsertKpiHistory = z.infer<typeof insertKpiHistorySchema>;
export type KpiHistory = typeof kpiHistoryTable.$inferSelect;

export const forecastsTable = pgTable("forecasts", {
  id: serial("id").primaryKey(),
  forecastDate: date("forecast_date").notNull().unique(),
  predictedOccupancy: real("predicted_occupancy").notNull().default(0),
  predictedRevenue: real("predicted_revenue").notNull().default(0),
  predictedAdr: real("predicted_adr").notNull().default(0),
  confidenceLower: real("confidence_lower").notNull().default(0),
  confidenceUpper: real("confidence_upper").notNull().default(0),
  seasonFactor: real("season_factor").notNull().default(1.0),
  eventsFactor: real("events_factor").notNull().default(1.0),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});

export const insertForecastSchema = createInsertSchema(forecastsTable).omit({ id: true, generatedAt: true });
export type InsertForecast = z.infer<typeof insertForecastSchema>;
export type Forecast = typeof forecastsTable.$inferSelect;
