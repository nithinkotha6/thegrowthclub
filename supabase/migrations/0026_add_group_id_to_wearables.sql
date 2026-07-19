-- =============================================================================
-- MIGRATION: 0026_add_group_id_to_wearables.sql
-- Purpose (ISO-06):
--   `wearable_connections` (and the `wearable_steps`/`wearable_sleep`/
--   `wearable_resting_hr` ledgers hanging off it) carry no `group_id`, so the
--   sync cron processes every connection in one global pass with no
--   per-tenant boundary. This adds `group_id` to `wearable_connections`
--   (backfilled from `group_members`) and scopes the three ledger tables'
--   RLS transitively through `connection_id`, mirroring the existing
--   `log_votes`/`memory_comments` subquery-based policy pattern from
--   0008_database_hardening_and_rls.sql — the ledger tables don't need their
--   own `group_id` column since they can never be read/written without a
--   `wearable_connections` row.
-- =============================================================================

ALTER TABLE public.wearable_connections ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups (id) ON DELETE CASCADE;

UPDATE public.wearable_connections wc
SET group_id = COALESCE(
  (SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = wc.user_id LIMIT 1),
  (SELECT id FROM public.groups ORDER BY created_at ASC LIMIT 1)
)
WHERE wc.group_id IS NULL;

ALTER TABLE public.wearable_connections ALTER COLUMN group_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS wearable_connections_group_id_idx ON public.wearable_connections (group_id);

-- Group-scoped RLS for wearable_connections and its ledger tables.
DROP POLICY IF EXISTS wearable_connections_group_isolation ON public.wearable_connections;
CREATE POLICY wearable_connections_group_isolation ON public.wearable_connections
  FOR ALL
  TO anon, authenticated
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);

DROP POLICY IF EXISTS wearable_steps_group_isolation ON public.wearable_steps;
CREATE POLICY wearable_steps_group_isolation ON public.wearable_steps
  FOR ALL
  TO anon, authenticated
  USING (
    connection_id IN (
      SELECT id FROM public.wearable_connections
      WHERE group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid
    )
  )
  WITH CHECK (
    connection_id IN (
      SELECT id FROM public.wearable_connections
      WHERE group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid
    )
  );

DROP POLICY IF EXISTS wearable_sleep_group_isolation ON public.wearable_sleep;
CREATE POLICY wearable_sleep_group_isolation ON public.wearable_sleep
  FOR ALL
  TO anon, authenticated
  USING (
    connection_id IN (
      SELECT id FROM public.wearable_connections
      WHERE group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid
    )
  )
  WITH CHECK (
    connection_id IN (
      SELECT id FROM public.wearable_connections
      WHERE group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid
    )
  );

DROP POLICY IF EXISTS wearable_resting_hr_group_isolation ON public.wearable_resting_hr;
CREATE POLICY wearable_resting_hr_group_isolation ON public.wearable_resting_hr
  FOR ALL
  TO anon, authenticated
  USING (
    connection_id IN (
      SELECT id FROM public.wearable_connections
      WHERE group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid
    )
  )
  WITH CHECK (
    connection_id IN (
      SELECT id FROM public.wearable_connections
      WHERE group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid
    )
  );
