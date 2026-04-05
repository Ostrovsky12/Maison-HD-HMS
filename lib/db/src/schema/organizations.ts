import { pgTable, serial, text, integer, boolean, timestamp, pgEnum, decimal, varchar, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const planEnum = pgEnum("plan", ["basic", "pro", "enterprise"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "trial", "suspended", "cancelled"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "reception", "housekeeper", "accountant"]);

export const organizationsTable = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: planEnum("plan").notNull().default("basic"),
  maxUnits: integer("max_units").notNull().default(50),
  maxUsers: integer("max_users").notNull().default(10),

  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  website: text("website"),
  logo: text("logo"),
  primaryColor: text("primary_color").default("#4f46e5"),

  subscriptionStatus: subscriptionStatusEnum("subscription_status").notNull().default("trial"),
  trialEndsAt: timestamp("trial_ends_at"),
  subscriptionEndsAt: timestamp("subscription_ends_at"),

  timezone: text("timezone").default("Europe/Kiev"),
  currency: text("currency").default("UAH"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("20.0"),

  enabledModules: jsonb("enabled_modules"),

  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const organizationMembersTable = pgTable("organization_members", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull(),
  role: memberRoleEnum("role").notNull().default("reception"),
  isActive: boolean("is_active").notNull().default(true),
  invitedAt: timestamp("invited_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;

export const insertOrganizationMemberSchema = createInsertSchema(organizationMembersTable).omit({ id: true, createdAt: true });
export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;
export type OrganizationMember = typeof organizationMembersTable.$inferSelect;
