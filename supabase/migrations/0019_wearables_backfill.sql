-- Add backfill_completed column to wearable_connections table
ALTER TABLE public.wearable_connections ADD COLUMN IF NOT EXISTS backfill_completed BOOLEAN DEFAULT false;
