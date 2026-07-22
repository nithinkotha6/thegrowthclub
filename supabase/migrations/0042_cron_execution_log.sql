-- =============================================================================
-- MIGRATION: 0042_cron_execution_log.sql
-- Idempotency execution tracking table for cron jobs.
-- Prevents duplicate triggers from Vercel or external dispatchers.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cron_execution_log (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  cron_name      text        NOT NULL,
  group_id       uuid        REFERENCES public.groups(id) ON DELETE CASCADE,
  execution_date date        NOT NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz,
  status         text        NOT NULL, -- 'started' | 'completed' | 'failed'
  error_message  text,
  CONSTRAINT cron_execution_log_unique_key UNIQUE (cron_name, group_id, execution_date)
);

CREATE INDEX IF NOT EXISTS cron_execution_log_name_date_idx ON public.cron_execution_log (cron_name, execution_date);
CREATE INDEX IF NOT EXISTS cron_execution_log_group_idx ON public.cron_execution_log (group_id);

ALTER TABLE public.cron_execution_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_execution_log_group_isolation ON public.cron_execution_log;
CREATE POLICY cron_execution_log_group_isolation ON public.cron_execution_log
  FOR ALL
  USING (group_id IS NULL OR group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id IS NULL OR group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);
