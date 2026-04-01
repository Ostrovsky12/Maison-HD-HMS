import { pgTable, serial, integer, timestamp, text, boolean, pgEnum, varchar, numeric, date } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";

export const rentalStatusEnum = pgEnum("rental_status", ["active","ended","upcoming","terminated"]);
export const rentalPaymentStatusEnum = pgEnum("rental_payment_status", ["pending","paid","overdue","cancelled"]);

export const rentalContractsTable = pgTable("rental_contracts", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id),
  tenantName: varchar("tenant_name", { length: 255 }).notNull(),
  tenantEmail: varchar("tenant_email", { length: 255 }),
  tenantPhone: varchar("tenant_phone", { length: 30 }),
  tenantPassport: varchar("tenant_passport", { length: 100 }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  monthlyRate: numeric("monthly_rate", { precision: 10, scale: 2 }).notNull(),
  depositAmount: numeric("deposit_amount", { precision: 10, scale: 2 }).default("0"),
  depositPaid: boolean("deposit_paid").default(false),
  status: rentalStatusEnum("status").notNull().default("upcoming"),
  notes: text("notes"),
  contractNumber: varchar("contract_number", { length: 50 }).unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rentalPaymentsTable = pgTable("rental_payments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  contractId: integer("contract_id").notNull().references(() => rentalContractsTable.id),
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: rentalPaymentStatusEnum("status").notNull().default("pending"),
  dueDate: date("due_date").notNull(),
  paidDate: date("paid_date"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rentalRequestsTable = pgTable("rental_requests", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  contractId: integer("contract_id").notNull().references(() => rentalContractsTable.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  priority: varchar("priority", { length: 20 }).default("medium"),
  status: varchar("status", { length: 30 }).default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export type RentalContract = typeof rentalContractsTable.$inferSelect;
export type RentalPayment = typeof rentalPaymentsTable.$inferSelect;
export type RentalRequest = typeof rentalRequestsTable.$inferSelect;
