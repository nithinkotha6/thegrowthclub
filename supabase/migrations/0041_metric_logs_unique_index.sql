-- =============================================================================
-- MIGRATION: 0041_metric_logs_unique_index.sql
-- Adds a composite UNIQUE index on public.metric_logs to prevent accidental
-- duplicate activity records from double-clicks or network retries while
-- allowing intentional re-logging of the same metric at different dates or values.
-- =============================================================================

ALTER TABLE public.metric_logs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS metric_logs_unique_per_user_time_value
  ON public.metric_logs (user_id, metric_slug, (logged_at AT TIME ZONE 'UTC')::date, value)
  WHERE deleted_at IS NULL;
