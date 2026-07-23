import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateIntensityForAll,
  calculateIntensityForMetric,
  getColorForIntensity,
  calculateStreak,
  calculateConsistencyRate,
  getDaysInMonth,
  getLast30Days,
} from '../lib/utils/heatmapColors';

describe('Consistency Heatmap Unit Tests', () => {
  it('calculates intensity correctly for composite all metrics mode', () => {
    assert.strictEqual(calculateIntensityForAll(0), 0); // None
    assert.strictEqual(calculateIntensityForAll(1), 1); // Partial (1-3)
    assert.strictEqual(calculateIntensityForAll(2), 1); // Partial (1-3)
    assert.strictEqual(calculateIntensityForAll(3), 1); // Partial (1-3)
    assert.strictEqual(calculateIntensityForAll(4), 3); // Good (4)
    assert.strictEqual(calculateIntensityForAll(5), 4); // Perfect (5)
  });

  it('calculates intensity correctly for individual metric mode', () => {
    assert.strictEqual(calculateIntensityForMetric(false), 0); // None (#111A0A)
    assert.strictEqual(calculateIntensityForMetric(true), 4); // Perfect (#CEFF00)
  });

  it('maps intensity level to correct requested color hex strings', () => {
    assert.strictEqual(getColorForIntensity(0), '#111A0A'); // Dark Green-Black
    assert.strictEqual(getColorForIntensity(1), '#2C4815'); // Dark Forest Green
    assert.strictEqual(getColorForIntensity(3), '#6AA31A'); // Medium Vibrant Green
    assert.strictEqual(getColorForIntensity(4), '#CEFF00'); // Brand Neon Lime Accent
  });

  it('generates correct days in month array', () => {
    const julyDays = getDaysInMonth(2026, 6); // July = month index 6
    assert.strictEqual(julyDays.length, 31);
    assert.strictEqual(julyDays[0], '2026-07-01');
    assert.strictEqual(julyDays[30], '2026-07-31');

    const febDays = getDaysInMonth(2026, 1); // Feb 2026
    assert.strictEqual(febDays.length, 28);
  });

  it('calculates consistency rate as days attended / total days of month', () => {
    const byDateMap: Record<string, Set<string>> = {};
    const allMetrics = ['steps', 'push_ups', 'squats', 'diet', 'gym_streak'];

    // 14 days attended out of 31 in July 2026
    const julyDays = getDaysInMonth(2026, 6);
    for (let i = 0; i < 14; i++) {
      byDateMap[julyDays[i]] = new Set(allMetrics);
    }

    const rate = calculateConsistencyRate(byDateMap, 'all', 2026, 6);
    assert.strictEqual(rate.daysAttended, 14);
    assert.strictEqual(rate.totalDaysInMonth, 31);
    assert.strictEqual(rate.percentage, 45);
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
});
