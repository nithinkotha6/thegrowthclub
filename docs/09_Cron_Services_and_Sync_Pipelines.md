# 09 — Cron Services & Sync Pipelines

> **Last updated:** 2026-07-19
> **Schedules**: Declared in vercel.json
> **Auth**: Header validation (`Authorization: Bearer <CRON_SECRET>`)
> **Source of Truth**: [vercel.json](../vercel.json), [app/api/cron/](../app/api/cron)

### Revision Log
| Date | Commit | Sections Touched | Summary |
|---|---|---|---|
| 2026-07-18 | fa4c8bb | §1.2 (rewritten), §5–§8 (new) | Correct Google Health v4 endpoints (previous doc described the deprecated Google Fitness API v1 shape — wrong URL, wrong request body). Add Part 4.3 required Service Inventory table (§5), Cost Projections (§6 — `[VERIFY]`-flagged), Billing Risk Flags (§7), Deployment Pipeline (§8). |
| 2026-07-18 | (post-fa4c8bb) | §3.2 | `ai-bookie` challenge-tone description changed from "Hyderabadi slang" to "casual friend-group tone" to reflect the neutralized agent prompts. |
| 2026-07-18 | (wearables accuracy pass) | §1.1 (title), §1.3 (rewritten) | §1.3 replaced: WHOOP now syncs via the real WHOOP API v2 OAuth flow (`/api/wearables/connect/whoop`, `/api/wearables/callback/whoop`), not a mock generator. WHOOP never writes `wearable_steps` (the hardware has no step-count metric). Added §1.4 documenting the new `WEARABLE_KEY_<PROVIDER>_<NICKNAME>` env-var fallback connection mechanism. |
| 2026-07-19 | (Documentation audit) | §0 (new), §5 (new), §6-§9 (renumbered), §7 | Added §0, a single canonical cron-schedule table — the source of truth referenced by `01_Architecture_and_App_Structure.md` §8 instead of a duplicated table there. Added §5 documenting the two new streak-related crons (`reset-monthly-streaks`, `monthly-summary`), shifting Service Inventory/Cost Projections/Billing-Risk/Deployment Pipeline from §5-§8 to §6-§9. Removed the stale Telegram Bot API cost row from §7 (integration fully removed from the codebase in an earlier pass). |

---

## 0. Cron Schedule Summary

Single source of truth for all cron schedules — do not duplicate this table elsewhere; link to this section instead.

| Job | Path | Schedule (UTC) | Status | Authorization |
|---|---|---|---|---|
| Daily Whistle | `/api/cron/daily-whistle` | `0 3 * * *` (03:00 daily) | Active | `Bearer CRON_SECRET` |
| Wearables Sync | `/api/cron/sync-wearables` | `0 0 * * *` (midnight daily) | Active | `Bearer CRON_SECRET` |
| Reset Monthly Streaks | `/api/cron/reset-monthly-streaks` | `0 0 1 * *` (1st of month, midnight) | Active | `Bearer CRON_SECRET` |
| Monthly Summary | `/api/cron/monthly-summary` | `0 1 1 * *` (1st of month, 01:00) | Active | `Bearer CRON_SECRET` |
| AI Bookie | `/api/cron/ai-bookie` | `0 13 * * 1` (13:00 Monday) | **Dormant** — route exists, not scheduled in `vercel.json` | `Bearer CRON_SECRET` |
| WhatsApp Digest | `/api/cron/whatsapp-digest` | `0 12 * * *` (12:00 daily) | **Dormant** — route exists, not scheduled in `vercel.json`; the equivalent GitHub Actions workflow (`.github/workflows/whatsapp-digest.yml`) is also manual-trigger-only, by the same deliberate "one daily broadcast only" decision | `Bearer CRON_SECRET` |

All cron handlers validate `Authorization: Bearer <CRON_SECRET>` via `safeCompare()`. A supplementary GitHub Actions workflow (`.github/workflows/sync-wearables.yml`) also calls `/api/cron/sync-wearables` every 6 hours (Vercel Hobby plans only allow daily-granularity crons) — see `Admin_to_do.md` §5 for the required `APP_BASE_URL`/`CRON_SECRET` repo secrets.

