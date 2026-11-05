ALTER TABLE "servio_booking_attempts" ADD COLUMN IF NOT EXISTS "notification_delivery" jsonb NOT NULL DEFAULT '{}'::jsonb;
