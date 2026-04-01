import { pgTable, serial, integer, timestamp, text, boolean, pgEnum, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { bookingsTable } from "./bookings";
import { guestsTable } from "./guests";

export const inboxChannelEnum = pgEnum("inbox_channel", ["telegram", "instagram", "website", "email", "phone", "whatsapp", "viber"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["open", "pending", "resolved", "spam"]);
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const messageTypeEnum = pgEnum("message_type", ["text", "image", "file", "audio", "video", "booking_card", "system"]);

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  channel: inboxChannelEnum("channel").notNull(),
  externalId: varchar("external_id", { length: 255 }),
  guestName: varchar("guest_name", { length: 255 }),
  guestPhone: varchar("guest_phone", { length: 50 }),
  guestEmail: varchar("guest_email", { length: 255 }),
  guestAvatarUrl: text("guest_avatar_url"),
  guestId: integer("guest_id").references(() => guestsTable.id),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  status: conversationStatusEnum("status").notNull().default("open"),
  assignedToId: integer("assigned_to_id"),
  subject: text("subject"),
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  lastMessagePreview: text("last_message_preview"),
  unreadCount: integer("unread_count").notNull().default(0),
  tags: jsonb("tags").$type<string[]>().default([]),
  aiSummary: text("ai_summary"),
  metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id),
  direction: messageDirectionEnum("direction").notNull(),
  messageType: messageTypeEnum("message_type").notNull().default("text"),
  content: text("content"),
  mediaUrl: text("media_url"),
  mediaType: varchar("media_type", { length: 50 }),
  isRead: boolean("is_read").notNull().default(false),
  isAiGenerated: boolean("is_ai_generated").notNull().default(false),
  externalMessageId: varchar("external_message_id", { length: 255 }),
  senderName: varchar("sender_name", { length: 255 }),
  metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const channelConfigsTable = pgTable("channel_configs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  channel: inboxChannelEnum("channel").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  config: jsonb("config").$type<Record<string, string>>().default({}),
  webhookUrl: text("webhook_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertConversationSchema = createInsertSchema(conversationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Conversation = typeof conversationsTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
export type ChannelConfig = typeof channelConfigsTable.$inferSelect;
