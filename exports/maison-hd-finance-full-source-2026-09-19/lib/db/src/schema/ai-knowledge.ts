import { pgTable, serial, text, timestamp, integer, varchar, date, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiKnowledgeArticlesTable = pgTable("ai_knowledge_articles", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id"),
  category: varchar("category", { length: 64 }).notNull().default("general"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: text("tags"),
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  effectiveFrom: date("effective_from", { mode: "string" }),
  effectiveUntil: date("effective_until", { mode: "string" }),
  createdById: integer("created_by_id"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAiKnowledgeArticleSchema = createInsertSchema(aiKnowledgeArticlesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AiKnowledgeArticle = typeof aiKnowledgeArticlesTable.$inferSelect;
export type InsertAiKnowledgeArticle = z.infer<typeof insertAiKnowledgeArticleSchema>;

export const aiConciergeSettingsTable = pgTable("ai_concierge_settings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  mode: varchar("mode", { length: 16 }).notNull().default("manual"),
  updatedById: integer("updated_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AiConciergeSettings = typeof aiConciergeSettingsTable.$inferSelect;

export const aiConciergeAuditLogsTable = pgTable("ai_concierge_audit_logs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  conversationId: integer("conversation_id"),
  actorUserId: integer("actor_user_id"),
  action: varchar("action", { length: 48 }).notNull(),
  outcome: varchar("outcome", { length: 32 }).notNull(),
  sources: jsonb("sources"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AiConciergeAuditLog = typeof aiConciergeAuditLogsTable.$inferSelect;

export const aiInsightsCacheTable = pgTable("ai_insights_cache", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id"),
  insightType: varchar("insight_type", { length: 64 }).notNull(),
  content: text("content").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AiInsightsCache = typeof aiInsightsCacheTable.$inferSelect;
