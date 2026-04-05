import { pgTable, serial, integer, timestamp, text, boolean, jsonb, varchar, numeric } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { guestsTable } from "./guests";
import { loyaltyTierEnum } from "./guest-experience";

export const loyaltySettingsTable = pgTable("loyalty_settings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  programName: varchar("program_name", { length: 255 }).notNull().default("Loyalty Club"),
  pointsPerNight: integer("points_per_night").notNull().default(100),
  pointsPerUah: numeric("points_per_uah", { precision: 6, scale: 2 }).notNull().default("1"),
  pointsPerFbUah: numeric("points_per_fb_uah", { precision: 6, scale: 2 }).notNull().default("0.5"),
  silverThreshold: integer("silver_threshold").notNull().default(1000),
  goldThreshold: integer("gold_threshold").notNull().default(5000),
  platinumThreshold: integer("platinum_threshold").notNull().default(15000),
  bronzePerks: jsonb("bronze_perks").$type<string[]>().default(["5% знижка на F&B"]),
  silverPerks: jsonb("silver_perks").$type<string[]>().default(["10% знижка на F&B", "Пізній виїзд"]),
  goldPerks: jsonb("gold_perks").$type<string[]>().default(["15% знижка на F&B", "Рання реєстрація", "Безкоштовний сніданок"]),
  platinumPerks: jsonb("platinum_perks").$type<string[]>().default(["20% знижка", "Приорітетне заселення", "Безкоштовний апгрейд"]),
  pointsToUahRate: numeric("points_to_uah_rate", { precision: 6, scale: 4 }).notNull().default("0.1"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const loyaltyMembersTable = pgTable("loyalty_members", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  guestId: integer("guest_id").notNull().references(() => guestsTable.id),
  tier: loyaltyTierEnum("tier").notNull().default("bronze"),
  pointsBalance: integer("points_balance").notNull().default(0),
  pointsLifetime: integer("points_lifetime").notNull().default(0),
  pointsRedeemed: integer("points_redeemed").notNull().default(0),
  totalStays: integer("total_stays").notNull().default(0),
  totalNights: integer("total_nights").notNull().default(0),
  totalSpent: numeric("total_spent", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  lastStayAt: timestamp("last_stay_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const loyaltyMemberTxTable = pgTable("loyalty_member_tx", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  memberId: integer("member_id").notNull().references(() => loyaltyMembersTable.id),
  txType: varchar("tx_type", { length: 30 }).notNull().default("adjust"),
  points: integer("points").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  description: text("description"),
  referenceId: integer("reference_id"),
  referenceType: varchar("reference_type", { length: 50 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type LoyaltySettings = typeof loyaltySettingsTable.$inferSelect;
export type LoyaltyMember = typeof loyaltyMembersTable.$inferSelect;
export type LoyaltyMemberTx = typeof loyaltyMemberTxTable.$inferSelect;
