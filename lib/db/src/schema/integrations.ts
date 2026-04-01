import { pgTable, serial, text, boolean, timestamp, real, integer, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const otaChannelsTable = pgTable("ota_channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  channelType: text("channel_type").notNull(),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  apiUrl: text("api_url"),
  commissionRate: real("commission_rate").notNull().default(15.0),
  syncEnabled: boolean("sync_enabled").notNull().default(true),
  syncInterval: integer("sync_interval").notNull().default(15),
  lastSync: timestamp("last_sync"),
  totalBookings: integer("total_bookings").notNull().default(0),
  totalRevenue: real("total_revenue").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOtaChannelSchema = createInsertSchema(otaChannelsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOtaChannel = z.infer<typeof insertOtaChannelSchema>;
export type OtaChannel = typeof otaChannelsTable.$inferSelect;

export const webhookEndpointsTable = pgTable("webhook_endpoints", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  secret: text("secret"),
  events: json("events").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  lastTriggered: timestamp("last_triggered"),
  failureCount: integer("failure_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWebhookEndpointSchema = createInsertSchema(webhookEndpointsTable).omit({ id: true, createdAt: true });
export type InsertWebhookEndpoint = z.infer<typeof insertWebhookEndpointSchema>;
export type WebhookEndpoint = typeof webhookEndpointsTable.$inferSelect;
