CREATE TABLE IF NOT EXISTS "servio_booking_attempts" (
  "id" uuid PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "request_id" uuid NOT NULL,
  "request_hash" text NOT NULL,
  "state" text NOT NULL,
  "account" text,
  "payload" jsonb NOT NULL,
  "connection" text NOT NULL,
  "bill" jsonb,
  "consent" jsonb,
  "payment" jsonb,
  "issue" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "servio_booking_attempt_request"
  ON "servio_booking_attempts" ("organization_id", "request_id");
