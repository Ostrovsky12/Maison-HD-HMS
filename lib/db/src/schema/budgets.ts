import { pgTable, serial, integer, numeric, text } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const monthlyBudgetsTable = pgTable("monthly_budgets", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  accommodationTarget: numeric("accommodation_target", { precision: 12, scale: 2 }).notNull().default("0"),
  fbTarget: numeric("fb_target", { precision: 12, scale: 2 }).notNull().default("0"),
  spaTarget: numeric("spa_target", { precision: 12, scale: 2 }).notNull().default("0"),
  eventsTarget: numeric("events_target", { precision: 12, scale: 2 }).notNull().default("0"),
  totalTarget: numeric("total_target", { precision: 12, scale: 2 }).notNull().default("0"),
  occupancyTarget: numeric("occupancy_target", { precision: 5, scale: 2 }).notNull().default("0"),
  adrTarget: numeric("adr_target", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
});

export const insertMonthlyBudgetSchema = createInsertSchema(monthlyBudgetsTable).omit({ id: true });
export type InsertMonthlyBudget = z.infer<typeof insertMonthlyBudgetSchema>;
export type MonthlyBudget = typeof monthlyBudgetsTable.$inferSelect;
