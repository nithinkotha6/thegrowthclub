import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { safeCompare } from '@/lib/security';
import { logger } from '@/lib/logger';
import { runCronIdempotent } from '@/lib/cron/idempotent-runner';

export const maxDuration = 60;

/**
 * Daily Schema Backup Cron Job. Runs daily at 03:00 UTC.
 * Replicates all primary schema tables into the 'backup' schema.
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    const secret = process.env.CRON_SECRET;

    // Validate authorization if CRON_SECRET is configured
    if (secret && authHeader && !safeCompare(authHeader, `Bearer ${secret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();
    const executionDate = new Date().toISOString().slice(0, 10);
    let summary: { table_name: string; row_count: number }[] = [];
    let totalRows = 0;
    let rpcError: string | null = null;

    const runResult = await runCronIdempotent('daily-schema-backup', null, executionDate, async () => {
      const { data, error } = await supabaseAdmin.rpc('backup_replicate_from_master');

      if (error) {
        rpcError = error.message;
        logger.error('Schema backup failed', { error: error.message, timestamp: new Date().toISOString() });
        throw new Error(error.message);
      }

      summary = (data || []) as { table_name: string; row_count: number }[];
      totalRows = summary.reduce((sum, item) => sum + (Number(item.row_count) || 0), 0);

      logger.info('Schema backup completed', {
        tablesBackedUp: summary.length,
        totalRowsCopied: totalRows,
        timestamp: new Date().toISOString(),
      });
    });

    if (runResult.status === 'skipped') {
      return NextResponse.json({
        success: true,
        status: 'skipped',
        message: 'Daily schema backup already executed for today window.',
      });
    }

    return NextResponse.json({
      success: !rpcError,
      status: runResult.status,
      summary,
      totalRows,
    });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    logger.error('Schema backup job error', { error: errMsg });
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
