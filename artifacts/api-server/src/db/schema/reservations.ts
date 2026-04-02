/**
 * RESERVATIONS DOMAIN
 * The core booking engine: reservations, guests, status history, sources
 *
 * Architecture:
 *   reservation_sources (OTA/channel config)
 *       ↓
 *   reservations (header: dates, unit, totals)
 *       ├── reservation_items  (line items: room nights, services, charges)
 *       ├── reservation_guests (which real guests are staying)
 *       └── reservation_status_history (full audit trail)
 *
 * NOTE: `reservations` maps to the existing `bookings` table.
 */

import {
  pgTable, serial, text, boolean, integer, numeric,
  timestamp, date, jsonb, index,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";
import { propertyUnits } from "./property";
import { guests } from "./guests";
import { users } from "./iam";

// ─── RESERVATION SOURCES ──────────────────────────────────────────────────────
// Booking channel / source configuration per tenant.
// Extends the existing booking_source enum with structured per-channel config.
export const reservationSources = pgTable("reservation_sources", {
  id:            serial("id").primaryKey(),
  tenantId:      integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name:          text("name").notNull(),         // "Booking.com" | "Direct Website" | "Walk-in"
  code:          text("code").notNull(),         // "booking" | "direct" | "airbnb" | "phone" | "walkin"
  type:          text("type").notNull(),         // "ota" | "direct" | "gds" | "offline" | "api"
  commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).default("0"),
  color:         text("color"),                  // hex color for calendar display
  isActive:      boolean("is_active").notNull().default(true),
  config:        jsonb("config").default("{}"),  // OTA API credentials, channel settings
  createdAt:     timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:     index("idx_reservation_sources_tenant").on(t.tenantId),
}));

// ─── RESERVATIONS ─────────────────────────────────────────────────────────────
// The central reservation record. Maps to existing `bookings` table.
// All financial totals are derived from reservation_items (see below).
export const reservations = pgTable("bookings", {
  id:                   serial("id").primaryKey(),
  tenantId:             integer("organization_id"),  // denormalized for fast queries
  unitId:               integer("unit_id").notNull().references(() => propertyUnits.id),
  guestId:              integer("guest_id").references(() => guests.id),

  // Confirmation number visible to guest
  confirmationNo:       text("confirmation_no"),      // "MHD-2025-00412"

  // Dates
  checkIn:              date("check_in").notNull(),
  checkOut:             date("check_out").notNull(),
  checkInTime:          text("checkin_time").default("14:00"),
  checkOutTime:         text("checkout_time").default("12:00"),
  actualCheckIn:        timestamp("actual_check_in"),  // recorded at time of arrival
  actualCheckOut:       timestamp("actual_check_out"),

  // Status
  status:               text("status").notNull().default("pending"),
    // "draft" | "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show"
  paymentStatus:        text("payment_status").notNull().default("unpaid"),
    // "unpaid" | "partial" | "paid" | "overpaid" | "refunded"

  // Source
  source:               text("source").notNull().default("direct"),
  sourceId:             integer("source_id").references(() => reservationSources.id),
  externalId:           text("external_id"),           // OTA booking ID
  channelConfirmNo:     text("channel_confirm_no"),    // OTA own confirmation number

  // Rate
  rateId:               integer("rate_id"),
  rateName:             text("rate_name"),
  ratePlanCode:         text("rate_plan_code"),         // "BAR" | "NR" | "BB" | "HB" | "FB"

  // Occupancy
  adults:               integer("adults").notNull().default(1),
  childrenUnder6:       integer("children_under_6").notNull().default(0),
  childrenOver6:        integer("children_over_6").notNull().default(0),
  extraBeds:            integer("extra_beds").notNull().default(0),
  guestsCount:          integer("guests_count").notNull().default(1),

  // Financials (denormalized totals)
  totalAmount:          numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  paidAmount:           numeric("paid_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  discountId:           integer("discount_id"),
  discountValue:        numeric("discount_value", { precision: 10, scale: 2 }),
  discountType:         text("discount_type"),
  currency:             text("currency").default("UAH"),

  // Guest details (denormalized for quick access without guest lookup)
  firstName:            text("first_name"),
  lastName:             text("last_name"),
  middleName:           text("middle_name"),
  phone:                text("phone"),

  // Legal
  legalEntityId:        integer("legal_entity_id"),

  // Addons (denormalized JSONB for backward compatibility)
  selectedAddons:       jsonb("selected_addons").default("{}"),
  addonIds:             jsonb("addon_ids").default("[]"),

  // Guest journey
  guestAccessCode:      text("guest_access_code"),    // access to guest portal
  checkinFormSubmitted: boolean("checkin_form_submitted").default(false),
  checkinFormData:      jsonb("checkin_form_data").default("{}"),
  draftExpiresAt:       timestamp("draft_expires_at"),
  paymentLink:          text("payment_link"),

  notes:                text("notes"),
  internalNotes:        text("internal_notes"),
  tags:                 jsonb("tags").default("[]"),

  createdBy:            integer("created_by").references(() => users.id),
  cancelledBy:          integer("cancelled_by").references(() => users.id),
  cancelledAt:          timestamp("cancelled_at"),
  cancellationReason:   text("cancellation_reason"),
  cancellationPolicy:   text("cancellation_policy"), // snapshot of policy at time of booking
  noShowAt:             timestamp("no_show_at"),

  createdAt:            timestamp("created_at").notNull().defaultNow(),
  updatedAt:            timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxUnit:              index("idx_bookings_unit").on(t.unitId),
  idxGuest:             index("idx_bookings_guest").on(t.guestId),
  idxStatus:            index("idx_bookings_status").on(t.status),
  idxDates:             index("idx_bookings_dates").on(t.checkIn, t.checkOut),
  idxTenant:            index("idx_bookings_tenant").on(t.tenantId),
}));

