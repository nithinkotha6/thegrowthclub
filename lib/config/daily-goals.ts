/**
 * Configuration for predefined daily goal metrics (Dashboard & Challenges module).
 */

export interface PredefinedDailyGoal {
  slug: string;
  name: string;
  target: number;
  description?: string;
}

export const DAILY_GOAL_METRICS: PredefinedDailyGoal[] = [
  { slug: 'steps',      name: '10,000 steps', target: 10000, description: 'Log 10,000 steps today' },
  { slug: 'push_ups',   name: '50 Push-ups',  target: 50,    description: '50 push-ups completed' },
  { slug: 'squats',     name: '50 squads',    target: 50,    description: '50 squats completed' },
  { slug: 'gym_streak', name: 'Gym streak',   target: 1,     description: 'Gym session completed' },
  { slug: 'diet',       name: 'Diet',         target: 1,     description: 'Stuck to clean diet today' },
];
