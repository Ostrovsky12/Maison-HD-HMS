ALTER TABLE fb_order_items ADD COLUMN IF NOT EXISTS requires_confirmation boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE fb_order_items ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
--> statement-breakpoint
ALTER TABLE fb_order_items ADD COLUMN IF NOT EXISTS confirmed_by integer;
