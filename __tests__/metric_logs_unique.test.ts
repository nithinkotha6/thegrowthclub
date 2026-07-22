import { describe, it } from 'node:test';
import assert from 'node:assert';

export interface MetricLogRecord {
  id: string;
  user_id: string;
  group_id: string;
  metric_slug: string;
  value: number;
  unit: string;
  logged_at: string;
  deleted_at: string | null;
}

/**
 * Mock database store simulating Postgres metric_logs table with UNIQUE index:
 * (user_id, metric_slug, (logged_at AT TIME ZONE 'UTC')::date, value) WHERE deleted_at IS NULL
 */
export class MockMetricLogsRepository {
  private logs: MetricLogRecord[] = [];

  public async insert(record: Omit<MetricLogRecord, 'id' | 'deleted_at'>): Promise<{ success: true; data: MetricLogRecord } | { success: false; code: string; error: string }> {
    const logDateStr = new Date(record.logged_at).toISOString().slice(0, 10);

    // Enforce composite unique index logic
    const duplicate = this.logs.find(
      (item) =>
        item.deleted_at === null &&
        item.user_id === record.user_id &&
        item.metric_slug === record.metric_slug &&
        item.value === record.value &&
        new Date(item.logged_at).toISOString().slice(0, 10) === logDateStr
    );

    if (duplicate) {
      return {
        success: false,
        code: '23505',
        error: 'Activity already logged today with this value.',
      };
    }

    const newRecord: MetricLogRecord = {
      ...record,
      id: `log-${Math.random().toString(36).slice(2, 9)}`,
      deleted_at: null,
    };
    this.logs.push(newRecord);
    return { success: true, data: newRecord };
  }

  public get count(): number {
    return this.logs.length;
  }

  public clear(): void {
    this.logs = [];
  }
}

describe('Metric Logs Uniqueness Index Tests', () => {
  const repo = new MockMetricLogsRepository();

  it('successfully inserts initial activity record', async () => {
    repo.clear();
    const res = await repo.insert({
      user_id: 'user-1',
      group_id: 'group-1',
      metric_slug: 'pushups',
      value: 50,
      unit: 'reps',
      logged_at: '2026-07-20T10:00:00Z',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(repo.count, 1);
  });

  it('rejects duplicate insert on same day with same user, metric, and value', async () => {
    repo.clear();
    // Activity 1
    await repo.insert({
      user_id: 'user-1',
      group_id: 'group-1',
      metric_slug: 'pushups',
      value: 50,
      unit: 'reps',
      logged_at: '2026-07-20T10:00:00Z',
    });

    // Activity 2 (Duplicate)
    const duplicateRes = await repo.insert({
      user_id: 'user-1',
      group_id: 'group-1',
      metric_slug: 'pushups',
      value: 50,
      unit: 'reps',
      logged_at: '2026-07-20T14:30:00Z', // same UTC date
    });

    assert.strictEqual(duplicateRes.success, false);
    if (!duplicateRes.success) {
      assert.strictEqual(duplicateRes.code, '23505');
      assert.strictEqual(duplicateRes.error, 'Activity already logged today with this value.');
    }
    assert.strictEqual(repo.count, 1);
  });

  it('allows activity log on a different day', async () => {
    repo.clear();
    await repo.insert({
      user_id: 'user-1',
      group_id: 'group-1',
      metric_slug: 'pushups',
      value: 50,
      unit: 'reps',
      logged_at: '2026-07-20T10:00:00Z',
    });

    const res = await repo.insert({
      user_id: 'user-1',
      group_id: 'group-1',
      metric_slug: 'pushups',
      value: 50,
      unit: 'reps',
      logged_at: '2026-07-21T10:00:00Z', // next day
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(repo.count, 2);
  });

  it('allows activity log for a different metric on the same day', async () => {
    repo.clear();
    await repo.insert({
      user_id: 'user-1',
      group_id: 'group-1',
      metric_slug: 'pushups',
      value: 50,
      unit: 'reps',
      logged_at: '2026-07-20T10:00:00Z',
    });

    const res = await repo.insert({
      user_id: 'user-1',
      group_id: 'group-1',
      metric_slug: 'pullups',
      value: 10,
      unit: 'reps',
      logged_at: '2026-07-20T10:30:00Z', // different metric
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(repo.count, 2);
  });

  it('allows activity log with a different value on the same day', async () => {
    repo.clear();
    await repo.insert({
      user_id: 'user-1',
      group_id: 'group-1',
      metric_slug: 'pushups',
      value: 50,
      unit: 'reps',
      logged_at: '2026-07-20T10:00:00Z',
    });

    const res = await repo.insert({
      user_id: 'user-1',
      group_id: 'group-1',
      metric_slug: 'pushups',
      value: 100, // different value (e.g. evening set)
      unit: 'reps',
      logged_at: '2026-07-20T18:00:00Z',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(repo.count, 2);
  });
});

describe('Double-Click & Network Retry Simulations', () => {
  const repo = new MockMetricLogsRepository();

  it('handles double-click simulation (rapid concurrent submissions within 500ms)', async () => {
    repo.clear();

    const payload = {
      user_id: 'user-1',
      group_id: 'group-1',
      metric_slug: 'run',
      value: 5,
      unit: 'miles',
      logged_at: '2026-07-22T08:00:00Z',
    };

    // Simulate 2 form submissions triggered in rapid succession (<500ms)
    const [res1, res2] = await Promise.all([
      repo.insert(payload),
      repo.insert(payload),
    ]);

    const successes = [res1, res2].filter((r) => r.success);
    const failures = [res1, res2].filter((r) => !r.success);

    assert.strictEqual(successes.length, 1, 'Exactly 1 request should succeed');
    assert.strictEqual(failures.length, 1, 'Exactly 1 request should be rejected');
    assert.strictEqual(failures[0].error, 'Activity already logged today with this value.');
    assert.strictEqual(repo.count, 1, 'Database should contain exactly 1 row');
  });

  it('handles network retry simulation (sequential resubmission on slow response)', async () => {
    repo.clear();

    const payload = {
      user_id: 'user-1',
      group_id: 'group-1',
      metric_slug: 'water',
      value: 2,
      unit: 'liters',
      logged_at: '2026-07-22T09:00:00Z',
    };

    // First attempt succeeds
    const firstAttempt = await repo.insert(payload);
    assert.strictEqual(firstAttempt.success, true);

    // Network retry (user clicks again after timeout/retry)
    const retryAttempt = await repo.insert(payload);
    assert.strictEqual(retryAttempt.success, false);
    if (!retryAttempt.success) {
      assert.strictEqual(retryAttempt.error, 'Activity already logged today with this value.');
    }
    assert.strictEqual(repo.count, 1);
  });
});
