import { describe, it } from 'node:test';
import assert from 'node:assert';
import { METRIC_PROGRESSION_CATALOG, normalizeMetricSlug } from '../lib/config/challenge-tiers';

export interface MockProgressionRow {
  id: string;
  user_id: string;
  group_id: string;
  metric_slug: string;
  current_highest_value: number;
  current_tier: number;
}

export interface MockHistoryRow {
  id: string;
  user_id: string;
  group_id: string;
  metric_slug: string;
  tier_before: number;
  tier_after: number;
  entry_date: string;
  deleted_at: string | null;
}

export class MockProgressionStore {
  public progression: MockProgressionRow[] = [];
  public history: MockHistoryRow[] = [];

  public clear() {
    this.progression = [];
    this.history = [];
  }

  public logValue(userId: string, groupId: string, metricSlug: string, value: number) {
    const normSlug = normalizeMetricSlug(metricSlug);
    const existingProg = this.progression.find((p) => p.user_id === userId && p.metric_slug === normSlug);
    const prevValue = existingProg?.current_highest_value ?? 0;

    const historyRow: MockHistoryRow = {
      id: `h-${Math.random().toString(36).slice(2, 9)}`,
      user_id: userId,
      group_id: groupId,
      metric_slug: normSlug,
      tier_before: prevValue,
      tier_after: value,
      entry_date: new Date().toISOString(),
      deleted_at: null,
    };
    this.history.push(historyRow);

    if (value > prevValue) {
      if (existingProg) {
        existingProg.current_highest_value = value;
        existingProg.current_tier = value;
      } else {
        this.progression.push({
          id: `p-${Math.random().toString(36).slice(2, 9)}`,
          user_id: userId,
          group_id: groupId,
          metric_slug: normSlug,
          current_highest_value: value,
          current_tier: value,
        });
      }
    }

    return historyRow;
  }

  public softDeleteHistory(historyId: string) {
    const entry = this.history.find((h) => h.id === historyId);
    if (entry) {
      entry.deleted_at = new Date().toISOString();
      // Recompute highest value for metric
      const activeHistory = this.history.filter(
        (h) => h.user_id === entry.user_id && h.metric_slug === entry.metric_slug && h.deleted_at === null
      );
      const newHighest = activeHistory.reduce((max, h) => Math.max(max, h.tier_after), 0);
      const prog = this.progression.find((p) => p.user_id === entry.user_id && p.metric_slug === entry.metric_slug);
      if (prog) {
        prog.current_highest_value = newHighest;
        prog.current_tier = newHighest;
      }
    }
  }

  public getUnlockedTiers(metricSlug: string, value: number) {
    const normSlug = normalizeMetricSlug(metricSlug);
    const config = METRIC_PROGRESSION_CATALOG[normSlug];
    if (!config) return [];
    return config.tiers.filter((t) => value >= t.targetValue);
  }
}

describe('Clash of Clans Tier Progression Unit Tests', () => {
  const store = new MockProgressionStore();

  it('unlocks all tiers where current highest value >= target value', () => {
    // Value 55 push-ups
    const unlocked = store.getUnlockedTiers('push_ups', 55);
    // Push-ups targets: 5, 10, 15, 20, 30, 40 (6 tiers unlocked out of 14)
    assert.strictEqual(unlocked.length, 6);
    assert.strictEqual(unlocked[0].tierNumber, 1);
    assert.strictEqual(unlocked[5].tierNumber, 6);
  });

  it('updates personal best and logs history entry on new record', () => {
    store.clear();

    // Log 10 push-ups
    store.logValue('user-1', 'group-1', 'push_ups', 10);
    assert.strictEqual(store.history.length, 1);
    assert.strictEqual(store.progression[0].current_highest_value, 10);

    // Log 50 push-ups (new record)
    store.logValue('user-1', 'group-1', 'push_ups', 50);
    assert.strictEqual(store.history.length, 2);
    assert.strictEqual(store.progression[0].current_highest_value, 50);
  });

  it('handles soft-delete of history entry and recomputes personal best', () => {
    store.clear();

    const h1 = store.logValue('user-1', 'group-1', 'push_ups', 10);
    const h2 = store.logValue('user-1', 'group-1', 'push_ups', 50);
    assert.strictEqual(store.progression[0].current_highest_value, 50);

    // Soft-delete the 50 push-ups entry
    store.softDeleteHistory(h2.id);
    assert.strictEqual(h2.deleted_at !== null, true);
    assert.strictEqual(store.progression[0].current_highest_value, 10);
  });

  it('switches metrics and maintains independent progression states', () => {
    store.clear();

    store.logValue('user-1', 'group-1', 'push_ups', 100);
    store.logValue('user-1', 'group-1', 'pull_ups', 20);

    const pushProg = store.progression.find((p) => p.metric_slug === 'push_ups');
    const pullProg = store.progression.find((p) => p.metric_slug === 'pull_ups');

    assert.strictEqual(pushProg?.current_highest_value, 100);
    assert.strictEqual(pullProg?.current_highest_value, 20);
  });
});
