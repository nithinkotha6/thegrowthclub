# Beyond Yesterday - Data Integrity Audit

This audit evaluates the Beyond Yesterday platform against four critical data integrity requirements. All findings are backed by file citations, query logic, or architecture paths. 

## 1. Zero Data Duplication

### Activity Logging (`metric_logs`)
*   **Finding:** The primary `metric_logs` table lacks a `UNIQUE` constraint to prevent activity deduplication.
*   **Evidence:** `sql/BASELINE_SCHEMA.sql` defines `metric_logs` with a standard `UUID` primary key, but omits a composite unique constraint (e.g., `user_id`, `metric_slug`, `logged_at`, `value`).
*   **Risk:** Rapid double-clicking of the submit button or network retries will result in duplicate rows, as the Server Actions (`app/actions/logDirect.ts` and `app/actions/ingest.ts`) do not implement idempotency keys.

### Cron Jobs & Webhooks
*   **Finding:** Cron services lack execution locks, and the WhatsApp webhook lacks message deduplication.
*   **Evidence:** 
    *   `app/api/cron/daily-whistle/route.ts` runs directly without checking a `cron_execution_log` table. A double-trigger from Vercel will send the broadcast twice.
    *   `app/api/webhooks/whatsapp/route.ts` parses the `idMessage` but never checks the database (e.g., `chat_history`) to verify if the webhook was already processed, opening the system up to replay attacks or duplicate processing of delayed webhooks.

### Module Overrides
*   **Finding:** `daily_goal_completions` safely prevents duplication, while `challenge_history` and `league_match_logs` do not.
*   **Evidence:** `0036_daily_goals.sql` implements a conditional unique index `ON public.daily_goal_completions (user_id, daily_goal_id, ((completed_at AT TIME ZONE 'UTC')::date)) WHERE deleted_at IS NULL;`. However, `0037_challenge_progression.sql` and `0038_leagues.sql` lack such constraints on their log tables.

## 2. Guaranteed Complete Deletion

### The Deletion Path
*   **Finding:** Deleting an activity executes a hard delete (`.delete()`) rather than setting a soft-delete flag, successfully eliminating the parent record.
*   **Evidence:** `app/actions/vote.ts` at `deleteActivityAction` executes: `await supabase.from('metric_logs').delete().eq('id', logId);`.

### Cascading Cleanup & Phantom Code
*   **Finding:** The `log_votes` table is safely cleared via a database-level `ON DELETE CASCADE` (`sql/BASELINE_SCHEMA.sql` line 126). However, the Server Action contains phantom deletion code.
*   **Evidence:** `app/actions/vote.ts` lines 235-247 executes defensive deletions against `approvals`, `comments`, `memory_comments`, and `xp_transactions`. These tables do not exist in the current schema, resulting in unnecessary, failing queries that are silently swallowed by `catch (_) {}`.

### Cache Invalidation Risk
*   **Finding:** Activities deleted from the dashboard may still appear as part of totals or histories on other pages due to insufficient cache invalidation.
*   **Evidence:** `deleteActivityAction` ends with `revalidatePath('/dashboard');`. In Next.js, this invalidates the exact `/dashboard` path but leaves child routes (like `/dashboard/gang`) and external routes (like `/profile/[userId]`) stale.

## 3. Perfect Data Consistency

### Revalidation Completeness
*   **Finding:** Every major Server Action mutation leaves UI views out of sync.
*   **Evidence:** `vote.ts`, `ingest.ts`, `logDirect.ts`, and `metrics.ts` extensively use exact-path revalidations like `revalidatePath('/dashboard')`. Because the `'layout'` flag is omitted (e.g., `revalidatePath('/dashboard', 'layout')`), sister and child views relying on the same data are not refreshed.

### XP Sync 
*   **Finding:** XP deductions are handled perfectly at the database level on deletion, guaranteeing backend consistency.
*   **Evidence:** The `award_xp_on_verify` trigger (`sql/BASELINE_SCHEMA.sql` lines 198-234) calculates and subtracts the exact XP reward from `profiles.total_xp` when a verified log is deleted. (Note: As mentioned above, the UI will lag behind this correct DB state due to cache invalidation flaws).

## 4. Absolute Data Accuracy

### The `streak_count` Critical Bug
*   **Finding:** The `streak_count` displayed on user profiles will always be `0`. It is a statically stored column that is never incremented.
*   **Evidence:** `0039_add_streak_to_profiles.sql` adds the `streak_count` integer to the `profiles` table. `app/api/cron/reset-monthly-streaks/route.ts` resets it to `0` on the first of the month. A codebase-wide sweep confirms there is absolutely no logic—either in Server Actions, AI prompts, or Database Triggers—that increments this column. 

### Timestamp Truncation
*   **Finding:** Manual activity logs obliterate the exact time of the activity, forcing all records to exactly 12:00 PM UTC.
*   **Evidence:** `app/actions/logDirect.ts` (line 143) assembles the date manually: `const loggedAt = isValidDateStr ? \`\${loggedAtDate}T12:00:00Z\` : undefined;`. This compromises chronological sorting for multiple activities logged on the same day.

### League Data Integrity
*   **Finding:** Completed league matches are safely protected from retroactive tampering.
*   **Evidence:** `0038_leagues.sql` introduces the `prevent_completed_match_edit()` database trigger. Attempting to modify scores or winners after `completed_at` is set immediately throws an exception.
