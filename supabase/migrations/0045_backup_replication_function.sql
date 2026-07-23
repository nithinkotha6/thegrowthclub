-- =============================================================================
-- MIGRATION: 0045_backup_replication_function.sql
-- Database Resilience — Backup Replication & Recovery Stored Functions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- FUNCTION: backup_replicate_from_master()
-- Replicates all tables from primary schema (public/Master) to backup schema.
-- Truncates backup tables, filters out soft-deleted rows (deleted_at IS NULL),
-- and logs execution summary to backup.backup_metadata.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION backup_replicate_from_master()
RETURNS TABLE(table_name text, row_count bigint) AS $$
DECLARE
  v_src_schema text := 'public';
  v_tables text[] := ARRAY[
    'groups',
    'profiles',
    'group_members',
    'metrics_config',
    'metric_definitions',
    'metric_logs',
    'log_votes',
    'wearable_connections',
    'wearable_steps',
    'wearable_sleep',
    'wearable_resting_hr',
    'memories',
    'memory_comments',
    'chat_history',
    'system_settings',
    'member_lore',
    'vocab_banks',
    'bot_persistent_state',
    'login_attempts',
    'bot_moods',
    'daily_goals',
    'daily_goal_completions',
    'challenge_history',
    'challenge_progression',
    'league_assignments',
    'league_challenges',
    'league_matches',
    'league_match_logs',
    'push_subscriptions',
    'cron_execution_log'
  ];
  v_tbl text;
  v_inserted_count bigint;
  v_total_rows bigint := 0;
  v_tables_count integer := 0;
  v_has_deleted_at boolean;
  v_sql text;
BEGIN
  -- Detect primary source schema ('Master' if present, else 'public')
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'Master' AND table_name = 'groups'
  ) THEN
    v_src_schema := 'Master';
  ELSE
    v_src_schema := 'public';
  END IF;

  -- 1. Truncate all backup tables in dependency order with CASCADE
  TRUNCATE TABLE 
    "backup".log_votes,
    "backup".league_match_logs,
    "backup".league_matches,
    "backup".league_assignments,
    "backup".league_challenges,
    "backup".challenge_history,
    "backup".challenge_progression,
    "backup".daily_goal_completions,
    "backup".daily_goals,
    "backup".memory_comments,
    "backup".memories,
    "backup".wearable_resting_hr,
    "backup".wearable_sleep,
    "backup".wearable_steps,
    "backup".wearable_connections,
    "backup".chat_history,
    "backup".member_lore,
    "backup".vocab_banks,
    "backup".bot_persistent_state,
    "backup".login_attempts,
    "backup".push_subscriptions,
    "backup".cron_execution_log,
    "backup".metric_logs,
    "backup".group_members,
    "backup".profiles,
    "backup".metric_definitions,
    "backup".metrics_config,
    "backup".system_settings,
    "backup".bot_moods,
    "backup".groups
  CASCADE;

  -- 2. Copy data from source schema to backup schema
  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = v_src_schema AND table_name = v_tbl
    ) THEN
      -- Check if source table contains soft-delete column
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = v_src_schema AND table_name = v_tbl AND column_name = 'deleted_at'
      ) INTO v_has_deleted_at;

      IF v_has_deleted_at THEN
        v_sql := format('INSERT INTO "backup".%I SELECT * FROM %I.%I WHERE deleted_at IS NULL', v_tbl, v_src_schema, v_tbl);
      ELSE
        v_sql := format('INSERT INTO "backup".%I SELECT * FROM %I.%I', v_tbl, v_src_schema, v_tbl);
      END IF;

      EXECUTE v_sql;
      GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

      v_total_rows := v_total_rows + v_inserted_count;
      v_tables_count := v_tables_count + 1;

      table_name := v_tbl;
      row_count := v_inserted_count;
      RETURN NEXT;
    END IF;
  END LOOP;

  -- 3. Log audit metadata entry
  INSERT INTO "backup".backup_metadata (backed_up_at, status, total_tables_copied, total_rows_copied)
  VALUES (now(), 'completed', v_tables_count, v_total_rows);

  RETURN;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO "backup".backup_metadata (backed_up_at, status, error_message, total_tables_copied, total_rows_copied)
  VALUES (now(), 'failed', SQLERRM, v_tables_count, v_total_rows);
  RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ---------------------------------------------------------------------------
-- FUNCTION: backup_restore_to_master(p_table_name text DEFAULT NULL)
-- Restores rows from backup schema into primary schema (public/Master).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION backup_restore_to_master(p_table_name text DEFAULT NULL)
RETURNS TABLE(table_name text, restored_rows bigint) AS $$
DECLARE
  v_dest_schema text := 'public';
  v_tables text[];
  v_tbl text;
  v_count bigint;
  v_sql text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'Master' AND table_name = 'groups'
  ) THEN
    v_dest_schema := 'Master';
  ELSE
    v_dest_schema := 'public';
  END IF;

  IF p_table_name IS NOT NULL AND p_table_name <> '' THEN
    v_tables := ARRAY[p_table_name];
  ELSE
    v_tables := ARRAY[
      'groups', 'profiles', 'group_members', 'metrics_config', 'metric_definitions',
      'metric_logs', 'log_votes', 'wearable_connections', 'wearable_steps',
      'wearable_sleep', 'wearable_resting_hr', 'memories', 'memory_comments',
      'chat_history', 'system_settings', 'member_lore', 'vocab_banks',
      'bot_persistent_state', 'login_attempts', 'bot_moods', 'daily_goals',
      'daily_goal_completions', 'challenge_history', 'challenge_progression',
      'league_assignments', 'league_challenges', 'league_matches',
      'league_match_logs', 'push_subscriptions', 'cron_execution_log'
    ];
  END IF;

  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'backup' AND table_name = v_tbl) THEN
      v_sql := format('INSERT INTO %I.%I SELECT * FROM "backup".%I ON CONFLICT DO NOTHING', v_dest_schema, v_tbl, v_tbl);
      EXECUTE v_sql;
      GET DIAGNOSTICS v_count = ROW_COUNT;

      table_name := v_tbl;
      restored_rows := v_count;
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
