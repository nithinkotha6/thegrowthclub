# Dev Log — Database

## 2026-07-10 | Step 2: Initial Schema Migration

- Created `supabase/migrations/0000_initial_schema.sql`
  - Tables: `profiles`, `metrics_config`, `metric_logs` (EAV pattern)
  - Trigger: `trg_award_xp` → `award_xp_on_verification()` (XP + level recompute on status → 'verified')
  - RLS: read-all for authenticated; insert/update restricted to own rows
  - Seed: 5 initial metrics (long_run, deadlift, top_speed, weight, calories)

## 2026-07-10 | Step 3: Supabase Client Wiring

- Installed `@supabase/supabase-js` + `@supabase/ssr`
- Created `lib/supabase/server.ts` (SSR cookie-aware client for Server Components / Route Handlers)
- Created `lib/supabase/client.ts` (browser client for Client Components)
- Created `.env.local.example` (documents all required env vars)
