import { pgTable, serial, integer, text, timestamp, date, json, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";
import { usersTable } from "./users";

export const taskStatusEnum = pgEnum("task_status", ["pending", "in_progress", "completed"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high"]);

export const housekeepingTasksTable = pgTable("housekeeping_tasks", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id),
  assignedToId: integer("assigned_to_id").references(() => usersTable.id),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatusEnum("status").notNull().default("pending"),
  priority: taskPriorityEnum("priority").notNull().default("medium"),
  dueDate: date("due_date"),
  checklist: json("checklist").$type<Array<{ id: string; text: string; checked: boolean }>>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertHousekeepingTaskSchema = createInsertSchema(housekeepingTasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHousekeepingTask = z.infer<typeof insertHousekeepingTaskSchema>;
export type HousekeepingTask = typeof housekeepingTasksTable.$inferSelect;
