-- =============================================================================
-- DYNAMIC METRICS DEFINITIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.metric_definitions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  unit text NOT NULL,
  sort_direction text NOT NULL CHECK (sort_direction IN ('asc', 'desc')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.metric_definitions ENABLE ROW LEVEL SECURITY;
