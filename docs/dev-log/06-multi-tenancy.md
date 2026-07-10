# Dev Log — Multi-Tenancy

## 2026-07-10 | Step 6: Multi-Tenant Architecture

- Created `supabase/migrations/0001_multi_tenant.sql`
  - New `groups` table (id, name, invite_code UNIQUE, created_at)
  - `ALTER TABLE profiles`: added group_id FK, full_name, phone_number UNIQUE; renamed total_xp → xp
  - Rewrote `award_xp_on_verification()` trigger to reference renamed `xp` column
  - Replaced permissive read-all RLS on `profiles` + `metric_logs` with group-scoped policies
  - Seeded groups: BUDBIKE2025, MONKEY2025
- Created `app/actions/signup.ts` — invite-code server action (groups lookup → auth.signUp → profiles INSERT)
- Created `app/signup/page.tsx` — dark-themed standalone onboarding form
- Modified `components/MetricChart.tsx` — added `avatar_url` field to user data; terminal nodes use `image://{avatar_url}` ECharts symbol when populated
