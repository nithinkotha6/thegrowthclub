export interface ChallengeTierDef {
  tierNumber: number;
  targetValue: number;
  unit: 'reps' | 'seconds';
  description: string;
  dailyTarget?: boolean;
}

export interface MetricProgressionConfig {
  id: string;
  label: string;
  icon: string;
  unit: 'reps' | 'seconds';
  tiers: ChallengeTierDef[];
}

export const METRIC_PROGRESSION_CATALOG: Record<string, MetricProgressionConfig> = {
  push_ups: {
    id: 'push_ups',
    label: 'Push-ups',
    icon: '💪',
    unit: 'reps',
    tiers: [
      { tierNumber: 1, targetValue: 5, unit: 'reps', description: '5 push-ups' },
      { tierNumber: 2, targetValue: 10, unit: 'reps', description: '10 push-ups' },
      { tierNumber: 3, targetValue: 15, unit: 'reps', description: '15 push-ups' },
      { tierNumber: 4, targetValue: 20, unit: 'reps', description: '20 push-ups' },
      { tierNumber: 5, targetValue: 30, unit: 'reps', description: '30 push-ups' },
      { tierNumber: 6, targetValue: 40, unit: 'reps', description: '40 push-ups' },
      { tierNumber: 7, targetValue: 75, unit: 'reps', description: '75 push-ups', dailyTarget: true },
      { tierNumber: 8, targetValue: 100, unit: 'reps', description: '100 push-ups', dailyTarget: true },
      { tierNumber: 9, targetValue: 150, unit: 'reps', description: '150 push-ups', dailyTarget: true },
      { tierNumber: 10, targetValue: 200, unit: 'reps', description: '200 push-ups', dailyTarget: true },
      { tierNumber: 11, targetValue: 250, unit: 'reps', description: '250 push-ups', dailyTarget: true },
      { tierNumber: 12, targetValue: 300, unit: 'reps', description: '300 push-ups', dailyTarget: true },
      { tierNumber: 13, targetValue: 400, unit: 'reps', description: '400 push-ups', dailyTarget: true },
      { tierNumber: 14, targetValue: 500, unit: 'reps', description: '500 push-ups', dailyTarget: true },
    ],
  },
  pull_ups: {
    id: 'pull_ups',
    label: 'Pull-ups',
    icon: '🤸',
    unit: 'reps',
    tiers: [
      { tierNumber: 1, targetValue: 5, unit: 'reps', description: '5 pull-ups' },
      { tierNumber: 2, targetValue: 10, unit: 'reps', description: '10 pull-ups' },
      { tierNumber: 3, targetValue: 15, unit: 'reps', description: '15 pull-ups' },
      { tierNumber: 4, targetValue: 20, unit: 'reps', description: '20 pull-ups' },
      { tierNumber: 5, targetValue: 30, unit: 'reps', description: '30 pull-ups' },
      { tierNumber: 6, targetValue: 40, unit: 'reps', description: '40 pull-ups' },
      { tierNumber: 7, targetValue: 75, unit: 'reps', description: '75 pull-ups', dailyTarget: true },
      { tierNumber: 8, targetValue: 100, unit: 'reps', description: '100 pull-ups', dailyTarget: true },
      { tierNumber: 9, targetValue: 150, unit: 'reps', description: '150 pull-ups', dailyTarget: true },
      { tierNumber: 10, targetValue: 200, unit: 'reps', description: '200 pull-ups', dailyTarget: true },
      { tierNumber: 11, targetValue: 250, unit: 'reps', description: '250 pull-ups', dailyTarget: true },
      { tierNumber: 12, targetValue: 300, unit: 'reps', description: '300 pull-ups', dailyTarget: true },
      { tierNumber: 13, targetValue: 400, unit: 'reps', description: '400 pull-ups', dailyTarget: true },
      { tierNumber: 14, targetValue: 500, unit: 'reps', description: '500 pull-ups', dailyTarget: true },
    ],
  },
  squats: {
    id: 'squats',
    label: 'Squats',
    icon: '🏋️',
    unit: 'reps',
    tiers: [
      { tierNumber: 1, targetValue: 5, unit: 'reps', description: '5 squats' },
      { tierNumber: 2, targetValue: 10, unit: 'reps', description: '10 squats' },
      { tierNumber: 3, targetValue: 15, unit: 'reps', description: '15 squats' },
      { tierNumber: 4, targetValue: 20, unit: 'reps', description: '20 squats' },
      { tierNumber: 5, targetValue: 30, unit: 'reps', description: '30 squats' },
      { tierNumber: 6, targetValue: 40, unit: 'reps', description: '40 squats' },
      { tierNumber: 7, targetValue: 75, unit: 'reps', description: '75 squats', dailyTarget: true },
      { tierNumber: 8, targetValue: 100, unit: 'reps', description: '100 squats', dailyTarget: true },
      { tierNumber: 9, targetValue: 150, unit: 'reps', description: '150 squats', dailyTarget: true },
      { tierNumber: 10, targetValue: 200, unit: 'reps', description: '200 squats', dailyTarget: true },
      { tierNumber: 11, targetValue: 250, unit: 'reps', description: '250 squats', dailyTarget: true },
      { tierNumber: 12, targetValue: 300, unit: 'reps', description: '300 squats', dailyTarget: true },
      { tierNumber: 13, targetValue: 400, unit: 'reps', description: '400 squats', dailyTarget: true },
      { tierNumber: 14, targetValue: 500, unit: 'reps', description: '500 squats', dailyTarget: true },
    ],
  },
  plank: {
    id: 'plank',
    label: 'Plank (sec)',
    icon: '🧘',
    unit: 'seconds',
    tiers: [
      { tierNumber: 1, targetValue: 15, unit: 'seconds', description: '15 seconds' },
      { tierNumber: 2, targetValue: 30, unit: 'seconds', description: '30 seconds' },
      { tierNumber: 3, targetValue: 45, unit: 'seconds', description: '45 seconds' },
      { tierNumber: 4, targetValue: 60, unit: 'seconds', description: '1 minute' },
      { tierNumber: 5, targetValue: 75, unit: 'seconds', description: '1:15' },
      { tierNumber: 6, targetValue: 90, unit: 'seconds', description: '1:30' },
      { tierNumber: 7, targetValue: 105, unit: 'seconds', description: '1:45' },
      { tierNumber: 8, targetValue: 120, unit: 'seconds', description: '2:00' },
      { tierNumber: 9, targetValue: 150, unit: 'seconds', description: '2:30' },
      { tierNumber: 10, targetValue: 180, unit: 'seconds', description: '3:00' },
      { tierNumber: 11, targetValue: 210, unit: 'seconds', description: '3:30' },
      { tierNumber: 12, targetValue: 240, unit: 'seconds', description: '4:00' },
      { tierNumber: 13, targetValue: 270, unit: 'seconds', description: '4:30' },
      { tierNumber: 14, targetValue: 300, unit: 'seconds', description: '5:00' },
    ],
  },
};

export const METRICS_LIST = [
  { id: 'push_ups', label: 'Push-ups', icon: '💪' },
  { id: 'pull_ups', label: 'Pull-ups', icon: '🤸' },
  { id: 'squats', label: 'Squats', icon: '🏋️' },
  { id: 'plank', label: 'Plank (sec)', icon: '🧘' },
];

/** Utility to match human display name to slug. */
export function normalizeMetricSlug(typeOrSlug: string): string {
  const s = typeOrSlug.toLowerCase();
  if (s.includes('push')) return 'push_ups';
  if (s.includes('pull')) return 'pull_ups';
  if (s.includes('squat')) return 'squats';
  if (s.includes('plank')) return 'plank';
  return 'push_ups';
}
