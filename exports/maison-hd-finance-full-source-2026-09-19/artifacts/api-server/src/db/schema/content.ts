/**
 * CONTENT & GUEST JOURNEY DOMAIN
 * Digital touchpoints: in-room TV, check-in forms, checkout, documents, exports
 *
 * Architecture:
 *   tv_content (content library for in-room TV)
 *   tv_devices (one per room smart TV / tablet)
 *   checkin_forms (pre-arrival form templates + guest submissions)
 *   checkout_requests (express checkout / late checkout)
 *   documents (internal document storage)
 *   exported_documents (sent/exported document registry)
 *   accounting_exports (accounting system export jobs)
 */

import {
  pgTable, serial, text, boolean, integer,
  timestamp, date, jsonb, index,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";
import { properties, propertyUnits } from "./property";
import { guests } from "./guests";
import { reservations } from "./reservations";
import { users } from "./iam";

// ─── TV CONTENT ───────────────────────────────────────────────────────────────
// Content library for in-room entertainment system / smart TVs / tablets.
export const tvContent = pgTable("tv_content", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  propertyId:      integer("property_id").references(() => properties.id),
  title:           text("title").notNull(),
  type:            text("type").notNull(),
    // "welcome_video" | "property_info" | "services_menu" | "local_guide"
    // | "live_channel" | "vod" | "music" | "app_card" | "promo"
  mediaUrl:        text("media_url"),
  thumbnailUrl:    text("thumbnail_url"),
  duration:        integer("duration"),      // seconds (for video)
  language:        text("language").default("uk"),
  isActive:        boolean("is_active").notNull().default(true),
  sortOrder:       integer("sort_order").default(0),
  validFrom:       date("valid_from"),
  validTo:         date("valid_to"),
  targetAudience:  jsonb("target_audience").default("[]"), // guest segment filters
  meta:            jsonb("meta").default("{}"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_tv_content_tenant").on(t.tenantId),
}));

// ─── TV DEVICES ───────────────────────────────────────────────────────────────
// One device per physical room / zone. Maps to existing `tv_screens` table.
export const tvDevices = pgTable("tv_devices", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  unitId:          integer("unit_id").references(() => propertyUnits.id),
  propertyId:      integer("property_id").references(() => properties.id),
  name:            text("name").notNull(),        // "Room 101 TV" | "Lobby Screen"
  type:            text("type").notNull().default("room_tv"),
    // "room_tv" | "tablet" | "lobby_screen" | "restaurant_screen" | "spa_screen"
  macAddress:      text("mac_address"),
  ipAddress:       text("ip_address"),
  serialNo:        text("serial_no"),
  model:           text("model"),
  firmwareVersion: text("firmware_version"),
  status:          text("status").notNull().default("active"),
    // "active" | "offline" | "maintenance" | "decommissioned"
  lastSeenAt:      timestamp("last_seen_at"),
  currentGuestId:  integer("current_guest_id").references(() => guests.id),
  currentResId:    integer("current_reservation_id").references(() => reservations.id),
  displayConfig:   jsonb("display_config").default("{}"),  // brightness, language, playlist
  accessCode:      text("access_code"),           // PIN for parental/access control
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_tv_devices_tenant").on(t.tenantId),
  idxUnit:         index("idx_tv_devices_unit").on(t.unitId),
}));

// ─── CHECKIN FORMS ────────────────────────────────────────────────────────────
// Pre-arrival form templates AND guest-submitted responses.
// Two modes: template (tenantId set, guestId null) + submission (linked to reservation).
export const checkinForms = pgTable("checkin_forms", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  reservationId:   integer("reservation_id").references(() => reservations.id),
  guestId:         integer("guest_id").references(() => guests.id),
  isTemplate:      boolean("is_template").notNull().default(false),
  name:            text("name"),                  // template name "Standard Pre-Arrival"
  fields:          jsonb("fields").notNull().default("[]"),
    // template: [{ id, type, label, required, options }]
    // submission: [{ id, type, label, value }]
  status:          text("status").notNull().default("pending"),
    // "pending" | "sent" | "partial" | "submitted" | "verified" | "expired"
  accessToken:     text("access_token"),          // unique link token for guest
  accessUrl:       text("access_url"),            // full link sent to guest
  sentAt:          timestamp("sent_at"),
  submittedAt:     timestamp("submitted_at"),
  verifiedAt:      timestamp("verified_at"),
  verifiedBy:      integer("verified_by").references(() => users.id),
  expiresAt:       timestamp("expires_at"),
  reminderSentAt:  timestamp("reminder_sent_at"),
  language:        text("language").default("uk"),
  meta:            jsonb("meta").default("{}"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_checkin_forms_tenant").on(t.tenantId),
  idxReservation:  index("idx_checkin_forms_reservation").on(t.reservationId),
}));

