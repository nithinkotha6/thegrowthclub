-- =============================================================================
-- MIGRATION: 0031_bot_moods_lookup.sql
-- DATA-05: Replace the hardcoded persistent_mood CHECK constraint with a
-- proper lookup table so new moods can be added via INSERT instead of a
-- schema migration. Settings UI reads this table for its mood picker.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.bot_moods (
  slug        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.bot_moods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role full access on bot_moods" ON public.bot_moods;
CREATE POLICY "Allow service role full access on bot_moods"
  ON public.bot_moods
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL PRIVILEGES ON TABLE public.bot_moods TO postgres, service_role;

-- Seed with the 5 moods currently allowed by the old CHECK constraint.
INSERT INTO public.bot_moods (slug, label) VALUES
  ('Normal',   'Normal'),
  ('Angry',    'Angry'),
  ('Sad',      'Sad'),
  ('Arrogant', 'Arrogant'),
  ('Sarcastic','Sarcastic')
ON CONFLICT (slug) DO NOTHING;

-- Drop the old CHECK constraint on persistent_mood (name assigned in 0021).
ALTER TABLE public.bot_persistent_state
  DROP CONSTRAINT IF EXISTS bot_persistent_state_persistent_mood_check;

-- Replace it with a FK into the new lookup table.
ALTER TABLE public.bot_persistent_state
  ADD CONSTRAINT bot_persistent_state_persistent_mood_fkey
  FOREIGN KEY (persistent_mood) REFERENCES public.bot_moods(slug);
