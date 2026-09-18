import { pgTable, serial, integer, text, numeric, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export const paymentEventsTable = pgTable("payment_events", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  eventKey: text("event_key").notNull(),
  previousAmount: numeric("previous_amount", { precision: 12, scale: 2 }).notNull(),
  targetAmount: numeric("target_amount", { precision: 12, scale: 2 }).notNull(),
  deltaAmount: numeric("delta_amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("UAH"),
  status: text("status").notNull().default("pending"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, table => ({
  paymentEventsEventKeyUnique: uniqueIndex("payment_events_org_event_key_uq")
    .on(table.organizationId, table.eventKey),
}));

export type PaymentEvent = typeof paymentEventsTable.$inferSelect;