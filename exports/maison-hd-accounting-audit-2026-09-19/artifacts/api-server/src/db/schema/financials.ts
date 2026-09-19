/**
 * FINANCIALS DOMAIN
 * Revenue management: folios, invoices, payments, payment infrastructure
 *
 * Architecture:
 *   folios (guest account / bill)
 *       └── folio_entries (individual charges/credits — existing table)
 *   invoices (formal tax document)
 *   payments (actual money movement)
 *       └── payment_attempts (individual API calls)
 *   payment_providers (per-tenant payment gateway configs)
 */

import {
  pgTable, serial, text, boolean, integer, numeric,
  timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";
import { reservations } from "./reservations";
import { guests } from "./guests";
import { users } from "./iam";

// ─── PAYMENT PROVIDERS ────────────────────────────────────────────────────────
// Per-tenant payment gateway configuration (LiqPay, Wayforpay, Stripe, etc.)
export const paymentProviders = pgTable("payment_providers", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name:            text("name").notNull(),
  provider:        text("provider").notNull(),
    // "liqpay" | "wayforpay" | "fondy" | "stripe" | "monobank" | "cash" | "terminal"
  displayName:     text("display_name").notNull(),
  isActive:        boolean("is_active").notNull().default(true),
  isDefault:       boolean("is_default").notNull().default(false),
  credentials:     jsonb("credentials").default("{}"),  // encrypted: { publicKey, privateKey, ... }
  webhookSecret:   text("webhook_secret"),
  config:          jsonb("config").default("{}"),        // { successUrl, failUrl, currency, ... }
  testMode:        boolean("test_mode").notNull().default(false),
  feePct:          numeric("fee_pct", { precision: 5, scale: 2 }).default("0"),
  sortOrder:       integer("sort_order").default(0),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_payment_providers_tenant").on(t.tenantId),
}));

// ─── FOLIOS ───────────────────────────────────────────────────────────────────
// Guest account / bill header. Multiple folios can be opened per reservation
// (e.g. room folio, spa folio, city tax folio).
// Line items live in the existing `folio_entries` table.
export const folios = pgTable("folios", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  reservationId:   integer("reservation_id").references(() => reservations.id),
  guestId:         integer("guest_id").references(() => guests.id),
  folioNo:         text("folio_no").notNull(),    // "F-2025-00412-A"
  type:            text("type").notNull().default("main"),
    // "main" | "spa" | "fnb" | "city_tax" | "deposit" | "misc"
  status:          text("status").notNull().default("open"),
    // "open" | "settled" | "transferred" | "closed" | "disputed"
  currency:        text("currency").notNull().default("UAH"),
  totalCharges:    numeric("total_charges", { precision: 14, scale: 2 }).notNull().default("0"),
  totalCredits:    numeric("total_credits", { precision: 14, scale: 2 }).notNull().default("0"),
  balance:         numeric("balance", { precision: 14, scale: 2 }).notNull().default("0"),
  legalEntityId:   integer("legal_entity_id"),
  settledAt:       timestamp("settled_at"),
  settledBy:       integer("settled_by").references(() => users.id),
  notes:           text("notes"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxReservation:  index("idx_folios_reservation").on(t.reservationId),
  idxGuest:        index("idx_folios_guest").on(t.guestId),
  idxTenant:       index("idx_folios_tenant").on(t.tenantId),
}));

