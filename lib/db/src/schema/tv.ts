import { pgTable, serial, integer, timestamp, boolean, varchar, jsonb } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";

export const tvScreensTable = pgTable("tv_screens", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  unitId: integer("unit_id").references(() => unitsTable.id),
  roomCode: varchar("room_code", { length: 20 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }),
  isActive: boolean("is_active").default(true),
  branding: jsonb("branding").$type<{
    hotelName?: string; logo?: string; primaryColor?: string; accentColor?: string; tagline?: string;
  }>().default({}),
  contentConfig: jsonb("content_config").$type<{
    slideInterval?: number; showWeather?: boolean; showEvents?: boolean; showUpsells?: boolean;
  }>().default({}),
  lastPingAt: timestamp("last_ping_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TvScreen = typeof tvScreensTable.$inferSelect;
