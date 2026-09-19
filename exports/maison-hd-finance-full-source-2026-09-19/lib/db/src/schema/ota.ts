import { pgTable, serial, integer, timestamp, text, boolean, pgEnum, varchar, numeric, jsonb } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";

export const otaChannelTypeEnum = pgEnum("ota_channel_type", ["booking_com","airbnb","expedia","agoda","ostrovok","direct"]);
export const otaChannelStatusEnum = pgEnum("ota_channel_status", ["active","inactive","error","pending"]);
export const otaEventTypeEnum = pgEnum("ota_event_type", ["reservation_created","reservation_modified","reservation_cancelled","availability_update","rate_update","ping"]);

export const otaChannelConfigsTable = pgTable("ota_channel_configs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  channel: otaChannelTypeEnum("channel").notNull(),
  status: otaChannelStatusEnum("status").notNull().default("pending"),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  apiKey: varchar("api_key", { length: 500 }),
  propertyIdExt: varchar("property_id_ext", { length: 100 }),
  webhookSecret: varchar("webhook_secret", { length: 255 }),
  lastSyncAt: timestamp("last_sync_at"),
  lastError: text("last_error"),
  settings: jsonb("settings").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const otaUnitMappingsTable = pgTable("ota_unit_mappings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  channelId: integer("channel_id").notNull().references(() => otaChannelConfigsTable.id),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id),
  extRoomId: varchar("ext_room_id", { length: 100 }).notNull(),
  extRoomName: varchar("ext_room_name", { length: 255 }),
  markupPercent: numeric("markup_percent", { precision: 5, scale: 2 }).default("0"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const otaWebhookLogsTable = pgTable("ota_webhook_logs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  channelId: integer("channel_id").references(() => otaChannelConfigsTable.id),
  eventType: otaEventTypeEnum("event_type"),
  payload: jsonb("payload").$type<Record<string, any>>(),
  status: varchar("status", { length: 20 }).default("received"),
  processedAt: timestamp("processed_at"),
  bookingRef: varchar("booking_ref", { length: 50 }),
  errorMessage: text("error_message"),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});

export type OtaChannelConfig = typeof otaChannelConfigsTable.$inferSelect;
export type OtaWebhookLog = typeof otaWebhookLogsTable.$inferSelect;
