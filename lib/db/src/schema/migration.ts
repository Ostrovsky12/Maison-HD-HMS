import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb, decimal,
  pgEnum,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

// ── Enums ────────────────────────────────────────────────────────

export const connectionStatusEnum = pgEnum("connection_status", [
  "pending", "connected", "error", "disconnected",
]);

export const importBatchStatusEnum = pgEnum("import_batch_status", [
  "pending", "running", "paused", "completed", "failed", "cancelled",
]);

export const importItemStatusEnum = pgEnum("import_item_status", [
  "pending", "processing", "success", "failed", "conflict", "skipped",
]);

export const importItemActionEnum = pgEnum("import_item_action", [
  "create", "update", "merge", "skip",
]);

export const importEntityTypeEnum = pgEnum("import_entity_type", [
  "guest", "booking", "unit", "rate", "payment", "company",
  "note", "service", "room_type", "source_channel",
]);

export const conflictTypeEnum = pgEnum("conflict_type", [
  "duplicate", "field_mismatch", "ambiguous_mapping", "date_overlap", "missing_reference",
]);

export const conflictResolutionEnum = pgEnum("conflict_resolution", [
  "use_external", "use_internal", "merge", "skip",
]);

export const syncStatusEnum = pgEnum("sync_status", [
  "synced", "pending", "error", "stale", "unmapped",
]);

// ── external_connections ─────────────────────────────────────────
// One per tenant per external system (Servio, Cloudbeds, etc.)
export const externalConnectionsTable = pgTable("external_connections", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  systemSlug: text("system_slug").notNull(),           // "servio" | "cloudbeds" | "fidelio"
  systemName: text("system_name").notNull(),            // "Servio HMS"
  displayName: text("display_name"),                   // e.g. "Dogoda Servio"
  baseUrl: text("base_url"),                           // Servio API endpoint
  apiKey: text("api_key"),                              // encrypted in prod
  username: text("username"),
  passwordHash: text("password_hash"),                 // if basic auth
  hotelCode: text("hotel_code"),                       // Servio hotel code / DB name
  status: connectionStatusEnum("status").default("pending").notNull(),
  lastTestAt: timestamp("last_test_at"),
  lastTestError: text("last_test_error"),
  lastSyncAt: timestamp("last_sync_at"),
  isCutoverMode: boolean("is_cutover_mode").default(false),    // Servio is source of truth
  isActive: boolean("is_active").default(true),
  settings: jsonb("settings").$type<Record<string, any>>(),    // extra system-specific config
  metadata: jsonb("metadata").$type<Record<string, any>>(),    // discovered info about system
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── import_batches ───────────────────────────────────────────────
// A batch = one migration/sync operation
export const importBatchesTable = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  connectionId: integer("connection_id").references(() => externalConnectionsTable.id),
  batchType: text("batch_type").notNull(),             // "full" | "incremental" | "guests_only" | "preview"
  entityTypes: jsonb("entity_types").$type<string[]>(), // which entity types to import
  status: importBatchStatusEnum("status").default("pending").notNull(),
  totalItems: integer("total_items").default(0),
  processedItems: integer("processed_items").default(0),
  successItems: integer("success_items").default(0),
  failedItems: integer("failed_items").default(0),
  conflictItems: integer("conflict_items").default(0),
  skippedItems: integer("skipped_items").default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  dateRangeFrom: text("date_range_from"),             // ISO date for incremental sync
  dateRangeTo: text("date_range_to"),
  deduplicationMode: text("deduplication_mode").default("phone_email"), // how to dedup guests
  conflictMode: text("conflict_mode").default("flag"),                  // "flag" | "prefer_external" | "prefer_internal"
  settings: jsonb("settings").$type<Record<string, any>>(),
  notes: text("notes"),
  errorLog: text("error_log"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── import_batch_items ───────────────────────────────────────────
// Each row = one object imported (guest, booking, etc.)
export const importBatchItemsTable = pgTable("import_batch_items", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => importBatchesTable.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").notNull(),
  entityType: importEntityTypeEnum("entity_type").notNull(),
  externalId: text("external_id").notNull(),           // ID in Servio
  externalData: jsonb("external_data").$type<Record<string, any>>(), // raw Servio payload
  internalId: integer("internal_id"),                  // our entity ID after import
  status: importItemStatusEnum("status").default("pending").notNull(),
  action: importItemActionEnum("action"),
  conflictReason: text("conflict_reason"),
  errorMessage: text("error_message"),
  processingLog: jsonb("processing_log").$type<any[]>(),
  retryCount: integer("retry_count").default(0),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── sync_conflicts ───────────────────────────────────────────────
// Conflicts that need human review
export const syncConflictsTable = pgTable("sync_conflicts", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  batchId: integer("batch_id").references(() => importBatchesTable.id),
  itemId: integer("item_id").references(() => importBatchItemsTable.id),
  entityType: text("entity_type").notNull(),
  externalId: text("external_id"),
  internalId: integer("internal_id"),
  conflictType: conflictTypeEnum("conflict_type").notNull(),
  externalData: jsonb("external_data").$type<Record<string, any>>(),
  internalData: jsonb("internal_data").$type<Record<string, any>>(),
  resolution: conflictResolutionEnum("resolution"),
  resolvedBy: integer("resolved_by").references(() => usersTable.id),
  resolvedAt: timestamp("resolved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── external_entity_mappings ─────────────────────────────────────
// The permanent link: "internal guest 42 = Servio guest SRV-001"
export const externalEntityMappingsTable = pgTable("external_entity_mappings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  connectionId: integer("connection_id").references(() => externalConnectionsTable.id),
  externalSystem: text("external_system").notNull(),   // "servio"
  entityType: text("entity_type").notNull(),            // "guest" | "booking" etc.
  internalId: integer("internal_id").notNull(),
  externalId: text("external_id").notNull(),
  syncStatus: syncStatusEnum("sync_status").default("synced").notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  mappingConfidence: decimal("mapping_confidence", { precision: 3, scale: 2 }).default("1.00"),
  batchId: integer("batch_id").references(() => importBatchesTable.id),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
