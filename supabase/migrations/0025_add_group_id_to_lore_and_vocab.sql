-- =============================================================================
-- MIGRATION: 0025_add_group_id_to_lore_and_vocab.sql
-- Purpose (ISO-04):
--   `member_lore` and `vocab_banks` currently have no `group_id` column, so
--   isolation for both tables depends on every caller remembering to join
--   through `profiles`/`group_members` (member_lore) or not existing at all
--   (vocab_banks). This adds a first-class `group_id` column to both tables,
--   backfills existing rows, and rewrites RLS to the same group-scoped
--   pattern used by `metric_logs`/`memories` (see 0008_database_hardening).
-- =============================================================================

-- 1. member_lore: add group_id, backfill from the user's group_members row
--    (falling back to the oldest group if a profile has no membership row,
--    which should not happen in practice but keeps the NOT NULL backfill safe).
ALTER TABLE public.member_lore ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups (id) ON DELETE CASCADE;

UPDATE public.member_lore ml
SET group_id = COALESCE(
  (SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = ml.user_id LIMIT 1),
  (SELECT id FROM public.groups ORDER BY created_at ASC LIMIT 1)
)
WHERE ml.group_id IS NULL;

ALTER TABLE public.member_lore ALTER COLUMN group_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS member_lore_group_id_idx ON public.member_lore (group_id);

-- 2. vocab_banks: add group_id, backfill any existing (admin-authored) rows to
--    the oldest group, then replace the global (tone, target_gender) unique
--    constraint with a per-group one so each tenant can maintain its own bank.
ALTER TABLE public.vocab_banks ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups (id) ON DELETE CASCADE;

UPDATE public.vocab_banks v
SET group_id = (SELECT id FROM public.groups ORDER BY created_at ASC LIMIT 1)
WHERE v.group_id IS NULL
  AND EXISTS (SELECT 1 FROM public.groups);

DELETE FROM public.vocab_banks WHERE group_id IS NULL;

ALTER TABLE public.vocab_banks ALTER COLUMN group_id SET NOT NULL;

ALTER TABLE public.vocab_banks DROP CONSTRAINT IF EXISTS vocab_banks_tone_target_gender_key;
ALTER TABLE public.vocab_banks DROP CONSTRAINT IF EXISTS vocab_banks_group_id_tone_target_gender_key;
ALTER TABLE public.vocab_banks ADD CONSTRAINT vocab_banks_group_id_tone_target_gender_key UNIQUE (group_id, tone, target_gender);

CREATE INDEX IF NOT EXISTS vocab_banks_group_id_idx ON public.vocab_banks (group_id);

-- 3. Rewrite RLS to the group-scoped header pattern used elsewhere.
DROP POLICY IF EXISTS "Allow read/write for group members" ON public.member_lore;
DROP POLICY IF EXISTS member_lore_group_isolation ON public.member_lore;
CREATE POLICY member_lore_group_isolation ON public.member_lore
  FOR ALL
  TO anon, authenticated
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);

DROP POLICY IF EXISTS "Allow read/write for authenticated users" ON public.vocab_banks;
DROP POLICY IF EXISTS vocab_banks_group_isolation ON public.vocab_banks;
CREATE POLICY vocab_banks_group_isolation ON public.vocab_banks
  FOR ALL
  TO anon, authenticated
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);
