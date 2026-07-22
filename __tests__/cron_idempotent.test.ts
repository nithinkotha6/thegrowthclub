import { describe, it } from 'node:test';
import assert from 'node:assert';

export interface CronExecutionLogRecord {
  id: string;
  cron_name: string;
  group_id: string | null;
  execution_date: string;
  started_at: string;
  completed_at: string | null;
  status: 'started' | 'completed' | 'failed';
  error_message: string | null;
}

/**
 * Mock Cron Execution Log Store simulating Postgres UNIQUE(cron_name, group_id, execution_date)
 */
export class MockCronExecutionStore {
  private logs: CronExecutionLogRecord[] = [];

  public clear(): void {
    this.logs = [];
  }

  public get recordCount(): number {
    return this.logs.length;
  }

  public async runCronIdempotent(
    cronName: string,
    groupId: string | null,
    executionDate: Date | string,
    cronLogic: () => Promise<void>
  ): Promise<{ status: 'completed' | 'skipped' | 'failed'; reason?: string; error?: string }> {
    const dateStr = typeof executionDate === 'string'
      ? executionDate.slice(0, 10)
      : executionDate.toISOString().slice(0, 10);

    const existingIndex = this.logs.findIndex(
      (item) =>
        item.cron_name === cronName &&
        item.group_id === groupId &&
        item.execution_date === dateStr
    );

    if (existingIndex !== -1 && this.logs[existingIndex].status === 'completed') {
      return { status: 'skipped', reason: 'already_executed' };
    }

    if (existingIndex !== -1) {
      this.logs[existingIndex].status = 'started';
      this.logs[existingIndex].started_at = new Date().toISOString();
      this.logs[existingIndex].error_message = null;
    } else {
      this.logs.push({
        id: `cron-log-${Math.random().toString(36).slice(2, 9)}`,
        cron_name: cronName,
        group_id: groupId,
        execution_date: dateStr,
        started_at: new Date().toISOString(),
        completed_at: null,
        status: 'started',
        error_message: null,
      });
    }

    const recIndex = this.logs.findIndex(
      (item) =>
        item.cron_name === cronName &&
        item.group_id === groupId &&
        item.execution_date === dateStr
    );

    try {
      await cronLogic();
      this.logs[recIndex].status = 'completed';
      this.logs[recIndex].completed_at = new Date().toISOString();
      return { status: 'completed' };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logs[recIndex].status = 'failed';
      this.logs[recIndex].error_message = errorMsg;
      return { status: 'failed', error: errorMsg };
    }
  }
}

describe('Cron Idempotency & Execution Lock Tests', () => {
  const store = new MockCronExecutionStore();

  it('runs cron logic on first invocation and records completed status', async () => {
    store.clear();
    let executions = 0;

    const res = await store.runCronIdempotent('daily-whistle', 'group-1', '2026-07-22', async () => {
      executions++;
    });

    assert.strictEqual(res.status, 'completed');
    assert.strictEqual(executions, 1, 'Logic should execute once');
    assert.strictEqual(store.recordCount, 1);
  });

  it('skips cron logic on duplicate trigger for same group and date window', async () => {
    store.clear();
    let executions = 0;

    // Invocations 1
    const res1 = await store.runCronIdempotent('daily-whistle', 'group-1', '2026-07-22', async () => {
      executions++;
    });
    assert.strictEqual(res1.status, 'completed');
    assert.strictEqual(executions, 1);

    // Invocation 2 (Duplicate Vercel trigger)
    const res2 = await store.runCronIdempotent('daily-whistle', 'group-1', '2026-07-22', async () => {
      executions++;
    });
    assert.strictEqual(res2.status, 'skipped');
    assert.strictEqual(res2.reason, 'already_executed');
    assert.strictEqual(executions, 1, 'Logic must NOT run a second time');
    assert.strictEqual(store.recordCount, 1, 'Execution log entry remains 1');
  });

  it('allows retrying cron logic if previous run failed', async () => {
    store.clear();
    let executions = 0;

    // Invocation 1: fails
    const res1 = await store.runCronIdempotent('daily-whistle', 'group-1', '2026-07-22', async () => {
      executions++;
      throw new Error('Network timeout during dispatch');
    });

    assert.strictEqual(res1.status, 'failed');
    assert.strictEqual(res1.error, 'Network timeout during dispatch');
    assert.strictEqual(executions, 1);

    // Invocation 2: retry after failure -> logic executes again
    const res2 = await store.runCronIdempotent('daily-whistle', 'group-1', '2026-07-22', async () => {
      executions++;
    });

    assert.strictEqual(res2.status, 'completed');
    assert.strictEqual(executions, 2, 'Logic should retry after failure');
  });

  it('handles distinct groups independently on same execution date', async () => {
    store.clear();
    let group1Executions = 0;
    let group2Executions = 0;

    await store.runCronIdempotent('daily-whistle', 'group-1', '2026-07-22', async () => {
      group1Executions++;
    });

    await store.runCronIdempotent('daily-whistle', 'group-2', '2026-07-22', async () => {
      group2Executions++;
    });

    assert.strictEqual(group1Executions, 1);
    assert.strictEqual(group2Executions, 1);
    assert.strictEqual(store.recordCount, 2);
  });
});
