# 11 — Challenge Tiers & Clash of Clans Progression Architecture

> **Last updated:** 2026-07-22
> **Target Schema Table**: `public.challenge_tiers`, `public.challenge_progression`, `public.challenge_history`
> **Active Metrics**: Push-ups, Pull-ups, Squats, Plank (sec)
> **Tier Count**: 14 progressive tiers per metric

---

## 1. Overview

The Challenges tab features a Clash of Clans-inspired tier progression system where members unlock progressive achievement tiers (Tiers 1 to 14) for bodyweight exercises and time trials.

Key System Properties:
1. **Invisible Horizontal Scroller**: Metric selector pills (`Push-ups`, `Pull-ups`, `Squats`, `Plank (sec)`) with hidden scrollbars.
2. **Current Highest Record**: Displays personal best record with a `🔥` icon.
3. **Interactive Tier Checkboxes**: Checkboxes enable automatically when `currentHighest >= targetValue`. Completed tiers reorder to the bottom.
4. **Numeric Log Input**: Users submit numeric values to update personal best records.
5. **Soft-Deletable History**: History entries can be deleted (`deleted_at IS NOT NULL`), automatically triggering database triggers to recompute tier state.

---

## 2. Challenge Tier Definitions

### 2.1 Push-ups, Pull-ups & Squats (Reps)

| Tier | Target Value | Subtitle Label | Description |
|---|---|---|---|
| Tier 1 | 5 reps | Standard | 5 reps |
| Tier 2 | 10 reps | Standard | 10 reps |
| Tier 3 | 15 reps | Standard | 15 reps |
| Tier 4 | 20 reps | Standard | 20 reps |
| Tier 5 | 30 reps | Standard | 30 reps |
| Tier 6 | 40 reps | Standard | 40 reps |
| Tier 7 | 75 reps | `in one whole day` | 75 reps |
| Tier 8 | 100 reps | `in one whole day` | 100 reps |
| Tier 9 | 150 reps | `in one whole day` | 150 reps |
| Tier 10 | 200 reps | `in one whole day` | 200 reps |
| Tier 11 | 250 reps | `in one whole day` | 250 reps |
| Tier 12 | 300 reps | `in one whole day` | 300 reps |
| Tier 13 | 400 reps | `in one whole day` | 400 reps |
| Tier 14 | 500 reps | `in one whole day` | 500 reps |

### 2.2 Plank (Duration in Seconds)

| Tier | Target Value (Sec) | Description Label |
|---|---|---|
| Tier 1 | 15 sec | 15 seconds |
| Tier 2 | 30 sec | 30 seconds |
| Tier 3 | 45 sec | 45 seconds |
| Tier 4 | 60 sec | 1 minute |
| Tier 5 | 75 sec | 1:15 |
| Tier 6 | 90 sec | 1:30 |
| Tier 7 | 105 sec | 1:45 |
| Tier 8 | 120 sec | 2:00 |
| Tier 9 | 150 sec | 2:30 |
| Tier 10 | 180 sec | 3:00 |
| Tier 11 | 210 sec | 3:30 |
| Tier 12 | 240 sec | 4:00 |
| Tier 13 | 270 sec | 4:30 |
| Tier 14 | 300 sec | 5:00 |

---

## 3. Component Hierarchy

- **Orchestrator**: `ProgressionChallengePanel.tsx`
- **Subcomponents**:
  - `MetricPillSelector.tsx` (Horizontal pill tabs with scrollbar hidden)
  - `CurrentHighestCard.tsx` (Personal best hero card)
  - `ChallengeTierList.tsx` (14 tier item cards with checkboxes)
  - `LogValueInput.tsx` (Numeric value input + `LOG` button)
  - `ChallengeHistory.tsx` (History list + soft delete)
