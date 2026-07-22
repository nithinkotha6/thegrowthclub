-- =============================================================================
-- MIGRATION: 0043_challenge_league_unique_constraints.sql
-- Adds composite UNIQUE indexes on public.challenge_history and
-- public.league_match_logs to prevent duplicate submissions from double-clicks
-- or network retries while allowing legitimate logging on distinct dates or values.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS challenge_history_unique_per_user_day_value
  ON public.challenge_history (user_id, challenge_type, ((entry_date AT TIME ZONE 'UTC')::date), tier_after)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS league_match_logs_unique_per_match_user_action_day
  ON public.league_match_logs (match_id, actor_id, action, ((created_at AT TIME ZONE 'UTC')::date));
