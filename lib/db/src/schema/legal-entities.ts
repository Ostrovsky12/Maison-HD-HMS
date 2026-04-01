import { pgTable, serial, integer, varchar, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export const legalEntityTypeEnum = pgEnum("legal_entity_type", ["tov", "fop", "pp", "other"]);

export const legalEntitiesTable = pgTable("legal_entities", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: legalEntityTypeEnum("type").notNull().default("fop"),
  edrpou: varchar("edrpou", { length: 20 }),
  iban: varchar("iban", { length: 40 }),
  bank: varchar("bank", { length: 255 }),
  mfo: varchar("mfo", { length: 10 }),
  address: text("address"),
  liqpayPublicKey: varchar("liqpay_public_key", { length: 255 }),
  liqpayPrivateKey: varchar("liqpay_private_key", { length: 255 }),
  fondyMerchantId: varchar("fondy_merchant_id", { length: 100 }),
  fondySecretKey: varchar("fondy_secret_key", { length: 255 }),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type LegalEntity = typeof legalEntitiesTable.$inferSelect;
export type NewLegalEntity = typeof legalEntitiesTable.$inferInsert;
