import { pgTable, serial, integer, text, timestamp, date, real, json, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const nightAuditStatusEnum = pgEnum("night_audit_status", ["pending", "completed", "failed"]);

export const nightAuditsTable = pgTable("night_audits", {
  id: serial("id").primaryKey(),
  auditDate: date("audit_date").notNull(),
  totalUnits: integer("total_units").default(0),
  occupiedUnits: integer("occupied_units").default(0),
  occupancyRate: real("occupancy_rate").default(0),
  totalRevenue: real("total_revenue").default(0),
  accommodationRevenue: real("accommodation_revenue").default(0),
  servicesRevenue: real("services_revenue").default(0),
  totalGuests: integer("total_guests").default(0),
  newCheckins: integer("new_checkins").default(0),
  checkouts: integer("checkouts").default(0),
  newBookings: integer("new_bookings").default(0),
  cancellations: integer("cancellations").default(0),
  status: nightAuditStatusEnum("status").notNull().default("completed"),
  performedById: integer("performed_by_id").references(() => usersTable.id),
  performedAt: timestamp("performed_at"),
  errors: json("errors").$type<string[]>().default([]),
  warnings: json("warnings").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNightAuditSchema = createInsertSchema(nightAuditsTable).omit({ id: true, createdAt: true });
export type InsertNightAudit = z.infer<typeof insertNightAuditSchema>;
export type NightAudit = typeof nightAuditsTable.$inferSelect;

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  oldData: json("old_data"),
  newData: json("new_data"),
  userId: integer("user_id").references(() => usersTable.id),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
