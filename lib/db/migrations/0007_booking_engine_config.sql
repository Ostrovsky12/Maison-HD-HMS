-- Development migration. Managed production receives this nullable column via
-- Publish's development-to-production schema diff, never startup DDL.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS booking_engine_config jsonb;
