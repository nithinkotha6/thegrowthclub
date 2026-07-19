-- =============================================================================
-- MIGRATION: 0029_chat_history_prompt_version.sql
-- AGENT-06: Track which prompt/persona version generated each assistant
-- reply so persona tuning can be correlated with chat_history rows.
-- =============================================================================

ALTER TABLE public.chat_history
  ADD COLUMN IF NOT EXISTS prompt_version TEXT;
