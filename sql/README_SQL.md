# SQL Folder — What This Actually Is

> **Last updated:** 2026-07-19

**Short answer: these files are legacy/historical and should NOT be run against a database, in any order.**
The single source of truth for schema deployment is [`supabase/migrations/`](../supabase/migrations) — an ordered, timestamped, idempotent migration sequence (`0001_initial_schema.sql` through `0040_metrics_config_is_hidden.sql` as of 2026-07-19) that a fresh Supabase project should be provisioned from via `supabase db push` / `supabase migration up`.

Everything in this `sql/` folder predates or duplicates that sequence and was never kept in sync with it. Nothing here is missing on purpose — it's just dead weight that risks confusing a future deploy if someone assumes it's current.

---

## Setting up a database from scratch — step by step

You only ever need **one** folder: `supabase/migrations/`. The `sql/` folder (this one) is **not** part of the setup process — see the file-by-file table below for why each file there is dead/superseded. Do not run anything from `sql/` on a real project.

### Option A — Supabase Dashboard SQL Editor (no CLI needed, recommended)

1. Create a new Supabase project (or use an existing empty one). Note the **Project URL**, **anon public key**, and **service_role key** from Settings → API — you'll need these for `.env.local` / Vercel env vars regardless of which option you use here.
2. Open **Supabase Dashboard → SQL Editor**.
3. Open each file in `supabase/migrations/` **in ascending numeric order, with no gaps**, starting from `0001_initial_schema.sql` and ending at the highest-numbered file currently in the folder (`0040_metrics_config_is_hidden.sql` as of this writing). For each file:
   - Paste its full contents into a new query.
   - Run it.
   - Confirm no errors before moving to the next file.
4. Every migration in this repo is written to be idempotent (`IF NOT EXISTS` / guarded `ON CONFLICT` clauses), so if you're ever unsure how far you got, it's safe to just re-run from `0001` forward — already-applied statements are safe no-ops.
5. That's it — no other folder, script, or seed file needs to run. `sql/*.sql` (this folder) is never touched.

### Option B — Supabase CLI (if you have it installed locally)

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

This applies every file in `supabase/migrations/` in order automatically, tracked by Supabase's own migration-history table. (Note: as of this writing, no Supabase CLI has been available in this dev environment, so Option A above is the one that's actually been verified end-to-end in this project.)

### After migrations: one manual bootstrap step

The app has no self-serve "create the first group" flow — signup requires an *existing* group's invite code, and the admin-group-creation Server Action requires an *existing* logged-in session. On a brand-new database there's nothing to log into yet, so insert the first group directly in the SQL Editor:

```sql
insert into public.groups (name, invite_code)
values ('Your Group Name', 'YOUR-INVITE-CODE');
```

Full external-setup runbook (env vars, OAuth redirect URIs, GitHub Actions secrets, etc.) lives in [`docs/Admin_to_do.md`](../docs/Admin_to_do.md) — this file only covers the database/SQL side.

### The exact current migration order (for reference)

`0001_initial_schema.sql` → `0002_dynamic_metrics.sql` → `0003_wearables_schema.sql` → `0004_memories_and_caption_schema.sql` → `0005_fix_trigger_null_xp.sql` → `0006_add_headline_to_metric_logs.sql` → `0007_add_deleted_at_to_memories.sql` → `0008_database_hardening_and_rls.sql` → `0009_chat_history.sql` → `0010_profiles_phone_number.sql` → `0011_admin_features.sql` → `0012_system_settings_fix.sql` → `0013_lore_and_vocab.sql` → `0014_soft_delete_and_editor.sql` → `0015_add_is_hidden_to_metrics.sql` → `0016_profiles_strictness.sql` → `0017_bot_persistent_state.sql` → `0018_wearables_expires_at.sql` → `0019_wearables_backfill.sql` → `0020_wearable_tables_constraints.sql` → `0021_remove_deprecated_moods_and_vocab.sql` → `0022_migrate_long_run_to_top_golf.sql` → `0023_add_requires_verification_to_metrics_config.sql` → `0024_add_deleted_at_to_groups.sql` → `0025_add_group_id_to_lore_and_vocab.sql` → `0026_add_group_id_to_wearables.sql` → `0027_add_metric_definition_id_to_metric_logs.sql` → `0028_login_attempts.sql` → `0029_chat_history_prompt_version.sql` → `0030_bot_persistent_state_target_group_scope.sql` → `0031_bot_moods_lookup.sql` → `0032_lore_vocab_rls_lockdown.sql` → `0033_profiles_group_id_and_role.sql` → `0034_widen_profiles_pin_column.sql` → `0035_add_requires_verification_to_metric_definitions.sql` → `0036_daily_goals.sql` → `0037_challenge_progression.sql` → `0038_leagues.sql` → `0039_add_streak_to_profiles.sql` → `0040_metrics_config_is_hidden.sql`.

