-- =============================================================================
-- MIGRATION: 0048_league_player_scores.sql
-- Individual Player Scores & Match Timer Schema
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.league_match_player_scores (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   uuid        REFERENCES public.league_matches(id) ON DELETE CASCADE,
  group_id   uuid        REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_name  text        NOT NULL, -- 'TITANS' | 'REBELS'
  score      numeric     NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(match_id, user_id)
);

ALTER TABLE public.league_matches 
  ADD COLUMN IF NOT EXISTS timer_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS timer_started_at timestamptz;
