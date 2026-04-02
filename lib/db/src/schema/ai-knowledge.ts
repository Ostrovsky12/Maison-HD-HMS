import { pgTable, serial, text, timestamp, integer, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiKnowledgeArticlesTable = pgTable("ai_knowledge_articles", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id"),
  category: varchar("category", { length: 64 }).notNull().default("general"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: text("tags"),
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

export const aiInsightsCacheTable = pgTable("ai_insights_cache", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id"),
  insightType: varchar("insight_type", { length: 64 }).notNull(),
  content: text("content").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AiInsightsCache = typeof aiInsightsCacheTable.$inferSelect;
