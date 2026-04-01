import { pgTable, serial, integer, text, timestamp, numeric, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const subscriptionTierEnum = pgEnum("subscription_tier", ["trial", "basic", "pro", "enterprise"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["trial", "active", "past_due", "cancelled", "expired"]);
export const subscriptionPeriodEnum = pgEnum("subscription_period", ["monthly", "yearly"]);
export const subInvoiceStatusEnum = pgEnum("sub_invoice_status", ["pending", "paid", "overdue", "cancelled"]);
export const subPaymentSystemEnum = pgEnum("sub_payment_system", ["liqpay", "fondy", "manual"]);
export const subPaymentStatusEnum = pgEnum("sub_payment_status", ["pending", "success", "failure", "refunded"]);

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id).unique(),
  tier: subscriptionTierEnum("tier").notNull().default("trial"),
  period: subscriptionPeriodEnum("period").notNull().default("monthly"),
  status: subscriptionStatusEnum("status").notNull().default("trial"),
  trialEndsAt: timestamp("trial_ends_at"),
  currentPeriodStart: timestamp("current_period_start").notNull().defaultNow(),
  currentPeriodEnd: timestamp("current_period_end").notNull().defaultNow(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  autoRenew: boolean("auto_renew").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const subscriptionInvoicesTable = pgTable("subscription_invoices", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  invoiceNumber: text("invoice_number").notNull().unique(),
  tier: subscriptionTierEnum("tier").notNull(),
  period: subscriptionPeriodEnum("period").notNull().default("monthly"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  tax: numeric("tax", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("UAH"),
  status: subInvoiceStatusEnum("status").notNull().default("pending"),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const subscriptionPaymentsTable = pgTable("subscription_payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => subscriptionInvoicesTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  paymentSystem: subPaymentSystemEnum("payment_system").notNull(),
  externalPaymentId: text("external_payment_id").notNull().unique(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("UAH"),
  status: subPaymentStatusEnum("status").notNull().default("pending"),
  paymentMethod: text("payment_method"),
  rawResponse: jsonb("raw_response"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSubscriptionInvoiceSchema = createInsertSchema(subscriptionInvoicesTable).omit({ id: true, createdAt: true });
export const insertSubscriptionPaymentSchema = createInsertSchema(subscriptionPaymentsTable).omit({ id: true, createdAt: true });

export type Subscription = typeof subscriptionsTable.$inferSelect;
export type SubscriptionInvoice = typeof subscriptionInvoicesTable.$inferSelect;
export type SubscriptionPayment = typeof subscriptionPaymentsTable.$inferSelect;
