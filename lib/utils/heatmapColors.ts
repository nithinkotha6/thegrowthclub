/**
 * Utility functions for Daily Goals Consistency Heatmap (intensity, colors, streak, completion rate).
 */

export type HeatmapIntensity = 0 | 1 | 2 | 3 | 4;

export const HEATMAP_COLORS: Record<HeatmapIntensity, { bg: string; text: string; label: string }> = {
  0: { bg: '#111A0A', text: '#94A3B8', label: 'None' },
  1: { bg: '#2C4815', text: '#FFFFFF', label: 'Partial' },
  2: { bg: '#2C4815', text: '#FFFFFF', label: 'Partial' },
  3: { bg: '#6AA31A', text: '#FFFFFF', label: 'Good' },
  4: { bg: '#CEFF00', text: '#0A1628', label: 'Perfect' },
};

export function getColorForIntensity(intensity: HeatmapIntensity): string {
  return HEATMAP_COLORS[intensity]?.bg ?? HEATMAP_COLORS[0].bg;
}

/** Calculates completion intensity for composite 'all' metrics mode (0 to 5 completed habits). */
export function calculateIntensityForAll(count: number): HeatmapIntensity {
  if (count <= 0) return 0; // Dark Green-Black (#111A0A)
  if (count <= 3) return 1; // Dark Forest Green (#2C4815) - 1, 2, or 3 habits
  if (count === 4) return 3; // Medium Vibrant Green (#6AA31A) - 4 habits
  return 4; // Brand Neon Lime Accent (#CEFF00) - Perfect (all 5)
}

/** Calculates completion intensity for single metric mode. */
export function calculateIntensityForMetric(completed: boolean): HeatmapIntensity {
  return completed ? 4 : 0; // Brand Neon Lime Accent (#CEFF00) or Dark (#111A0A)
}

export interface DayHeatmapData {
  dateStr: string;
  dayOfMonth: number;
  count: number;
  intensity: HeatmapIntensity;
  completedSlugs: string[];
}

/** Helper to generate array of YYYY-MM-DD date strings for any target Month (year, month: 0-11). */
export function getDaysInMonth(year: number, month: number): string[] {
  const totalDays = new Date(year, month + 1, 0).getDate();
  const dates: string[] = [];
  for (let day = 1; day <= totalDays; day++) {
    const yStr = String(year);
    const mStr = String(month + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    dates.push(`${yStr}-${mStr}-${dStr}`);
  }
  return dates;
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
 * Calculates consistency rate as (days attended in month / total days of month).
 */
export function calculateConsistencyRate(
  byDateMap: Record<string, Set<string>>,
  selectedMetric: string,
  year: number,
  month: number,
  totalGoalCount = 5
): { daysAttended: number; totalDaysInMonth: number; percentage: number } {
  const monthDates = getDaysInMonth(year, month);
  let daysAttended = 0;

  for (const dateStr of monthDates) {
    const set = byDateMap[dateStr];
    if (!set || set.size === 0) continue;

    if (selectedMetric === 'all') {
      if (set.size > 0) {
        daysAttended++;
      }
    } else {
      if (set.has(selectedMetric)) {
        daysAttended++;
      }
    }
  }

  const totalDaysInMonth = monthDates.length;
  const percentage = Math.round((daysAttended / totalDaysInMonth) * 100);

  return { daysAttended, totalDaysInMonth, percentage };
}

/**
 * Legacy 30-day completion rate calculation helper.
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
    const maxPossible = dates.length * totalGoalCount;
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
