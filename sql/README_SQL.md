# SQL Folder — What This Actually Is

**Short answer: these files are legacy/historical and should NOT be run against a database, in any order.**
The single source of truth for schema deployment is [`supabase/migrations/`](../supabase/migrations) — an ordered, timestamped, idempotent migration sequence (`0001_initial_schema.sql` through `0034_widen_profiles_pin_column.sql` as of 2026-07-18) that a fresh Supabase project should be provisioned from via `supabase db push` / `supabase migration up`.

Everything in this `sql/` folder predates or duplicates that sequence and was never kept in sync with it. Nothing here is missing on purpose — it's just dead weight that risks confusing a future deploy if someone assumes it's current.

## File-by-file

| File | What it actually is | Safe to run? |
|---|---|---|
| `00_emergency_schema_cleanup.sql` | An ad-hoc patch applied by hand (not via the migrations folder) to add `profiles.group_id`, `profiles.role`, and the `profiles_group_pin_key` constraint. Its exact content has since been promoted into the real, ordered migration [`supabase/migrations/0033_profiles_group_id_and_role.sql`](../supabase/migrations/0033_profiles_group_id_and_role.sql). | No — already applied via 0033. Running it again is harmless (all `IF NOT EXISTS`-guarded) but pointless. |
| `05_lore_and_vocab.sql` | An early draft, later renumbered into [`supabase/migrations/0013_lore_and_vocab.sql`](../supabase/migrations/0013_lore_and_vocab.sql). Same table definitions, word-for-word. | No — superseded by 0013 (which itself was further hardened by 0025 and 0032). |
| `06_soft_delete_and_editor.sql` | Same story, renumbered into [`supabase/migrations/0014_soft_delete_and_editor.sql`](../supabase/migrations/0014_soft_delete_and_editor.sql). | No — superseded by 0014. |
| `07_add_is_hidden_to_metrics.sql` | Same story, renumbered into [`supabase/migrations/0015_add_is_hidden_to_metrics.sql`](../supabase/migrations/0015_add_is_hidden_to_metrics.sql). | No — superseded by 0015. |
| `BASELINE_SCHEMA.sql` | A one-time, hand-assembled "everything so far" dump, concatenating migrations `0001`–`0018` plus the emergency cleanup script inline. It stops at migration `0018` and was never updated again — it is missing **16+ subsequent migrations** (`0019`–`0034`), including the WHOOP/PIN-hashing support, admin role fixes, and every RLS/isolation hardening pass. | **No — actively misleading.** Do not treat this as "the current schema." |
| `consolidated_schema.sql` | Identical in nature and staleness to `BASELINE_SCHEMA.sql` (appears to be the same snapshot, possibly an earlier or duplicate save). Also stops at `0018`. | **No — actively misleading**, same reason as above. |

## Why no `readme_sql.md` "run in sequence" guide was created

You asked for a one-line-per-file, run-in-order guide *if* these files are already in good shape for that. They aren't: three are exact duplicates of migrations that already exist properly (and have since been hardened further), one was already promoted into a real migration, and the two "consolidated" files are 16 migrations out of date — running them wouldn't reconstruct the current schema, it would reconstruct a stale, incomplete one. Writing a "run these in order" guide would have been actively wrong.

## Recommendation

Delete this folder (or move it to something like `sql/_archive/` if you want to keep it for historical reference) and rely entirely on `supabase/migrations/` going forward. Every future schema change should be a new file there, e.g. `0035_<description>.sql`.
