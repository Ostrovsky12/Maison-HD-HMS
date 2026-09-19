import { pgTable, serial, varchar, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const demoRequestStatusEnum = pgEnum("demo_request_status", [
  "new",
  "contacted",
  "demo_scheduled",
  "converted",
  "declined",
]);

export const demoRequestsTable = pgTable("demo_requests", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  company: varchar("company", { length: 255 }).notNull(),
  propertiesCount: integer("properties_count").default(1),
  message: text("message"),
  status: demoRequestStatusEnum("status").default("new").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type DemoRequest = typeof demoRequestsTable.$inferSelect;
export type NewDemoRequest = typeof demoRequestsTable.$inferInsert;
