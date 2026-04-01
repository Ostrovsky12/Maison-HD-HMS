import { pgTable, serial, integer, timestamp, text, boolean, pgEnum, jsonb, varchar, numeric, date } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { bookingsTable } from "./bookings";

export const eventTypeEnum = pgEnum("event_type", ["wedding", "corporate", "birthday", "conference", "seminar", "gala", "private", "other"]);
export const eventStatusEnum = pgEnum("event_status", ["inquiry", "offer_sent", "confirmed", "deposit_paid", "completed", "cancelled"]);
export const eventServiceCategoryEnum = pgEnum("event_service_category", ["catering", "decoration", "music", "equipment", "photo_video", "transport", "accommodation", "other"]);
export const eventTaskStatusEnum = pgEnum("event_task_status", ["pending", "in_progress", "done", "skipped"]);

export const eventSpacesTable = pgTable("event_spaces", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  capacityMin: integer("capacity_min").default(1),
  capacityMax: integer("capacity_max").notNull().default(50),
  areaSqm: integer("area_sqm"),
  pricePerHour: numeric("price_per_hour", { precision: 10, scale: 2 }).default("0"),
  pricePerDay: numeric("price_per_day", { precision: 10, scale: 2 }).default("0"),
  amenities: jsonb("amenities").$type<string[]>().default([]),
  isActive: boolean("is_active").notNull().default(true),
  color: varchar("color", { length: 20 }).default("#6366f1"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  eventSpaceId: integer("event_space_id").references(() => eventSpacesTable.id),
  eventType: eventTypeEnum("event_type").notNull().default("private"),
  name: varchar("name", { length: 255 }).notNull(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  clientPhone: varchar("client_phone", { length: 50 }),
  clientEmail: varchar("client_email", { length: 255 }),
  eventDate: date("event_date").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull().default("12:00"),
  endTime: varchar("end_time", { length: 5 }).notNull().default("18:00"),
  guestCount: integer("guest_count").notNull().default(1),
  status: eventStatusEnum("status").notNull().default("inquiry"),
  venuePrice: numeric("venue_price", { precision: 10, scale: 2 }).default("0"),
  servicesPrice: numeric("services_price", { precision: 10, scale: 2 }).default("0"),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).default("0"),
  depositAmount: numeric("deposit_amount", { precision: 10, scale: 2 }).default("0"),
  depositPaid: boolean("deposit_paid").default(false),
  notes: text("notes"),
  staffNotes: text("staff_notes"),
  tags: jsonb("tags").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const eventServicesTable = pgTable("event_services", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  category: eventServiceCategoryEnum("category").notNull().default("other"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  quantity: integer("quantity").default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).default("0"),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).default("0"),
  isConfirmed: boolean("is_confirmed").default(false),
  vendorName: varchar("vendor_name", { length: 255 }),
  vendorPhone: varchar("vendor_phone", { length: 50 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const eventTasksTable = pgTable("event_tasks", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: eventTaskStatusEnum("status").notNull().default("pending"),
  dueDate: date("due_date"),
  assignedTo: varchar("assigned_to", { length: 255 }),
  sortOrder: integer("sort_order").default(0),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type EventSpace = typeof eventSpacesTable.$inferSelect;
export type Event = typeof eventsTable.$inferSelect;
export type EventService = typeof eventServicesTable.$inferSelect;
export type EventTask = typeof eventTasksTable.$inferSelect;