// ─── RESERVATION ITEMS ────────────────────────────────────────────────────────
// Line items composing a reservation's charges.
// Each night is a separate item type "room_night", addons are "addon", etc.
// This replaces ad-hoc JSONB fields in bookings.
export const reservationItems = pgTable("reservation_items", {
  id:               serial("id").primaryKey(),
  reservationId:    integer("reservation_id").notNull().references(() => reservations.id, { onDelete: "cascade" }),

  itemType:         text("item_type").notNull(),
    // "room_night" | "addon" | "spa" | "fnb" | "rental" | "event_fee" | "tax" | "discount" | "deposit"
  date:             date("date"),              // specific night date for "room_night" items
  name:             text("name").notNull(),
  description:      text("description"),
  quantity:         numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
  unitPrice:        numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  totalPrice:       numeric("total_price", { precision: 12, scale: 2 }).notNull(),
  vatRate:          numeric("vat_rate", { precision: 5, scale: 2 }).default("20"),
  vatAmount:        numeric("vat_amount", { precision: 12, scale: 2 }),

  // Reference to source entity
  refType:          text("ref_type"),         // "addon" | "rate" | "spa_service" | ...
  refId:            integer("ref_id"),

  businessUnitId:   integer("business_unit_id"),
  revenueCategoryId: integer("revenue_category_id"),

  isPosted:         boolean("is_posted").notNull().default(false),
  postedAt:         timestamp("posted_at"),
  invoiceId:        integer("invoice_id"),

  createdAt:        timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxReservation:   index("idx_reservation_items_booking").on(t.reservationId),
}));

// ─── RESERVATION GUESTS ───────────────────────────────────────────────────────
// Which guest profiles are attached to a reservation (main + additional).
// Supports group/family bookings where multiple guests share one reservation.
export const reservationGuests = pgTable("reservation_guests", {
  id:              serial("id").primaryKey(),
  reservationId:   integer("reservation_id").notNull().references(() => reservations.id, { onDelete: "cascade" }),
  guestId:         integer("guest_id").notNull().references(() => guests.id),
  role:            text("role").notNull().default("primary"), // "primary" | "additional" | "child"
  isMainGuest:     boolean("is_main_guest").notNull().default(false),
  roomAssignment:  text("room_assignment"),   // for multi-room group bookings
  checkedIn:       boolean("checked_in").notNull().default(false),
  checkedInAt:     timestamp("checked_in_at"),
  checkedOut:      boolean("checked_out").notNull().default(false),
  checkedOutAt:    timestamp("checked_out_at"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxReservation:  index("idx_reservation_guests_booking").on(t.reservationId),
  idxGuest:        index("idx_reservation_guests_guest").on(t.guestId),
}));

// ─── RESERVATION STATUS HISTORY ───────────────────────────────────────────────
// Immutable audit trail of every status change.
// Enables SLA calculations, dispute resolution, and analytics.
export const reservationStatusHistory = pgTable("reservation_status_history", {
  id:              serial("id").primaryKey(),
  reservationId:   integer("reservation_id").notNull().references(() => reservations.id, { onDelete: "cascade" }),
  fromStatus:      text("from_status"),
  toStatus:        text("to_status").notNull(),
  reason:          text("reason"),             // cancellation reason, no-show reason, etc.
  changedBy:       integer("changed_by").references(() => users.id),
  changedByRole:   text("changed_by_role"),
  source:          text("source").default("manual"), // "manual" | "api" | "ota" | "system" | "ai"
  metadata:        jsonb("metadata").default("{}"),  // OTA notification payload, etc.
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxReservation:  index("idx_res_status_hist_booking").on(t.reservationId),
}));
