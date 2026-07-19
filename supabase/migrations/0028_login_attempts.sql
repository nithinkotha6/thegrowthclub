-- =============================================================================
-- LOGIN ATTEMPT THROTTLING (PIN brute-force defense)
-- =============================================================================
-- Tracks failed PIN attempts per (group, ip) so loginWithPersonalPinAction can
-- lock out an ip after too many wrong PINs in a short window, in addition to
-- the existing per-request delay.

CREATE TABLE IF NOT EXISTS public.login_attempts (
  group_id uuid NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  ip text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1,
  first_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  PRIMARY KEY (group_id, ip)
);

CREATE INDEX IF NOT EXISTS login_attempts_locked_until_idx ON public.login_attempts (locked_until);

-- Only the server-side service-role client (which bypasses RLS) ever reads or
-- writes this table from loginWithPersonalPinAction; no anon/authenticated
-- policy is defined, so RLS denies all client-side access by default.
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
