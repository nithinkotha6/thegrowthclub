# 10 — Database Backup Schema Map & Recovery Runbook

> **Last updated:** 2026-07-22
> **Target Schema**: `backup` (1:1 replica of primary `public`/`Master` schema)
> **Schedule**: Daily at 03:00 UTC (Vercel Cron `/api/cron/daily-schema-backup`)
> **Audit Log**: `backup.backup_metadata`
> **Admin Control**: `/admin/backup-status`

---

## 1. Overview

The `"backup"` schema provides an automated, live, in-database failover and replication layer for TheGrowthClub. Every night at 03:00 UTC, the `backup_replicate_from_master()` function truncates all backup tables in dependency order and populates them from the primary (`public`/`Master`) schema.

Key Resilience Properties:
1. **Relational Isolation**: Foreign key constraints inside `"backup"` point strictly to other `"backup"` tables, preventing cross-schema leaks.
2. **Soft-Delete Exclusion**: Rows where `deleted_at IS NOT NULL` are excluded during replication, ensuring backup tables contain clean, active data.
3. **Auditable Metadata**: Every execution records timestamp, status (`completed` | `failed`), total tables copied, and total rows copied into `backup.backup_metadata`.
4. **Instant Recovery**: Restore operations can copy single tables or the full schema back to the primary schema in under 1 minute.

---

## 2. Table Mapping Matrix (Primary → Backup)

| Primary Table (`public` / `Master`) | Backup Table (`backup`) | Soft-Delete Filter | Description |
|---|---|---|---|
| `groups` | `backup.groups` | `WHERE deleted_at IS NULL` | Group tenant accounts & invite codes |
| `profiles` | `backup.profiles` | No | User profiles, XP, level, PIN, streak count |
| `group_members` | `backup.group_members` | No | User-to-group membership mapping |
| `metrics_config` | `backup.metrics_config` | No | Standard activity tracking catalog |
| `metric_definitions` | `backup.metric_definitions` | No | Custom dynamic metric definitions |
| `metric_logs` | `backup.metric_logs` | `WHERE deleted_at IS NULL` | Activity log submissions |
| `log_votes` | `backup.log_votes` | No | Peer-review verification votes |
| `wearable_connections` | `backup.wearable_connections` | No | OAuth tokens for WHOOP / Google Health |
| `wearable_steps` | `backup.wearable_steps` | No | Synced daily step metrics |
| `wearable_sleep` | `backup.wearable_sleep` | No | Synced sleep duration metrics |
| `wearable_resting_hr` | `backup.wearable_resting_hr` | No | Synced resting heart rate metrics |
| `memories` | `backup.memories` | `WHERE deleted_at IS NULL` | Uploaded memory photo archive |
| `memory_comments` | `backup.memory_comments` | No | Comments on shared memory photos |
| `chat_history` | `backup.chat_history` | No | Inbound & outbound WhatsApp messages |
| `system_settings` | `backup.system_settings` | No | Global system key-value configurations |
| `member_lore` | `backup.member_lore` | No | Persona lore & member facts |
| `vocab_banks` | `backup.vocab_banks` | No | WhatsApp bot vocabulary & phrases |
| `bot_persistent_state` | `backup.bot_persistent_state` | No | Active bot mood & targeted roast state |
| `login_attempts` | `backup.login_attempts` | No | Brute-force rate limiting attempts |
| `bot_moods` | `backup.bot_moods` | No | Lookup table for supported bot moods |
| `daily_goals` | `backup.daily_goals` | No | Predefined daily goals catalog |
| `daily_goal_completions` | `backup.daily_goal_completions` | `WHERE deleted_at IS NULL` | User daily goal completion logs |
| `challenge_history` | `backup.challenge_history` | `WHERE deleted_at IS NULL` | Tier promotion history entries |
| `challenge_progression` | `backup.challenge_progression` | No | Current user challenge tier states |
| `league_assignments` | `backup.league_assignments` | No | Roster assignments (TITANS vs REBELS) |
| `league_challenges` | `backup.league_challenges` | No | League match challenge catalog |
| `league_matches` | `backup.league_matches` | `WHERE deleted_at IS NULL` | Match records & scores |
| `league_match_logs` | `backup.league_match_logs` | No | Match action audit logs |
| `push_subscriptions` | `backup.push_subscriptions` | No | Web Push notification endpoints |
| `cron_execution_log` | `backup.cron_execution_log` | No | Cron idempotency & execution history |

---

## 3. Replication Procedure

### Function: `backup_replicate_from_master()`

1. **Truncation Step**:
   Truncates all tables in `"backup"` schema in reverse dependency order using `CASCADE`.
2. **Replication Step**:
   Iterates through all 30 primary tables. For each table, copies records into `"backup"`. If `deleted_at` exists, applies `WHERE deleted_at IS NULL`.
3. **Audit Logging Step**:
   Inserts an entry into `backup.backup_metadata`:
   ```sql
   INSERT INTO backup.backup_metadata (backed_up_at, status, total_tables_copied, total_rows_copied)
   VALUES (now(), 'completed', v_tables_count, v_total_rows);
   ```

---

## 4. Recovery Procedures & Runbook

### Option A: Admin Dashboard Live Recovery (Recommended)
1. Navigate to `/admin/backup-status`.
2. Review the latest backup timestamp and table row counts.
3. Click **"Restore from Backup"**.
4. Select scope (**ALL TABLES** or a specific target table, e.g. `metric_logs`).
5. Click **"Confirm Restore"**.

### Option B: SQL Editor Live Recovery
To restore a single table directly via Supabase SQL Editor:
```sql
SELECT * FROM backup_restore_to_master('metric_logs');
```

To restore the full schema:
```sql
SELECT * FROM backup_restore_to_master(NULL);
```

---

## 5. Cron & Monitoring

- **Schedule**: `0 3 * * *` (3:00 AM UTC daily).
- **Cron Route**: `/api/cron/daily-schema-backup` (configured in `vercel.json`).
- **Monitoring Table**: `backup.backup_metadata`.
