-- =============================================================================
-- MIGRATION: 0046_seed_challenge_tiers.sql
-- Clash of Clans-inspired Challenge Tier Progression Schema & Seeding
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.challenge_tiers (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid        REFERENCES public.groups(id) ON DELETE CASCADE,
  metric_slug   text        NOT NULL, -- 'push_ups', 'pull_ups', 'squats', 'plank'
  tier_number   integer     NOT NULL, -- 1-14
  target_value  numeric     NOT NULL, -- 5, 10, 15, 75, 100...
  unit          text,                 -- 'reps' | 'seconds'
  description   text        NOT NULL, -- "5 push-ups", "15 seconds", etc.
  daily_target  boolean     DEFAULT false, -- true if "in one whole day"
  sort_order    integer,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(group_id, metric_slug, tier_number)
);

-- Seed global challenge tiers (group_id IS NULL) for Push-ups, Pull-ups, Squats, and Plank
INSERT INTO public.challenge_tiers (group_id, metric_slug, tier_number, target_value, unit, description, daily_target, sort_order)
VALUES
  -- ── Push-ups (Reps) ────────────────────────────────────────────────────────
  (null, 'push_ups', 1, 5, 'reps', '5 push-ups', false, 1),
  (null, 'push_ups', 2, 10, 'reps', '10 push-ups', false, 2),
  (null, 'push_ups', 3, 15, 'reps', '15 push-ups', false, 3),
  (null, 'push_ups', 4, 20, 'reps', '20 push-ups', false, 4),
  (null, 'push_ups', 5, 30, 'reps', '30 push-ups', false, 5),
  (null, 'push_ups', 6, 40, 'reps', '40 push-ups', false, 6),
  (null, 'push_ups', 7, 75, 'reps', '75 push-ups', true, 7),
  (null, 'push_ups', 8, 100, 'reps', '100 push-ups', true, 8),
  (null, 'push_ups', 9, 150, 'reps', '150 push-ups', true, 9),
  (null, 'push_ups', 10, 200, 'reps', '200 push-ups', true, 10),
  (null, 'push_ups', 11, 250, 'reps', '250 push-ups', true, 11),
  (null, 'push_ups', 12, 300, 'reps', '300 push-ups', true, 12),
  (null, 'push_ups', 13, 400, 'reps', '400 push-ups', true, 13),
  (null, 'push_ups', 14, 500, 'reps', '500 push-ups', true, 14),

  -- ── Pull-ups (Reps) ────────────────────────────────────────────────────────
  (null, 'pull_ups', 1, 5, 'reps', '5 pull-ups', false, 1),
  (null, 'pull_ups', 2, 10, 'reps', '10 pull-ups', false, 2),
  (null, 'pull_ups', 3, 15, 'reps', '15 pull-ups', false, 3),
  (null, 'pull_ups', 4, 20, 'reps', '20 pull-ups', false, 4),
  (null, 'pull_ups', 5, 30, 'reps', '30 pull-ups', false, 5),
  (null, 'pull_ups', 6, 40, 'reps', '40 pull-ups', false, 6),
  (null, 'pull_ups', 7, 75, 'reps', '75 pull-ups', true, 7),
  (null, 'pull_ups', 8, 100, 'reps', '100 pull-ups', true, 8),
  (null, 'pull_ups', 9, 150, 'reps', '150 pull-ups', true, 9),
  (null, 'pull_ups', 10, 200, 'reps', '200 pull-ups', true, 10),
  (null, 'pull_ups', 11, 250, 'reps', '250 pull-ups', true, 11),
  (null, 'pull_ups', 12, 300, 'reps', '300 pull-ups', true, 12),
  (null, 'pull_ups', 13, 400, 'reps', '400 pull-ups', true, 13),
  (null, 'pull_ups', 14, 500, 'reps', '500 pull-ups', true, 14),

  -- ── Squats (Reps) ──────────────────────────────────────────────────────────
  (null, 'squats', 1, 5, 'reps', '5 squats', false, 1),
  (null, 'squats', 2, 10, 'reps', '10 squats', false, 2),
  (null, 'squats', 3, 15, 'reps', '15 squats', false, 3),
  (null, 'squats', 4, 20, 'reps', '20 squats', false, 4),
  (null, 'squats', 5, 30, 'reps', '30 squats', false, 5),
  (null, 'squats', 6, 40, 'reps', '40 squats', false, 6),
  (null, 'squats', 7, 75, 'reps', '75 squats', true, 7),
  (null, 'squats', 8, 100, 'reps', '100 squats', true, 8),
  (null, 'squats', 9, 150, 'reps', '150 squats', true, 9),
  (null, 'squats', 10, 200, 'reps', '200 squats', true, 10),
  (null, 'squats', 11, 250, 'reps', '250 squats', true, 11),
  (null, 'squats', 12, 300, 'reps', '300 squats', true, 12),
  (null, 'squats', 13, 400, 'reps', '400 squats', true, 13),
  (null, 'squats', 14, 500, 'reps', '500 squats', true, 14),

  -- ── Plank (Duration in Seconds) ───────────────────────────────────────────
  (null, 'plank', 1, 15, 'seconds', '15 seconds', false, 1),
  (null, 'plank', 2, 30, 'seconds', '30 seconds', false, 2),
  (null, 'plank', 3, 45, 'seconds', '45 seconds', false, 3),
  (null, 'plank', 4, 60, 'seconds', '1 minute', false, 4),
  (null, 'plank', 5, 75, 'seconds', '1:15', false, 5),
  (null, 'plank', 6, 90, 'seconds', '1:30', false, 6),
  (null, 'plank', 7, 105, 'seconds', '1:45', false, 7),
  (null, 'plank', 8, 120, 'seconds', '2:00', false, 8),
  (null, 'plank', 9, 150, 'seconds', '2:30', false, 9),
  (null, 'plank', 10, 180, 'seconds', '3:00', false, 10),
  (null, 'plank', 11, 210, 'seconds', '3:30', false, 11),
  (null, 'plank', 12, 240, 'seconds', '4:00', false, 12),
  (null, 'plank', 13, 270, 'seconds', '4:30', false, 13),
  (null, 'plank', 14, 300, 'seconds', '5:00', false, 14)
ON CONFLICT DO NOTHING;
