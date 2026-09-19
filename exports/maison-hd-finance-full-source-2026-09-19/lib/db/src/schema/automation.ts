import { pgTable, serial, integer, timestamp, text, boolean, pgEnum, jsonb, varchar, numeric } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { bookingsTable } from "./bookings";

export const automationTriggerEnum = pgEnum("automation_trigger", [
  "booking_created","booking_confirmed","checkin_today","checkout_today",
  "checkout_tomorrow","guest_birthday","payment_overdue","low_occupancy",
  "hk_task_pending","fb_order_ready","spa_appointment_today","manual",
]);
export const automationActionEnum = pgEnum("automation_action", [
  "send_inbox_message","create_hk_task","create_notification",
  "upsell_spa","upsell_fb","upsell_upgrade","send_email","webhook_call",
]);
export const automationStatusEnum = pgEnum("automation_status", ["success","failed","skipped"]);

export const automationRulesTable = pgTable("automation_rules", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  trigger: automationTriggerEnum("trigger").notNull(),
  conditions: jsonb("conditions").$type<Record<string, any>>().default({}),
  actions: jsonb("actions").$type<Array<{ type: string; params: Record<string, any> }>>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  runCount: integer("run_count").default(0),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const automationLogsTable = pgTable("automation_logs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  ruleId: integer("rule_id").references(() => automationRulesTable.id),
  ruleName: varchar("rule_name", { length: 255 }),
  trigger: automationTriggerEnum("trigger"),
  status: automationStatusEnum("status").notNull().default("success"),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: integer("entity_id"),
  details: jsonb("details").$type<Record<string, any>>().default({}),
  resultMessage: text("result_message"),
  triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
});

export const upsellOffersTable = pgTable("upsell_offers", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  offerType: varchar("offer_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  shownAt: timestamp("shown_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AutomationRule = typeof automationRulesTable.$inferSelect;
export type AutomationLog = typeof automationLogsTable.$inferSelect;
export type UpsellOffer = typeof upsellOffersTable.$inferSelect;