// ─── INVOICES ─────────────────────────────────────────────────────────────────
// Formal tax documents: вiдомiсть / рахунок-фактура / акт.
// Maps to existing `invoices` table conceptually.
export const invoices = pgTable("invoices", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("organization_id").notNull().references(() => tenants.id),
  reservationId:   integer("booking_id").references(() => reservations.id),
  guestId:         integer("guest_id").references(() => guests.id),
  legalEntityId:   integer("legal_entity_id"),
  invoiceNo:       text("invoice_no").notNull(),  // "INV-2025-00412"
  type:            text("type").notNull().default("invoice"),
    // "invoice" | "credit_note" | "tax_invoice" | "act" | "receipt"
  status:          text("status").notNull().default("draft"),
    // "draft" | "issued" | "sent" | "paid" | "overdue" | "cancelled"
  currency:        text("currency").notNull().default("UAH"),
  subtotal:        numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  vatAmount:       numeric("vat_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  totalAmount:     numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  paidAmount:      numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  dueDate:         timestamp("due_date"),
  issuedAt:        timestamp("issued_at"),
  paidAt:          timestamp("paid_at"),
  sentAt:          timestamp("sent_at"),
  recipientName:   text("recipient_name"),
  recipientEmail:  text("recipient_email"),
  recipientAddress: text("recipient_address"),
  recipientTaxId:  text("recipient_tax_id"),
  notes:           text("notes"),
  lineItems:       jsonb("line_items").default("[]"), // denormalized for PDF generation
  createdBy:       integer("created_by_id").references(() => users.id),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_invoices_tenant").on(t.tenantId),
  idxReservation:  index("idx_invoices_reservation").on(t.reservationId),
}));

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────
// Actual money movement records. Maps to existing `payments` table.
export const payments = pgTable("payments", {
  id:               serial("id").primaryKey(),
  tenantId:         integer("organization_id"),
  reservationId:    integer("booking_id").notNull().references(() => reservations.id),
  invoiceId:        integer("invoice_id").references(() => invoices.id),
  folioId:          integer("folio_id").references(() => folios.id),
  providerId:       integer("provider_id").references(() => paymentProviders.id),
  amount:           numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency:         text("currency").default("UAH"),
  method:           text("method").notNull(),
    // "cash" | "card" | "bank_transfer" | "liqpay" | "wayforpay" | "crypto"
  status:           text("status").notNull().default("completed"),
    // "pending" | "completed" | "failed" | "refunded" | "disputed"
  paymentType:      text("payment_type").default("payment"),
    // "payment" | "deposit" | "refund" | "adjustment"
  reference:        text("reference"),
  externalId:       text("external_id"),       // gateway transaction ID
  receiptNumber:    text("receipt_number"),
  receiptUrl:       text("receipt_url"),
  feeAmount:        numeric("fee_amount", { precision: 10, scale: 2 }).default("0"),
  netAmount:        numeric("net_amount", { precision: 10, scale: 2 }),
  legalEntityId:    integer("legal_entity_id"),
  terminalId:       text("terminal_id"),
  staffId:          integer("staff_id").references(() => users.id),
  refundOfId:       integer("refund_of_id").references(() => payments.id),
  description:      text("description"),
  notes:            text("notes"),
  processedAt:      timestamp("processed_at"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxReservation:   index("idx_payments_reservation").on(t.reservationId),
  idxTenant:        index("idx_payments_tenant").on(t.tenantId),
}));

// ─── PAYMENT ATTEMPTS ─────────────────────────────────────────────────────────
// Granular log of each individual payment API call attempt.
// Enables full payment lifecycle tracing, retry logic, and reconciliation.
export const paymentAttempts = pgTable("payment_attempts", {
  id:              serial("id").primaryKey(),
  paymentId:       integer("payment_id").references(() => payments.id),
  reservationId:   integer("reservation_id").references(() => reservations.id),
  providerId:      integer("provider_id").references(() => paymentProviders.id),
  amount:          numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency:        text("currency").default("UAH"),
  status:          text("status").notNull(),
    // "initiated" | "pending" | "succeeded" | "failed" | "timeout" | "cancelled"
  errorCode:       text("error_code"),
  errorMessage:    text("error_message"),
  externalId:      text("external_id"),        // gateway's reference
  paymentUrl:      text("payment_url"),        // redirect URL for 3DS
  requestPayload:  jsonb("request_payload"),   // sanitized gateway request
  responsePayload: jsonb("response_payload"),  // gateway response
  webhookPayload:  jsonb("webhook_payload"),   // webhook notification
  initiatedAt:     timestamp("initiated_at").notNull().defaultNow(),
  completedAt:     timestamp("completed_at"),
  ipAddress:       text("ip_address"),
  userAgent:       text("user_agent"),
}, (t) => ({
  idxPayment:      index("idx_payment_attempts_payment").on(t.paymentId),
  idxReservation:  index("idx_payment_attempts_reservation").on(t.reservationId),
}));
