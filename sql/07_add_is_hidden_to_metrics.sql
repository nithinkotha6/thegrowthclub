-- 1. Add is_hidden column to metric_definitions
ALTER TABLE public.metric_definitions ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- 2. Create performance index
CREATE INDEX IF NOT EXISTS metric_definitions_is_hidden_idx ON public.metric_definitions(is_hidden);
