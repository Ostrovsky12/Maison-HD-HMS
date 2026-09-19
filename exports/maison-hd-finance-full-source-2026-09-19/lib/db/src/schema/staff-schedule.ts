import { pgTable, serial, integer, date, time, timestamp, text, boolean, varchar, pgEnum } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export const shiftStatusEnum = pgEnum("shift_status", ["scheduled", "confirmed", "completed", "absent", "cancelled"]);
export const shiftDepartmentEnum = pgEnum("shift_department", ["reception", "housekeeping", "fb", "maintenance", "security", "management", "spa", "other"]);

export const staffShiftsTable = pgTable("staff_shifts", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  shiftDate: date("shift_date").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  department: shiftDepartmentEnum("department").notNull().default("reception"),
  status: shiftStatusEnum("status").notNull().default("scheduled"),
  notes: text("notes"),
  breakMinutes: integer("break_minutes").notNull().default(30),
  isOvertime: boolean("is_overtime").notNull().default(false),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type StaffShift = typeof staffShiftsTable.$inferSelect;
export type InsertStaffShift = typeof staffShiftsTable.$inferInsert;
