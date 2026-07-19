-- =============================================================================
-- MIGRATION: 0024_add_deleted_at_to_groups.sql
-- Purpose:
--   Adds soft-delete support to `groups`, enabling `adminDeleteGroup` (see
--   Findings_and_Recommendations.md ISO-01) to deactivate a group without
--   destroying its historical data (metric_logs, chat_history, etc.).
-- =============================================================================

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS groups_deleted_at_idx ON public.groups (deleted_at);
