-- =============================================================================
-- MIGRATION: 0039_add_streak_to_profiles.sql
-- Streak & Badge System: adds streak_count + last_reset_month to profiles,
-- and a push_subscriptions table for the PWA push notification skeleton.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS streak_count integer NOT NULL DEFAULT 0;

-- YYYY-MM of the last month this profile's streak was reset (text, not DATE,
-- since it's compared against a computed "current YYYY-MM" string, not a
-- real calendar date).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_reset_month text;

-- push_subscriptions: one row per browser/device subscription (a user can
-- have more than one, e.g. phone + desktop). Group-scoped like every other
-- table, RLS follows the established header-based policy pattern.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id   uuid        NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  endpoint   text        NOT NULL,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_group_id_idx ON public.push_subscriptions (group_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_group_isolation ON public.push_subscriptions;
CREATE POLICY push_subscriptions_group_isolation ON public.push_subscriptions
  FOR ALL
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);
