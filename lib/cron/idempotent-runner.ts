import { createAdminClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export interface CronRunResult {
  status: 'completed' | 'skipped' | 'failed';
  reason?: string;
  error?: string;
}

/**
 * Idempotent cron runner.
 * Ensures that a given cron job runs at most once per execution date for a given group.
 *
 * @param cronName Name identifier of the cron job (e.g., 'daily-whistle')
 * @param groupId Group ID string, or null for global system crons
 * @param executionDate Date object or YYYY-MM-DD date string for the execution window
 * @param cronLogic Async function containing the core cron task
 */
export async function runCronIdempotent(
  cronName: string,
  groupId: string | null,
  executionDate: Date | string,
  cronLogic: () => Promise<void>
): Promise<CronRunResult> {
  const supabase = createAdminClient();
  const dateStr = typeof executionDate === 'string'
    ? executionDate.slice(0, 10)
    : executionDate.toISOString().slice(0, 10);

  // 1. Check if already executed today for this group/cron
  let checkQuery = supabase
    .from('cron_execution_log')
    .select('id, status, error_message')
    .eq('cron_name', cronName)
    .eq('execution_date', dateStr);

  if (groupId) {
    checkQuery = checkQuery.eq('group_id', groupId);
  } else {
    checkQuery = checkQuery.is('group_id', null);
  }

  const { data: existing, error: checkErr } = await checkQuery.maybeSingle();

  if (checkErr) {
    logger.warn('[runCronIdempotent] Error checking cron execution log:', { cronName, groupId, date: dateStr, error: checkErr.message });
  }

  if (existing && existing.status === 'completed') {
    logger.info('[runCronIdempotent] Cron already completed for execution window, skipping:', { cronName, groupId, date: dateStr });
    return { status: 'skipped', reason: 'already_executed' };
  }

  // 2. Mark as started
  if (existing) {
    await supabase
      .from('cron_execution_log')
      .update({
        status: 'started',
        started_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', existing.id);
  } else {
    const { error: insertErr } = await supabase.from('cron_execution_log').insert({
      cron_name: cronName,
      group_id: groupId,
      execution_date: dateStr,
      started_at: new Date().toISOString(),
      status: 'started',
    });

    if (insertErr && (insertErr.code === '23505' || insertErr.message?.includes('unique'))) {
      logger.info('[runCronIdempotent] Concurrent cron execution detected, skipping:', { cronName, groupId, date: dateStr });
      return { status: 'skipped', reason: 'concurrent_lock' };
    }
  }

  // 3. Execute cron logic
  try {
    await cronLogic();

    let updateQuery = supabase
      .from('cron_execution_log')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('cron_name', cronName)
      .eq('execution_date', dateStr);

    if (groupId) {
      updateQuery = updateQuery.eq('group_id', groupId);
    } else {
      updateQuery = updateQuery.is('group_id', null);
    }

    await updateQuery;

    logger.info('[runCronIdempotent] Cron completed successfully:', { cronName, groupId, date: dateStr });
    return { status: 'completed' };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    let failQuery = supabase
      .from('cron_execution_log')
      .update({
        status: 'failed',
        error_message: errorMsg,
      })
      .eq('cron_name', cronName)
      .eq('execution_date', dateStr);

    if (groupId) {
      failQuery = failQuery.eq('group_id', groupId);
    } else {
      failQuery = failQuery.is('group_id', null);
    }

    await failQuery;

    logger.error('[runCronIdempotent] Cron execution failed:', { cronName, groupId, date: dateStr, error: errorMsg });
    throw err;
  }
}
