-- =============================================================================
-- MIGRATION: 0035_add_requires_verification_to_metric_definitions.sql
-- Custom metrics (metric_definitions, created via the Settings tab) never had
-- a way to opt into peer-review verification — only the two built-in
-- metrics_config rows (car_top_speed, most_beers) could require it, and only
-- by a hardcoded seed value. This lets an admin tick "Requires verification"
-- when creating (or later editing) any custom metric, same as the existing
-- built-in flag on metrics_config (migration 0023).
-- =============================================================================

ALTER TABLE public.metric_definitions
  ADD COLUMN IF NOT EXISTS requires_verification BOOLEAN NOT NULL DEFAULT false;
