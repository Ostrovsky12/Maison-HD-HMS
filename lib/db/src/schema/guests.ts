import { pgTable, serial, text, integer, timestamp, numeric, boolean, date, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const loyaltyLevelEnum = pgEnum("loyalty_level", ["bronze", "silver", "gold", "platinum"]);

export const guestsTable = pgTable("guests", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  middleName: text("middle_name"),
  email: text("email"),
  phone: text("phone"),
  passportNumber: text("passport_number"),
  nationality: text("nationality"),
  birthDate: date("birth_date"),
  address: text("address"),
  notes: text("notes"),
  ltv: numeric("ltv", { precision: 10, scale: 2 }).notNull().default("0"),
  bookingCount: integer("booking_count").notNull().default(0),
  loyaltyLevel: loyaltyLevelEnum("loyalty_level").default("bronze"),
  loyaltyPoints: integer("loyalty_points").default(0),
  totalNights: integer("total_nights").default(0),
  totalSpent: numeric("total_spent", { precision: 10, scale: 2 }).default("0"),
  preferences: jsonb("preferences").$type<string[]>().default([]),
  tags: jsonb("tags").$type<string[]>().default([]),
  lastVisit: timestamp("last_visit"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGuestSchema = createInsertSchema(guestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGuest = z.infer<typeof insertGuestSchema>;
export type Guest = typeof guestsTable.$inferSelect;
