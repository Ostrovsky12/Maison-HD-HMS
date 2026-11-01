ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "tv_weather" jsonb NOT NULL DEFAULT '{}'::jsonb;
