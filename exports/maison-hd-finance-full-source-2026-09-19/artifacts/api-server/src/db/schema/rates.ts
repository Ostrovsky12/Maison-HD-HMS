/**
 * RATES DOMAIN
 * Revenue Management: rates, rules, packages, offers, quotes, availability
 *
 * Architecture:
 *   rates (base rate plans)
 *       └── rate_rules (restrictions + adjustments per rule)
 *   packages (bundles: room + services)
 *   offers   (promotions: discounts, early bird, last minute)
 *   addons   (à la carte: breakfast, transfer, etc.)
 *   quotes   (pre-booking proposals)
 *       └── quote_items
 *   availability_blocks (manual overrides)
 *   maintenance_blocks  (operational blocks)
 */

import {
  pgTable, serial, text, boolean, integer, numeric,
  timestamp, date, jsonb, index, unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";
import { properties, propertyUnits, unitTypes } from "./property";

// ─── RATES ────────────────────────────────────────────────────────────────────
// Base rate plans (e.g. BAR, Non-Refundable, Bed & Breakfast).
// Maps to existing `rates` table. Extended here.
export const rates = pgTable("rates", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("organization_id"),
  propertyId:      integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  unitTypeId:      integer("unit_type_id").references(() => unitTypes.id),
  name:            text("name").notNull(),
  code:            text("code"),              // "BAR" | "NR" | "BB" | "HB" | "FB"
  type:            text("type").notNull().default("per_night"),
    // "per_night" | "per_person" | "per_stay" | "per_hour"
  mealPlan:        text("meal_plan").default("ro"),
    // "ro" (room only) | "bb" | "hb" | "fb" | "ai"
  basePrice:       numeric("base_price", { precision: 10, scale: 2 }).notNull(),
  weekendPrice:    numeric("weekend_price", { precision: 10, scale: 2 }),
  currency:        text("currency").default("UAH"),
  isRefundable:    boolean("is_refundable").notNull().default(true),
  cancellationPolicy: text("cancellation_policy"),
  validFrom:       date("valid_from"),
  validTo:         date("valid_to"),
  isActive:        boolean("is_active").notNull().default(true),
  description:     text("description"),
  meta:            jsonb("meta").default("{}"),
  sortOrder:       integer("sort_order").default(0),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxProperty:     index("idx_rates_property").on(t.propertyId),
}));

// ─── RATE RULES ───────────────────────────────────────────────────────────────
// Dynamic adjustments and restrictions on base rates.
// Types: min_stay, max_stay, closed_to_arrival, closed_to_departure,
//        early_bird (book X days ahead), last_minute, day_of_week_multiplier,
//        occupancy_based (yield management), length_of_stay_discount
export const rateRules = pgTable("rate_rules", {
  id:              serial("id").primaryKey(),
  rateId:          integer("rate_id").notNull().references(() => rates.id, { onDelete: "cascade" }),
  name:            text("name").notNull(),
  type:            text("type").notNull(),
    // "min_stay" | "max_stay" | "cta" | "ctd" | "early_bird" | "last_minute"
    // | "day_multiplier" | "occupancy_multiplier" | "los_discount"
  priority:        integer("priority").notNull().default(0), // higher = applied first
  conditions:      jsonb("conditions").notNull().default("{}"),
    // { daysOfWeek: [5,6], dateRange: { from, to }, minStay: 2, occupancyGte: 80, ... }
  adjustment:      jsonb("adjustment").notNull().default("{}"),
    // { type: "percent" | "fixed" | "replace", value: 15, min: 0, max: null }
  validFrom:       date("valid_from"),
  validTo:         date("valid_to"),
  isActive:        boolean("is_active").notNull().default(true),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxRate:         index("idx_rate_rules_rate").on(t.rateId),
}));

