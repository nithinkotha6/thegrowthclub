/**
 * Utility functions for Daily Goals Consistency Heatmap (intensity, colors, streak, completion rate).
 */

export type HeatmapIntensity = 0 | 1 | 2 | 3 | 4;

export const HEATMAP_COLORS: Record<HeatmapIntensity, { bg: string; text: string; label: string }> = {
  0: { bg: '#FFFFFF', text: '#0F1F3C', label: 'None' },
  1: { bg: '#E8FF80', text: '#0F1F3C', label: 'Partial' },
  2: { bg: '#E8FF80', text: '#0F1F3C', label: 'Partial' },
  3: { bg: '#DFFF33', text: '#0F1F3C', label: 'Good' },
  4: { bg: '#E5FF00', text: '#0F1F3C', label: 'Perfect' },
};

export function getColorForIntensity(intensity: HeatmapIntensity): string {
  return HEATMAP_COLORS[intensity]?.bg ?? HEATMAP_COLORS[0].bg;
}

/** Calculates completion intensity for composite 'all' metrics mode (0 to 5 completed habits). */
export function calculateIntensityForAll(count: number): HeatmapIntensity {
  if (count <= 0) return 0; // White (#FFFFFF)
  if (count <= 3) return 1; // Light Lime (#E8FF80) - 1, 2, or 3 habits
  if (count === 4) return 3; // Neon Lime (#DFFF33) - 4 habits
  return 4; // Electric Lime (#E5FF00) - Perfect (all 5)
}

/** Calculates completion intensity for single metric mode. */
export function calculateIntensityForMetric(completed: boolean): HeatmapIntensity {
  return completed ? 4 : 0; // Electric Lime (#E5FF00) or White (#FFFFFF)
}

export interface DayHeatmapData {
  dateStr: string;
  dayOfMonth: number;
  count: number;
  intensity: HeatmapIntensity;
  completedSlugs: string[];
}

/** Helper to generate array of YYYY-MM-DD date strings for last 30 days (inclusive of today). */
export function getLast30Days(todayDate: Date = new Date()): string[] {
  const dates: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(todayDate);
    d.setDate(todayDate.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  return dates;
}

/**
 * Calculates current streak of consecutive days up to today (or yesterday if today has no completions yet)
 * where target condition was satisfied.
 */
export function calculateStreak(
  byDateMap: Record<string, Set<string>>,
  selectedMetric: string,
  totalGoalCount = 5,
  todayDate: Date = new Date()
): number {
  const dates = getLast30Days(todayDate);
  const dateSetMap: Record<string, Set<string>> = {};
  for (const dateStr of dates) {
    dateSetMap[dateStr] = byDateMap[dateStr] || new Set();
  }

  const isSatisfied = (dateStr: string): boolean => {
    const set = dateSetMap[dateStr];
    if (!set) return false;
    if (selectedMetric === 'all') {
      return set.size >= totalGoalCount;
    }
    return set.has(selectedMetric);
  };

  let streak = 0;

  // Check from today backwards
  const todayStr = dates[dates.length - 1];
  const yesterdayStr = dates[dates.length - 2];

  let checkIdx = dates.length - 1;

  // If today is not satisfied yet, start checking from yesterday if yesterday was satisfied
  if (!isSatisfied(todayStr)) {
    if (yesterdayStr && isSatisfied(yesterdayStr)) {
      checkIdx = dates.length - 2;
    } else {
      return 0;
    }
  }

  for (let i = checkIdx; i >= 0; i--) {
    if (isSatisfied(dates[i])) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Calculates completion rate percentage for last 30 days.
 * For 'all': actual total completions / (30 * totalGoalCount) * 100.
 * For individual metric: days completed / 30 * 100.
 */
export function calculateCompletionRate(
  byDateMap: Record<string, Set<string>>,
  selectedMetric: string,
  totalGoalCount = 5,
  todayDate: Date = new Date()
): number {
  const dates = getLast30Days(todayDate);

  if (selectedMetric === 'all') {
    let totalActual = 0;
    for (const dateStr of dates) {
      const set = byDateMap[dateStr];
      if (set) {
        totalActual += Math.min(set.size, totalGoalCount);
      }
    }
    const maxPossible = dates.length * totalGoalCount; // 30 * 5 = 150
    return Math.round((totalActual / maxPossible) * 100);
  } else {
    let daysCompleted = 0;
    for (const dateStr of dates) {
      const set = byDateMap[dateStr];
      if (set && set.has(selectedMetric)) {
        daysCompleted++;
      }
    }
    return Math.round((daysCompleted / dates.length) * 100);
  }
}
