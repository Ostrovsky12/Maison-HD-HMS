import { pgTable, uuid, integer, text, bigint, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export const bookingDraftsTable = pgTable("booking_drafts", {
  id: uuid("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  revision: bigint("revision", { mode: "number" }).notNull(),
  noticeVersion: text("notice_version").notNull(),
  details: jsonb("details").notNull(),
  stage: text("stage").notNull(),
  status: text("status").default("new").notNull(),
  notes: text("notes").default("").notNull(),
  servioAttemptId: uuid("servio_attempt_id"),
  bookingId: integer("booking_id"),
  lastSeen: timestamp("last_seen", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("booking_drafts_token_idx").on(table.organizationId, table.tokenHash),
  index("booking_drafts_org_seen_idx").on(table.organizationId, table.lastSeen),
]);
