-- =============================================================================
-- FIX TRIGGER NULL XP ASSIGNMENT ON DYNAMIC CUSTOM METRICS
-- =============================================================================

-- Correct award_xp_on_verify function logic to handle cases where slug does not exist in metrics_config
CREATE OR REPLACE FUNCTION public.award_xp_on_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_xp integer := 25;
  v_should_award boolean := false;
  v_should_deduct boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'verified' THEN
      v_should_award := true;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'verified' AND NEW.status = 'verified' THEN
      v_should_award := true;
    ELSIF OLD.status = 'verified' AND NEW.status <> 'verified' THEN
      v_should_deduct := true;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'verified' THEN
      v_should_deduct := true;
    END IF;
  END IF;

  IF v_should_award THEN
    v_xp := 25;
    SELECT xp_reward
      INTO v_xp
      FROM public.metrics_config
     WHERE slug = NEW.metric_slug
     LIMIT 1;
    IF v_xp IS NULL THEN
      v_xp := 25;
    END IF;

    UPDATE public.profiles
       SET total_xp      = total_xp + v_xp,
           current_level = floor(1 + sqrt(greatest(0, total_xp + v_xp)::float / 500)) + 1
     WHERE id = NEW.user_id;
  ELSIF v_should_deduct THEN
    v_xp := 25;
    SELECT xp_reward
      INTO v_xp
      FROM public.metrics_config
     WHERE slug = OLD.metric_slug
     LIMIT 1;
    IF v_xp IS NULL THEN
      v_xp := 25;
    END IF;

    UPDATE public.profiles
       SET total_xp      = greatest(0, total_xp - v_xp),
           current_level = floor(1 + sqrt(greatest(0, total_xp - v_xp)::float / 500)) + 1
     WHERE id = OLD.user_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