// ─── ADDONS ───────────────────────────────────────────────────────────────────
// À la carte services bookable with a reservation.
export const addons = pgTable("addons", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("organization_id").notNull().references(() => tenants.id),
  propertyId:      integer("property_id").references(() => properties.id),
  name:            text("name").notNull(),
  description:     text("description"),
  category:        text("category").notNull().default("other"),
    // "food" | "spa" | "transport" | "activity" | "equipment" | "service" | "other"
  price:           numeric("price", { precision: 10, scale: 2 }).notNull(),
  priceType:       text("price_type").notNull().default("per_stay"),
    // "per_stay" | "per_night" | "per_person" | "per_night_person" | "per_unit"
  vatRate:         numeric("vat_rate", { precision: 5, scale: 2 }).default("20"),
  imageUrl:        text("image_url"),
  maxQuantity:     integer("max_quantity"),
  isActive:        boolean("is_active").notNull().default(true),
  isPreSellable:   boolean("is_pre_sellable").notNull().default(true), // show in booking widget
  sortOrder:       integer("sort_order").default(0),
  meta:            jsonb("meta").default("{}"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_addons_tenant").on(t.tenantId),
}));

// ─── PACKAGES ─────────────────────────────────────────────────────────────────
// Bundled offers: room + services + extras priced as a package.
export const packages = pgTable("packages", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  propertyId:      integer("property_id").references(() => properties.id),
  name:            text("name").notNull(),
  description:     text("description"),
  shortDesc:       text("short_desc"),
  imageUrl:        text("image_url"),
  rateId:          integer("rate_id").references(() => rates.id),
  minNights:       integer("min_nights").default(1),
  maxNights:       integer("max_nights"),
  includedAddons:  jsonb("included_addons").default("[]"), // [{ addonId, quantity }]
  totalPrice:      numeric("total_price", { precision: 10, scale: 2 }),
  discountPct:     numeric("discount_pct", { precision: 5, scale: 2 }),
  validFrom:       date("valid_from"),
  validTo:         date("valid_to"),
  isActive:        boolean("is_active").notNull().default(true),
  sortOrder:       integer("sort_order").default(0),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_packages_tenant").on(t.tenantId),
}));

// ─── OFFERS ───────────────────────────────────────────────────────────────────
// Promotional campaigns: early bird, flash sale, direct booking discount.
export const offers = pgTable("offers", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  propertyId:      integer("property_id").references(() => properties.id),
  name:            text("name").notNull(),
  description:     text("description"),
  type:            text("type").notNull(),
    // "early_bird" | "last_minute" | "long_stay" | "flash_sale" | "loyalty" | "promo_code"
  promoCode:       text("promo_code"),
  discountType:    text("discount_type").notNull().default("percent"), // "percent" | "fixed"
  discountValue:   numeric("discount_value", { precision: 10, scale: 2 }).notNull(),
  conditions:      jsonb("conditions").default("{}"),
    // { minNights, minAdvanceDays, maxAdvanceDays, unitTypeIds, guestSegments }
  bookFrom:        date("book_from"),
  bookTo:          date("book_to"),
  stayFrom:        date("stay_from"),
  stayTo:          date("stay_to"),
  maxUses:         integer("max_uses"),
  usedCount:       integer("used_count").notNull().default(0),
  isStackable:     boolean("is_stackable").notNull().default(false),
  isActive:        boolean("is_active").notNull().default(true),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_offers_tenant").on(t.tenantId),
}));

