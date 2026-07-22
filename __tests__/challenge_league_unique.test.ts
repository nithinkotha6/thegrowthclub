import { describe, it } from 'node:test';
import assert from 'node:assert';

export interface MockChallengeHistoryRow {
  id: string;
  group_id: string;
  user_id: string;
  challenge_type: string;
  entry_date: string; // YYYY-MM-DD
  tier_before: number;
  tier_after: number;
  deleted_at: string | null;
}

export interface MockLeagueMatchLogRow {
  id: string;
  group_id: string;
  match_id: string;
  action: 'create' | 'complete' | 'delete';
  actor_id: string;
  created_at: string; // YYYY-MM-DD
}

/**
 * Mock Database Store simulating composite UNIQUE constraints on challenge_history
 * and league_match_logs
 */
export class MockChallengeLeagueDbStore {
  private history: MockChallengeHistoryRow[] = [];
  private matchLogs: MockLeagueMatchLogRow[] = [];

  public clear() {
    this.history = [];
    this.matchLogs = [];
  }

  public get historyCount(): number {
    return this.history.length;
  }

  public get matchLogsCount(): number {
    return this.matchLogs.length;
  }

  public logProgressionActivity(
    groupId: string,
    userId: string,
    challengeType: string,
    newTierValue: number,
    entryDateStr: string = '2026-07-20'
  ): { success: true; id: string } | { success: false; error: string; code: string } {
    // Check composite UNIQUE (user_id, challenge_type, entry_date::date, tier_after) WHERE deleted_at IS NULL
    const isDuplicate = this.history.some(
      (h) =>
        h.user_id === userId &&
        h.challenge_type === challengeType &&
        h.entry_date === entryDateStr &&
        h.tier_after === newTierValue &&
        h.deleted_at === null
    );

    if (isDuplicate) {
      return {
        success: false,
        error: "You've already logged this value today.",
        code: '23505',
      };
    }

    const newRow: MockChallengeHistoryRow = {
      id: `hist-${Math.random().toString(36).slice(2, 9)}`,
      group_id: groupId,
      user_id: userId,
      challenge_type: challengeType,
      entry_date: entryDateStr,
      tier_before: 0,
      tier_after: newTierValue,
      deleted_at: null,
    };

    this.history.push(newRow);
    return { success: true, id: newRow.id };
  }

  public logLeagueMatchAction(
    groupId: string,
    matchId: string,
    actorId: string,
    action: 'create' | 'complete' | 'delete',
    createdAtStr: string = '2026-07-20'
  ): { success: true; id: string } | { success: false; error: string; code: string } {
    // Check composite UNIQUE (match_id, actor_id, action, created_at::date)
    const isDuplicate = this.matchLogs.some(
      (m) =>
        m.match_id === matchId &&
        m.actor_id === actorId &&
        m.action === action &&
        m.created_at === createdAtStr
    );

    if (isDuplicate) {
      return {
        success: false,
        error: 'This match action was already submitted.',
        code: '23505',
      };
    }

    const newRow: MockLeagueMatchLogRow = {
      id: `mlog-${Math.random().toString(36).slice(2, 9)}`,
      group_id: groupId,
      match_id: matchId,
      action,
      actor_id: actorId,
      created_at: createdAtStr,
    };

    this.matchLogs.push(newRow);
    return { success: true, id: newRow.id };
  }
}

describe('Challenge & League Data Integrity Uniqueness Index Tests', () => {
  const db = new MockChallengeLeagueDbStore();

  it('successfully logs initial progression activity', () => {
    db.clear();

    const res = db.logProgressionActivity('group-1', 'user-1', 'marathon', 50, '2026-07-20');
    assert.strictEqual(res.success, true);
    assert.strictEqual(db.historyCount, 1);
  });

  it('rejects duplicate progression log on same day with same user, challenge, and tier value', () => {
    db.clear();

    const res1 = db.logProgressionActivity('group-1', 'user-1', 'marathon', 50, '2026-07-20');
    assert.strictEqual(res1.success, true);

    const res2 = db.logProgressionActivity('group-1', 'user-1', 'marathon', 50, '2026-07-20');
    assert.strictEqual(res2.success, false);
    assert.strictEqual(res2.code, '23505');
    assert.strictEqual(res2.error, "You've already logged this value today.");
    assert.strictEqual(db.historyCount, 1, 'Duplicate row must NOT be created');
  });

  it('allows progression log on a different day or with a different tier value', () => {
    db.clear();

    // Log 1: Day 1
    const res1 = db.logProgressionActivity('group-1', 'user-1', 'marathon', 50, '2026-07-20');
    assert.strictEqual(res1.success, true);

    // Log 2: Day 2 (same tier value)
    const res2 = db.logProgressionActivity('group-1', 'user-1', 'marathon', 50, '2026-07-21');
    assert.strictEqual(res2.success, true);

    // Log 3: Day 1 (different tier value)
    const res3 = db.logProgressionActivity('group-1', 'user-1', 'marathon', 100, '2026-07-20');
    assert.strictEqual(res3.success, true);

    assert.strictEqual(db.historyCount, 3);
  });

  it('successfully logs league match action and rejects duplicate action on same date', () => {
    db.clear();

    const res1 = db.logLeagueMatchAction('group-1', 'match-100', 'user-1', 'complete', '2026-07-20');
    assert.strictEqual(res1.success, true);

    const res2 = db.logLeagueMatchAction('group-1', 'match-100', 'user-1', 'complete', '2026-07-20');
    assert.strictEqual(res2.success, false);
    assert.strictEqual(res2.code, '23505');
    assert.strictEqual(db.matchLogsCount, 1);
  });

  it('handles rapid double-click simulation on progression submission', async () => {
    db.clear();

    // Simulate 2 rapid concurrent clicks
    const submitPromises = [
      Promise.resolve(db.logProgressionActivity('group-1', 'user-1', 'marathon', 50, '2026-07-20')),
      Promise.resolve(db.logProgressionActivity('group-1', 'user-1', 'marathon', 50, '2026-07-20')),
    ];

    const results = await Promise.all(submitPromises);
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    assert.strictEqual(successes.length, 1, 'Only one submission succeeds');
    assert.strictEqual(failures.length, 1, 'Second submission fails with unique constraint error');
    assert.strictEqual(failures[0].error, "You've already logged this value today.");
    assert.strictEqual(db.historyCount, 1);
  });
});
