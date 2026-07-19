-- =============================================================================
-- MIGRATION: 0022_migrate_long_run_to_top_golf.sql
-- Purpose:
--   Moves the one-time "long_run -> top_golf" metrics_config migration that
--   previously ran on every /dashboard render (app/dashboard/page.tsx) into a
--   proper, idempotent migration. See Findings_and_Recommendations.md PERF-02.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.metrics_config WHERE slug = 'top_golf') THEN
    -- Insert the top_golf config first.
    INSERT INTO public.metrics_config (slug, display_name, unit, sort_order, xp_reward)
    VALUES ('top_golf', 'Top Golf Shot', 'Yards', 'desc', 50);

    -- Migrate all existing metric_logs rows from long_run -> top_golf.
    UPDATE public.metric_logs
       SET metric_slug = 'top_golf',
           unit         = 'Yards'
     WHERE metric_slug = 'long_run';

    -- Drop the deprecated long_run config row.
    DELETE FROM public.metrics_config WHERE slug = 'long_run';
  END IF;
END $$;
