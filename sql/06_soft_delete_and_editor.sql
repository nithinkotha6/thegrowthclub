-- =============================================================================
-- MIGRATION: 06_soft_delete_and_editor.sql
-- Setting up soft delete structures on profiles.
-- =============================================================================

-- 1. Add is_active soft delete column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. Create performance index
CREATE INDEX IF NOT EXISTS profiles_is_active_idx ON public.profiles(is_active);
