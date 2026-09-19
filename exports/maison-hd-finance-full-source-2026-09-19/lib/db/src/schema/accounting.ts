import {
  pgTable, serial, integer, text, numeric, boolean,
  timestamp, date, pgEnum,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { legalEntitiesTable } from "./legal-entities";
import { usersTable } from "./users";
import { bookingsTable } from "./bookings";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const accDocTypeEnum = pgEnum("acc_doc_type", [
  "contract",        // Договір
  "invoice",         // Рахунок-фактура
  "act",             // Акт виконаних робіт
  "tax_invoice",     // Податкова накладна
  "credit_note",     // Коригуюча ПН
  "payment_order",   // Платіжне доручення
  "reconciliation",  // Акт звірки
  "expense",         // Видаткова накладна
  "other",
]);

export const accDocStatusEnum = pgEnum("acc_doc_status", [
  "draft",    // Чернетка
  "issued",   // Виставлено
  "sent",     // Надіслано
  "signed",   // Підписано
  "paid",     // Оплачено
  "overdue",  // Прострочено
  "cancelled",// Скасовано
]);

export const counterpartyTypeEnum = pgEnum("counterparty_type", [
  "legal",     // Юридична особа (ТОВ/ПрАТ/АТ)
  "fop",       // Фізична особа-підприємець
  "individual",// Фізична особа
]);

export const vatRateEnum = pgEnum("vat_rate", [
  "20",   // Стандартна ставка ПДВ
  "7",    // Знижена (ліки, книги тощо)
  "0",    // Нульова ставка
  "exempt",// Без ПДВ
]);

export const integrationProviderEnum = pgEnum("acc_integration_provider", [
  "bas",      // BAS (M.E.Doc based)
  "medoc",    // M.E.Doc (ПН, звіти)
  "vchasno",  // Вчасно (EDM, REST API)
  "taxcom",   // Таксер (ПРРО)
  "checkbox", // Checkbox (ПРРО)
]);

export const integrationStatusEnum = pgEnum("acc_integration_status", [
  "active", "inactive", "error", "pending",
]);

// ─── Counterparties (Контрагенти) ─────────────────────────────────────────────

export const counterpartiesTable = pgTable("counterparties", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  shortName: text("short_name"),
  type: counterpartyTypeEnum("type").notNull().default("legal"),

  // Identification
  edrpou: text("edrpou"),         // ЄДРПОУ
  ipn: text("ipn"),               // ІПН (фіз.особа)
  vatNumber: text("vat_number"),  // № свідоцтва ПДВ
  isVatPayer: boolean("is_vat_payer").default(false),

  // Contacts
  legalAddress: text("legal_address"),
  actualAddress: text("actual_address"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),

  // Bank details
  iban: text("iban"),
  bankName: text("bank_name"),
  bankMfo: text("bank_mfo"),

  // Persons
  director: text("director"),
  accountant: text("accountant"),
  contactPerson: text("contact_person"),

  // Internal
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Accounting Documents ─────────────────────────────────────────────────────

export const accountingDocumentsTable = pgTable("accounting_documents", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),

  // Type & status
  docType: accDocTypeEnum("doc_type").notNull(),
  status: accDocStatusEnum("status").notNull().default("draft"),

  // Numbering
  docNumber: text("doc_number").notNull(),
  series: text("series"),                // Серія (для ПН)
  externalNumber: text("external_number"),// Номер у зовнішній системі (BAS/M.E.Doc)

  // Dates
  docDate: date("doc_date").notNull(),
  deliveryDate: date("delivery_date"),   // Дата поставки
  dueDate: date("due_date"),             // Термін оплати
  signedAt: timestamp("signed_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),

  // Parties
  legalEntityId: integer("legal_entity_id").references(() => legalEntitiesTable.id),
  counterpartyId: integer("counterparty_id").references(() => counterpartiesTable.id),
  counterpartyName: text("counterparty_name"), // snapshot
  counterpartyEdrpou: text("counterparty_edrpou"),

  // Amounts
  currency: text("currency").notNull().default("UAH"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),

  // Content
  subject: text("subject"),              // Предмет договору/акту
  description: text("description"),
  paymentTerms: text("payment_terms"),   // Умови оплати
  notes: text("notes"),

  // Linking
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  parentDocId: integer("parent_doc_id"),  // Для ПН → посилання на акт
  relatedDocIds: text("related_doc_ids"), // JSON array

  // External integrations
  basExportedAt: timestamp("bas_exported_at", { withTimezone: true }),
  medocSentAt: timestamp("medoc_sent_at", { withTimezone: true }),
  medocRegNumber: text("medoc_reg_number"), // Реєстраційний номер у ДПС
  vchasnoId: text("vchasno_id"),            // ID у Вчасно
  vchasnoStatus: text("vchasno_status"),

  // Files
  pdfUrl: text("pdf_url"),
  xmlUrl: text("xml_url"),
  signatureUrl: text("signature_url"),

  // Audit
  createdById: integer("created_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Document Line Items (Рядки документу) ────────────────────────────────────

export const documentItemsTable = pgTable("document_items", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => accountingDocumentsTable.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),

  description: text("description").notNull(),
  unit: text("unit").notNull().default("послуга"),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
  vatRate: vatRateEnum("vat_rate").notNull().default("20"),
  vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  totalPrice: numeric("total_price", { precision: 14, scale: 2 }).notNull(),

  // UKT ZED code (for tax purposes)
  productCode: text("product_code"),
  // ДКПП (Classifier of goods and services)
  serviceCode: text("service_code"),
});

// ─── Accounting Integrations ──────────────────────────────────────────────────

export const accountingIntegrationsTable = pgTable("accounting_integrations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  provider: integrationProviderEnum("provider").notNull(),
  status: integrationStatusEnum("status").notNull().default("inactive"),

  // Connection settings (JSON)
  config: text("config"),  // JSON: api keys, endpoints, folder paths, etc.

  // Sync info
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncStatus: text("last_sync_status"),
  lastSyncError: text("last_sync_error"),
  syncedDocCount: integer("synced_doc_count").default(0),

  // Automation settings
  autoExportDocTypes: text("auto_export_doc_types"), // JSON array of doc types to auto-export
  autoExportOnSign: boolean("auto_export_on_sign").default(false),

  isEnabled: boolean("is_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Counterparty = typeof counterpartiesTable.$inferSelect;
export type AccountingDocument = typeof accountingDocumentsTable.$inferSelect;
export type DocumentItem = typeof documentItemsTable.$inferSelect;
export type AccountingIntegration = typeof accountingIntegrationsTable.$inferSelect;
