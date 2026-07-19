-- =============================================================================
-- DATA-01: metric_logs.metric_slug currently overloads "built-in catalog slug"
-- OR "metric_definitions UUID (custom metric)" with no FK, validated only in
-- application code. Add a real FK column for the custom-metric case so the
-- reference is DB-enforced going forward; metric_slug is kept as-is for the
-- built-in catalog and for existing rows/read paths (additive, no breakage).
-- =============================================================================

-- 1. Add the nullable FK column.
ALTER TABLE public.metric_logs
  ADD COLUMN IF NOT EXISTS metric_definition_id uuid REFERENCES public.metric_definitions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS metric_logs_metric_definition_id_idx ON public.metric_logs (metric_definition_id);

-- 2. Backfill: any existing row whose metric_slug is actually a UUID that
-- matches a metric_definitions.id (i.e. a custom metric logged under the old
-- overloaded column) gets metric_definition_id populated.
UPDATE public.metric_logs ml
SET metric_definition_id = md.id
FROM public.metric_definitions md
WHERE ml.metric_definition_id IS NULL
  AND ml.metric_slug ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND md.id = ml.metric_slug::uuid;
