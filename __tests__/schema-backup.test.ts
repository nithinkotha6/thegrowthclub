import { describe, it } from 'node:test';
import assert from 'node:assert';

export interface MockPrimaryGroup {
  id: string;
  name: string;
  invite_code: string;
  deleted_at: string | null;
}

export interface MockPrimaryProfile {
  id: string;
  full_name: string;
  group_id: string;
  streak_count: number;
}

export interface MockPrimaryMetricLog {
  id: string;
  user_id: string;
  group_id: string;
  metric_slug: string;
  value: number;
  deleted_at: string | null;
}

export interface MockBackupMetadata {
  id: string;
  backed_up_at: string;
  status: 'completed' | 'failed';
  error_message: string | null;
  total_tables_copied: number;
  total_rows_copied: number;
}

/** Mock Store for Schema Backup & Recovery Replication Tests */
export class MockDatabaseResilienceStore {
  // Primary (Master/public) schema tables
  public primaryGroups: MockPrimaryGroup[] = [];
  public primaryProfiles: MockPrimaryProfile[] = [];
  public primaryMetricLogs: MockPrimaryLog[] = [];

  // Backup schema tables
  public backupGroups: MockPrimaryGroup[] = [];
  public backupProfiles: MockPrimaryProfile[] = [];
  public backupMetricLogs: MockPrimaryLog[] = [];
  public backupMetadata: MockBackupMetadata[] = [];

  public clear() {
    this.primaryGroups = [];
    this.primaryProfiles = [];
    this.primaryMetricLogs = [];
    this.backupGroups = [];
    this.backupProfiles = [];
    this.backupMetricLogs = [];
    this.backupMetadata = [];
  }

  /** Simulates backup_replicate_from_master() stored procedure */
  public replicateFromMaster(): { success: true; summary: { table_name: string; row_count: number }[]; totalRows: number } {
    // 1. Truncate backup tables
    this.backupGroups = [];
    this.backupProfiles = [];
    this.backupMetricLogs = [];

    // 2. Replicate active (non-deleted) records from primary schema
    const activeGroups = this.primaryGroups.filter((g) => g.deleted_at === null);
    const activeProfiles = [...this.primaryProfiles];
    const activeMetricLogs = this.primaryMetricLogs.filter((l) => l.deleted_at === null);

    this.backupGroups = JSON.parse(JSON.stringify(activeGroups));
    this.backupProfiles = JSON.parse(JSON.stringify(activeProfiles));
    this.backupMetricLogs = JSON.parse(JSON.stringify(activeMetricLogs));

    const summary = [
      { table_name: 'groups', row_count: this.backupGroups.length },
      { table_name: 'profiles', row_count: this.backupProfiles.length },
      { table_name: 'metric_logs', row_count: this.backupMetricLogs.length },
    ];

    const totalRows = summary.reduce((sum, item) => sum + item.row_count, 0);

    // 3. Log metadata record
    this.backupMetadata.push({
      id: `meta-${Math.random().toString(36).slice(2, 9)}`,
      backed_up_at: new Date().toISOString(),
      status: 'completed',
      error_message: null,
      total_tables_copied: summary.length,
      total_rows_copied: totalRows,
    });

    return { success: true, summary, totalRows };
  }

  /** Simulates backup_restore_to_master() stored procedure */
  public restoreToMaster(targetTable?: string): { success: true; restoredCount: number } {
    let restoredCount = 0;

    if (!targetTable || targetTable === 'groups') {
      for (const bg of this.backupGroups) {
        if (!this.primaryGroups.some((pg) => pg.id === bg.id)) {
          this.primaryGroups.push(JSON.parse(JSON.stringify(bg)));
          restoredCount++;
        }
      }
    }

    if (!targetTable || targetTable === 'metric_logs') {
      for (const bl of this.backupMetricLogs) {
        if (!this.primaryMetricLogs.some((pl) => pl.id === bl.id)) {
          this.primaryMetricLogs.push(JSON.parse(JSON.stringify(bl)));
          restoredCount++;
        }
      }
    }

    return { success: true, restoredCount };
  }
}

type MockPrimaryLog = MockPrimaryMetricLog;

describe('Database Schema Backup & Live Recovery Tests', () => {
  const store = new MockDatabaseResilienceStore();

  it('replicates primary tables to backup schema and records metadata log', () => {
    store.clear();

    store.primaryGroups.push({ id: 'g-1', name: 'Texasbuds', invite_code: 'tx-1', deleted_at: null });
    store.primaryProfiles.push({ id: 'u-1', full_name: 'User One', group_id: 'g-1', streak_count: 5 });
    store.primaryMetricLogs.push({ id: 'l-1', user_id: 'u-1', group_id: 'g-1', metric_slug: 'steps', value: 10000, deleted_at: null });

    const res = store.replicateFromMaster();
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.totalRows, 3);
    assert.strictEqual(store.backupGroups.length, 1);
    assert.strictEqual(store.backupProfiles.length, 1);
    assert.strictEqual(store.backupMetricLogs.length, 1);

    assert.strictEqual(store.backupMetadata.length, 1);
    assert.strictEqual(store.backupMetadata[0].status, 'completed');
    assert.strictEqual(store.backupMetadata[0].total_tables_copied, 3);
  });

  it('excludes soft-deleted records (deleted_at IS NOT NULL) during replication', () => {
    store.clear();

    store.primaryGroups.push({ id: 'g-1', name: 'Active Group', invite_code: 'code-1', deleted_at: null });
    store.primaryGroups.push({ id: 'g-2', name: 'Deleted Group', invite_code: 'code-2', deleted_at: '2026-07-20T10:00:00Z' });

    store.primaryMetricLogs.push({ id: 'l-1', user_id: 'u-1', group_id: 'g-1', metric_slug: 'steps', value: 5000, deleted_at: null });
    store.primaryMetricLogs.push({ id: 'l-2', user_id: 'u-1', group_id: 'g-1', metric_slug: 'push_ups', value: 30, deleted_at: '2026-07-21T12:00:00Z' });

    store.replicateFromMaster();

    // Only active group (g-1) should be in backup schema
    assert.strictEqual(store.backupGroups.length, 1);
    assert.strictEqual(store.backupGroups[0].id, 'g-1');

    // Only active metric log (l-1) should be in backup schema
    assert.strictEqual(store.backupMetricLogs.length, 1);
    assert.strictEqual(store.backupMetricLogs[0].id, 'l-1');
  });

  it('restores missing rows from backup schema to primary schema', () => {
    store.clear();

    store.primaryGroups.push({ id: 'g-1', name: 'Primary Group', invite_code: 'code-1', deleted_at: null });
    store.primaryMetricLogs.push({ id: 'l-1', user_id: 'u-1', group_id: 'g-1', metric_slug: 'steps', value: 8000, deleted_at: null });

    // Initial replication to backup schema
    store.replicateFromMaster();
    assert.strictEqual(store.backupMetricLogs.length, 1);

    // Simulate accidental deletion in primary schema
    store.primaryMetricLogs = [];
    assert.strictEqual(store.primaryMetricLogs.length, 0);

    // Perform restore from backup schema
    const restoreRes = store.restoreToMaster('metric_logs');
    assert.strictEqual(restoreRes.success, true);
    assert.strictEqual(restoreRes.restoredCount, 1);

    // Verify row restored back to primary schema
    assert.strictEqual(store.primaryMetricLogs.length, 1);
    assert.strictEqual(store.primaryMetricLogs[0].id, 'l-1');
  });
});