// ─── QUOTES ───────────────────────────────────────────────────────────────────
// Pre-booking proposals sent to potential guests.
// A quote can be converted into a reservation.
export const quotes = pgTable("quotes", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  guestId:         integer("guest_id"),
  propertyId:      integer("property_id").references(() => properties.id),
  unitTypeId:      integer("unit_type_id").references(() => unitTypes.id),
  quoteNo:         text("quote_no"),             // "Q-2025-00041"
  status:          text("status").notNull().default("draft"),
    // "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired" | "converted"
  checkIn:         date("check_in"),
  checkOut:        date("check_out"),
  adults:          integer("adults").default(2),
  children:        integer("children").default(0),
  subtotal:        numeric("subtotal", { precision: 12, scale: 2 }),
  discountAmount:  numeric("discount_amount", { precision: 12, scale: 2 }).default("0"),
  totalAmount:     numeric("total_amount", { precision: 12, scale: 2 }),
  currency:        text("currency").default("UAH"),
  validUntil:      timestamp("valid_until"),
  notes:           text("notes"),
  guestEmail:      text("guest_email"),
  guestName:       text("guest_name"),
  sentAt:          timestamp("sent_at"),
  viewedAt:        timestamp("viewed_at"),
  convertedToReservationId: integer("converted_to_reservation_id"),
  createdBy:       integer("created_by"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_quotes_tenant").on(t.tenantId),
}));

// ─── QUOTE ITEMS ──────────────────────────────────────────────────────────────
export const quoteItems = pgTable("quote_items", {
  id:              serial("id").primaryKey(),
  quoteId:         integer("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  name:            text("name").notNull(),
  description:     text("description"),
  itemType:        text("item_type").notNull().default("room_night"),
  quantity:        numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
  unitPrice:       numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  totalPrice:      numeric("total_price", { precision: 12, scale: 2 }).notNull(),
  vatRate:         numeric("vat_rate", { precision: 5, scale: 2 }).default("20"),
  sortOrder:       integer("sort_order").default(0),
}, (t) => ({
  idxQuote:        index("idx_quote_items_quote").on(t.quoteId),
}));

// ─── AVAILABILITY BLOCKS ──────────────────────────────────────────────────────
// Manual stop-sell / allotment overrides.
// These take precedence over rate availability.
export const availabilityBlocks = pgTable("availability_blocks", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  propertyId:      integer("property_id").references(() => properties.id),
  unitId:          integer("unit_id").references(() => propertyUnits.id),
  unitTypeId:      integer("unit_type_id").references(() => unitTypes.id),
  type:            text("type").notNull(),
    // "stop_sell" | "allotment" | "owner_hold" | "overbooking_hold"
  startDate:       date("start_date").notNull(),
  endDate:         date("end_date").notNull(),
  quantity:        integer("quantity").default(1), // null = all units of type
  reason:          text("reason"),
  notes:           text("notes"),
  rateIds:         jsonb("rate_ids").default("[]"), // null = all rates blocked
  sourceIds:       jsonb("source_ids").default("[]"), // null = all sources blocked
  createdBy:       integer("created_by"),
  isActive:        boolean("is_active").notNull().default(true),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_avail_blocks_tenant").on(t.tenantId),
  idxDates:        index("idx_avail_blocks_dates").on(t.startDate, t.endDate),
}));

// ─── MAINTENANCE BLOCKS ───────────────────────────────────────────────────────
// Units blocked for maintenance, renovation, or deep cleaning.
// Different from availability_blocks — operational context, links to tickets.
export const maintenanceBlocks = pgTable("maintenance_blocks", {
  id:              serial("id").primaryKey(),
  unitId:          integer("unit_id").notNull().references(() => propertyUnits.id, { onDelete: "cascade" }),
  type:            text("type").notNull().default("maintenance"),
    // "maintenance" | "renovation" | "deep_cleaning" | "owner_stay" | "seasonal_close"
  startDate:       date("start_date").notNull(),
  endDate:         date("end_date").notNull(),
  reason:          text("reason"),
  ticketId:        integer("ticket_id"),   // FK to maintenance_tickets
  createdBy:       integer("created_by"),
  resolvedAt:      timestamp("resolved_at"),
  isActive:        boolean("is_active").notNull().default(true),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxUnit:         index("idx_maintenance_blocks_unit").on(t.unitId),
  idxDates:        index("idx_maintenance_blocks_dates").on(t.startDate, t.endDate),
}));
