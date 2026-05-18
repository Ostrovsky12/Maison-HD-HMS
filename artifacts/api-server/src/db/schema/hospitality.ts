/**
 * HOSPITALITY DOMAIN
 * Revenue-generating departments beyond accommodation:
 * Spa, Rentals, Events, Restaurant / POS
 */

import {
  pgTable, serial, text, boolean, integer, numeric,
  timestamp, date, time, jsonb, index,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";
import { properties, propertyUnits, businessUnits } from "./property";
import { guests } from "./guests";
import { reservations } from "./reservations";
import { users } from "./iam";

// ══════════════════════════════════════════════════════════════════════════════
//  SPA MODULE
// ══════════════════════════════════════════════════════════════════════════════

// ─── SPA SERVICES ─────────────────────────────────────────────────────────────
// Catalog of spa treatments and wellness services.
// Maps to existing `spa_services` table.
export const spaServices = pgTable("spa_services", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  propertyId:      integer("property_id").references(() => properties.id),
  name:            text("name").notNull(),
  category:        text("category").notNull(),  // "massage" | "facial" | "body" | "hair" | "nail" | "wellness"
  description:     text("description"),
  durationMin:     integer("duration_min").notNull().default(60),
  price:           numeric("price", { precision: 10, scale: 2 }).notNull(),
  priceType:       text("price_type").default("per_session"), // "per_session" | "per_person"
  vatRate:         numeric("vat_rate", { precision: 5, scale: 2 }).default("20"),
  imageUrl:        text("image_url"),
  requiresResource: boolean("requires_resource").default(true),
  maxPersons:      integer("max_persons").default(1),
  bufferBefore:    integer("buffer_before_min").default(0), // setup time
  bufferAfter:     integer("buffer_after_min").default(15),  // cleanup time
  isActive:        boolean("is_active").notNull().default(true),
  sortOrder:       integer("sort_order").default(0),
  meta:            jsonb("meta").default("{}"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_spa_services_tenant").on(t.tenantId),
}));

// ─── SPA RESOURCES ────────────────────────────────────────────────────────────
// Bookable resources: treatment rooms, therapists, hydrotherapy equipment.
// Maps to existing `spa_resources` table.
export const spaResources = pgTable("spa_resources", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  propertyId:      integer("property_id").references(() => properties.id),
  name:            text("name").notNull(),
  type:            text("type").notNull(),   // "room" | "therapist" | "equipment" | "pool"
  capacity:        integer("capacity").default(1),
  qualifications:  jsonb("qualifications").default("[]"), // service IDs this resource can handle
  workingHours:    jsonb("working_hours").default("{}"),  // { mon: { from: "09:00", to: "21:00" } }
  isActive:        boolean("is_active").notNull().default(true),
  sortOrder:       integer("sort_order").default(0),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
});

// ─── SPA BOOKINGS ─────────────────────────────────────────────────────────────
// Individual spa appointment reservations.
// (previously: spa_appointments — renamed for consistency)
export const spaBookings = pgTable("spa_bookings", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  reservationId:   integer("reservation_id").references(() => reservations.id),
  guestId:         integer("guest_id").references(() => guests.id),
  serviceId:       integer("service_id").notNull().references(() => spaServices.id),
  resourceId:      integer("resource_id").references(() => spaResources.id),
  therapistId:     integer("therapist_id").references(() => users.id),
  appointmentDate: date("appointment_date").notNull(),
  startTime:       text("start_time").notNull(),  // "14:00"
  endTime:         text("end_time").notNull(),    // "15:00"
  status:          text("status").notNull().default("confirmed"),
    // "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show"
  guestCount:      integer("guest_count").default(1),
  price:           numeric("price", { precision: 10, scale: 2 }),
  discount:        numeric("discount", { precision: 10, scale: 2 }).default("0"),
  totalAmount:     numeric("total_amount", { precision: 10, scale: 2 }),
  isPaid:          boolean("is_paid").default(false),
  folioId:         integer("folio_id"),
  notes:           text("notes"),
  internalNotes:   text("internal_notes"),
  reminderSentAt:  timestamp("reminder_sent_at"),
  cancelledAt:     timestamp("cancelled_at"),
  cancelReason:    text("cancel_reason"),
  createdBy:       integer("created_by").references(() => users.id),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_spa_bookings_tenant").on(t.tenantId),
  idxDate:         index("idx_spa_bookings_date").on(t.appointmentDate),
  idxReservation:  index("idx_spa_bookings_reservation").on(t.reservationId),
}));

// ══════════════════════════════════════════════════════════════════════════════
//  RENTAL MODULE
// ══════════════════════════════════════════════════════════════════════════════

