-- ---------------------------------------------------------------------------
-- ALTER TABLE: profiles
-- Add phone_number and gender fields.
-- Enforce phone_number as the unique natural key across the platform.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text;

-- Backfill existing rows with dummy phone numbers based on ID to satisfy NOT NULL & UNIQUE
UPDATE public.profiles 
   SET phone_number = '+1999555' || substring(id::text from 1 for 8)
 WHERE phone_number IS NULL;

-- Enforce constraints
ALTER TABLE public.profiles ALTER COLUMN phone_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_phone_number_unique'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_number_unique UNIQUE (phone_number);
  END IF;
END $$;
