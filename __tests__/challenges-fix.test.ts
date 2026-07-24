import { describe, it } from 'node:test';
import assert from 'node:assert';
import { METRIC_PROGRESSION_CATALOG, normalizeMetricSlug } from '../lib/config/challenge-tiers';

export class MockProgressiveStore {
  public tierCompletions: Set<number> = new Set();
  public history: { id: string; metric: string; value: number; date: string }[] = [];
  public currentHighest = 0;

  public clear() {
    this.tierCompletions.clear();
    this.history = [];
    this.currentHighest = 0;
  }

  public logValue(metricSlug: string, value: number) {
    const normSlug = normalizeMetricSlug(metricSlug);
    const config = METRIC_PROGRESSION_CATALOG[normSlug];

    // Find exact tier match
    const matchedTier = config?.tiers.find((t) => t.targetValue === value);
    if (matchedTier) {
      this.tierCompletions.add(matchedTier.tierNumber);
    }

    this.currentHighest = Math.max(this.currentHighest, value);
    this.history.push({
      id: `m-${Math.random().toString(36).slice(2, 9)}`,
      metric: normSlug,
      value,
      date: new Date().toISOString(),
    });
  }

  public toggleTier(metricSlug: string, tierNumber: number, tierValue: number) {
    if (this.tierCompletions.has(tierNumber)) {
      this.tierCompletions.delete(tierNumber);
    } else {
      this.tierCompletions.add(tierNumber);
      this.currentHighest = Math.max(this.currentHighest, tierValue);
      this.history.push({
        id: `m-${Math.random().toString(36).slice(2, 9)}`,
        metric: metricSlug,
        value: tierValue,
        date: new Date().toISOString(),
      });
    }
  }

  public getIncompleteTiers(metricSlug: string) {
    const config = METRIC_PROGRESSION_CATALOG[metricSlug];
    return config.tiers.filter((t) => !this.tierCompletions.has(t.tierNumber));
  }

  public getCompletedTiers(metricSlug: string) {
    const config = METRIC_PROGRESSION_CATALOG[metricSlug];
    return config.tiers.filter((t) => this.tierCompletions.has(t.tierNumber));
  }
}

describe('Refactored Progressive Tier System Unit Tests', () => {
  const store = new MockProgressiveStore();

  it('marks exact tier match only when logging a value', () => {
    store.clear();

    // Log 40 push-ups -> matches Tier 6 (40 push-ups)
    store.logValue('push_ups', 40);

    const completed = store.getCompletedTiers('push_ups');
    assert.strictEqual(completed.length, 1);
    assert.strictEqual(completed[0].tierNumber, 6);
    assert.strictEqual(completed[0].targetValue, 40);
  });

  it('reveals incomplete tiers at top and moves completed tiers to bottom', () => {
    store.clear();

    // Initially all 14 tiers are incomplete
    let incomplete = store.getIncompleteTiers('push_ups');
    let completed = store.getCompletedTiers('push_ups');
    assert.strictEqual(incomplete.length, 14);
    assert.strictEqual(completed.length, 0);

    // Complete tier 1 (5 push-ups)
    store.toggleTier('push_ups', 1, 5);

    incomplete = store.getIncompleteTiers('push_ups');
    completed = store.getCompletedTiers('push_ups');
    assert.strictEqual(incomplete.length, 13);
    assert.strictEqual(completed.length, 1);
    assert.strictEqual(completed[0].tierNumber, 1);
  });

  it('formats milestone history as "X Push-ups done 🎯"', () => {
    store.clear();

    store.logValue('push_ups', 50);
    const entry = store.history[0];
    const unitLabel = METRIC_PROGRESSION_CATALOG['push_ups'].label;
    const formatted = `${entry.value} ${unitLabel} done 🎯`;

    assert.strictEqual(formatted, '50 Push-ups done 🎯');
  });

  it('toggles tier checkbox on click to log exact tier value', () => {
    store.clear();

    // Click checkbox for Tier 3 (15 push-ups)
    store.toggleTier('push_ups', 3, 15);

    assert.strictEqual(store.tierCompletions.has(3), true);
    assert.strictEqual(store.currentHighest, 15);
    assert.strictEqual(store.history.length, 1);

    // Click again to uncomplete
    store.toggleTier('push_ups', 3, 15);
    assert.strictEqual(store.tierCompletions.has(3), false);
  });
});
