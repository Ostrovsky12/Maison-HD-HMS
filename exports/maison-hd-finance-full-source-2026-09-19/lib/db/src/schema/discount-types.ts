import { pgTable, serial, integer, varchar, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export const discountValueTypeEnum = pgEnum("discount_value_type", ["percent", "fixed"]);

export const discountTypesTable = pgTable("discount_types", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  value: numeric("value", { precision: 10, scale: 2 }).notNull().default("0"),
  valueType: discountValueTypeEnum("value_type").notNull().default("percent"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DiscountType = typeof discountTypesTable.$inferSelect;
export type NewDiscountType = typeof discountTypesTable.$inferInsert;
