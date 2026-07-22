# Streaks System Specification & Implementation Guide

## Overview

The Streaks system tracks consecutive daily activity logging by group members. Every profile contains a `streak_count` integer representing the number of consecutive days on which the user has logged at least one activity in their group.

---

## Architecture & Calculation Logic

### 1. Trigger & Integration Points
When an activity is logged via:
- Direct manual logging (`app/actions/logDirect.ts` — `logDirectActivity` and `logActivityManual`)
- AI natural language ingestion (`app/actions/ingest.ts` — `ingestActivity`)

The application invokes `incrementStreakIfContinuous(userId, groupId)` defined in [`lib/actions/updateStreak.ts`](file:///d:/Nithinkotha6-Git/The-Growth-Hub-App/thegrowthclub/lib/actions/updateStreak.ts) immediately following the successful insertion into `metric_logs`.

### 2. Continuation & Reset Rules
For a user logging an activity on local date **DATE X**:
- **First activity ever / after reset**: If the user has no prior activity before DATE X, `streak_count` is set to **1**.
- **Continuation (DATE X - 1)**: If the user's previous activity was logged on **DATE X - 1** (yesterday), `streak_count` is incremented by **1** (`streak_count += 1`).
- **Same Day Logging (DATE X)**: If the user logs multiple activities on the same local date (DATE X), `streak_count` remains **unchanged**.
- **Missed Day Reset (DATE X - N where N >= 2)**: If the user skipped one or more calendar days, `streak_count` resets to **1** starting a new streak.

---

## Timezone Boundary Handling

- **Local Timezone Boundary**: Streak calculations evaluate "day boundaries" using midnight in the user's local timezone, rather than UTC.
- **Timezone Resolution**:
  - `incrementStreakIfContinuous` checks `profile.timezone` (if populated in future schema updates).
  - Falls back to `process.env.APP_TIMEZONE` or `'UTC'` if unconfigured.
- **Formatting**: `getLocalDateString(date, timezone)` uses `Intl.DateTimeFormat('en-CA', { timeZone })` to guarantee accurate `YYYY-MM-DD` day bucketing across global timezones.
- **Example**: An activity logged at 11:00 PM PST on July 21 (which corresponds to 06:00 AM UTC on July 22) is correctly attributed to July 21 PST.

---

## Monthly Reset Cron

- **Cron Route**: [`app/api/cron/reset-monthly-streaks/route.ts`](file:///d:/Nithinkotha6-Git/The-Growth-Hub-App/thegrowthclub/app/api/cron/reset-monthly-streaks/route.ts)
- **Schedule**: Executes on the 1st of every month at 00:00 UTC.
- **Behavior**: Sets `profiles.streak_count = 0` and stamps `profiles.last_reset_month = YYYY-MM`.
- **Re-accumulation**: Resetting `streak_count` to 0 allows monthly leaderboard competition. When a user logs their first activity in the new month, `incrementStreakIfContinuous` initializes their streak at 1, which then accumulates daily throughout the month.

---

## Key Files

| Component | Path | Description |
| --- | --- | --- |
| Core Calculation | [`lib/actions/updateStreak.ts`](file:///d:/Nithinkotha6-Git/The-Growth-Hub-App/thegrowthclub/lib/actions/updateStreak.ts) | Timezone-aware continuous streak calculation & DB update logic |
| Direct Ingestion | [`app/actions/logDirect.ts`](file:///d:/Nithinkotha6-Git/The-Growth-Hub-App/thegrowthclub/app/actions/logDirect.ts) | Server action post-insert streak update integration |
| AI Ingestion | [`app/actions/ingest.ts`](file:///d:/Nithinkotha6-Git/The-Growth-Hub-App/thegrowthclub/app/actions/ingest.ts) | AI prompt log post-insert streak update integration |
| Monthly Reset Cron | [`app/api/cron/reset-monthly-streaks/route.ts`](file:///d:/Nithinkotha6-Git/The-Growth-Hub-App/thegrowthclub/app/api/cron/reset-monthly-streaks/route.ts) | Monthly 1st-of-month streak reset endpoint |
| Unit & Integration Tests | [`__tests__/streak.test.ts`](file:///d:/Nithinkotha6-Git/The-Growth-Hub-App/thegrowthclub/__tests__/streak.test.ts) | Test suite verifying continuation, reset, same-day, and timezone edge cases |

---

## Revision Log

| Date | Author / Role | Changes |
| --- | --- | --- |
| 2026-07-22 | Streaks Feature Engineer | Initial document creation following end-to-end implementation of `streak_count` increment logic, timezone-aware day boundary formatting, unit/integration test suite, and monthly reset integration. |
