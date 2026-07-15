-- ---------------------------------------------------------------------------
-- ALTER TABLE: group_members
-- Add role column to group_members table to support admin controls.
-- ---------------------------------------------------------------------------
ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS role text DEFAULT 'member';

-- ---------------------------------------------------------------------------
-- TABLE: system_settings
-- Global configuration parameters (e.g. AI bot kill switch).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Enable RLS and grant access
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access on system_settings"
  ON public.system_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow select to anonymous users
CREATE POLICY "Allow select on system_settings to anonymous"
  ON public.system_settings
  FOR SELECT
  TO anon
  USING (true);
