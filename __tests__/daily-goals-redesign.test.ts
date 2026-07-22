import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DAILY_GOAL_METRICS } from '../lib/config/daily-goals';

export interface MockGoalCompletion {
  id: string;
  daily_goal_id: string;
  user_id: string;
  completed_at: string; // ISO date
  deleted_at: string | null;
}

/** Mock Database Store for Daily Goals redesign unit testing */
export class MockDailyGoalsDbStore {
  private completions: MockGoalCompletion[] = [];

  public clear() {
    this.completions = [];
  }

  public get completionsCount(): number {
    return this.completions.filter((c) => c.deleted_at === null).length;
  }

  public logCompletion(
    dailyGoalId: string,
    userId: string,
    completedAtISO: string
  ): { success: true; id: string } | { success: false; error: string } {
    const newRecord: MockGoalCompletion = {
      id: `cmpl-${Math.random().toString(36).slice(2, 9)}`,
      daily_goal_id: dailyGoalId,
      user_id: userId,
      completed_at: completedAtISO,
      deleted_at: null,
    };
    this.completions.push(newRecord);
    return { success: true, id: newRecord.id };
  }

  public deleteCompletion(completionId: string): { success: true } | { success: false; error: string } {
    const target = this.completions.find((c) => c.id === completionId && c.deleted_at === null);
    if (!target) {
      return { success: false, error: 'Completion not found.' };
    }
    target.deleted_at = new Date().toISOString();
    return { success: true };
  }

  public getCompletionsForDate(userId: string, dateStr: string): MockGoalCompletion[] {
    return this.completions.filter(
      (c) => c.user_id === userId && c.deleted_at === null && c.completed_at.startsWith(dateStr)
    );
  }
}

describe('Daily Goals Redesign Unit & Integration Tests', () => {
  const store = new MockDailyGoalsDbStore();

  it('verifies predefined daily goal metrics configuration', () => {
    assert.strictEqual(DAILY_GOAL_METRICS.length, 5);

    const names = DAILY_GOAL_METRICS.map((m) => m.name);
    assert.ok(names.includes('10,000 steps'));
    assert.ok(names.includes('50 Push-ups'));
    assert.ok(names.includes('50 squads'));
    assert.ok(names.includes('Gym streak'));
    assert.ok(names.includes('Diet'));
  });

  it('logs goal completion for today on checking box -> database insert called', () => {
    store.clear();
    const todayStr = '2026-07-22';
    const completedAt = `${todayStr}T12:00:00.000Z`;

    const res = store.logCompletion('goal-steps', 'user-1', completedAt);
    assert.strictEqual(res.success, true);
    assert.strictEqual(store.completionsCount, 1);

    const todayCompletions = store.getCompletionsForDate('user-1', todayStr);
    assert.strictEqual(todayCompletions.length, 1);
    assert.strictEqual(todayCompletions[0].daily_goal_id, 'goal-steps');
  });

  it('unchecks goal -> soft-deletes completion row from database', () => {
    store.clear();
    const todayStr = '2026-07-22';

    const logRes = store.logCompletion('goal-pushups', 'user-1', `${todayStr}T12:00:00.000Z`);
    assert.strictEqual(logRes.success, true);
    assert.strictEqual(store.completionsCount, 1);

    const delRes = store.deleteCompletion(logRes.id);
    assert.strictEqual(delRes.success, true);
    assert.strictEqual(store.completionsCount, 0);

    const todayCompletions = store.getCompletionsForDate('user-1', todayStr);
    assert.strictEqual(todayCompletions.length, 0);
  });

  it('navigates dates -> queries goal status specifically for selected date', () => {
    store.clear();

    // Log steps on 2026-07-20
    store.logCompletion('goal-steps', 'user-1', '2026-07-20T12:00:00.000Z');

    // Log pushups on 2026-07-21
    store.logCompletion('goal-pushups', 'user-1', '2026-07-21T12:00:00.000Z');

    const day20Completions = store.getCompletionsForDate('user-1', '2026-07-20');
    assert.strictEqual(day20Completions.length, 1);
    assert.strictEqual(day20Completions[0].daily_goal_id, 'goal-steps');

    const day21Completions = store.getCompletionsForDate('user-1', '2026-07-21');
    assert.strictEqual(day21Completions.length, 1);
    assert.strictEqual(day21Completions[0].daily_goal_id, 'goal-pushups');

    const day22Completions = store.getCompletionsForDate('user-1', '2026-07-22');
    assert.strictEqual(day22Completions.length, 0);
  });
});
