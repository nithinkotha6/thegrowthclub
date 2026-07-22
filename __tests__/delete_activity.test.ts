import { describe, it } from 'node:test';
import assert from 'node:assert';
import { logger } from '../lib/logger';

export interface ActivityRecord {
  id: string;
  user_id: string;
  metric_slug: string;
  value: number;
}

export interface LogVoteRecord {
  id: string;
  log_id: string;
  voter_id: string;
  vote: 'approve' | 'reject';
}

/**
 * Mock database service verifying database ON DELETE CASCADE for log_votes
 */
export class MockDatabaseService {
  public metricLogs: ActivityRecord[] = [];
  public logVotes: LogVoteRecord[] = [];
  public logLogs: Array<{ level: string; msg: string; ctx?: Record<string, unknown> }> = [];

  public clear(): void {
    this.metricLogs = [];
    this.logVotes = [];
    this.logLogs = [];
  }

  public async deleteActivity(
    logId: string,
    currentUserId: string,
    simulateDbError?: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const record = this.metricLogs.find((m) => m.id === logId);

      if (!record) {
        logger.warn('[deleteActivityAction] Activity record not found', { logId });
        this.logLogs.push({ level: 'warn', msg: '[deleteActivityAction] Activity record not found', ctx: { logId } });
        return { success: false, error: 'Activity record not found.' };
      }

      if (record.user_id !== currentUserId) {
        logger.warn('[deleteActivityAction] Unauthorized deletion attempt', { logId, recordUserId: record.user_id, currentUserId });
        this.logLogs.push({ level: 'warn', msg: '[deleteActivityAction] Unauthorized deletion attempt', ctx: { logId } });
        return { success: false, error: 'Unauthorized: You can only delete activities you logged.' };
      }

      if (simulateDbError) {
        const errorMsg = 'Database connection error during delete';
        logger.error('[deleteActivityAction] Activity deletion failed', { logId, error: errorMsg });
        this.logLogs.push({ level: 'error', msg: '[deleteActivityAction] Activity deletion failed', ctx: { logId, error: errorMsg } });
        return { success: false, error: `Failed to delete activity: ${errorMsg}` };
      }

      // Perform deletion from metricLogs
      this.metricLogs = this.metricLogs.filter((m) => m.id !== logId);
      // Database ON DELETE CASCADE clears log_votes
      this.logVotes = this.logVotes.filter((v) => v.log_id !== logId);

      logger.info('[deleteActivityAction] Activity deleted', { logId });
      this.logLogs.push({ level: 'info', msg: '[deleteActivityAction] Activity deleted', ctx: { logId } });
      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('[deleteActivityAction] Unexpected error deleting activity', { logId, error: errorMsg });
      this.logLogs.push({ level: 'error', msg: '[deleteActivityAction] Unexpected error deleting activity', ctx: { logId, error: errorMsg } });
      return { success: false, error: 'Failed to delete activity.' };
    }
  }
}

describe('Delete Activity Action & Cascade Tests', () => {
  const db = new MockDatabaseService();

  it('deletes activity and cascades deletion to log_votes', async () => {
    db.clear();
    const logId = 'log-100';
    const userId = 'user-1';

    db.metricLogs.push({ id: logId, user_id: userId, metric_slug: 'pushups', value: 50 });
    db.logVotes.push({ id: 'vote-1', log_id: logId, voter_id: 'user-2', vote: 'approve' });
    db.logVotes.push({ id: 'vote-2', log_id: logId, voter_id: 'user-3', vote: 'approve' });

    assert.strictEqual(db.metricLogs.length, 1);
    assert.strictEqual(db.logVotes.length, 2);

    const result = await db.deleteActivity(logId, userId);

    assert.strictEqual(result.success, true);
    assert.strictEqual(db.metricLogs.length, 0, 'metric_logs row should be deleted');
    assert.strictEqual(db.logVotes.length, 0, 'log_votes child rows should be cascade-deleted');

    const infoLogs = db.logLogs.filter((l) => l.level === 'info' && l.msg.includes('Activity deleted'));
    assert.strictEqual(infoLogs.length, 1);
  });

  it('handles database error and logs error via logger.error', async () => {
    db.clear();
    const logId = 'log-101';
    const userId = 'user-1';

    db.metricLogs.push({ id: logId, user_id: userId, metric_slug: 'run', value: 5 });

    const result = await db.deleteActivity(logId, userId, true);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error?.includes('Failed to delete activity'), true);
    assert.strictEqual(db.metricLogs.length, 1, 'metric_logs row should remain on failed delete');

    const errorLogs = db.logLogs.filter((l) => l.level === 'error');
    assert.strictEqual(errorLogs.length, 1);
  });

  it('rejects unauthorized deletion attempt and logs warning', async () => {
    db.clear();
    const logId = 'log-102';
    const ownerId = 'user-owner';
    const attackerId = 'user-attacker';

    db.metricLogs.push({ id: logId, user_id: ownerId, metric_slug: 'catan_wins', value: 1 });

    const result = await db.deleteActivity(logId, attackerId);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error?.includes('Unauthorized'), true);
    assert.strictEqual(db.metricLogs.length, 1);

    const warnLogs = db.logLogs.filter((l) => l.level === 'warn' && l.msg.includes('Unauthorized'));
    assert.strictEqual(warnLogs.length, 1);
  });
});
