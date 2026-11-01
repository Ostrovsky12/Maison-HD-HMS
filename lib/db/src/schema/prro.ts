import {
  pgTable, serial, integer, varchar, text, boolean, timestamp, jsonb,
  numeric, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { organizationsTable } from "./organizations";
import { legalEntitiesTable } from "./legal-entities";
import { usersTable } from "./users";

export const prroRegistersTable = pgTable("prro_registers", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  legalEntityId: integer("legal_entity_id").notNull().references(() => legalEntitiesTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  fiscalNumber: varchar("fiscal_number", { length: 32 }),
  deviceId: varchar("device_id", { length: 100 }).notNull(),
  locationName: varchar("location_name", { length: 255 }),
  locationAddress: text("location_address"),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  provider: varchar("provider", { length: 32 }).notNull().default("dps"),
  offlineAllowed: boolean("offline_allowed").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  orgEntityIdx: index("prro_registers_org_entity_idx").on(table.organizationId, table.legalEntityId),
  orgDeviceUq: uniqueIndex("prro_registers_org_device_uq").on(table.organizationId, table.deviceId),
}));

export const prroShiftsTable = pgTable("prro_shifts", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  legalEntityId: integer("legal_entity_id").notNull().references(() => legalEntitiesTable.id),
  registerId: integer("register_id").notNull().references(() => prroRegistersTable.id),
  cashierUserId: integer("cashier_user_id").references(() => usersTable.id),
  signerKeyId: varchar("signer_key_id", { length: 255 }),
  status: varchar("status", { length: 24 }).notNull().default("opening"),
  dpsShiftId: varchar("dps_shift_id", { length: 100 }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  registerStatusIdx: index("prro_shifts_register_status_idx").on(table.organizationId, table.registerId, table.status),
  oneActiveUq: uniqueIndex("prro_shifts_one_active_per_register_uq")
    .on(table.organizationId, table.registerId)
    .where(sql`${table.status} IN ('opening', 'open', 'closing')`),
}));

export const fiscalDocumentsTable = pgTable("fiscal_documents", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  legalEntityId: integer("legal_entity_id").notNull().references(() => legalEntitiesTable.id),
  registerId: integer("register_id").references(() => prroRegistersTable.id),
  shiftId: integer("shift_id").references(() => prroShiftsTable.id),
  sourceType: varchar("source_type", { length: 40 }).notNull(),
  sourceId: varchar("source_id", { length: 100 }).notNull(),
  documentType: varchar("document_type", { length: 24 }).notNull().default("sale"),
  paymentChannel: varchar("payment_channel", { length: 40 }).notNull(),
  policyDecision: varchar("policy_decision", { length: 24 }).notNull(),
  policyCode: varchar("policy_code", { length: 100 }).notNull(),
  policyReason: text("policy_reason").notNull(),
  policyVersion: varchar("policy_version", { length: 32 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("draft"),
  currency: varchar("currency", { length: 3 }).notNull().default("UAH"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  previousHash: varchar("previous_hash", { length: 64 }),
  localNumber: integer("local_number"),
  fiscalNumber: varchar("fiscal_number", { length: 100 }),
  dpsDocumentId: varchar("dps_document_id", { length: 100 }),
  xmlPayload: text("xml_payload"),
  signedPayload: text("signed_payload"),
  dpsSignedId: text("dps_signed_id"),
  dpsSignedData: text("dps_signed_data"),
  dpsResponse: jsonb("dps_response"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  lastError: text("last_error"),
  payloadSnapshot: jsonb("payload_snapshot").notNull(),
  policyEvidence: jsonb("policy_evidence").notNull().default({}),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  fiscalizedAt: timestamp("fiscalized_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  orgCreatedIdx: index("fiscal_documents_org_created_idx").on(table.organizationId, table.createdAt),
  sellerSourceIdx: index("fiscal_documents_seller_source_idx").on(table.organizationId, table.legalEntityId, table.sourceType, table.sourceId),
  idempotencyUq: uniqueIndex("fiscal_documents_idempotency_uq").on(table.organizationId, table.idempotencyKey),
  hashIdx: index("fiscal_documents_hash_idx").on(table.organizationId, table.contentHash),
  retryIdx: index("fiscal_documents_retry_idx").on(table.status, table.nextRetryAt),
}));

export const fiscalEventsTable = pgTable("fiscal_events", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  fiscalDocumentId: integer("fiscal_document_id").notNull().references(() => fiscalDocumentsTable.id),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  eventStatus: varchar("event_status", { length: 24 }).notNull(),
  requestId: varchar("request_id", { length: 100 }),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  documentIdx: index("fiscal_events_document_idx").on(table.organizationId, table.fiscalDocumentId, table.createdAt),
}));

export const insertPrroRegisterSchema = createInsertSchema(prroRegistersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFiscalDocumentSchema = createInsertSchema(fiscalDocumentsTable).omit({ id: true, createdAt: true });
export type PrroRegister = typeof prroRegistersTable.$inferSelect;
export type PrroShift = typeof prroShiftsTable.$inferSelect;
export type FiscalDocument = typeof fiscalDocumentsTable.$inferSelect;
export type InsertPrroRegister = z.infer<typeof insertPrroRegisterSchema>;
export type InsertFiscalDocument = z.infer<typeof insertFiscalDocumentSchema>;