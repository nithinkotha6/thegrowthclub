-- =============================================================================
-- MIGRATION: 0033_profiles_group_id_and_role.sql
-- QA-02: `profiles.group_id`, `profiles.role`, and the
-- `profiles_group_pin_key UNIQUE (group_id, pin)` constraint are required by
-- application code (`app/actions/auth.ts` signUpAction, `app/actions/admin.ts`
-- adminUpdateMemberRole) but previously existed ONLY in the ad-hoc
-- `sql/00_emergency_schema_cleanup.sql` script, outside the ordered
-- `supabase/migrations/` sequence. A clean database built from migrations
-- 0001-0032 alone would be missing these columns entirely, and `signUpAction`
-- would fail with "column group_id/role does not exist" on first use.
--
-- This migration promotes that emergency patch into the ordered migration
-- history so a fresh database matches what the app actually requires.
-- All statements are idempotent (IF NOT EXISTS / guarded), so this is also
-- safe to run against an already-patched live database (no-op there).
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups (id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text;

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'member';

UPDATE public.profiles SET role = 'member' WHERE role IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_group_pin_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_group_pin_key UNIQUE (group_id, pin);
  END IF;
END
$$;
