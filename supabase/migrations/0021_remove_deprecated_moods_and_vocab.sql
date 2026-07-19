-- =============================================================================
-- MIGRATION: 0021_remove_deprecated_moods_and_vocab.sql
-- Purpose:
--   1. Restrict `bot_persistent_state.persistent_mood` to a smaller set.
--      Removes: 'Horny', 'Happy', 'Flirting', 'Romantic'
--      Keeps:   'Normal', 'Angry', 'Sad', 'Arrogant', 'Sarcastic'
--   2. Blank the `vocab_banks` seed rows so the table starts empty; the app
--      no longer ships any hard-coded slang vocabulary.
-- =============================================================================

-- 1. Backfill any existing rows carrying a removed mood back to 'Normal'.
UPDATE public.bot_persistent_state
   SET persistent_mood = 'Normal',
       updated_at      = now()
 WHERE persistent_mood IN ('Horny', 'Happy', 'Flirting', 'Romantic');

-- 2. Drop the previous CHECK constraint on persistent_mood (name assigned by PG).
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.bot_persistent_state'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%persistent_mood%'
  LOOP
    EXECUTE format('ALTER TABLE public.bot_persistent_state DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

-- 3. Re-add the CHECK with the reduced mood set (named for easy future replacement).
ALTER TABLE public.bot_persistent_state
  ADD CONSTRAINT bot_persistent_state_persistent_mood_check
  CHECK (persistent_mood IN ('Normal', 'Angry', 'Sad', 'Arrogant', 'Sarcastic'));

-- 4. Clear all seeded vocabulary. The table remains available for admin-authored
--    entries via the Settings UI; nothing ships in code.
DELETE FROM public.vocab_banks;
