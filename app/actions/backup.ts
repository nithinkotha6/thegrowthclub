'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession, type AppSession } from '@/lib/session';
import { logger } from '@/lib/logger';

export interface BackupMetadataRecord {
  id: string;
  backed_up_at: string;
  status: 'completed' | 'failed';
  error_message: string | null;
  total_tables_copied: number | null;
  total_rows_copied: number | null;
  created_at: string;
}

export interface BackupTableSummary {
  table_name: string;
  row_count: number;
}

/** Confirms caller has an authenticated session. */
async function requireSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session) {
    return { session: null, error: 'Unauthorized session credentials mismatch.' };
  }
  return { session, error: null };
}

/** Fetch latest backup status & metadata history from "backup".backup_metadata. */
export async function getBackupStatusAction(): Promise<
  | {
      success: true;
      latestMetadata: BackupMetadataRecord | null;
      history: BackupMetadataRecord[];
      tables: BackupTableSummary[];
    }
  | { success: false; error: string }
> {
  try {
    const { session, error: authErr } = await requireSession();
    if (!session) return { success: false, error: authErr! };

    const supabaseAdmin = createAdminClient();

    // Fetch history from backup.backup_metadata
    const { data: historyData, error: metaErr } = await supabaseAdmin
      .from('backup_metadata' as any)
      .select('*')
      .order('backed_up_at', { ascending: false })
      .limit(10);

    if (metaErr) {
      logger.warn('[getBackupStatusAction] Query backup_metadata warn:', { error: metaErr.message });
    }

    const history = (historyData || []) as unknown as BackupMetadataRecord[];
    const latestMetadata = history[0] || null;

    // List of backup tables to query current row counts
    const tableNames = [
      'groups', 'profiles', 'group_members', 'metrics_config', 'metric_definitions',
      'metric_logs', 'log_votes', 'wearable_connections', 'wearable_steps',
      'wearable_sleep', 'wearable_resting_hr', 'memories', 'memory_comments',
      'chat_history', 'system_settings', 'member_lore', 'vocab_banks',
      'bot_persistent_state', 'login_attempts', 'bot_moods', 'daily_goals',
      'daily_goal_completions', 'challenge_history', 'challenge_progression',
      'league_assignments', 'league_challenges', 'league_matches',
      'league_match_logs', 'push_subscriptions', 'cron_execution_log'
    ];

    const tables: BackupTableSummary[] = [];
    for (const tbl of tableNames) {
      const { count } = await supabaseAdmin
        .schema('backup' as any)
        .from(tbl as any)
        .select('*', { count: 'exact', head: true });

      tables.push({
        table_name: tbl,
        row_count: count ?? 0,
      });
    }

    return {
      success: true,
      latestMetadata,
      history,
      tables,
    };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    logger.error('Failed to fetch backup status:', { error: errMsg });
    return { success: false, error: errMsg };
  }
}

/** Manually trigger immediate schema replication from Master to backup schema. */
export async function triggerSchemaBackupAction(): Promise<
  | { success: true; summary: BackupTableSummary[]; totalRows: number }
  | { success: false; error: string }
> {
  try {
    const { session, error: authErr } = await requireSession();
    if (!session) return { success: false, error: authErr! };

    const supabaseAdmin = createAdminClient();
    const { data, error: rpcErr } = await supabaseAdmin.rpc('backup_replicate_from_master');

    if (rpcErr) {
      logger.error('Manual schema backup failed:', { error: rpcErr.message });
      return { success: false, error: rpcErr.message };
    }

    const summary = (data || []) as unknown as BackupTableSummary[];
    const totalRows = summary.reduce((sum, item) => sum + (Number(item.row_count) || 0), 0);

    logger.info('Manual schema backup completed successfully', {
      tablesBackedUp: summary.length,
      totalRowsCopied: totalRows,
      userId: session.userId,
    });

    revalidatePath('/admin/backup-status');
    revalidatePath('/', 'layout');

    return { success: true, summary, totalRows };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    logger.error('Manual schema backup error:', { error: errMsg });
    return { success: false, error: errMsg };
  }
}

/** Restore rows from backup schema into primary schema (Master/public). */
export async function restoreFromBackupAction(
  tableName?: string
): Promise<{ success: true; restored: { table_name: string; restored_rows: number }[] } | { success: false; error: string }> {
  try {
    const { session, error: authErr } = await requireSession();
    if (!session) return { success: false, error: authErr! };

    const supabaseAdmin = createAdminClient();
    const { data, error: rpcErr } = await supabaseAdmin.rpc('backup_restore_to_master', {
      p_table_name: tableName || null,
    });

    if (rpcErr) {
      logger.error('Schema restore from backup failed:', { error: rpcErr.message, tableName });
      return { success: false, error: rpcErr.message };
    }

    const restored = (data || []) as unknown as { table_name: string; restored_rows: number }[];
    const totalRestored = restored.reduce((sum, item) => sum + (Number(item.restored_rows) || 0), 0);

    logger.info('Restore from backup completed successfully', {
      restoredTables: restored.length,
      totalRestoredRows: totalRestored,
      tableName: tableName || 'ALL',
      userId: session.userId,
    });

    revalidatePath('/admin/backup-status');
    revalidatePath('/', 'layout');

    return { success: true, restored };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    logger.error('Schema restore error:', { error: errMsg });
    return { success: false, error: errMsg };
  }
}
