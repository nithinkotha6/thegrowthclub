-- 1. Drop the excised phone_number column completely so INSERTs stop failing
ALTER TABLE public.profiles DROP COLUMN IF EXISTS phone_number;

-- 2. Ensure PINs are only unique WITHIN a group, not globally across the entire database
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pin_key;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_group_pin_key;

-- Ensure group_id column exists on profiles before adding the unique constraint
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_group_pin_key UNIQUE (group_id, pin);

-- 3. Verify standard required columns have correct defaults
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'member';
