-- =============================================================================
-- MIGRATION: 0023_add_requires_verification_to_metrics_config.sql
-- Purpose:
--   Replace the hardcoded `(metric_slug === 'car_top_speed' || metric_slug ===
--   'most_beers')` peer-review check duplicated across app/actions/ingest.ts,
--   app/actions/logDirect.ts (x3), and app/api/telegram/route.ts with a single
--   DB-driven flag on metrics_config. See Findings_and_Recommendations.md DATA-02.
-- =============================================================================

ALTER TABLE public.metrics_config
  ADD COLUMN IF NOT EXISTS requires_verification BOOLEAN NOT NULL DEFAULT false;

UPDATE public.metrics_config
   SET requires_verification = true
 WHERE slug IN ('car_top_speed', 'most_beers');
