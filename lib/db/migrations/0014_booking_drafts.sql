CREATE TABLE IF NOT EXISTS booking_drafts (
  id uuid PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  revision bigint NOT NULL,
  notice_version text NOT NULL,
  details jsonb NOT NULL,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  notes text NOT NULL DEFAULT '',
  servio_attempt_id uuid,
  booking_id integer,
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS booking_drafts_token_idx ON booking_drafts(organization_id,token_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS booking_drafts_org_seen_idx ON booking_drafts(organization_id,last_seen);
