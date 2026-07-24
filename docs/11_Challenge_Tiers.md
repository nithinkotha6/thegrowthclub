# 11 — Progressive Challenge Tiers & Flame Effect Architecture

> **Last updated:** 2026-07-23
> **Target Schema Tables**: `public.challenge_tiers`, `public.tier_completions`, `public.challenge_progression`, `public.challenge_history`
> **Active Metrics**: Push-ups, Pull-ups, Squats, Plank (sec)
> **Tier Count**: 14 progressive tiers per metric

---

## 1. Overview

The Challenges tab features a progressive tier unlocking system where tiers are revealed one-at-a-time as users complete each milestone.

Key System Improvements:
1. **Dynamic Tier Reordering & Reveal**:
   - Incomplete tiers are displayed at the top in ascending order.
   - When a tier checkbox is tapped, that tier moves down to the "Completed Milestones" section at the bottom.
2. **Exact Tier Completion (`tier_completions`)**:
   - Tapping a tier checkbox logs that exact tier's target value and records it in `public.tier_completions`.
   - Logging a value only marks the exact tier matching that target value.
3. **Milestone History Format**:
   - History entries are formatted as milestone achievements (`40 Push-ups done 🎯` or `15 seconds done 🎯`) instead of transition values (`0 → 40`).
4. **Realistic Flame Animation & Side Position**:
   - Flame icon is placed to the right of the personal best record (e.g. `40 🔥`).
   - Uses `@keyframes fireBurn` CSS animation with scaleY/scaleX pulse, hue rotation (-10deg to 5deg), and brightness flicker.

---

## 2. Data Model

### `public.tier_completions` Table

```sql
CREATE TABLE IF NOT EXISTS public.tier_completions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id      uuid        REFERENCES public.groups(id) ON DELETE CASCADE,
  metric_slug   text        NOT NULL, -- 'push_ups', 'pull_ups', 'squats', 'plank'
  tier_number   integer     NOT NULL, -- 1-14
  tier_value    numeric     NOT NULL, -- e.g., 40 for "40 push-ups"
  completed_at  timestamptz DEFAULT now(),
  deleted_at    timestamptz,          -- soft-delete for history removal
  UNIQUE(user_id, group_id, metric_slug, tier_number)
);
```

---

## 3. Component Hierarchy

- **Orchestrator**: `ProgressionChallengePanel.tsx`
- **Subcomponents**:
  - `MetricPillSelector.tsx` (Horizontal pill tabs with scrollbar hidden)
  - `CurrentHighestCard.tsx` (Record display with `40 🔥` and `@keyframes fireBurn` animation)
  - `ChallengeTierList.tsx` (Incomplete tiers at top, completed tiers at bottom)
  - `LogValueInput.tsx` (Numeric value input + `LOG` button)
  - `ChallengeHistory.tsx` (`X reps done 🎯` milestone list + soft delete)
