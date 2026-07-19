-- =============================================================================
-- MIGRATION: 0032_lore_vocab_rls_lockdown.sql
-- DATA-06: member_lore and vocab_banks previously had `FOR ALL USING (true)`
-- policies with no `TO` clause, granting anon/authenticated open read/write.
-- Both tables are only ever accessed via service-role Server Actions, so
-- lock them down to service_role only — matching the pattern already used
-- by chat_history (0009) and bot_persistent_state (0017).
-- =============================================================================

-- member_lore
DROP POLICY IF EXISTS "Allow read/write for group members" ON public.member_lore;
CREATE POLICY "Allow service role full access on member_lore"
  ON public.member_lore
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
REVOKE ALL ON TABLE public.member_lore FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.member_lore TO postgres, service_role;

-- vocab_banks
DROP POLICY IF EXISTS "Allow read/write for authenticated users" ON public.vocab_banks;
CREATE POLICY "Allow service role full access on vocab_banks"
  ON public.vocab_banks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
REVOKE ALL ON TABLE public.vocab_banks FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.vocab_banks TO postgres, service_role;