// ─── CHECKOUT REQUESTS ────────────────────────────────────────────────────────
// Express checkout, late checkout, and early departure requests from guests.
export const checkoutRequests = pgTable("checkout_requests", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  reservationId:   integer("reservation_id").notNull().references(() => reservations.id),
  guestId:         integer("guest_id").references(() => guests.id),
  type:            text("type").notNull().default("express"),
    // "express" | "late" | "early_departure"
  requestedTime:   text("requested_time"),   // "13:00" for late checkout
  status:          text("status").notNull().default("pending"),
    // "pending" | "approved" | "declined" | "processed"
  feeApplied:      boolean("fee_applied").default(false),
  feeAmount:       text("fee_amount"),
  guestNotes:      text("guest_notes"),
  staffNotes:      text("staff_notes"),
  billReviewDone:  boolean("bill_review_done").default(false),
  billConfirmed:   boolean("bill_confirmed").default(false),
  folioPdf:        text("folio_pdf"),        // URL to emailed/shown folio PDF
  processedBy:     integer("processed_by").references(() => users.id),
  processedAt:     timestamp("processed_at"),
  requestedAt:     timestamp("requested_at").notNull().defaultNow(),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_checkout_requests_tenant").on(t.tenantId),
  idxReservation:  index("idx_checkout_requests_reservation").on(t.reservationId),
}));

// ─── DOCUMENTS ────────────────────────────────────────────────────────────────
// General document storage: contracts, agreements, insurance, licenses.
export const documents = pgTable("documents", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  entityType:      text("entity_type"),        // "reservation" | "guest" | "event" | "tenant" | null
  entityId:        integer("entity_id"),
  name:            text("name").notNull(),
  type:            text("type").notNull(),
    // "contract" | "agreement" | "invoice" | "receipt" | "act" | "passport_scan"
    // | "insurance" | "permit" | "license" | "other"
  mimeType:        text("mime_type"),
  fileUrl:         text("file_url").notNull(),
  fileSize:        integer("file_size"),        // bytes
  checksum:        text("checksum"),            // SHA-256
  status:          text("status").notNull().default("active"),
    // "active" | "archived" | "deleted" | "signed" | "expired"
  isConfidential:  boolean("is_confidential").notNull().default(false),
  signedAt:        timestamp("signed_at"),
  expiresAt:       timestamp("expires_at"),
  uploadedBy:      integer("uploaded_by").references(() => users.id),
  tags:            jsonb("tags").default("[]"),
  meta:            jsonb("meta").default("{}"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_documents_tenant").on(t.tenantId),
  idxEntity:       index("idx_documents_entity").on(t.entityType, t.entityId),
}));

// ─── EXPORTED DOCUMENTS ───────────────────────────────────────────────────────
// Registry of documents exported/sent to guests or external systems.
export const exportedDocuments = pgTable("exported_documents", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  documentId:      integer("document_id").references(() => documents.id),
  entityType:      text("entity_type"),
  entityId:        integer("entity_id"),
  exportType:      text("export_type").notNull(),
    // "email" | "download" | "print" | "sms_link" | "whatsapp" | "api"
  recipient:       text("recipient"),            // email / phone
  status:          text("status").notNull().default("sent"),
    // "sent" | "delivered" | "failed" | "downloaded"
  fileUrl:         text("file_url"),
  fileSize:        integer("file_size"),
  language:        text("language").default("uk"),
  exportedBy:      integer("exported_by").references(() => users.id),
  sentAt:          timestamp("sent_at").notNull().defaultNow(),
  meta:            jsonb("meta").default("{}"),
}, (t) => ({
  idxTenant:       index("idx_exported_docs_tenant").on(t.tenantId),
}));

// ─── ACCOUNTING EXPORTS ───────────────────────────────────────────────────────
// Jobs that export financial data to accounting systems (1C, BAS, Checkbox).
export const accountingExports = pgTable("accounting_exports", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  legalEntityId:   integer("legal_entity_id"),
  system:          text("system").notNull(),
    // "bas" | "vchasno" | "taxcom" | "medoc" | "checkbox" | "1c" | "excel" | "csv"
  type:            text("type").notNull(),
    // "tax_invoice" | "act" | "payment" | "journal" | "full_period" | "z_report"
  status:          text("status").notNull().default("pending"),
    // "pending" | "running" | "success" | "failed" | "cancelled"
  periodFrom:      date("period_from"),
  periodTo:        date("period_to"),
  recordCount:     integer("record_count"),
  fileUrl:         text("file_url"),
  errorMessage:    text("error_message"),
  config:          jsonb("config").default("{}"),   // format settings, filters
  result:          jsonb("result").default("{}"),   // summary statistics
  startedAt:       timestamp("started_at"),
  completedAt:     timestamp("completed_at"),
  createdBy:       integer("created_by").references(() => users.id),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_accounting_exports_tenant").on(t.tenantId),
  idxStatus:       index("idx_accounting_exports_status").on(t.status),
}));
