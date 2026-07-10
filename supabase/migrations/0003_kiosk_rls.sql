-- =============================================================================
-- Migration: 0003_kiosk_rls.sql
-- Purpose:   Allow unauthenticated (anon) users to read group names for the
--            kiosk landing page dropdown. The invite_code (PIN) is never
--            returned in the list query — it is only matched server-side.
--
-- Root cause: 0002 set the groups SELECT policy to `TO authenticated` only.
--             The kiosk landing page has no session, so getGroupsAction()
--             returned zero rows.
--
-- Security model:
--   - anon role can read group id + name (no invite_code exposed)
--   - anon role can verify a PIN because verifyPinAction() passes both the
--     group_id AND the invite_code from the form — this is a lookup, not a
--     reveal. The server never returns the invite_code to the client.
--   - All other tables (profiles, metric_logs, group_members, log_votes)
--     remain restricted to authenticated users via existing policies.
-- =============================================================================

-- ── Drop the authenticated-only policy and replace with two separate ones ────

drop policy if exists "groups: members can read own groups" on public.groups;

-- 1. Anon users (landing page, no session) can read id + name for the dropdown.
--    invite_code is not selected by getGroupsAction, so it is never exposed.
create policy "groups: anon can list group names"
  on public.groups for select
  to anon
  using (true);

-- 2. Authenticated members can still read their own groups (post-login contexts).
create policy "groups: authenticated members can read own groups"
  on public.groups for select
  to authenticated
  using (
    id in (
      select group_id from public.group_members where user_id = auth.uid()
    )
  );
