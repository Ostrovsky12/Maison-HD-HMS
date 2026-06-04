/**
 * PLATFORM DOMAIN
 * Multi-tenant SaaS infrastructure: tenants, settings, subscriptions, feature flags
 *
 * NOTE: `tenants` maps to the existing `organizations` table.
 *       New canonical name is used in application code going forward.
 */

import {
  pgTable, serial, text, boolean, integer, numeric,
  timestamp, jsonb, unique, index,
} from "drizzle-orm/pg-core";

// ─── TENANTS (= organizations) ────────────────────────────────────────────────
export const tenants = pgTable("organizations", {
  id:                  serial("id").primaryKey(),
  name:                text("name").notNull(),
  slug:                text("slug").notNull().unique(),
  email:               text("email"),
  phone:               text("phone"),
  address:             text("address"),
  website:             text("website"),
  logo:                text("logo"),
  primaryColor:        text("primary_color").default("#4f46e5"),
  timezone:            text("timezone").default("Europe/Kiev"),
  currency:            text("currency").default("UAH"),
  taxRate:             numeric("tax_rate", { precision: 5, scale: 2 }).default("20.0"),
  isActive:            boolean("is_active").notNull().default(true),
  subscriptionStatus:  text("subscription_status").notNull().default("trial"),
  trialEndsAt:         timestamp("trial_ends_at"),
  subscriptionEndsAt:  timestamp("subscription_ends_at"),
  guestGuideUrl:       text("guest_guide_url"),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
});

// ─── TENANT SETTINGS ──────────────────────────────────────────────────────────
// Key-value settings per tenant, namespaced by module.
// Examples: { module: "reservations", key: "default_checkin_time", value: "14:00" }
export const tenantSettings = pgTable("tenant_settings", {
  id:         serial("id").primaryKey(),
  tenantId:   integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  module:     text("module").notNull(),      // "reservations" | "billing" | "spa" | ...
  key:        text("key").notNull(),
  value:      text("value"),
  valueJson:  jsonb("value_json"),           // for structured values
  isSecret:   boolean("is_secret").notNull().default(false),
  updatedAt:  timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniq:       unique().on(t.tenantId, t.module, t.key),
  idxTenant:  index("idx_tenant_settings_tenant").on(t.tenantId),
}));

// ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────────
// One active subscription record per tenant. History tracked in subscription_invoices.
export const subscriptions = pgTable("subscriptions", {
  id:                   serial("id").primaryKey(),
  tenantId:             integer("organization_id").notNull()
                          .references(() => tenants.id).unique(),
  tier:                 text("tier").notNull().default("trial"),    // trial | starter | pro | enterprise
  period:               text("period").notNull().default("monthly"), // monthly | yearly
  status:               text("status").notNull().default("trial"),   // trial | active | cancelled | suspended
  modules:              jsonb("modules").default("[]"),              // enabled module slugs
  unitLimit:            integer("unit_limit"),
  userLimit:            integer("user_limit"),
  priceMonthly:         numeric("price_monthly", { precision: 10, scale: 2 }),
  trialEndsAt:          timestamp("trial_ends_at"),
  currentPeriodStart:   timestamp("current_period_start").notNull().defaultNow(),
  currentPeriodEnd:     timestamp("current_period_end").notNull().defaultNow(),
  cancelAtPeriodEnd:    boolean("cancel_at_period_end").default(false),
  autoRenew:            boolean("auto_renew").default(true),
  externalId:           text("external_id"),                        // Stripe/LiqPay subscription ID
  createdAt:            timestamp("created_at").notNull().defaultNow(),
  updatedAt:            timestamp("updated_at").notNull().defaultNow(),
});

// ─── FEATURE FLAGS ─────────────────────────────────────────────────────────────
// Per-tenant feature toggle overrides (on top of plan defaults).
export const featureFlags = pgTable("feature_flags", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  flag:        text("flag").notNull(),        // "ai_assistant" | "channel_manager" | ...
  enabled:     boolean("enabled").notNull().default(false),
  rolloutPct:  integer("rollout_pct").default(100), // 0-100 percentage rollout
  config:      jsonb("config").default("{}"),
  notes:       text("notes"),
  expiresAt:   timestamp("expires_at"),
  updatedBy:   integer("updated_by"),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniq:        unique().on(t.tenantId, t.flag),
  idxTenant:   index("idx_feature_flags_tenant").on(t.tenantId),
}));
