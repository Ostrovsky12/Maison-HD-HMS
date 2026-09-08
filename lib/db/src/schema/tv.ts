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
    hotelName?: string; logo?: string; logoUrl?: string; primaryColor?: string; accentColor?: string; tagline?: string;
    headingFont?: string; bodyFont?: string;
  }>().default({}),
  contentConfig: jsonb("content_config").$type<{
    slideInterval?: number;
    enabledSlides?: string[];
    hotelInfo?: {
      wifiSsid?: string; wifiPassword?: string; phone?: string; email?: string;
      address?: string; checkOutTime?: string; receptionHours?: string;
      breakfastHours?: string; lunchHours?: string; dinnerHours?: string; roomServiceHours?: string;
      spaHours?: string; poolHours?: string; fitnessHours?: string; parkingInfo?: string; housekeepingInfo?: string;
    };
    activities?: Array<{ icon?: string; name?: string; description?: string; hours?: string; price?: string; tag?: string }>;
    offers?: Array<{ icon?: string; title?: string; description?: string; price?: string; originalPrice?: string; tag?: string; cta?: string }>;
    promotionalVideos?: Array<{ url: string; title?: string }>;
  }>().default({}),
  lastPingAt: timestamp("last_ping_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TvScreen = typeof tvScreensTable.$inferSelect;
