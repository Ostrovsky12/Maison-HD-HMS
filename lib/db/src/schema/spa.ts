import { pgTable, serial, integer, timestamp, text, boolean, pgEnum, jsonb, varchar, numeric, date, time } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { guestsTable } from "./guests";
import { bookingsTable } from "./bookings";

export const spaAppointmentStatusEnum = pgEnum("spa_appointment_status", ["pending", "confirmed", "in_progress", "completed", "cancelled", "no_show"]);
export const spaMembershipStatusEnum = pgEnum("spa_membership_status", ["active", "paused", "expired", "cancelled"]);
export const spaMembershipTypeEnum = pgEnum("spa_membership_type", ["sessions", "monthly", "annual", "day_pass_bundle"]);
export const spaServiceCategoryEnum = pgEnum("spa_service_category", ["massage", "body", "face", "pool", "sauna", "jacuzzi", "fitness", "wellness", "other"]);

export const spaServicesTable = pgTable("spa_services", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: spaServiceCategoryEnum("category").notNull().default("massage"),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  maxGuests: integer("max_guests").default(1),
  requiresSpecialist: boolean("requires_specialist").default(true),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").default(0),
  tags: jsonb("tags").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const spaResourcesTable = pgTable("spa_resources", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  resourceType: varchar("resource_type", { length: 100 }).notNull().default("room"),
  capacity: integer("capacity").default(1),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const spaSpecialistsTable = pgTable("spa_specialists", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 30 }),
  bio: text("bio"),
  specializations: jsonb("specializations").$type<string[]>().default([]),
  workDays: jsonb("work_days").$type<number[]>().default([1, 2, 3, 4, 5]),
  workStart: varchar("work_start", { length: 5 }).default("09:00"),
  workEnd: varchar("work_end", { length: 5 }).default("18:00"),
  slotMinutes: integer("slot_minutes").default(60),
  isActive: boolean("is_active").notNull().default(true),
  color: varchar("color", { length: 20 }).default("#6366f1"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const spaAppointmentsTable = pgTable("spa_appointments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  serviceId: integer("service_id").references(() => spaServicesTable.id),
  specialistId: integer("specialist_id").references(() => spaSpecialistsTable.id),
  resourceId: integer("resource_id").references(() => spaResourcesTable.id),
  guestId: integer("guest_id").references(() => guestsTable.id),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  guestName: varchar("guest_name", { length: 255 }),
  guestPhone: varchar("guest_phone", { length: 50 }),
  appointmentDate: date("appointment_date").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  price: numeric("price", { precision: 10, scale: 2 }).default("0"),
  paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }).default("0"),
  status: spaAppointmentStatusEnum("status").notNull().default("pending"),
  isHotelGuest: boolean("is_hotel_guest").default(false),
  isDayPass: boolean("is_day_pass").default(false),
  membershipId: integer("membership_id"),
  notes: text("notes"),
  staffNotes: text("staff_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const spaMembershipsTable = pgTable("spa_memberships", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  guestId: integer("guest_id").references(() => guestsTable.id),
  guestName: varchar("guest_name", { length: 255 }).notNull(),
  guestPhone: varchar("guest_phone", { length: 50 }),
  membershipType: spaMembershipTypeEnum("membership_type").notNull().default("sessions"),
  name: varchar("name", { length: 255 }).notNull(),
  sessionsTotal: integer("sessions_total").default(0),
  sessionsUsed: integer("sessions_used").notNull().default(0),
  pricePaid: numeric("price_paid", { precision: 10, scale: 2 }).default("0"),
  startsAt: date("starts_at").notNull(),
  expiresAt: date("expires_at"),
  status: spaMembershipStatusEnum("status").notNull().default("active"),
  services: jsonb("services").$type<number[]>().default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const spaDayPassesTable = pgTable("spa_day_passes", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  guestName: varchar("guest_name", { length: 255 }).notNull(),
  guestPhone: varchar("guest_phone", { length: 50 }),
  guestCount: integer("guest_count").notNull().default(1),
  passDate: date("pass_date").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).default("0"),
  includes: jsonb("includes").$type<string[]>().default([]),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSpaServiceSchema = createInsertSchema(spaServicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSpaSpecialistSchema = createInsertSchema(spaSpecialistsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSpaAppointmentSchema = createInsertSchema(spaAppointmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSpaMembershipSchema = createInsertSchema(spaMembershipsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSpaDayPassSchema = createInsertSchema(spaDayPassesTable).omit({ id: true, createdAt: true });

export type SpaService = typeof spaServicesTable.$inferSelect;
export type SpaSpecialist = typeof spaSpecialistsTable.$inferSelect;
export type SpaAppointment = typeof spaAppointmentsTable.$inferSelect;
export type SpaMembership = typeof spaMembershipsTable.$inferSelect;
export type SpaDayPass = typeof spaDayPassesTable.$inferSelect;