**This list will drift out of date as new migrations are added** — always trust the actual file listing of `supabase/migrations/` over this snapshot; it's here only as a quick-glance reference of what "from scratch" currently means.

---

## File-by-file (this `sql/` folder — do NOT run any of these)

| File | What it actually is | Safe to run? |
|---|---|---|
| `00_emergency_schema_cleanup.sql` | An ad-hoc patch applied by hand (not via the migrations folder) to add `profiles.group_id`, `profiles.role`, and the `profiles_group_pin_key` constraint. Its exact content has since been promoted into the real, ordered migration [`supabase/migrations/0033_profiles_group_id_and_role.sql`](../supabase/migrations/0033_profiles_group_id_and_role.sql). | No — already applied via 0033. Running it again is harmless (all `IF NOT EXISTS`-guarded) but pointless. |
| `05_lore_and_vocab.sql` | An early draft, later renumbered into [`supabase/migrations/0013_lore_and_vocab.sql`](../supabase/migrations/0013_lore_and_vocab.sql). Same table definitions, word-for-word. | No — superseded by 0013 (which itself was further hardened by 0025 and 0032). |
| `06_soft_delete_and_editor.sql` | Same story, renumbered into [`supabase/migrations/0014_soft_delete_and_editor.sql`](../supabase/migrations/0014_soft_delete_and_editor.sql). | No — superseded by 0014. |
| `07_add_is_hidden_to_metrics.sql` | Same story, renumbered into [`supabase/migrations/0015_add_is_hidden_to_metrics.sql`](../supabase/migrations/0015_add_is_hidden_to_metrics.sql). | No — superseded by 0015. |
| `BASELINE_SCHEMA.sql` | A one-time, hand-assembled "everything so far" dump, concatenating migrations `0001`–`0018` plus the emergency cleanup script inline. It stops at migration `0018` and was never updated again — it is missing **16+ subsequent migrations** (`0019`–`0034`), including the WHOOP/PIN-hashing support, admin role fixes, and every RLS/isolation hardening pass. | **No — actively misleading.** Do not treat this as "the current schema." |
| `consolidated_schema.sql` | Identical in nature and staleness to `BASELINE_SCHEMA.sql` (appears to be the same snapshot, possibly an earlier or duplicate save). Also stops at `0018`. | **No — actively misleading**, same reason as above. |

## Why this `sql/` folder itself has no "run in sequence" guide

A one-line-per-file, run-in-order guide only makes sense if these files are in good shape for that. They aren't: three are exact duplicates of migrations that already exist properly in `supabase/migrations/` (and have since been hardened further there), one was already promoted into a real migration, and the two "consolidated" files are 16+ migrations out of date. Running them wouldn't reconstruct the current schema, it would reconstruct a stale, incomplete one. The step-by-step "from scratch" guide above covers `supabase/migrations/` instead, which is the folder that's actually safe and correct to run in order.

## Recommendation

Delete this folder (or move it to something like `sql/_archive/` if you want to keep it for historical reference) and rely entirely on `supabase/migrations/` going forward. Every future schema change should be a new file there, e.g. `0035_<description>.sql`.
