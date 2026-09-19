CREATE TABLE IF NOT EXISTS "payment_events" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "event_key" text NOT NULL,
  "previous_amount" numeric(12,2) NOT NULL,
  "target_amount" numeric(12,2) NOT NULL,
  "delta_amount" numeric(12,2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'UAH',
  "status" text NOT NULL DEFAULT 'pending',
  "payload" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_events_org_event_key_uq"
  ON "payment_events" ("organization_id", "event_key");