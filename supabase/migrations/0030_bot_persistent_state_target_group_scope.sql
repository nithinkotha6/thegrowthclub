-- =============================================================================
-- MIGRATION: 0030_bot_persistent_state_target_group_scope.sql
-- DATA-04: Enforce at the database level that
-- bot_persistent_state.target_user_id (when set) belongs to the same
-- group_id as the row it's attached to. The app layer already checks this
-- (see verifyUserInGroup in app/actions/admin.ts) — this trigger adds
-- defense-in-depth for any future/direct write path.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_bot_persistent_state_target_in_group()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.target_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.group_members
       WHERE user_id = NEW.target_user_id
         AND group_id = NEW.group_id
    ) THEN
      RAISE EXCEPTION 'target_user_id % is not a member of group_id %', NEW.target_user_id, NEW.group_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bot_persistent_state_target_in_group ON public.bot_persistent_state;

CREATE TRIGGER trg_bot_persistent_state_target_in_group
  BEFORE INSERT OR UPDATE ON public.bot_persistent_state
  FOR EACH ROW
  EXECUTE FUNCTION public.check_bot_persistent_state_target_in_group();