// ─── RENTAL ITEMS ─────────────────────────────────────────────────────────────
// Rentable equipment catalog: bikes, kayaks, golf carts, snorkel sets.
export const rentalItems = pgTable("rental_items", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  propertyId:      integer("property_id").references(() => properties.id),
  name:            text("name").notNull(),
  category:        text("category").notNull(), // "bike" | "watercraft" | "sports" | "vehicle" | "tech"
  description:     text("description"),
  imageUrl:        text("image_url"),
  totalStock:      integer("total_stock").notNull().default(1),
  pricePerHour:    numeric("price_per_hour", { precision: 10, scale: 2 }),
  pricePerDay:     numeric("price_per_day", { precision: 10, scale: 2 }),
  depositAmount:   numeric("deposit_amount", { precision: 10, scale: 2 }).default("0"),
  vatRate:         numeric("vat_rate", { precision: 5, scale: 2 }).default("20"),
  isActive:        boolean("is_active").notNull().default(true),
  sortOrder:       integer("sort_order").default(0),
  meta:            jsonb("meta").default("{}"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_rental_items_tenant").on(t.tenantId),
}));

// ─── RENTAL BOOKINGS ──────────────────────────────────────────────────────────
// Reservations for rental items.
export const rentalBookings = pgTable("rental_bookings", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  reservationId:   integer("reservation_id").references(() => reservations.id),
  guestId:         integer("guest_id").references(() => guests.id),
  itemId:          integer("item_id").notNull().references(() => rentalItems.id),
  quantity:        integer("quantity").notNull().default(1),
  startDate:       timestamp("start_date").notNull(),
  endDate:         timestamp("end_date").notNull(),
  status:          text("status").notNull().default("active"),
    // "pending" | "active" | "returned" | "overdue" | "cancelled"
  priceType:       text("price_type").notNull().default("per_day"), // "per_hour" | "per_day"
  unitPrice:       numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalAmount:     numeric("total_amount", { precision: 10, scale: 2 }),
  depositPaid:     numeric("deposit_paid", { precision: 10, scale: 2 }).default("0"),
  depositReturnedAt: timestamp("deposit_returned_at"),
  returnedAt:      timestamp("returned_at"),
  returnCondition: text("return_condition"),  // "good" | "damaged" | "lost"
  damageNotes:     text("damage_notes"),
  folioId:         integer("folio_id"),
  createdBy:       integer("created_by").references(() => users.id),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_rental_bookings_tenant").on(t.tenantId),
  idxItem:         index("idx_rental_bookings_item").on(t.itemId),
  idxReservation:  index("idx_rental_bookings_reservation").on(t.reservationId),
}));

// ══════════════════════════════════════════════════════════════════════════════
//  EVENTS MODULE
// ══════════════════════════════════════════════════════════════════════════════

// ─── EVENT LEADS ──────────────────────────────────────────────────────────────
// Sales pipeline for event inquiries (weddings, conferences, corporate retreats).
export const eventLeads = pgTable("event_leads", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  propertyId:      integer("property_id").references(() => properties.id),
  contactName:     text("contact_name").notNull(),
  contactEmail:    text("contact_email"),
  contactPhone:    text("contact_phone"),
  company:         text("company"),
  eventType:       text("event_type").notNull(),
    // "wedding" | "corporate" | "conference" | "birthday" | "gala" | "private" | "other"
  eventDate:       date("event_date"),
  alternateDate:   date("alternate_date"),
  guestCount:      integer("guest_count"),
  budget:          numeric("budget", { precision: 12, scale: 2 }),
  currency:        text("currency").default("UAH"),
  status:          text("status").notNull().default("new"),
    // "new" | "contacted" | "demo_scheduled" | "offer_sent" | "negotiating" | "converted" | "declined" | "lost"
  source:          text("source"),        // "website" | "phone" | "referral" | "social"
  requirements:    text("requirements"),
  notes:           text("notes"),
  assignedTo:      integer("assigned_to").references(() => users.id),
  followUpAt:      timestamp("follow_up_at"),
  convertedAt:     timestamp("converted_at"),
  convertedToId:   integer("converted_to_id"),  // FK to event_bookings.id
  lostReason:      text("lost_reason"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_event_leads_tenant").on(t.tenantId),
  idxStatus:       index("idx_event_leads_status").on(t.status),
}));

