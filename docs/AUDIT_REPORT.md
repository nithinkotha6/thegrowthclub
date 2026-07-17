# Production Audit & Hardening Report — Beyond Yesterday

**Date:** July 15, 2026  
**Auditor:** Antigravity (Principal Full-Stack & Security Engineer)

This document details the findings and resolutions of the comprehensive production security and database correctness audit conducted on the **Beyond-Yesterday** repository.

---

## 1. Security Vulnerabilities & Hardening

### [CRITICAL] Decorative Row Level Security (RLS) Leak
* **Finding:** RLS was enabled on all tables in `0001_initial_schema.sql`, but the policies granted unrestricted read/write access to `anon` callers using simple `using (true)` and `with check (true)` clauses. Since the Kiosk Auth model doesn't use Supabase Auth, any client querying PostgREST with the public anon key could read and edit all group members, profiles, plain-text PINs, logs, and votes.
* **Resolution:** 
  1. Transitioned all server-side database access (Server Actions, API Routes, Server Components) to use a newly centralized administrative client (`createAdminClient()`) configured with the `SUPABASE_SERVICE_ROLE_KEY`.
  2. Modified client settings page ([SettingsClient.tsx](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/components/SettingsClient.tsx)) to receive definitions as props from the server page rather than querying Supabase directly via the client-side `anon` client.
  3. Hardened the database schema ([0001_initial_schema.sql](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/supabase/migrations/0001_initial_schema.sql) and [0002_dynamic_metrics.sql](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/supabase/migrations/0002_dynamic_metrics.sql)) by dropping the public/anon read and write policies on sensitive tables (`profiles`, `group_members`, `metric_logs`, `log_votes`, `metric_definitions`). Unauthorized PostgREST access is now completely blocked.

### [HIGH] Disabled/Misconfigured Next.js Middleware
* **Finding:** The request interception logic was implemented inside `proxy.ts`, but Next.js requires the file to be named `middleware.ts` to be executed automatically by the routing engine. As a result, dashboard routes were not protected by any middleware security gate.
* **Resolution:** Next.js 16 (Turbopack) introduces native support for `proxy.ts` as a request proxy/interception boundary, and explicitly forbids having both `middleware.ts` and `proxy.ts` at the root (causing build failures). We verified the Next.js 16 Turbopack compiler behavior: `proxy.ts` is compiled natively as `Proxy (Middleware)`. Having no `middleware.ts` allows Turbopack to successfully compile it as the primary gateway.

### [MEDIUM] Unsecured WhatsApp Webhook Ingest Endpoint
* **Finding:** The WhatsApp webhook route ([route.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/webhooks/whatsapp/route.ts)) accepted incoming POST payloads without verifying the sender identity, exposing the webhook to arbitrary message spoofing.
* **Resolution:** Implemented verification checking that the incoming `body.instanceData.idInstance` matches the configured `process.env.GREEN_API_INSTANCE_ID` using our new timing-safe comparison helper.

### [MEDIUM] Timing-Safe Comparisons & Missing Env Checks
* **Finding:** Authorization checking on `/api/cron/*` and Telegram/WhatsApp webhooks relied on basic string equality (`===`). If `CRON_SECRET` or `TELEGRAM_WEBHOOK_SECRET` was undefined, empty headers could bypass verification.
* **Resolution:** 
  1. Created [security.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/security.ts) containing an Edge-runtime-compatible pure JS timing-safe comparison helper `safeCompare`.
  2. Secured all webhook/cron secret validations to require the secrets to be defined and matched timing-safely via `safeCompare`.

### [MEDIUM] Insecure PIN database lookup and Brute-Force Vulnerability
* **Finding:** In [auth.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/auth.ts), the login query retrieved all profiles in the target group (along with their plain-text PINs) to filter the login user in JavaScript application code. This leaked other users' PINs to memory and lacked rate limiting.
* **Resolution:** 
  1. Updated the Supabase query to filter on the database level using `.eq('profiles.pin', sanitizedPin)`.
  2. Applied `safeCompare` for timing-safe PIN verification.
  3. Added a 1-second delay on login failure to slow down PIN brute-force guessing attacks.

---

## 2. Database Correctness & Architecture

### [HIGH] Stale/Non-Functional XP Allocation on Direct Inserts
* **Finding:** The database trigger `trg_award_xp` in `0001_initial_schema.sql` was configured to run only `after update of status` on `metric_logs`. Manual quick-logs and automated wearables sync insert rows directly with a status of `'verified'`. Since no update occurred, these logs never triggered XP calculation, leaving users without experience points.
* **Resolution:** Redefined the PL/pgSQL function `award_xp_on_verify()` and trigger `trg_award_xp` to fire on both `INSERT` and `UPDATE`, resolving insert vs update context dynamically to award XP on both paths.

### [HIGH] Missing Wearables Schema Migrations
* **Finding:** The wearables schemas (`wearable_connections`, `wearable_steps`, etc.) were missing from version control migrations, which would crash clean local developer setups.
* **Resolution:** Generated database migration [0003_wearables_schema.sql](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/supabase/migrations/0003_wearables_schema.sql) defining the tables.

### [HIGH] Multi-Tenant Wearables Constraint Defect
* **Finding:** The specification in `README.md` and `docs/architecture.md` defined `wearable_steps`, `wearable_sleep`, and `wearable_resting_hr` with a single-column `UNIQUE` constraint on `logged_date`, which would prevent multiple users from registering logs on the same date.
* **Resolution:** Declared composite unique constraints on `(connection_id, logged_date)` inside [0003_wearables_schema.sql](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/supabase/migrations/0003_wearables_schema.sql), fixing the multi-tenant design flaw.

---

## 3. UI Progression Synchronization

### [LOW] Visual Mismatch in XP Level Progress
* **Finding:** The sidebar navigation component ([Sidebar.tsx](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/components/Sidebar.tsx)) calculated progress bar percent linearly (`totalXp % 1000`), whereas the database trigger calculated level transitions quadratically (`floor(1 + sqrt(xp / 500)) + 1`). This caused the displayed level number to be completely desynchronized from the visual progress bar state.
* **Resolution:** Re-implemented the sidebar progress bar calculation to compute quadratic progression matching the database trigger, aligning visual feedback with game level mechanics.

---

## 4. Repository Clean-Up

### [LOW] Dead Code Clutter Removal
* **Finding:** The `src/` directory contained duplicate placeholder route stubs and empty directories.
* **Resolution:** Deleted the `src/` directory.

---

## 5. Verification Check Results

1. **Circular Dependencies:** Madge execution confirmed **0 circular dependencies** detected.
2. **Type Safety:** Type compiler compilation `npx tsc --noEmit` completed with **exit code 0 (no errors)**.
3. **Production Compilation:** Next.js build command `npm run build` executed successfully, packaging the client bundle and identifying `proxy.ts` natively as the proxy middleware.
