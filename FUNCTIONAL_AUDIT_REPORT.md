# Functional & Data-Integrity Audit Report — Beyond Yesterday

This document details the pre-production functional and database audit findings, severity metrics, root causes, and resolutions implemented to secure user data, prevent infinite XP farming, block parameter tampering, and eliminate dynamic metric hallucinations.

---

## 🔴 Critical Functional / Data Bugs

| ID | Pillar | Severity | File:Line | Component/Table | Defect Description | Root Cause | Fix Commit | Status |
|----|--------|----------|-----------|------------------|---------------------|------------|------------|--------|
| AUD-01 | Pillar 1 | Critical | `supabase/migrations/0001_initial_schema.sql` | `award_xp_on_verify` trigger | Verified logs deletions did not deduct XP, allowing infinite XP farming by logging and immediately deleting logs. | Missing trigger logic and events mapping for the `DELETE` event path on `metric_logs`. | `refactor: support DELETE events in XP triggers` | Fixed |
| AUD-02 | Pillar 1 | Critical | `app/actions/vote.ts:58-72` | `processVerificationVote` | Peer vote approvals and rejections lacked group validation, allowing users in Group A to vote on or delete pending logs in Group B. | The action only matched target log ID and did not verify if the log's `group_id` matched the voter's session group ID. | `security: enforce group scoping on peer verification votes` | Fixed |
| AUD-03 | Pillar 1 | Critical | `app/actions/memories.ts`, `app/actions/wearables.ts`, `app/actions/logDirect.ts` | Memories, Wearables, and Manual Logging Actions | Server actions accepted `userId`/`groupId` parameter values from the client trustingly without validating them against the session cookie, exposing the database to parameter tampering. | Missing session credential checks against passed arguments before calling service-role database clients. | `security: prevent parameter tampering on write server actions` | Fixed |
| AUD-04 | Pillar 4 | Critical | `supabase/migrations/` | `memories` & `memory_comments` tables | The database tables `memories` and `memory_comments` were used dynamically in the dashboard view and upload action but were completely missing from the SQL migrations. | The database creation migrations were never generated or added to version control. | `migration: create memories schema and add caption/duration columns` | Fixed |
| AUD-05 | Pillar 4 | Critical | `supabase/migrations/0001_initial_schema.sql` | `metric_logs` table | Manual logs captions were not persisted in version control migrations. `logActivityManual` crashed and retried without caption, causing silent data loss of duration/caption. | The `caption` column was missing from the `metric_logs` schema definition. | `migration: create memories schema and add caption/duration columns` | Fixed |

---

## 🟡 UI/UX Disconnects & Dead Buttons

| ID | Pillar | Severity | File:Line | Component/Table | Defect Description | Root Cause | Fix Commit | Status |
|----|--------|----------|-----------|------------------|---------------------|------------|------------|--------|
| AUD-06 | Pillar 3 | High | `app/signup/page.tsx` & `app/actions/signup.ts` | `/signup` page | The `/signup` route processed accounts via Supabase email/password auth which is completely disconnected from Kiosk PIN sessions, resulting in instant redirects to `/`. | The standalone signup path was built using standard email credentials rather than setting the required kiosk session cookies. | `refactor: align standalone signup page with kiosk flow` | Fixed |
| AUD-07 | Pillar 3 | Medium | `app/actions/cheer.ts:7-13` | `sendCheer` action | Clicking the social fire button on the leaderboard triggered a successful toast animation but only executed a server-side `console.log` with no database persistence. | persistent social taunts were designed as lightweight notification stubs rather than DB records. | N/A | Documented |

---

## 🔵 Schema & AI Access Flaws

| ID | Pillar | Severity | File:Line | Component/Table | Defect Description | Root Cause | Fix Commit | Status |
|----|--------|----------|-----------|------------------|---------------------|------------|------------|--------|
| AUD-08 | Pillar 2 | High | `app/actions/ingest.ts` & `app/api/telegram/route.ts` | Manual Ingest / Telegram Ingestion | Dynamic trackers created by users in settings had UUIDs as slugs which the AI could never guess, causing all AI-ingested logs for dynamic trackers to fail to render on the dashboard. | Gemini extracted human-readable text strings rather than looking up/mapping dynamically registered tracker UUIDs. | `feat: fetch and map custom metric slugs dynamically in AI ingest` | Fixed |
| AUD-09 | Pillar 2 | High | `app/api/cron/sync-wearables/route.ts` | Sync Wearables cron | Multiple cron sync executions on the same calendar day created duplicate step, sleep, and resting heart rate rows in `metric_logs`, artificially inflating leaderboard scores. | The sync ingestion inserted new logs without deleting existing aggregates for the same user, metric, and calendar day. | `fix: clear existing daily logs on wearable sync runs` | Fixed |
| AUD-10 | Pillar 4 | Medium | `supabase/migrations/0004_...` | `metric_logs.duration_seconds` | Endurance metrics durations (e.g. underwater swim times) were stored as concatenated strings in the caption, blocking sorting and filtering by duration at the database level. | Schema lacked a structured, queryable numeric representation of time. | `migration: create memories schema and add caption/duration columns` | Fixed |

---

## Technical Audit Implementation Notes

### 1. Database Invalidation Trigger (AUD-01)
We updated the PL/pgSQL function `award_xp_on_verify()` and trigger `trg_award_xp` inside [0001_initial_schema.sql](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/supabase/migrations/0001_initial_schema.sql) to hook into `INSERT OR UPDATE OR DELETE` of rows on `public.metric_logs`:
* During **`DELETE`** or a regression to **`pending`/`rejected`**, it deducts the exact value of `xp_reward` (lookup via slug in `metrics_config`) and updates the user's profile and quadratic level accordingly.

### 2. Standalone Signup Redirect (AUD-06)
We replaced the standalone `app/signup/page.tsx` file with a Next.js client-side redirection wrapper that routes incoming calls to `/?tab=signup`. We also updated `app/page.tsx` to lazily check search query parameters on mount to activate the signup tab. The obsolete `app/actions/signup.ts` file was completely pruned.

### 3. Dynamic AI Mapping (AUD-08)
Manual Gemini text ingestion ([ingest.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/ingest.ts)) and Telegram webhook ingestion ([route.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/telegram/route.ts)) now eagerly query `metrics_config` and `metric_definitions` dynamically before calling the LLM. The dynamic list of configurations and dynamic names/UUIDs are injected as matching directives into the prompt, and the resulting extracted identifier is validated at the application boundary.
