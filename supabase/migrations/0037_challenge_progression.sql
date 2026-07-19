-- =============================================================================
-- MIGRATION: 0037_challenge_progression.sql
-- Dashboard & Challenges Module — Progression Challenges (DASH-03, DASH-04,
-- DASH-19, DASH-20). See Findings_and_Recommendations.md.
--
-- Design: `challenge_progression.current_tier`/`previous_tier` are NEVER
-- written directly by application code. Server Actions only ever INSERT into
-- `challenge_history` (log) or soft-delete a row (UPDATE deleted_at). A
-- trigger recomputes `challenge_progression` from the latest remaining
-- non-deleted history row every time — this is what guarantees the tier can
-- never drift from its history, even across repeated deletes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.challenge_history (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id       uuid        NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  challenge_type text        NOT NULL,
  entry_date     timestamptz NOT NULL DEFAULT now(),
  tier_before    numeric     NOT NULL,
  tier_after     numeric     NOT NULL,
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS challenge_history_group_id_idx ON public.challenge_history (group_id);
CREATE INDEX IF NOT EXISTS challenge_history_user_challenge_idx ON public.challenge_history (user_id, challenge_type);

ALTER TABLE public.challenge_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS challenge_history_group_isolation ON public.challenge_history;
CREATE POLICY challenge_history_group_isolation ON public.challenge_history
  FOR ALL
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);

CREATE TABLE IF NOT EXISTS public.challenge_progression (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id       uuid        NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  challenge_type text        NOT NULL,
  current_tier   numeric     NOT NULL,
  previous_tier  numeric,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_type)
);

CREATE INDEX IF NOT EXISTS challenge_progression_group_id_idx ON public.challenge_progression (group_id);

ALTER TABLE public.challenge_progression ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS challenge_progression_group_isolation ON public.challenge_progression;
CREATE POLICY challenge_progression_group_isolation ON public.challenge_progression
  FOR ALL
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);

-- Recompute trigger: fires after every insert into challenge_history, and
-- after every soft-delete (deleted_at set). Always derives current/previous
-- tier from the latest remaining non-deleted row — never trusts a
-- separately-passed value.
CREATE OR REPLACE FUNCTION public.recompute_challenge_progression()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  latest RECORD;
BEGIN
  SELECT tier_after, tier_before, group_id
    INTO latest
    FROM public.challenge_history
   WHERE user_id = NEW.user_id
     AND challenge_type = NEW.challenge_type
     AND deleted_at IS NULL
   ORDER BY entry_date DESC, created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    -- No remaining (non-deleted) history for this user/challenge — there is
    -- no basis for a "current tier" anymore, so remove the progression row.
    DELETE FROM public.challenge_progression
     WHERE user_id = NEW.user_id
       AND challenge_type = NEW.challenge_type;
    RETURN NEW;
  END IF;

  INSERT INTO public.challenge_progression (group_id, user_id, challenge_type, current_tier, previous_tier, updated_at)
  VALUES (latest.group_id, NEW.user_id, NEW.challenge_type, latest.tier_after, latest.tier_before, now())
  ON CONFLICT (user_id, challenge_type)
  DO UPDATE SET
    current_tier  = EXCLUDED.current_tier,
    previous_tier = EXCLUDED.previous_tier,
    updated_at    = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_challenge_progression ON public.challenge_history;
CREATE TRIGGER trg_recompute_challenge_progression
  AFTER INSERT OR UPDATE OF deleted_at ON public.challenge_history
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_challenge_progression();
