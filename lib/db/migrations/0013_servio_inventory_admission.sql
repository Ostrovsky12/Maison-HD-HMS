ALTER TABLE "servio_booking_attempts" ADD COLUMN IF NOT EXISTS "inventory_key" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "servio_inventory_days" (
  "inventory_key" text NOT NULL,
  "stay_date" date NOT NULL,
  "capacity" integer NOT NULL CONSTRAINT "servio_inventory_capacity_nonnegative" CHECK ("capacity" >= 0),
  PRIMARY KEY ("inventory_key", "stay_date")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "servio_inventory_active_idx" ON "servio_booking_attempts" ("inventory_key") WHERE "state" NOT IN ('failed','cancelled');