---

## 1. Wearables Sync Engine (`/api/cron/sync-wearables`)

Source: [cron/sync-wearables/route.ts](../app/api/cron/sync-wearables/route.ts)

Executes daily at 00:00 UTC. Iterates active rows in `wearable_connections` to synchronize Google Health/Fitbit and WHOOP metrics.

### 1.1 Google OAuth2 Token Refresh Flow

For Google Health API v4 connections, the engine checks expiration constraints:
1. Compares current time with `expires_at` (stored in `wearable_connections`).
2. If the token has expired or will expire within 5 minutes (300,000ms):
   - Dispatches a POST request to `https://oauth2.googleapis.com/token`.
   - Body payload:
     ```json
     {
       "client_id": "GOOGLE_CLIENT_ID",
       "client_secret": "GOOGLE_CLIENT_SECRET",
       "refresh_token": "Stored Refresh Token",
       "grant_type": "refresh_token"
     }
     ```
   - On success:
     - Updates `access_token` with new value.
     - Updates `expires_at` based on the returned `expires_in` value.
     - Saves updated credentials to `wearable_connections` in database.

### 1.2 Google Health API v4 Sync Workflow

Once authorization is verified:
1. Determine Sync Window:
   - If `backfill_completed = false`: Syncs from `2026-01-01T00:00:00.000Z` (`new Date(2026, 0, 1, 0, 0, 0, 0)`) to current time. (source: `app/api/cron/sync-wearables/route.ts` L133-140)
   - If `backfill_completed = true`: Routine sync targets from start of today `00:00:00` in server local time to current time.
2. Chunk Windows:
   - Chunks query range into 30-day blocks (`MAX_CHUNK_DAYS = 30`, L214-215).
   - Prevents `INVALID_ROLLUP_QUERY_DURATION` API limits.
3. Fetch Step Metrics (uses **daily rollup** endpoint):
   - Endpoint: `POST https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp`
   - Body:
     ```json
     {
       "range": {
         "start": { "date": { "year": <chunkStartYear>, "month": <chunkStartMonth1-12>, "day": <chunkStartDay> }, "time": { "hours": 0, "minutes": 0, "seconds": 0 } },
         "end":   { "date": { "year": <chunkEndYear>,   "month": <chunkEndMonth1-12>,   "day": <chunkEndDay>   }, "time": { "hours": 0, "minutes": 0, "seconds": 0 } }
       }
     }
     ```
   - Extraction: `point.value.steps.countSum` per bucket, keyed by `YYYY-MM-DD` from `point.start.date` / `point.range.start.date`.
4. Fetch Sleep Metrics (uses **filter GET** endpoint):
   - Endpoint: `GET https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints?filter=sleep.interval.end_time%20>=%20"<ISO>"%20AND%20sleep.interval.end_time%20<%20"<ISO>"`
   - Extraction: `point.value.sleep.durationSum` (or `duration`, `durationSeconds`, `totalDurationSeconds` — defensive fallback), converted to hours; multiple points for the same day are summed.
5. Fetch Resting Heart Rate Metrics (uses **daily rollup** endpoint):
   - Endpoint: `POST https://health.googleapis.com/v4/users/me/dataTypes/daily-resting-heart-rate/dataPoints:dailyRollUp`
   - Body: identical shape to steps request.
   - Extraction: `point.value['daily-resting-heart-rate'].bpm` (or `.restingHeartRate` — defensive fallback), rounded to integer.
6. OAuth Scope Verification (soft):
   - Before syncing, calls `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=...` and logs a CRITICAL warning if the scope `googlehealth.activity_and_fitness.readonly` is absent (source: `route.ts` L102-125).
7. DB Persistence & De-duplication:
   - Payloads compiled into arrays; committed in three separate `UPSERT`s with `onConflict: 'user_id,logged_date'` against `wearable_steps`, `wearable_sleep`, `wearable_resting_hr`.
   - Only if `!hasApiError && !hasDbError && !isEmptyData` is `backfill_completed` flipped to `true` (source: `route.ts` L389-403).
   - `last_synced_at` is set to `now()` regardless of empty-data outcome.

