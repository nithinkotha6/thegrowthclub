-- =============================================================================
-- MIGRATION: 0040_metrics_config_is_hidden.sql
-- Lets admins manage the built-in dashboard metrics (Top Golf, Weight, etc.)
-- the same way custom metric_definitions are already managed: hide/show +
-- rename display_name/unit. Adds is_hidden, and reconciles metrics_config's
-- rows with the actual slugs shown on the dashboard (lib/metrics.ts
-- METRIC_PILLS) — the original 0001 seed used a different, unused set of
-- slugs (deadlift, calories, squat, etc.) that were never wired to any UI;
-- those rows are left untouched (harmless, not referenced by app code) and
-- the real dashboard slugs are added/synced alongside them.
-- =============================================================================

ALTER TABLE public.metrics_config
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

INSERT INTO public.metrics_config (slug, display_name, unit, sort_order, xp_reward)
VALUES
  ('top_golf',          'Top Golf Shot',     'Yards',  'desc', 50),
  ('steps',     'Steps',     'steps',  'desc', 25),
  ('run',          'Run',          'miles',    'desc', 25),
  ('Top_Speed',     'Top Speed',     'mph',    'desc', 25),
  ('underwater_swim',   'Underwater Swim',   'meters', 'desc', 25),
  ('most_beers',        'Most Beers',        'beers',  'desc', 25),
  ('catan_wins',        'Catan Wins',        'wins',   'desc', 25),
  ('national_parks',    'National Parks',    'parks',  'desc', 25)
ON CONFLICT (slug) DO NOTHING;
