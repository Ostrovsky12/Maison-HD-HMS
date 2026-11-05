import { pgTable, text, date, integer, primaryKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Opaque provider/hotel/category identity; shared physical stock is not split
// into separate quotas by rates, guests, tenants, or server processes.
export const servioInventoryDaysTable = pgTable("servio_inventory_days", {
  inventoryKey: text("inventory_key").notNull(),
  stayDate: date("stay_date").notNull(),
  capacity: integer("capacity").notNull(),
}, table => [
  primaryKey({ columns: [table.inventoryKey, table.stayDate] }),
  check("servio_inventory_capacity_nonnegative", sql`${table.capacity} >= 0`),
]);
