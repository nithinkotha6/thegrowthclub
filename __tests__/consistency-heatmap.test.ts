import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateIntensityForAll,
  calculateIntensityForMetric,
  getColorForIntensity,
  calculateStreak,
  calculateCompletionRate,
  getLast30Days,
} from '../lib/utils/heatmapColors';

describe('Consistency Heatmap Unit Tests', () => {
  it('calculates intensity correctly for composite all metrics mode', () => {
    assert.strictEqual(calculateIntensityForAll(0), 0); // None
    assert.strictEqual(calculateIntensityForAll(1), 1); // Partial (1-2)
    assert.strictEqual(calculateIntensityForAll(2), 1); // Partial (1-2)
    assert.strictEqual(calculateIntensityForAll(3), 2); // Partial (3)
    assert.strictEqual(calculateIntensityForAll(4), 3); // Good (4)
    assert.strictEqual(calculateIntensityForAll(5), 4); // Perfect (5)
  });

  it('calculates intensity correctly for individual metric mode', () => {
    assert.strictEqual(calculateIntensityForMetric(false), 0); // None
    assert.strictEqual(calculateIntensityForMetric(true), 4); // Perfect (Dark Green)
  });

  it('maps intensity level to correct color hex strings', () => {
    assert.strictEqual(getColorForIntensity(0), '#E8E8E8'); // White / Light Gray
    assert.strictEqual(getColorForIntensity(1), '#F5E6D3'); // Cream
    assert.strictEqual(getColorForIntensity(2), '#FFE082'); // Light Yellow
    assert.strictEqual(getColorForIntensity(3), '#CCFF00'); // Neon Lime
    assert.strictEqual(getColorForIntensity(4), '#4CAF50'); // Dark Green
  });

  it('calculates streak correctly for consecutive days', () => {
    const fixedToday = new Date('2026-07-23T12:00:00Z');
    const dates = getLast30Days(fixedToday);

    // Populate last 5 days with all 5 metrics
    const byDateMap: Record<string, Set<string>> = {};
    const allMetrics = ['steps', 'push_ups', 'squats', 'diet', 'gym_streak'];

    for (let i = dates.length - 5; i < dates.length; i++) {
      byDateMap[dates[i]] = new Set(allMetrics);
    }

    const streak = calculateStreak(byDateMap, 'all', 5, fixedToday);
    assert.strictEqual(streak, 5);
  });

  it('calculates completion rate correctly over 30 days window', () => {
    const fixedToday = new Date('2026-07-23T12:00:00Z');
    const dates = getLast30Days(fixedToday);

    const byDateMap: Record<string, Set<string>> = {};
    const allMetrics = ['steps', 'push_ups', 'squats', 'diet', 'gym_streak'];

    // 15 days out of 30 have all 5 metrics completed = 75 actual / 150 total = 50%
    for (let i = 0; i < 15; i++) {
      byDateMap[dates[i]] = new Set(allMetrics);
    }

    const rateAll = calculateCompletionRate(byDateMap, 'all', 5, fixedToday);
    assert.strictEqual(rateAll, 50);

    // Individual metric view: 15 days out of 30 for 'steps' = 50%
    const rateSteps = calculateCompletionRate(byDateMap, 'steps', 5, fixedToday);
    assert.strictEqual(rateSteps, 50);
  });
});
