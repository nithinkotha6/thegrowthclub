-- =============================================================================
-- MIGRATION: 0036_daily_goals.sql
-- Dashboard & Challenges Module — Daily Goals (DASH-01, DASH-02).
-- See Findings_and_Recommendations.md "## Dashboard & Challenges Implementation".
-- =============================================================================

-- 1. daily_goals: static, admin-defined daily task catalog. Immutable after
--    creation (no updated_at / edit path by design).
CREATE TABLE IF NOT EXISTS public.daily_goals (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    uuid        NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  title       text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_goals_group_id_idx ON public.daily_goals (group_id);

ALTER TABLE public.daily_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_goals_group_isolation ON public.daily_goals;
CREATE POLICY daily_goals_group_isolation ON public.daily_goals
  FOR ALL
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);

-- 2. daily_goal_completions: one row per user per goal per day. Soft-delete
--    (deleted_at) so the daily broadcast bot and Recent Activities can both
--    filter consistently — never hard-deleted, per the transaction-integrity
--    requirement in the spec.
CREATE TABLE IF NOT EXISTS public.daily_goal_completions (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id      uuid        NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  daily_goal_id uuid        NOT NULL REFERENCES public.daily_goals (id) ON DELETE CASCADE,
  completed_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_goal_completions_group_id_idx ON public.daily_goal_completions (group_id);
CREATE INDEX IF NOT EXISTS daily_goal_completions_user_id_idx ON public.daily_goal_completions (user_id);
CREATE INDEX IF NOT EXISTS daily_goal_completions_daily_goal_id_idx ON public.daily_goal_completions (daily_goal_id);
-- One completion per user per goal per calendar day (only enforced while not deleted).
CREATE UNIQUE INDEX IF NOT EXISTS daily_goal_completions_one_per_day_idx
  ON public.daily_goal_completions (user_id, daily_goal_id, (completed_at::date))
  WHERE deleted_at IS NULL;

ALTER TABLE public.daily_goal_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_goal_completions_group_isolation ON public.daily_goal_completions;
CREATE POLICY daily_goal_completions_group_isolation ON public.daily_goal_completions
  FOR ALL
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);
