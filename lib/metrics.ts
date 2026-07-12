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
    isBoolean: false,
    bg: 'bg-[#EAFCDB]', color: 'text-[#1E1E1E]', activeBg: 'bg-[#BDEEA0]',
  },
  {
    id: 'weight',
    label: 'Weight',
    unit: 'lbs',
    isCumulative: false,
    isBoolean: false,
    bg: 'bg-[#E0F4F4]', color: 'text-[#1E1E1E]', activeBg: 'bg-[#A8E0E0]',
  },
  {
    id: 'highest_steps',
    label: 'Highest Steps',
    unit: 'steps',
    isCumulative: false,
    isBoolean: false,
    bg: 'bg-[#FFF7ED]', color: 'text-[#C2410C]', activeBg: 'bg-[#FED7AA]',
  },
  {
    id: 'marathon',
    label: 'Marathon',
    unit: 'hrs',
    isCumulative: false,
    isBoolean: false,
    bg: 'bg-[#EFF6FF]', color: 'text-[#1D4ED8]', activeBg: 'bg-[#BFDBFE]',
  },
  {
    id: 'car_top_speed',
    label: 'Car Top Speed',
    unit: 'mph',
    isCumulative: false,
    isBoolean: false,
    bg: 'bg-[#FDF2F8]', color: 'text-[#9D174D]', activeBg: 'bg-[#FBCFE8]',
  },
  {
    id: 'underwater_swim',
    label: 'Underwater Swim',
    unit: 'meters',
    isCumulative: false,
    isBoolean: false,
    bg: 'bg-[#F0FDFA]', color: 'text-[#0F766E]', activeBg: 'bg-[#99F6E4]',
  },
  {
    id: 'most_beers',
    label: 'Most Beers',
    unit: 'beers',
    isCumulative: false,
    isBoolean: false,
    bg: 'bg-[#FFFBEB]', color: 'text-[#92400E]', activeBg: 'bg-[#FDE68A]',
  },
  {
    id: 'catan_wins',
    label: 'Catan Wins',
    unit: 'wins',
    isCumulative: true,
    isBoolean: false,
    bg: 'bg-[#F5F3FF]', color: 'text-[#5B21B6]', activeBg: 'bg-[#DDD6FE]',
  },
  {
    id: 'national_parks',
    label: 'National Parks',
    unit: 'parks',
    isCumulative: true,
    isBoolean: false,
    bg: 'bg-[#F0FDF4]', color: 'text-[#14532D]', activeBg: 'bg-[#86EFAC]',
  },
  {
    id: 'wearable_steps',
    label: 'Wearable Steps',
    unit: 'steps',
    isCumulative: true,
    isBoolean: false,
    bg: 'bg-[#FFF7ED]', color: 'text-[#C2410C]', activeBg: 'bg-[#FED7AA]',
  },
  {
    id: 'wearable_sleep',
    label: 'Wearable Sleep',
    unit: 'hrs',
    isCumulative: false,
    isBoolean: false,
    bg: 'bg-[#EFF6FF]', color: 'text-[#1D4ED8]', activeBg: 'bg-[#BFDBFE]',
  },
  {
    id: 'wearable_resting_hr',
    label: 'Wearable Resting HR',
    unit: 'bpm',
    isCumulative: false,
    isBoolean: false,
    bg: 'bg-[#FFF1F2]', color: 'text-[#BE123C]', activeBg: 'bg-[#FECDD3]',
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
