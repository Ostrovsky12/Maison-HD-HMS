ALTER TABLE "servio_booking_attempts" ADD COLUMN IF NOT EXISTS "payment_deadline" timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "servio_payment_deadline_idx" ON "servio_booking_attempts" ("payment_deadline") WHERE "state" IN ('bill_ready','awaiting_payment','expiring');