// ─── EVENT BOOKINGS ───────────────────────────────────────────────────────────
// Confirmed event reservations with full detail.
// Maps to existing `events` table conceptually.
export const eventBookings = pgTable("event_bookings", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  leadId:          integer("lead_id").references(() => eventLeads.id),
  propertyId:      integer("property_id").references(() => properties.id),
  eventSpaceId:    integer("event_space_id"),
  name:            text("name").notNull(),
  eventType:       text("event_type").notNull(),
  eventDate:       date("event_date").notNull(),
  startTime:       text("start_time"),    // "18:00"
  endTime:         text("end_time"),      // "23:00"
  guestCount:      integer("guest_count"),
  contactName:     text("contact_name").notNull(),
  contactPhone:    text("contact_phone"),
  contactEmail:    text("contact_email"),
  status:          text("status").notNull().default("confirmed"),
    // "inquiry" | "confirmed" | "deposit_paid" | "completed" | "cancelled"
  totalAmount:     numeric("total_amount", { precision: 12, scale: 2 }),
  depositAmount:   numeric("deposit_amount", { precision: 12, scale: 2 }),
  depositPaidAt:   timestamp("deposit_paid_at"),
  services:        jsonb("services").default("[]"), // selected services/packages
  requirements:    text("requirements"),
  notes:           text("notes"),
  assignedTo:      integer("assigned_to").references(() => users.id),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_event_bookings_tenant").on(t.tenantId),
  idxDate:         index("idx_event_bookings_date").on(t.eventDate),
}));

// ══════════════════════════════════════════════════════════════════════════════
//  RESTAURANT / POS MODULE
// ══════════════════════════════════════════════════════════════════════════════

// ─── RESTAURANT CHARGES ───────────────────────────────────────────────────────
// F&B charges linked directly to a hotel reservation (room service, restaurant bill).
// A lightweight bridge between the POS and PMS folios.
export const restaurantCharges = pgTable("restaurant_charges", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  reservationId:   integer("reservation_id").references(() => reservations.id),
  guestId:         integer("guest_id").references(() => guests.id),
  unitId:          integer("unit_id").references(() => propertyUnits.id), // the room it's billed to
  orderId:         integer("order_id"),     // FK to restaurant_orders or fb_orders
  orderNo:         text("order_no"),
  businessUnitId:  integer("business_unit_id").references(() => businessUnits.id),
  amount:          numeric("amount", { precision: 10, scale: 2 }).notNull(),
  vatAmount:       numeric("vat_amount", { precision: 10, scale: 2 }),
  description:     text("description"),
  chargedAt:       timestamp("charged_at").notNull().defaultNow(),
  postedToFolio:   boolean("posted_to_folio").notNull().default(false),
  folioEntryId:    integer("folio_entry_id"),
  notes:           text("notes"),
  createdBy:       integer("created_by").references(() => users.id),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_restaurant_charges_tenant").on(t.tenantId),
  idxReservation:  index("idx_restaurant_charges_reservation").on(t.reservationId),
}));

// ─── FB LEGACY TABLES (kept in schema to prevent Drizzle from dropping them) ──

// fb_config_settings — per-org F&B configuration blobs (section → jsonb)
export const fbConfigSettings = pgTable("fb_config_settings", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  section:        text("section").notNull(),
  data:           jsonb("data").notNull().default({}),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

// fb_order_sources — order origin labels shown on POS
export const fbOrderSources = pgTable("fb_order_sources", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  name:           text("name").notNull(),
  showOnPos:      boolean("show_on_pos").notNull().default(true),
  sortOrder:      integer("sort_order").notNull().default(0),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

// fb_payment_methods — F&B-specific payment methods on POS
export const fbPaymentMethods = pgTable("fb_payment_methods", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  name:           text("name").notNull(),
  type:           text("type").notNull().default("cash"),
  commissionPct:  numeric("commission_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  showOnPos:      boolean("show_on_pos").notNull().default(true),
  color:          text("color"),
  iconCode:       text("icon_code"),
  sortOrder:      integer("sort_order").notNull().default(0),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

// fb_hall_tables — visual hall-layout table positions (legacy floor-plan editor)
export const fbHallTables = pgTable("fb_hall_tables", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  hallId:         integer("hall_id"),
  hallName:       text("hall_name"),
  tableNumber:    integer("table_number").notNull(),
  posX:           integer("pos_x").notNull().default(0),
  posY:           integer("pos_y").notNull().default(0),
  width:          integer("width").notNull().default(80),
  height:         integer("height").notNull().default(80),
  seats:          integer("seats").notNull().default(4),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

// ─── POS SYNC LOGS ────────────────────────────────────────────────────────────
// Log of synchronization events between the PMS and external POS systems.
export const posSyncLogs = pgTable("pos_sync_logs", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  posSystem:       text("pos_system").notNull(), // "checkbox" | "poster" | "syrve" | "r_keeper"
  direction:       text("direction").notNull(),  // "pms_to_pos" | "pos_to_pms"
  entityType:      text("entity_type"),          // "order" | "charge" | "item" | "void"
  entityId:        text("entity_id"),
  status:          text("status").notNull(),     // "success" | "failed" | "partial"
  errorMessage:    text("error_message"),
  payload:         jsonb("payload"),
  response:        jsonb("response"),
  syncedAt:        timestamp("synced_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_pos_sync_logs_tenant").on(t.tenantId),
  idxStatus:       index("idx_pos_sync_logs_status").on(t.status),
}));
