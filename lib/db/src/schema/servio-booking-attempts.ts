import { pgTable, uuid, integer, text, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

// A Servio account is not a local unit/booking ID. Financial outcomes survive
// process failure and credentials are encrypted with the application key.
export const servioBookingAttemptsTable = pgTable("servio_booking_attempts", {
  id: uuid("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  requestId: uuid("request_id").notNull(),
  requestHash: text("request_hash").notNull(),
  state: text("state").notNull(),
  account: text("account"),
  payload: jsonb("payload").notNull(),
  connection: text("connection").notNull(),
  guestAccess: text("guest_access"),
  notificationDelivery: jsonb("notification_delivery").default({}).notNull(),
  paymentDeadline: timestamp("payment_deadline", { withTimezone: true }),
  inventoryKey: text("inventory_key"),
  bill: jsonb("bill"),
  consent: jsonb("consent"),
  payment: jsonb("payment"),
  issue: text("issue"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("servio_booking_attempt_request").on(table.organizationId, table.requestId),
  index("servio_payment_deadline_idx").on(table.paymentDeadline).where(sql`${table.state} IN ('bill_ready','awaiting_payment','expiring')`),
  index("servio_inventory_active_idx").on(table.inventoryKey).where(sql`${table.state} NOT IN ('failed','cancelled')`),
]);
export const insertServioBookingAttemptSchema = createInsertSchema(servioBookingAttemptsTable).omit({ createdAt: true, updatedAt: true });
export type ServioBookingAttempt = typeof servioBookingAttemptsTable.$inferSelect;
export type InsertServioBookingAttempt = z.infer<typeof insertServioBookingAttemptSchema>;
