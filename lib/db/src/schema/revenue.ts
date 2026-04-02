import { pgTable, serial, integer, timestamp, text, boolean, pgEnum, varchar, numeric, jsonb, date } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";

export const pricingRuleTypeEnum = pgEnum("pricing_rule_type", ["occupancy","season","day_of_week","event","last_minute","early_bird"]);
export const ratePlanStatusEnum = pgEnum("rate_plan_status", ["active","inactive","draft"]);

export const ratePlansTable = pgTable("rate_plans", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  baseModifier: numeric("base_modifier", { precision: 5, scale: 2 }).default("1.0"),
  status: ratePlanStatusEnum("status").notNull().default("active"),
  isDefault: boolean("is_default").default(false),
  cancellationPolicy: varchar("cancellation_policy", { length: 50 }).default("flexible"),
  minStay: integer("min_stay").default(1),
  maxStay: integer("max_stay"),
  includesBreakfast: boolean("includes_breakfast").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pricingRulesTable = pgTable("pricing_rules", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  ratePlanId: integer("rate_plan_id").references(() => ratePlansTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  ruleType: pricingRuleTypeEnum("rule_type").notNull(),
  conditions: jsonb("conditions").$type<Record<string, any>>().notNull().default({}),
  modifierType: varchar("modifier_type", { length: 20 }).notNull().default("percent"),
  modifierValue: numeric("modifier_value", { precision: 8, scale: 2 }).notNull(),
  priority: integer("priority").default(0),
  isActive: boolean("is_active").default(true),
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pricingOverridesTable = pgTable("pricing_overrides", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  unitId: integer("unit_id").references(() => unitsTable.id),
  overrideDate: date("override_date").notNull(),
  customPrice: numeric("custom_price", { precision: 10, scale: 2 }),
  minStay: integer("min_stay"),
  isClosed: boolean("is_closed").default(false),
  reason: varchar("reason", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type RatePlan = typeof ratePlansTable.$inferSelect;
export type PricingRule = typeof pricingRulesTable.$inferSelect;
export type PricingOverride = typeof pricingOverridesTable.$inferSelect;
