/**
 * Metric pill definitions — shared between Server Components and Client Components.
 * No 'use client' / 'use server' directive — safe to import from both sides.
 * Spec: Features.md §3
 */
export const METRIC_PILLS = [
  {
    id: 'long_run',
    label: 'Long Run',
    unit: 'mi',
    isCumulative: true,
    bg: 'bg-[#EAFCDB]', color: 'text-[#1E1E1E]', activeBg: 'bg-[#BDEEA0]',
  },
  {
    id: 'deadlift',
    label: 'Deadlift',
    unit: 'lbs',
    isCumulative: false,
    bg: 'bg-[#F3E8FF]', color: 'text-[#1E1E1E]', activeBg: 'bg-[#DDB9FF]',
  },
  {
    id: 'top_speed',
    label: 'Top Speed',
    unit: 'mph',
    isCumulative: false,
    bg: 'bg-[#FFE5E5]', color: 'text-[#FF3B30]', activeBg: 'bg-[#FFBDBA]',
  },
  {
    id: 'weight',
    label: 'Weight',
    unit: 'lbs',
    isCumulative: false,
    bg: 'bg-[#E0F4F4]', color: 'text-[#1E1E1E]', activeBg: 'bg-[#A8E0E0]',
  },
  {
    id: 'calories',
    label: 'Calories',
    unit: 'kcal',
    isCumulative: true,
    bg: 'bg-[#FFFBEB]', color: 'text-[#92400E]', activeBg: 'bg-[#FDE68A]',
  },
] as const;

export type MetricSlug = typeof METRIC_PILLS[number]['id'];

/** Range param values and their lookback in days */
export const RANGE_OPTIONS = [
  { value: '7d',  label: 'Last 7 Days',  days: 7   },
  { value: '30d', label: 'Last 30 Days', days: 30  },
  { value: '90d', label: 'Last 90 Days', days: 90  },
  { value: 'all', label: 'All Time',     days: 3650 },
] as const;

export type RangeValue = typeof RANGE_OPTIONS[number]['value'];

/** Map a range param string → lookback days (default 7) */
export function rangeToDays(range: string | undefined): number {
  return RANGE_OPTIONS.find((r) => r.value === range)?.days ?? 7;
}
