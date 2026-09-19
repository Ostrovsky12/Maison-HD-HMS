/**
 * PROPERTY DOMAIN
 * Physical infrastructure: legal entities, properties, unit types, units, amenities
 *
 * Hierarchy: Tenant → Legal Entity → Property → Unit Type → Unit
 *            Tenant → Business Unit (revenue center)
 */

import {
  pgTable, serial, text, boolean, integer, numeric,
  timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";

// ─── LEGAL ENTITIES ───────────────────────────────────────────────────────────
// A tenant may operate under multiple legal entities (e.g. LLC + FOP).
// Used for invoice issuance and accounting exports.
export const legalEntities = pgTable("legal_entities", {
  id:            serial("id").primaryKey(),
  tenantId:      integer("organization_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name:          text("name").notNull(),
  type:          text("type").notNull().default("fop"),   // "fop" | "legal" | "individual"
  taxCode:       text("tax_code"),         // ЄДРПОУ / ІПН
  vatNumber:     text("vat_number"),       // PDV registration number
  iban:          text("iban"),
  bankName:      text("bank_name"),
  mfo:           text("mfo"),              // Ukrainian bank code
  address:       text("address"),
  directorName:  text("director_name"),
  accountantName: text("accountant_name"),
  stamp:         text("stamp"),            // base64 stamp image
  signature:     text("signature"),        // base64 signature image
  logoUrl:       text("logo_url"),
  isDefault:     boolean("is_default").notNull().default(false),
  isActive:      boolean("is_active").notNull().default(true),
  meta:          jsonb("meta").default("{}"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:     index("idx_legal_entities_tenant").on(t.tenantId),
}));

// ─── PROPERTIES ───────────────────────────────────────────────────────────────
// A physical location (hotel, resort, hostel, villa complex).
export const properties = pgTable("properties", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("organization_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  legalEntityId:   integer("legal_entity_id").references(() => legalEntities.id),
  name:            text("name").notNull(),
  type:            text("type").notNull().default("hotel"), // "hotel"|"hostel"|"resort"|"villa"|"campsite"
  starRating:      integer("star_rating"),                  // 1-5
  address:         text("address"),
  city:            text("city"),
  country:         text("country").default("UA"),
  lat:             numeric("lat", { precision: 10, scale: 7 }),
  lng:             numeric("lng", { precision: 10, scale: 7 }),
  phone:           text("phone"),
  email:           text("email"),
  website:         text("website"),
  checkInTime:     text("checkin_time").default("14:00"),
  checkOutTime:    text("checkout_time").default("12:00"),
  timezone:        text("timezone").default("Europe/Kiev"),
  currency:        text("currency").default("UAH"),
  description:     text("description"),
  photos:          jsonb("photos").default("[]"),           // [{ url, caption, isPrimary }]
  policies:        jsonb("policies").default("{}"),         // { cancellation, pets, smoking, ... }
  isActive:        boolean("is_active").notNull().default(true),
  meta:            jsonb("meta").default("{}"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_properties_tenant").on(t.tenantId),
}));

// ─── UNIT TYPES ───────────────────────────────────────────────────────────────
// Room/unit category template. Units are instances of a type.
// Examples: "Standard Double", "Suite", "Glamping Dome", "Berth A"
export const unitTypes = pgTable("unit_types", {
  id:              serial("id").primaryKey(),
  propertyId:      integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  name:            text("name").notNull(),
  shortCode:       text("short_code"),           // "STD" | "STE" | "DBL"
  description:     text("description"),
  category:        text("category").notNull(),   // "room" | "suite" | "villa" | "tent" | "berth"
  defaultCapacity: integer("default_capacity").notNull().default(2),
  maxCapacity:     integer("max_capacity"),
  squareMeters:    numeric("square_meters", { precision: 6, scale: 1 }),
  bedConfig:       jsonb("bed_config").default("{}"), // { king: 1, sofa: 0, ... }
  basePrice:       numeric("base_price", { precision: 10, scale: 2 }),
  photos:          jsonb("photos").default("[]"),
  sortOrder:       integer("sort_order").default(0),
  isActive:        boolean("is_active").notNull().default(true),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxProperty:     index("idx_unit_types_property").on(t.propertyId),
}));

// ─── AMENITIES ────────────────────────────────────────────────────────────────
// Amenity catalog. Reusable across properties / unit types.
export const amenities = pgTable("amenities", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name:        text("name").notNull(),
  icon:        text("icon"),               // lucide icon name or emoji
  category:    text("category").notNull(), // "in_room" | "bathroom" | "connectivity" | "view" | "dining"
  isGlobal:    boolean("is_global").notNull().default(false), // available to all tenants
  sortOrder:   integer("sort_order").default(0),
  isActive:    boolean("is_active").notNull().default(true),
});

// ─── UNIT TYPE AMENITIES (M:M) ────────────────────────────────────────────────
export const unitTypeAmenities = pgTable("unit_type_amenities", {
  id:          serial("id").primaryKey(),
  unitTypeId:  integer("unit_type_id").notNull().references(() => unitTypes.id, { onDelete: "cascade" }),
  amenityId:   integer("amenity_id").notNull().references(() => amenities.id, { onDelete: "cascade" }),
  quantity:    integer("quantity").default(1),
}, (t) => ({
  idxUnitType: index("idx_unit_type_amenities_type").on(t.unitTypeId),
}));

// ─── PROPERTY UNITS ───────────────────────────────────────────────────────────
// Physical rooms/units. Each unit is an instance of a unit type.
// Maps to existing `units` table.
export const propertyUnits = pgTable("units", {
  id:                  serial("id").primaryKey(),
  propertyId:          integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  unitTypeId:          integer("unit_type_id").references(() => unitTypes.id),
  name:                text("name").notNull(),          // "101" | "Dome A" | "Villa Sunset"
  category:            text("category").notNull(),      // legacy: same as unit_type.category
  floor:               integer("floor"),
  capacity:            integer("capacity").notNull().default(2),
  maxCapacity:         integer("max_capacity"),
  squareMeters:        numeric("square_meters", { precision: 6, scale: 1 }),
  hasBalcony:          boolean("has_balcony").default(false),
  hasView:             text("has_view"),                // "sea" | "mountain" | "garden" | null
  basePrice:           numeric("base_price", { precision: 10, scale: 2 }),
  status:              text("status").notNull().default("active"), // "active"|"inactive"|"maintenance"
  housekeepingStatus:  text("housekeeping_status").notNull().default("clean"),
  description:         text("description"),
  photos:              jsonb("photos").default("[]"),
  meta:                jsonb("meta").default("{}"),
  sortOrder:           integer("sort_order").default(0),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxProperty:         index("idx_units_property").on(t.propertyId),
  idxType:             index("idx_units_type").on(t.unitTypeId),
}));

// ─── BUSINESS UNITS ───────────────────────────────────────────────────────────
// Revenue centers for P&L accounting: Accommodation, F&B, Spa, Rental, Events.
export const businessUnits = pgTable("business_units", {
  id:            serial("id").primaryKey(),
  tenantId:      integer("organization_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  propertyId:    integer("property_id").references(() => properties.id),
  name:          text("name").notNull(),
  type:          text("type").notNull(), // "accommodation"|"fnb"|"spa"|"rental"|"events"|"other"
  code:          text("code"),          // accounting cost center code
  currency:      text("currency").default("UAH"),
  isActive:      boolean("is_active").notNull().default(true),
  sortOrder:     integer("sort_order").default(0),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:     index("idx_business_units_tenant").on(t.tenantId),
}));
