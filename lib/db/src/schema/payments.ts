import { pgTable, serial, integer, text, timestamp, numeric, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingsTable } from "./bookings";
import { legalEntitiesTable } from "./legal-entities";
import { usersTable } from "./users";

export const paymentMethodEnum = pgEnum("payment_method", ["cash", "card", "liqpay", "stripe", "bank_transfer"]);
export const paymentTxStatusEnum = pgEnum("payment_tx_status", ["pending", "completed", "failed", "refunded"]);
export const paymentTypeEnum = pgEnum("payment_type", ["deposit", "payment", "partial", "refund", "fee", "adjustment"]);

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id),
  invoiceId: integer("invoice_id"),
  legalEntityId: integer("legal_entity_id").references(() => legalEntitiesTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  netAmount: numeric("net_amount", { precision: 10, scale: 2 }),
  feeAmount: numeric("fee_amount", { precision: 10, scale: 2 }).default("0"),
  currency: text("currency").default("UAH"),
  method: paymentMethodEnum("method").notNull().default("cash"),
  status: paymentTxStatusEnum("status").notNull().default("completed"),
  paymentType: paymentTypeEnum("payment_type").default("payment"),
  refundOfId: integer("refund_of_id"),
  reference: text("reference"),
  externalId: text("external_id"),
  liqpayOrderId: text("liqpay_order_id"),
  liqpayStatus: text("liqpay_status"),
  terminalId: text("terminal_id"),
  receiptNumber: text("receipt_number"),
  receiptUrl: text("receipt_url"),
  description: text("description"),
  notes: text("notes"),
  staffId: integer("staff_id").references(() => usersTable.id),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
