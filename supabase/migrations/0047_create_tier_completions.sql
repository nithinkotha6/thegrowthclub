-- =============================================================================
-- MIGRATION: 0047_create_tier_completions.sql
-- Independent Tier Completions & Milestone History Schema
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tier_completions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id      uuid        REFERENCES public.groups(id) ON DELETE CASCADE,
  metric_slug   text        NOT NULL, -- 'push_ups', 'pull_ups', 'squats', 'plank'
  tier_number   integer     NOT NULL, -- 1-14
  tier_value    numeric     NOT NULL, -- e.g., 40 for "40 push-ups"
  completed_at  timestamptz DEFAULT now(),
  deleted_at    timestamptz,          -- soft-delete for milestone history removal
  UNIQUE(user_id, group_id, metric_slug, tier_number)
);

-- Ensure highest_tier_unlocked exists on challenge_progression
ALTER TABLE public.challenge_progression 
  ADD COLUMN IF NOT EXISTS highest_tier_unlocked integer;
