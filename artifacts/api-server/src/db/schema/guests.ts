/**
 * GUESTS DOMAIN
 * Guest identity, extended profiles, loyalty program
 *
 * Architecture: guests → core identity (PII)
 *               guest_profiles → behavioral data (preferences, loyalty, history)
 */

import {
  pgTable, serial, text, boolean, integer, numeric,
  timestamp, date, jsonb, index,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";

// ─── GUESTS ───────────────────────────────────────────────────────────────────
// Core guest identity record. One record per real person per tenant.
// PII is stored here. Linked to reservations via reservation_guests.
export const guests = pgTable("guests", {
  id:             serial("id").primaryKey(),
  tenantId:       integer("organization_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Identity
  firstName:      text("first_name").notNull(),
  lastName:       text("last_name").notNull(),
  middleName:     text("middle_name"),
  email:          text("email"),
  phone:          text("phone"),
  birthDate:      date("birth_date"),
  gender:         text("gender"),                // "male" | "female" | "other" | null
  nationality:    text("nationality"),            // ISO 3166-1 alpha-2

  // Documents
  passportNumber: text("passport_number"),
  passportIssued: date("passport_issued"),
  passportExpiry: date("passport_expiry"),
  passportIssuedBy: text("passport_issued_by"),
  taxId:          text("tax_id"),                // ІПН

  // Contact
  address:        text("address"),
  city:           text("city"),
  country:        text("country"),
  language:       text("language").default("uk"),

  // Derived / denormalized (updated by triggers/jobs)
  bookingCount:   integer("booking_count").notNull().default(0),
  totalNights:    integer("total_nights").default(0),
  totalSpent:     numeric("total_spent", { precision: 10, scale: 2 }).default("0"),
  ltv:            numeric("ltv", { precision: 10, scale: 2 }).notNull().default("0"),
  lastVisit:      timestamp("last_visit"),

  // Tags & notes
  tags:           jsonb("tags").default("[]"),   // ["vip", "regular", "problem"]
  notes:          text("notes"),
  internalNotes:  text("internal_notes"),

  // Loyalty (denormalized for fast queries)
  loyaltyLevel:   text("loyalty_level").default("bronze"), // "bronze"|"silver"|"gold"|"platinum"
  loyaltyPoints:  integer("loyalty_points").default(0),

  // Preferences (free-form for now, structured in guest_profiles)
  preferences:    jsonb("preferences").default("[]"),

  isBlacklisted:  boolean("is_blacklisted").notNull().default(false),
  blacklistReason: text("blacklist_reason"),
  deletedAt:      timestamp("deleted_at"),        // soft delete (GDPR right to erasure)
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:      index("idx_guests_tenant").on(t.tenantId),
  idxEmail:       index("idx_guests_email").on(t.email),
  idxPhone:       index("idx_guests_phone").on(t.phone),
}));

// ─── GUEST PROFILES ───────────────────────────────────────────────────────────
// Extended behavioral profile. Separated from core identity for:
// - PII minimization compliance
// - Independent update cadence (preferences updated per-stay)
// - ML feature store readiness
export const guestProfiles = pgTable("guest_profiles", {
  id:                   serial("id").primaryKey(),
  guestId:              integer("guest_id").notNull().unique()
                          .references(() => guests.id, { onDelete: "cascade" }),

  // Accommodation preferences
  preferredUnitType:    text("preferred_unit_type"),    // "suite" | "double" | ...
  preferredFloor:       integer("preferred_floor"),
  preferredBedConfig:   text("preferred_bed_config"),   // "king" | "twin" | ...
  preferredView:        text("preferred_view"),
  prefersBabyBed:       boolean("prefers_baby_bed").default(false),

  // Stay preferences
  preferredCheckInTime: text("preferred_checkin_time"),
  preferredCheckOutTime: text("preferred_checkout_time"),
  preferredPillow:      text("preferred_pillow"),       // "soft" | "medium" | "firm"
  allergies:            jsonb("allergies").default("[]"), // ["nuts", "gluten", ...]
  dietaryReqs:          jsonb("dietary_reqs").default("[]"), // ["vegan", "halal", ...]

  // Wellness / Spa
  preferredSpaTherapist: integer("preferred_spa_therapist_id"),
  spaTreatmentHistory:  jsonb("spa_treatment_history").default("[]"),

  // F&B
  favouriteDishes:      jsonb("favourite_dishes").default("[]"),
  preferredTableNo:     text("preferred_table_no"),

  // Loyalty
  loyaltyTier:          text("loyalty_tier").default("bronze"),
  loyaltyPointsEarned:  integer("loyalty_points_earned").default(0),
  loyaltyPointsRedeemed: integer("loyalty_points_redeemed").default(0),
  memberSince:          date("member_since"),
  loyaltyCardNo:        text("loyalty_card_no"),

  // Communication
  preferredChannel:     text("preferred_channel").default("email"), // "email"|"sms"|"whatsapp"|"viber"
  marketingOptIn:       boolean("marketing_opt_in").default(false),
  newsletterOptIn:      boolean("newsletter_opt_in").default(false),
  smsOptIn:             boolean("sms_opt_in").default(false),
  unsubscribedAt:       timestamp("unsubscribed_at"),

  // Computed by AI
  satisfactionScore:    numeric("satisfaction_score", { precision: 3, scale: 2 }), // 0.00–5.00
  churnRisk:            text("churn_risk"),        // "low" | "medium" | "high"
  segments:             jsonb("segments").default("[]"), // ["business", "anniversary", "honeymoon"]

  updatedAt:            timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxGuest:             index("idx_guest_profiles_guest").on(t.guestId),
}));
