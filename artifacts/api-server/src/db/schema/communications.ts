/**
 * COMMUNICATIONS DOMAIN
 * Unified guest messaging: channels, conversations, messages, AI summaries
 *
 * Architecture:
 *   communication_channels (WhatsApp, Email, SMS, Viber, booking.com chat)
 *       └── conversations (per guest × channel thread)
 *               └── messages (individual messages)
 *   ai_summaries (AI-generated summaries per entity)
 */

import {
  pgTable, serial, text, boolean, integer, numeric,
  timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";
import { guests } from "./guests";
import { reservations } from "./reservations";
import { users } from "./iam";

// ─── COMMUNICATION CHANNELS ───────────────────────────────────────────────────
// Per-tenant channel configurations (API credentials per channel type).
export const communicationChannels = pgTable("communication_channels", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name:            text("name").notNull(),
  type:            text("type").notNull(),
    // "email" | "sms" | "whatsapp" | "viber" | "telegram" | "booking_chat" | "in_app"
  provider:        text("provider"),
    // "sendgrid" | "twilio" | "green_api" | "vonage" | "postmark" | "smtp"
  isActive:        boolean("is_active").notNull().default(true),
  isInbound:       boolean("is_inbound").notNull().default(true),   // can receive messages
  isOutbound:      boolean("is_outbound").notNull().default(true),  // can send messages
  fromAddress:     text("from_address"),     // email/phone sender identity
  displayName:     text("display_name"),     // "Maison HD Concierge" shown to guests
  credentials:     jsonb("credentials").default("{}"),  // encrypted API keys
  webhookUrl:      text("webhook_url"),
  webhookSecret:   text("webhook_secret"),
  config:          jsonb("config").default("{}"),  // channel-specific settings
  dailyLimit:      integer("daily_limit"),     // max messages per day
  sentToday:       integer("sent_today").notNull().default(0),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_comm_channels_tenant").on(t.tenantId),
}));

// ─── CONVERSATIONS ────────────────────────────────────────────────────────────
// A conversation thread between a guest and the property.
// One conversation per (guest × channel) per property session.
// Maps to existing `conversations` table.
export const conversations = pgTable("conversations", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("organization_id").notNull().references(() => tenants.id),
  guestId:         integer("guest_id").references(() => guests.id),
  reservationId:   integer("booking_id").references(() => reservations.id),
  channelId:       integer("channel_id").references(() => communicationChannels.id),
  channelType:     text("channel_type"),     // denormalized for fast queries
  externalThreadId: text("external_thread_id"), // OTA/WhatsApp thread reference
  subject:         text("subject"),
  status:          text("status").notNull().default("open"),
    // "open" | "pending" | "resolved" | "spam" | "archived"
  priority:        text("priority").default("normal"), // "low" | "normal" | "high" | "urgent"
  assignedTo:      integer("assigned_to").references(() => users.id),
  lastMessageAt:   timestamp("last_message_at"),
  lastMessageText: text("last_message_text"),  // preview snippet
  unreadCount:     integer("unread_count").notNull().default(0),
  aiSummary:       text("ai_summary"),
  tags:            jsonb("tags").default("[]"),
  resolvedAt:      timestamp("resolved_at"),
  resolvedBy:      integer("resolved_by").references(() => users.id),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_conversations_tenant").on(t.tenantId),
  idxGuest:        index("idx_conversations_guest").on(t.guestId),
  idxStatus:       index("idx_conversations_status").on(t.status),
}));

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
// Individual messages within a conversation.
// Maps to existing `messages` table.
export const messages = pgTable("messages", {
  id:              serial("id").primaryKey(),
  conversationId:  integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  direction:       text("direction").notNull(), // "inbound" | "outbound"
  authorType:      text("author_type").notNull().default("staff"), // "guest" | "staff" | "ai" | "system"
  authorId:        integer("author_id"),        // user.id if staff, guest.id if guest
  content:         text("content").notNull(),
  contentType:     text("content_type").notNull().default("text"),
    // "text" | "html" | "image" | "document" | "audio" | "location" | "template"
  attachments:     jsonb("attachments").default("[]"), // [{ url, name, mimeType, size }]
  externalId:      text("external_id"),         // message ID in external system (WA, email)
  status:          text("status").notNull().default("sent"),
    // "queued" | "sent" | "delivered" | "read" | "failed"
  isRead:          boolean("is_read").notNull().default(false),
  readAt:          timestamp("read_at"),
  deliveredAt:     timestamp("delivered_at"),
  isAiGenerated:   boolean("is_ai_generated").notNull().default(false),
  aiModel:         text("ai_model"),
  metadata:        jsonb("metadata").default("{}"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxConversation: index("idx_messages_conversation").on(t.conversationId),
  idxStatus:       index("idx_messages_status").on(t.status),
}));

// ─── AI SUMMARIES ─────────────────────────────────────────────────────────────
// AI-generated contextual summaries for any entity.
// Used by the concierge AI to understand guest context quickly.
export const aiSummaries = pgTable("ai_summaries", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  entityType:      text("entity_type").notNull(),
    // "guest" | "reservation" | "conversation" | "event_lead" | "maintenance_ticket"
  entityId:        integer("entity_id").notNull(),
  summary:         text("summary").notNull(),
  keyPoints:       jsonb("key_points").default("[]"),     // bullet points
  sentiment:       text("sentiment"),                     // "positive" | "neutral" | "negative"
  sentimentScore:  numeric("sentiment_score", { precision: 4, scale: 3 }),
  actionItems:     jsonb("action_items").default("[]"),   // suggested next actions
  model:           text("model").notNull(),               // "gpt-4o" | "claude-3-5" | ...
  promptVersion:   text("prompt_version"),
  inputTokens:     integer("input_tokens"),
  outputTokens:    integer("output_tokens"),
  generatedAt:     timestamp("generated_at").notNull().defaultNow(),
  expiresAt:       timestamp("expires_at"),               // cache TTL
}, (t) => ({
  idxEntity:       index("idx_ai_summaries_entity").on(t.entityType, t.entityId),
  idxTenant:       index("idx_ai_summaries_tenant").on(t.tenantId),
}));
