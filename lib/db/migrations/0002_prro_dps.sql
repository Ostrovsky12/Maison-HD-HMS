CREATE TABLE IF NOT EXISTS "prro_registers" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "legal_entity_id" integer NOT NULL REFERENCES "legal_entities"("id"),
  "name" varchar(255) NOT NULL,
  "fiscal_number" varchar(32),
  "device_id" varchar(100) NOT NULL,
  "location_name" varchar(255),
  "location_address" text,
  "status" varchar(32) NOT NULL DEFAULT 'draft',
  "provider" varchar(32) NOT NULL DEFAULT 'dps',
  "offline_allowed" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "prro_registers_org_device_uq"
  ON "prro_registers" ("organization_id", "device_id");
CREATE INDEX IF NOT EXISTS "prro_registers_org_entity_idx"
  ON "prro_registers" ("organization_id", "legal_entity_id");

CREATE TABLE IF NOT EXISTS "prro_shifts" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "legal_entity_id" integer NOT NULL REFERENCES "legal_entities"("id"),
  "register_id" integer NOT NULL REFERENCES "prro_registers"("id"),
  "cashier_user_id" integer REFERENCES "users"("id"),
  "signer_key_id" varchar(255),
  "status" varchar(24) NOT NULL DEFAULT 'opening',
  "dps_shift_id" varchar(100),
  "opened_at" timestamptz,
  "closed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "prro_shifts_register_status_idx"
  ON "prro_shifts" ("organization_id", "register_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "prro_shifts_one_active_per_register_uq"
  ON "prro_shifts" ("organization_id", "register_id")
  WHERE "status" IN ('opening', 'open', 'closing');

CREATE TABLE IF NOT EXISTS "fiscal_documents" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "legal_entity_id" integer NOT NULL REFERENCES "legal_entities"("id"),
  "register_id" integer REFERENCES "prro_registers"("id"),
  "shift_id" integer REFERENCES "prro_shifts"("id"),
  "source_type" varchar(40) NOT NULL,
  "source_id" varchar(100) NOT NULL,
  "document_type" varchar(24) NOT NULL DEFAULT 'sale',
  "payment_channel" varchar(40) NOT NULL,
  "policy_decision" varchar(24) NOT NULL,
  "policy_code" varchar(100) NOT NULL,
  "policy_reason" text NOT NULL,
  "policy_version" varchar(32) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'draft',
  "currency" varchar(3) NOT NULL DEFAULT 'UAH',
  "total_amount" numeric(14,2) NOT NULL,
  "idempotency_key" varchar(160) NOT NULL,
  "content_hash" varchar(64) NOT NULL,
  "previous_hash" varchar(64),
  "local_number" integer,
  "fiscal_number" varchar(100),
  "dps_document_id" varchar(100),
  "xml_payload" text,
  "signed_payload" text,
  "dps_signed_id" text,
  "dps_signed_data" text,
  "dps_response" jsonb,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "next_retry_at" timestamptz,
  "last_error" text,
  "payload_snapshot" jsonb NOT NULL,
  "policy_evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" integer REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "submitted_at" timestamptz,
  "fiscalized_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_documents_idempotency_uq"
  ON "fiscal_documents" ("organization_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "fiscal_documents_org_created_idx"
  ON "fiscal_documents" ("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "fiscal_documents_seller_source_idx"
  ON "fiscal_documents" ("organization_id", "legal_entity_id", "source_type", "source_id");
CREATE INDEX IF NOT EXISTS "fiscal_documents_hash_idx"
  ON "fiscal_documents" ("organization_id", "content_hash");
CREATE INDEX IF NOT EXISTS "fiscal_documents_retry_idx"
  ON "fiscal_documents" ("status", "next_retry_at");

CREATE TABLE IF NOT EXISTS "fiscal_events" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "fiscal_document_id" integer NOT NULL REFERENCES "fiscal_documents"("id"),
  "event_type" varchar(50) NOT NULL,
  "event_status" varchar(24) NOT NULL,
  "request_id" varchar(100),
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "fiscal_events_document_idx"
  ON "fiscal_events" ("organization_id", "fiscal_document_id", "created_at");