> Historical note: The prior version of this doc described the deprecated **Google Fitness API v1** (`https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate` + `startTimeMillis`/`endTimeMillis` body). The current code uses **Google Health API v4** exclusively (`health.googleapis.com/v4/...`) with a `range.start.date` / `range.end.date` body. All Fitness v1 references were incorrect.

### 1.3 WHOOP Sync (real API)

For connections matching provider `whoop`, the engine calls the real WHOOP API v2 (source: [cron/sync-wearables/route.ts](../app/api/cron/sync-wearables/route.ts) `syncWhoop`, `refreshWhoopAccessToken`):
- **Auth**: OAuth 2.0 per [developer.whoop.com/docs/developing/oauth](https://developer.whoop.com/docs/developing/oauth) — authorize URL `https://api.prod.whoop.com/oauth/oauth2/auth`, token URL `https://api.prod.whoop.com/oauth/oauth2/token`. Scopes: `read:recovery read:sleep offline`. Access tokens expire in ~1 hour; refreshed proactively (same 5-minute-early pattern as Google) via `refreshWhoopAccessToken`, which also persists the rotated `refresh_token` — WHOOP invalidates the previous one on every refresh.
- **Sync window**: `backfill_completed = false` → from `2026-01-01` to now; otherwise the last 2 days (covers a device that hasn't synced with the WHOOP app in a day or two).
- **Data fetched**: `GET /v2/recovery` (paginated via `next_token`) for `resting_heart_rate` → `wearable_resting_hr`; `GET /v2/activity/sleep` for `score.stage_summary` (`total_light_sleep_time_milli` + `total_slow_wave_sleep_time_milli` + `total_rem_sleep_time_milli`, converted ms → hours) → `wearable_sleep`. Nap records and non-`SCORED` records are excluded.
- **`wearable_steps` is intentionally never written for WHOOP connections** — WHOOP hardware (3.0/4.0/5.0/MG, all of which share this same API with no per-model variation) has no accelerometer-based step-count metric, so fabricating one would be inaccurate.
- De-duplication: Upserts rows targeting `(user_id, logged_date)`.
- Updates connection status: `backfill_completed` flips to `true` only if no API/DB error and at least one row was extracted; `last_synced_at` always updates.

### 1.4 Per-User Env-Var Fallback Connections

Source: [cron/sync-wearables/route.ts](../app/api/cron/sync-wearables/route.ts) `provisionEnvFallbackConnections`.

The self-service "Connect Fitbit"/"Connect Whoop" buttons ([dashboard/wearables](../app/dashboard/wearables/page.tsx) → `components/WearablesClientPage.tsx`) are the default way a member links a device — no code change needed per person. As a secondary override, a member can instead provide a refresh token obtained manually from that provider's OAuth flow via a Vercel env var named:

```
WEARABLE_KEY_<PROVIDER>_<NICKNAME>
```

`<PROVIDER>` is `WHOOP` or `FITBIT`; `<NICKNAME>` is the member's `profiles.nickname` (falls back to `full_name`), upper-cased with non-`[A-Z0-9]` characters stripped (e.g. `WEARABLE_KEY_WHOOP_NITHIN`). On each cron run, before processing a group's connections, `provisionEnvFallbackConnections` checks every group member without an existing `wearable_connections` row for that provider; if a matching env var is set, it inserts one (with `access_token` blank and `expires_at` already in the past, so the very next line of sync immediately exchanges the refresh token for a real access token via the normal refresh path). After that first run, it's an ordinary DB-backed connection like any OAuth-linked one — the fallback only ever fires once per member per provider, and never overrides a row that already exists from the real OAuth flow.

**The value must be a refresh token, not an access token** — WHOOP and Google access tokens expire in about an hour; a raw access token would silently stop syncing within that window. New members require adding a new Vercel env var and redeploying (env vars aren't editable without a redeploy) — this is why it's a fallback, not the default path.

---

## 2. Daily Streak Whistle Briefing (`/api/cron/daily-whistle`)

Source: [cron/daily-whistle/route.ts](../app/api/cron/daily-whistle/route.ts)

Executes daily at 03:00 UTC. Generates and sends a morning performance briefing to each group's WhatsApp chat JID.

### 2.1 Briefing Calculation Engine

For each group:
1. Fetch Yesterday's Logs:
   - Selects all logs where `status = 'verified'` and `logged_at` is between `now() - 24 hours` and `now()`.
2. Determine MVP:
   - Checks the user who logged the highest numeric value (or lowest for ascending metrics) in a single log.
3. Determine Slackers:
   - Resolves all active group members from `profiles` joined with `group_members`.
   - Filters out members who logged 1 or more verified activities in the last 24 hours.
   - Remaining names are marked as slackers.
4. Calculate Streaks:
   - Lookback window: Last 14 days.
   - Evaluates consecutive days of logging for each user moving backwards from yesterday.
   - A user must have logged at least 1 verified activity per day to maintain a streak.
   - Streak list includes any member with a streak length of 2 or more days.

### 2.2 AI Prompt & Message Construction

System prompt rules for briefing generation:
- Personality: Gen-Z sarcastic fitness instigator.
- Word limit: Under 100 words.
- Format: Plain text, exactly 3 bullet points, no bold, no italics, no hashtags, no markdown.
- Injects calculated lists: MVP nickname, slacker nicknames, active streaks.
- Gemini returns text. The handler appends the public dashboard root URL (`https://beyond-yesterday-app.vercel.app`) to the message footer.
- Dispatch: Calls Green API `sendMessage` to post the final text to the group's `whatsapp_group_id`.

---

## 3. Monday Prop Bet Bookie (`/api/cron/ai-bookie`)

Source: [cron/ai-bookie/route.ts](../app/api/cron/ai-bookie/route.ts)

Executes weekly on Mondays at 13:00 UTC.

### 3.1 Aggregations
1. Counts the total number of activities logged by each user in the last 30 days.
2. Calculates the maximum value achieved by each user per metric slug.

### 3.2 Bet Generation & Dispatch
- Compiles the statistics into a JSON-like context.
- Prompts Gemini to generate exactly 1 fitness-related prop bet challenge for the week.
- Challenge rules:
  - Specifying a target athlete.
  - Setting a numeric goal based on their history (e.g., "Macha will hit 40 pull-ups").
  - Setting a virtual coin wager amount (default 50 XP).
  - Written in casual friend-group tone.
- The generated plain text is sent to the group's WhatsApp JID via Green API.

---

## 4. Midday WhatsApp Digest (`/api/cron/whatsapp-digest`)

Source: [cron/whatsapp-digest/route.ts](../app/api/cron/whatsapp-digest/route.ts)

Executes daily at 12:00 UTC.

### 4.1 Digest Construction
1. Fetch all verified logs created in the last 24 hours.
2. Fetch the top_golf leaderboard scores for the group.
3. Renders a system context payload containing the names, metrics, values, units, and leaderboard standings.
4. Invokes Gemini using the `buildGroupAssistantPrompt()` system prompt to summarize the logs into a satirical midday chat update.
5. Message output is stripped of newlines (`\n`) and truncated to follow dynamic word count clamps.
6. Outbound: Posts the plain text output to the WhatsApp group via Green API.

> **Status: dormant.** Not scheduled in `vercel.json` (see §0) — route exists and works if called, but is not triggered automatically, per the "one daily broadcast only" product decision. The `ai-bookie` cron above is dormant for the same reason.

---

## 5. Monthly Streak & Summary Crons

### 5.1 Monthly Streak Reset (`/api/cron/reset-monthly-streaks`)

Source: [cron/reset-monthly-streaks/route.ts](../app/api/cron/reset-monthly-streaks/route.ts)

Executes 1st of every month at 00:00 UTC. For every profile in every group, compares `profiles.last_reset_month` to the current `YYYY-MM`; if different, resets `streak_count` to 0 and stamps `last_reset_month`. Naturally idempotent — a repeat run the same day is a no-op for any profile already reset (its `last_reset_month` already matches).

### 5.2 Monthly WhatsApp Summary (`/api/cron/monthly-summary`)

Source: [cron/monthly-summary/route.ts](../app/api/cron/monthly-summary/route.ts)

Executes 1st of every month at 01:00 UTC. For each group, queries the previous calendar month's verified `metric_logs`, aggregates per-member stats (total activities, top metric, personal bests), and asks Gemini to write a recap under 120 words. Dispatches via `sendWhatsAppGroupMessage` with the group's own Green API credential overrides — same per-group iteration pattern as `daily-whistle`.

---

## 6. Service Inventory

| Service | Package / SDK & Version | Purpose | Auth Method | Found In |
|---|---|---|---|---|
| Vercel | (platform) | Hosting for Next.js app + Serverless Functions + Cron | Vercel platform account | `vercel.json`, `package.json` build script |
| Supabase | `@supabase/supabase-js` ^2.110.2, `@supabase/ssr` ^0.12.0 | PostgreSQL DB, Storage buckets (`memories`, `avatars`) | Anon key + Service Role key + `x-group-id` header for RLS | `lib/supabase/server.ts`, `lib/supabase/client.ts` |
| Google Gemini | `@ai-sdk/google` ^4.0.11 + `ai` ^7.0.19 (Vercel AI SDK) | LLM generation (Fisky, ingestion, cron messages, caption AI, admin poke) | API key rotation pool via `utils/geminiPool.ts` (`GEMINI_API_KEYS` CSV, or `GOOGLE_GENERATIVE_AI_API_KEY`, or `GEMINI_API_KEY`); models `gemini-2.0-flash-lite` → `gemini-3.1-flash-lite` cascade | `lib/ai/google.ts`, `utils/geminiPool.ts`, `app/actions/ingest.ts`, `app/actions/admin.ts`, `app/actions/memories.ts`, all 4 cron routes, WhatsApp webhook |
| Green API (WhatsApp) | Raw REST via `fetch()` (no SDK) | Inbound webhook + outbound `sendMessage`/`sendFileByUrl` | Path token: `waInstance${GREEN_API_INSTANCE_ID}/{sendMessage,sendFileByUrl}/${GREEN_API_TOKEN}`; inbound verified via `safeCompare` on `body.instanceData.idInstance` | `lib/whatsapp.ts`, `app/api/webhooks/whatsapp/route.ts`, `app/actions/admin.ts`, `app/actions/memories.ts`, all 4 cron routes |

| Google Health API v4 | Raw REST via `fetch()` | Steps / sleep / resting-HR sync (daily) | OAuth 2.0 access token with scopes `googlehealth.activity_and_fitness.readonly`, `googlehealth.health_metrics_and_measurements.readonly` | `app/api/cron/sync-wearables/route.ts` |
| Google OAuth 2.0 | Raw REST via `fetch()` | Consent + token exchange + refresh | `client_id` + `client_secret` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`); refresh tokens stored in `wearable_connections.refresh_token` | `app/api/wearables/connect/google/route.ts`, `app/api/wearables/callback/google/route.ts`, refresh in cron/sync-wearables |
| WHOOP API v2 | Raw REST via `fetch()` | Sleep + resting-heart-rate sync (daily); no step-count data (not a WHOOP metric) | OAuth 2.0 (`WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`); refresh tokens stored in `wearable_connections.refresh_token` | `app/api/wearables/connect/whoop/route.ts`, `app/api/wearables/callback/whoop/route.ts`, refresh in cron/sync-wearables |
| Zod | `zod` ^4.4.3 | Schema-enforced structured LLM outputs (`generateObject`) + signup form validation | n/a | `app/actions/ingest.ts`, `app/actions/auth.ts` |\n| jose | `jose` ^6.2.3 | HS256 JWT signing/verification for `app_session` | `SESSION_SECRET` (min 32 chars) | `lib/session.ts`, `proxy.ts` |\n| ECharts | `echarts` ^6.1.0, `echarts-for-react` ^3.0.6 | Client-side chart rendering | n/a | `components/MetricChart.tsx` |\n| SWR | `swr` ^2.4.2 | Client-side polling refetch (ticker, gang) | n/a | (see components importing `swr`) |\n| Tailwind + Shadcn | `tailwindcss` ^4, `shadcn` ^4.13.0, `tw-animate-css` ^1.4.0, `class-variance-authority` ^0.7.1 | Styling / UI primitives | n/a | `app/globals.css`, `components/ui/*` |\n\n---\n\n## 7. Cost Projections `[VERIFY]`\n\nAll figures below are marked `[VERIFY]` because vendor pricing changes frequently and this audit has no authorization to query live billing dashboards. Numbers reflect publicly documented free-tier limits and list prices as understood at the historical moment of the vendor's most recent public change; confirm against the vendor's current pricing page before making any budgeting or contractual claim.\n\n| Service | Pricing Model | Free-Tier Limit | Est. Cost @ Current Scale (1 group, ~5 members) | Est. Cost @ 10\u00d7 (10 groups, ~50 members) | Checked On |\n|---|---|---|---|---|---|\n| Vercel Hosting | Hobby free; Pro $20/user/mo (as of vendor's most recent public tiering) | Hobby: 100 GB-hrs Function execution / mo | $0 if within Hobby; else `[VERIFY]` | Likely still within Hobby unless traffic bursts; `[VERIFY]` | `[VERIFY]` |\n| Vercel Cron | Included in Vercel Hobby (4 schedules used) | Hobby: 2 crons max | \u26a0\ufe0f Current 4-cron config exceeds Hobby limit (2) \u2014 requires Pro. Est. $20/mo | Same | `[VERIFY]` |\n| Supabase | Free tier / Pro $25/mo per project (per vendor's most recent public pricing) | Free: 500 MB DB, 1 GB Storage, 50 K MAU | $0 within Free; else `[VERIFY]` | Likely exceeds Free (10\u00d7 rows + memories images); `[VERIFY]` | `[VERIFY]` |\n| Google Gemini | Free tier / paid per 1 M tokens (varies by model \u2014 confirm on `ai.google.dev/pricing`) | Free: rate-limited RPM & TPM (varies) | Very low; cascade uses `gemini-2.0-flash-lite` first; `[VERIFY]` | Scales linearly with WhatsApp messages + cron; `[VERIFY]` | `[VERIFY]` |\n| Green API (WhatsApp) | Per-instance monthly + message-volume fees (varies by plan) | Trial: limited chats & instance | `[VERIFY]` | Scales linearly with messages; `[VERIFY]` | `[VERIFY]` |\n| Google Health API v4 | Free (as of vendor's public developer terms) | Google-defined per-project quotas | $0 | $0 | `[VERIFY]` |\n\n---\n\n## 8. Billing-Risk Flags\n\nOn-code-observed patterns most likely to inflate cost or quota consumption.\n\n### 8.1 Leaderboard/dashboard query pattern (N+1 risk)\n- `app/dashboard/page.tsx` L104-115 issues one query for `metric_definitions`; then re-queries with fallback if `is_hidden` column errors; then further queries for record holder, chart data, and feed. `getChartData` (`lib/queries.ts` L92-115) issues one query per chart render. **Risk: moderate** \u2014 not strictly N+1 (no per-user loop), but many small round-trips per page load.\n- `app/api/webhooks/whatsapp/route.ts` background block issues \u22656 sequential Supabase queries per inbound message (group, profile, chat history, recent logs, group members, top_golf logs, persistent state, 7d activity for slackers). Every WhatsApp message multiplies DB load.\n\n### 7.2 Wearable sync delete/reinsert churn\n- `syncGoogleHealthV4` (`app/api/cron/sync-wearables/route.ts`) uses `UPSERT` on `(user_id, logged_date)` \u2014 no delete. Historical backfill re-syncs the same days on any resumed backfill, effectively re-writing rows. Storage impact bounded by unique-date constraint; write amplification is real but not delete-churn.\n- `syncWhoop` regenerates a full mock series from `2026-01-01` on each backfill attempt (route.ts L410-458). If `backfill_completed` never flips (e.g. `isEmptyData` heuristic never satisfied), the mock sync balloons row count on each invocation until it fills to today.\n- `connectWearableAction(userId)` (`app/actions/wearables.ts` L15-25) deletes all existing rows for that user before inserting the mock connection. Combined with unique constraint churn on downstream `wearable_*` tables, back-to-back connect/disconnect cycles cascade to bulk deletes.\n\n### 7.3 Image optimization on upload/dispatch\n- `next.config.ts` sets `images.remotePatterns` to wildcard `**` for both `http` and `https`. Next.js Image Optimization will proxy and cache every distinct remote URL served through `<Image />`. Combined with the memories bucket returning public URLs, this can multiply Vercel Image Optimization invocations if avatars/memory thumbnails are rendered via `<Image />` \u2014 currently `page.tsx` uses `<Image unoptimized />` for avatars, so the risk is contained, but a single removal of `unoptimized` would monetize the wildcard.\n- Memories dispatch: `uploadAndCreateMemoryAction` (`app/actions/memories.ts` L145-193) sends the base64 image to Gemini for caption generation on EVERY upload, then fire-and-forgets a Green API `sendFileByUrl` broadcast. Multimodal Gemini calls are the most expensive prompt kind; every uploaded memory is one call.\n\n### 7.4 Cron cadence vs. need\n- `daily-whistle` runs daily at 03:00 UTC even if no verified activity yesterday (still calls Gemini and posts a message with slacker names). Skipping the LLM call when both `logs.length === 0` and `slackers.length === members.length` would save one call per group per day.\n- `sync-wearables` runs daily, iterating every row of `wearable_connections` (no `WHERE last_synced_at < now() - interval '1 day'` filter). Idle users still incur token-refresh + full-day-window API calls. **Risk: low** on Google Health free tier; **moderate** on paid tier.\n- `whatsapp-digest` re-runs the full `buildGroupAssistantPrompt()` context assembly + LLM call every noon regardless of whether the group is active.\n\n---\n\n## 9. Deployment Pipeline\n\n### 9.1 Build gate\n- **Command**: `npm run build` (resolves to `next build`). Runs TypeScript type-check via Next 16 build pipeline and Tailwind v4 compile.\n- **Lint**: `npm run lint` (`eslint` via `eslint-config-next` 16.2.10) is available but is NOT wired into a CI file present in the repo.\n- **No `postbuild` migration hook.** SQL migrations are not applied by `next build`; the `sql/consolidated_schema.sql` is a plain reference file, and `supabase/migrations/*.sql` require a separate `supabase db push` invocation not present in `package.json` scripts.\n\n### 8.2 Runtime configuration\n- Vercel Cron entries: 4 schedules declared in `vercel.json` (see \u00a71\u2013\u00a74 above).\n- Route-level `maxDuration`: set to 60 s on all cron routes and on `/api/webhooks/whatsapp` via `export const maxDuration = 60;`.\n\n### 8.3 Migration sequence (documented order per filename)\n\n```\n0001_initial_schema.sql\n0002_dynamic_metrics.sql\n0003_wearables_schema.sql\n0004_memories_and_caption_schema.sql\n0005_fix_trigger_null_xp.sql\n0006_add_headline_to_metric_logs.sql\n0007_add_deleted_at_to_memories.sql\n0008_database_hardening_and_rls.sql\n0009_chat_history.sql\n0010_profiles_phone_number.sql\n0011_admin_features.sql\n0012_system_settings_fix.sql\n0013_lore_and_vocab.sql\n0014_soft_delete_and_editor.sql\n0015_add_is_hidden_to_metrics.sql\n0016_profiles_strictness.sql\n0017_bot_persistent_state.sql\n0018_wearables_expires_at.sql\n0019_wearables_backfill.sql\n0020_wearable_tables_constraints.sql\n```\n\nApply in ascending numeric order. `sql/consolidated_schema.sql` at the repo root reflects the cumulative state after 0001\u2013most recent (verify against latest file). There is no wrapping deployment step \u2014 migrations are applied manually against the Supabase project (via `supabase db push` or the SQL editor).\n\n### 8.4 Runtime auto-migrations `[VERIFY \u2014 currently a code smell]`\n\n`app/dashboard/page.tsx` L143-176 contains an inline `long_run` \u2192 `top_golf` migration that runs on every dashboard render if the `top_golf` slug is missing from `metrics_config`. This is a symptom of missing migration tooling; it should be moved into a proper migration file and removed from page render.\n