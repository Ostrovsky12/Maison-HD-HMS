/**
 * OPERATIONS DOMAIN
 * Staff workflows: tasks, housekeeping, maintenance tickets
 *
 * Architecture:
 *   tasks (generic staff task list)
 *   housekeeping_tasks (unit-specific cleaning/inspection)
 *   maintenance_tickets (issue tracking with priority SLA)
 */

import {
  pgTable, serial, text, boolean, integer, numeric,
  timestamp, date, jsonb, index,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";
import { properties, propertyUnits } from "./property";
import { reservations } from "./reservations";
import { users } from "./iam";

// ─── TASKS ────────────────────────────────────────────────────────────────────
// Generic staff task management (guest requests, follow-ups, admin tasks).
// Separate from housekeeping_tasks (unit-focused) and maintenance_tickets (issue-focused).
export const tasks = pgTable("tasks", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  propertyId:      integer("property_id").references(() => properties.id),
  title:           text("title").notNull(),
  description:     text("description"),
  type:            text("type").notNull().default("general"),
    // "general" | "guest_request" | "guest_complaint" | "follow_up" | "admin" | "purchase"
  status:          text("status").notNull().default("pending"),
    // "pending" | "in_progress" | "completed" | "cancelled" | "on_hold"
  priority:        text("priority").notNull().default("normal"),
    // "low" | "normal" | "high" | "urgent"
  dueDate:         timestamp("due_date"),
  reservationId:   integer("reservation_id").references(() => reservations.id),
  unitId:          integer("unit_id").references(() => propertyUnits.id),
  assignedTo:      integer("assigned_to").references(() => users.id),
  assignedBy:      integer("assigned_by").references(() => users.id),
  completedBy:     integer("completed_by").references(() => users.id),
  completedAt:     timestamp("completed_at"),
  verifiedBy:      integer("verified_by").references(() => users.id),
  verifiedAt:      timestamp("verified_at"),
  estimatedMin:    integer("estimated_min"),
  actualMin:       integer("actual_min"),
  tags:            jsonb("tags").default("[]"),
  attachments:     jsonb("attachments").default("[]"),
  notes:           text("notes"),
  parentTaskId:    integer("parent_task_id"),   // for sub-tasks
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_tasks_tenant").on(t.tenantId),
  idxAssigned:     index("idx_tasks_assigned").on(t.assignedTo),
  idxStatus:       index("idx_tasks_status").on(t.status),
}));

// ─── HOUSEKEEPING TASKS ───────────────────────────────────────────────────────
// Unit-level cleaning and inspection workflow.
// Maps to existing `housekeeping_tasks` table.
export const housekeepingTasks = pgTable("housekeeping_tasks", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("organization_id").notNull().references(() => tenants.id),
  unitId:          integer("unit_id").notNull().references(() => propertyUnits.id),
  reservationId:   integer("booking_id").references(() => reservations.id),
  type:            text("type").notNull().default("cleaning"),
    // "cleaning" | "deep_cleaning" | "linen_change" | "inspection" | "maintenance" | "other"
  status:          text("status").notNull().default("pending"),
    // "pending" | "in_progress" | "completed" | "verified" | "skipped" | "cancelled"
  priority:        text("priority").default("normal"),
  scheduledDate:   date("scheduled_date"),
  scheduledTime:   text("scheduled_time"),     // preferred time "10:00"
  startedAt:       timestamp("started_at"),
  completedAt:     timestamp("completed_at"),
  durationMin:     integer("duration_min"),
  assignedToId:    integer("assigned_to_id").references(() => users.id),
  verifiedById:    integer("verified_by_id").references(() => users.id),
  checklist:       jsonb("checklist").default("[]"), // [{ item, checked, notes }]
  photos:          jsonb("photos").default("[]"),    // inspection photos
  issues:          jsonb("issues").default("[]"),    // found issues → creates maintenance ticket
  notes:           text("notes"),
  score:           integer("score"),                 // inspection score 0-100
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_hk_tasks_tenant").on(t.tenantId),
  idxUnit:         index("idx_hk_tasks_unit").on(t.unitId),
  idxDate:         index("idx_hk_tasks_date").on(t.scheduledDate),
  idxAssigned:     index("idx_hk_tasks_assigned").on(t.assignedToId),
}));

// ─── MAINTENANCE TICKETS ──────────────────────────────────────────────────────
// Issue tracking system for equipment failures, repairs, and facility problems.
// Lifecycle: reported → assigned → in_progress → resolved → closed
export const maintenanceTickets = pgTable("maintenance_tickets", {
  id:              serial("id").primaryKey(),
  tenantId:        integer("tenant_id").notNull().references(() => tenants.id),
  propertyId:      integer("property_id").references(() => properties.id),
  unitId:          integer("unit_id").references(() => propertyUnits.id),
  ticketNo:        text("ticket_no"),          // "MNT-2025-00142"
  title:           text("title").notNull(),
  description:     text("description"),
  category:        text("category").notNull(),
    // "electrical" | "plumbing" | "hvac" | "furniture" | "appliance" | "structural" | "it" | "other"
  status:          text("status").notNull().default("open"),
    // "open" | "assigned" | "in_progress" | "on_hold" | "resolved" | "closed" | "cancelled"
  priority:        text("priority").notNull().default("normal"),
    // "low" | "normal" | "high" | "urgent" | "critical"
  reportedBy:      integer("reported_by").references(() => users.id),
  assignedTo:      integer("assigned_to").references(() => users.id),
  externalContractor: text("external_contractor"),
  estimatedCost:   numeric("estimated_cost", { precision: 10, scale: 2 }),
  actualCost:      numeric("actual_cost", { precision: 10, scale: 2 }),
  scheduledDate:   timestamp("scheduled_date"),
  startedAt:       timestamp("started_at"),
  resolvedAt:      timestamp("resolved_at"),
  closedAt:        timestamp("closed_at"),
  slaDeadline:     timestamp("sla_deadline"),
  slaBreached:     boolean("sla_breached").notNull().default(false),
  photos:          jsonb("photos").default("[]"),     // before/after photos
  parts:           jsonb("parts").default("[]"),      // [{ name, qty, cost }]
  workLog:         jsonb("work_log").default("[]"),   // time tracking entries
  notes:           text("notes"),
  guestImpact:     boolean("guest_impact").notNull().default(false),
  reservationId:   integer("reservation_id").references(() => reservations.id),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxTenant:       index("idx_maint_tickets_tenant").on(t.tenantId),
  idxUnit:         index("idx_maint_tickets_unit").on(t.unitId),
  idxStatus:       index("idx_maint_tickets_status").on(t.status),
  idxAssigned:     index("idx_maint_tickets_assigned").on(t.assignedTo),
}));
