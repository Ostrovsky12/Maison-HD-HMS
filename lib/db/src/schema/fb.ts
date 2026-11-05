import { pgTable, serial, integer, timestamp, text, boolean, pgEnum, jsonb, varchar, numeric, date } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { bookingsTable } from "./bookings";
import { usersTable } from "./users";
import { legalEntitiesTable } from "./legal-entities";

export const fbOrderStatusEnum = pgEnum("fb_order_status", ["open", "in_kitchen", "ready", "served", "billed", "cancelled", "new_guest"]);
export const fbOrderTypeEnum = pgEnum("fb_order_type", ["dine_in", "room_service", "takeaway", "bar", "breakfast", "banquet", "corporate"]);
export const fbItemStatusEnum = pgEnum("fb_item_status", ["pending", "cooking", "ready", "served", "cancelled"]);
export const fbTableStatusEnum = pgEnum("fb_table_status", ["free", "occupied", "reserved", "cleaning"]);

export const fbCategoriesTable = pgTable("fb_categories", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: varchar("name", { length: 100 }).notNull(),
  emoji: varchar("emoji", { length: 10 }).default("🍽"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const fbItemsTable = pgTable("fb_items", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  categoryId: integer("category_id").references(() => fbCategoriesTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  priceHappy: numeric("price_happy", { precision: 10, scale: 2 }),
  cookMinutes: integer("cook_minutes").default(15),
  isAvailable: boolean("is_available").notNull().default(true),
  isPopular: boolean("is_popular").default(false),
  isVegetarian: boolean("is_vegetarian").default(false),
  allergens: jsonb("allergens").$type<string[]>().default([]),
  tags: jsonb("tags").$type<string[]>().default([]),
  sortOrder: integer("sort_order").default(0),
  imageUrl: text("image_url"),
  // Extended columns (added via raw SQL migrations)
  station: varchar("station", { length: 50 }).default("kitchen_general"),
  isStopList: boolean("is_stop_list").default(false),
  isAlcohol: boolean("is_alcohol").default(false),
  alcoholVolumePct: numeric("alcohol_volume_pct", { precision: 5, scale: 2 }),
  volumeL: numeric("volume_l", { precision: 6, scale: 3 }),
  exciseGroup: varchar("excise_group", { length: 50 }),
  exciseCode: varchar("excise_code", { length: 50 }),
  uktzedCode: varchar("uktzed_code", { length: 20 }),
  vatRate: integer("vat_rate").default(20),
  legalEntityId: integer("legal_entity_id").references(() => legalEntitiesTable.id),
  ingredientId: integer("ingredient_id"),
  itemType: varchar("item_type", { length: 30 }).default("dish"),
  techCard: jsonb("tech_card"),
  taxGroupId: integer("tax_group_id"),
  productCode: varchar("product_code", { length: 50 }),
  serviceCode: varchar("service_code", { length: 50 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fbTablesTable = pgTable("fb_tables", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  number: varchar("number", { length: 20 }).notNull(),
  capacity: integer("capacity").notNull().default(4),
  location: varchar("location", { length: 100 }).default("Основний зал"),
  status: fbTableStatusEnum("status").notNull().default("free"),
  currentOrderId: integer("current_order_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const fbOrdersTable = pgTable("fb_orders", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  tableId: integer("table_id").references(() => fbTablesTable.id),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  orderType: fbOrderTypeEnum("order_type").notNull().default("dine_in"),
  guestName: varchar("guest_name", { length: 255 }),
  roomNumber: varchar("room_number", { length: 20 }),
  guestCount: integer("guest_count").default(1),
  status: fbOrderStatusEnum("status").notNull().default("open"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).default("0"),
  paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }).default("0"),
  notes: text("notes"),
  staffNotes: text("staff_notes"),
  // Durable Poster dispatch journal, including uncertain-outcome holds.
  posterSync: jsonb("poster_sync"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // Extended columns (added via raw SQL migrations)
  currentWaiterUserId: integer("current_waiter_user_id").references(() => usersTable.id),
  tipAmount: numeric("tip_amount", { precision: 10, scale: 2 }).default("0"),
  tipPct: numeric("tip_pct", { precision: 5, scale: 2 }).default("0"),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).default("0"),
  discountLabel: varchar("discount_label", { length: 100 }),
  paymentMethod: varchar("payment_method", { length: 50 }),
  receiptNumber: varchar("receipt_number", { length: 100 }),
  exciseTotal: numeric("excise_total", { precision: 10, scale: 2 }).default("0"),
  legalEntityId: integer("legal_entity_id").references(() => legalEntitiesTable.id),
});

export const fbOrderItemsTable = pgTable("fb_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => fbOrdersTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => fbItemsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  status: fbItemStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  modifiers: jsonb("modifiers"),
  requiresConfirmation: boolean("requires_confirmation").notNull().default(false),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  confirmedBy: integer("confirmed_by"),
  sentAt: timestamp("sent_at"),
  readyAt: timestamp("ready_at"),
  servedAt: timestamp("served_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── LEGACY F&B TABLES ────────────────────────────────────────────────────────
// Kept in schema to prevent Drizzle from dropping them during deployment.
// These tables exist in production and must not be removed.

export const fbConfigSettingsTable = pgTable("fb_config_settings", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  section:        varchar("section", { length: 100 }).notNull(),
  data:           jsonb("data").notNull().default({}),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

export const fbOrderSourcesTable = pgTable("fb_order_sources", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  name:           varchar("name", { length: 100 }).notNull(),
  showOnPos:      boolean("show_on_pos").notNull().default(true),
  sortOrder:      integer("sort_order").notNull().default(0),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export const fbPaymentMethodsTable = pgTable("fb_payment_methods", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  name:           varchar("name", { length: 100 }).notNull(),
  type:           varchar("type", { length: 30 }).notNull().default("cash"),
  commissionPct:  numeric("commission_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  showOnPos:      boolean("show_on_pos").notNull().default(true),
  color:          varchar("color", { length: 20 }),
  iconCode:       varchar("icon_code", { length: 50 }),
  sortOrder:      integer("sort_order").notNull().default(0),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export const fbHallTablesTable = pgTable("fb_hall_tables", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  hallId:         integer("hall_id"),
  hallName:       varchar("hall_name", { length: 100 }),
  tableNumber:    integer("table_number").notNull(),
  posX:           integer("pos_x").notNull().default(0),
  posY:           integer("pos_y").notNull().default(0),
  width:          integer("width").notNull().default(80),
  height:         integer("height").notNull().default(80),
  seats:          integer("seats").notNull().default(4),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export type FbCategory = typeof fbCategoriesTable.$inferSelect;
export type FbItem = typeof fbItemsTable.$inferSelect;
export type FbTable = typeof fbTablesTable.$inferSelect;
export type FbOrder = typeof fbOrdersTable.$inferSelect;
export type FbOrderItem = typeof fbOrderItemsTable.$inferSelect;
