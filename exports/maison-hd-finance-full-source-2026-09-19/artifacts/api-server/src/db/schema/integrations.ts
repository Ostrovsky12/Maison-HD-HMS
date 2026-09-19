/**
 * INTEGRATIONS DOMAIN
 * External system connectors: accounts, sync logs, audit trail
 */

import {
  pgTable, serial, text, boolean, integer,
  timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";
import { users } from "./iam";

// ─── INTEGRATION ACCOUNTS ─────────────────────────────────────────────────────
// Per-tenant integration credential stores.
// Each row represents one configured integration for a tenant.
// Maps to existing `external_connections` table conceptually.
export const integrationAccounts = pgTable("integration_accounts", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name:            text("name").notNull(),       // human label "Booking.com - Main Account"
  type:            text("type").notNull(),
    // OTA: "booking_com" | "airbnb" | "expedia" | "google_hotel"
    // POS: "checkbox" | "poster" | "syrve"
    // Accounting: "vchasno" | "taxcom" | "medoc" | "bas"
    // Payment: "liqpay" | "wayforpay" | "fondy" | "monobank"
    // CRM: "bitrix" | "hubspot" | "pipedrive"
    // Other: "slack" | "zapier" | "make" | "n8n" | "custom_webhook"
  category:        text("category").notNull(),
    // "ota" | "pos" | "accounting" | "payment" | "crm" | "automation" | "other"
  status:          text("status").notNull().default("pending"),
    // "pending" | "active" | "error" | "disconnected" | "expired"
  credentials:     jsonb("credentials").default("{}"),  // encrypted
  config:          jsonb("config").default("{}"),        // integration-specific settings
  webhookUrl:      text("webhook_url"),
  webhookSecret:   text("webhook_secret"),
  externalId:      text("external_id"),         // account/hotel ID in external system
  lastSyncAt:      timestamp("last_sync_at"),
  lastErrorAt:     timestamp("last_error_at"),
  lastErrorMsg:    text("last_error_msg"),
  syncFrequency:   text("sync_frequency").default("realtime"),
    // "realtime" | "hourly" | "daily" | "manual"
  autoSync:        boolean("auto_sync").notNull().default(true),
  isActive:        boolean("is_active").notNull().default(true),
  expiresAt:       timestamp("expires_at"),     // for OAuth token expiry
  refreshToken:    text("refresh_token"),       // encrypted
  createdBy:       integer("created_by").references(() => users.id),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_integration_accounts_tenant").on(t.tenantId),
  idxType:         index("idx_integration_accounts_type").on(t.type),
}));

// ─── INTEGRATION LOGS ─────────────────────────────────────────────────────────
// Detailed logs of every integration API call and sync operation.
// Maps to existing `integration_logs` table.
export const integrationLogs = pgTable("integration_logs", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("organization_id").notNull().references(() => tenants.id),
  accountId:       integer("account_id").references(() => integrationAccounts.id),
  integration:     text("integration").notNull(),   // same as integrationAccounts.type
  direction:       text("direction").notNull(),     // "inbound" | "outbound"
  operation:       text("operation").notNull(),     // "create_booking" | "update_rates" | ...
  status:          text("status").notNull(),        // "success" | "failed" | "partial"
  entityType:      text("entity_type"),             // "reservation" | "rate" | "availability" ...
  entityId:        text("entity_id"),
  externalId:      text("external_id"),
  requestPayload:  jsonb("request_payload"),
  responsePayload: jsonb("response_payload"),
  errorCode:       text("error_code"),
  errorMessage:    text("error_message"),
  durationMs:      integer("duration_ms"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_integration_logs_tenant").on(t.tenantId),
  idxAccount:      index("idx_integration_logs_account").on(t.accountId),
  idxStatus:       index("idx_integration_logs_status").on(t.status),
}));

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────
// Immutable audit trail for all significant entity mutations.
// Maps to existing `audit_logs` table.
export const auditLogs = pgTable("audit_logs", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("organization_id").references(() => tenants.id),
  userId:          integer("user_id").references(() => users.id),
  userEmail:       text("user_email"),      // snapshot in case user is deleted
  userRole:        text("user_role"),       // snapshot of role at time of action
  action:          text("action").notNull(),
    // "created" | "updated" | "deleted" | "status_changed" | "exported" | "login" | ...
  entityType:      text("entity_type").notNull(),
    // "reservation" | "guest" | "invoice" | "payment" | "user" | "rate" | ...
  entityId:        text("entity_id"),
  entityLabel:     text("entity_label"),    // human-readable identifier (booking no, guest name)
  changes:         jsonb("changes"),        // { field: { before, after } }
  metadata:        jsonb("metadata").default("{}"),
  ipAddress:       text("ip_address"),
  userAgent:       text("user_agent"),
  requestId:       text("request_id"),      // correlation ID
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_audit_logs_tenant").on(t.tenantId),
  idxEntity:       index("idx_audit_logs_entity").on(t.entityType, t.entityId),
  idxUser:         index("idx_audit_logs_user").on(t.userId),
  idxCreated:      index("idx_audit_logs_created").on(t.createdAt),
}));
