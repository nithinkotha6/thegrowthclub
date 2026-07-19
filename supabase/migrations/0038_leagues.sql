-- =============================================================================
-- MIGRATION: 0038_leagues.sql
-- Dashboard & Challenges Module — Leagues (DASH-05, DASH-06, DASH-07, DASH-08,
-- DASH-25). See Findings_and_Recommendations.md.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.league_assignments (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    uuid        NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  team_name   text        NOT NULL CHECK (team_name IN ('TITANS', 'REBELS')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS league_assignments_group_id_idx ON public.league_assignments (group_id);

ALTER TABLE public.league_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS league_assignments_group_isolation ON public.league_assignments;
CREATE POLICY league_assignments_group_isolation ON public.league_assignments
  FOR ALL
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);

-- league_challenges: per-group catalog (mirrors metric_definitions, not the
-- global metrics_config pattern — DASH-06 decision: per-group, so each group
-- can add its own challenge types independently, seeded with a starter set
-- at insert time via the group-creation Server Action rather than a global
-- seed here).
CREATE TABLE IF NOT EXISTS public.league_challenges (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    uuid        NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS league_challenges_group_id_idx ON public.league_challenges (group_id);

ALTER TABLE public.league_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS league_challenges_group_isolation ON public.league_challenges;
CREATE POLICY league_challenges_group_isolation ON public.league_challenges
  FOR ALL
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);

CREATE TABLE IF NOT EXISTS public.league_matches (
  id                  uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id            uuid        NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  league_challenge_id uuid        NOT NULL REFERENCES public.league_challenges (id) ON DELETE CASCADE,
  titans_score        numeric     NOT NULL DEFAULT 0,
  rebels_score        numeric     NOT NULL DEFAULT 0,
  winner_team         text        CHECK (winner_team IN ('TITANS', 'REBELS', 'TIE')),
  completed_at        timestamptz,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS league_matches_group_id_idx ON public.league_matches (group_id);

ALTER TABLE public.league_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS league_matches_group_isolation ON public.league_matches;
CREATE POLICY league_matches_group_isolation ON public.league_matches
  FOR ALL
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);

-- Server-enforced completion lock (DASH-25): once completed_at is set, the
-- score/winner/completed_at fields can never change again, regardless of
-- which code path attempts it — a disabled UI input alone is not enforcement.
CREATE OR REPLACE FUNCTION public.prevent_completed_match_edit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.completed_at IS NOT NULL THEN
    IF NEW.titans_score IS DISTINCT FROM OLD.titans_score
       OR NEW.rebels_score IS DISTINCT FROM OLD.rebels_score
       OR NEW.winner_team IS DISTINCT FROM OLD.winner_team
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'This league match is already completed; score and winner cannot be changed.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_completed_match_edit ON public.league_matches;
CREATE TRIGGER trg_prevent_completed_match_edit
  BEFORE UPDATE ON public.league_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_completed_match_edit();

CREATE TABLE IF NOT EXISTS public.league_match_logs (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id   uuid        NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  match_id   uuid        NOT NULL REFERENCES public.league_matches (id) ON DELETE CASCADE,
  action     text        NOT NULL CHECK (action IN ('create', 'complete', 'delete')),
  actor_id   uuid        NOT NULL REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS league_match_logs_group_id_idx ON public.league_match_logs (group_id);
CREATE INDEX IF NOT EXISTS league_match_logs_match_id_idx ON public.league_match_logs (match_id);

ALTER TABLE public.league_match_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS league_match_logs_group_isolation ON public.league_match_logs;
CREATE POLICY league_match_logs_group_isolation ON public.league_match_logs
  FOR ALL
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);
