ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "group_booking_id" varchar(36);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "group_name" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookings_group_booking"
  ON "bookings" ("group_booking_id")
  WHERE "group_booking_id" IS NOT NULL;