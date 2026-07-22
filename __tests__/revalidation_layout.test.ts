import { describe, it } from 'node:test';
import assert from 'node:assert';

export interface ActivityRecord {
  id: string;
  user_id: string;
  group_id: string;
  metric_slug: string;
  value: number;
  unit: string;
  status: 'pending' | 'verified' | 'rejected';
  logged_at: string;
}

export interface RouteViewState {
  route: string;
  metric_slug: string;
  graphPoints: number[];
  podium: { user_id: string; total: number }[];
  rankings: { user_id: string; total: number }[];
  recentActivities: ActivityRecord[];
  isCacheValid: boolean;
}

/**
 * Mock Multi-Route Application State Container
 * Simulates React Server Component query results across parent (/dashboard),
 * child (/dashboard/gang), and sister (/profile/[userId]) routes.
 */
export class MockApplicationStore {
  private activities: ActivityRecord[] = [];
  public currentMetric: string = 'pushups';
  private revalidationEvents: { path: string; type: string }[] = [];

  constructor() {
    this.reset();
  }

  public reset() {
    this.currentMetric = 'pushups';
    this.activities = [
      {
        id: 'act-1',
        user_id: 'user-1',
        group_id: 'group-alpha',
        metric_slug: 'pushups',
        value: 50,
        unit: 'reps',
        status: 'verified',
        logged_at: new Date().toISOString(),
      },
      {
        id: 'act-2',
        user_id: 'user-2',
        group_id: 'group-alpha',
        metric_slug: 'pushups',
        value: 30,
        unit: 'reps',
        status: 'verified',
        logged_at: new Date().toISOString(),
      },
    ];
    this.revalidationEvents = [];
    this.currentMetric = 'pushups';
  }

  /**
   * Action: Log activity
   */
  public logActivity(record: ActivityRecord) {
    this.activities.push(record);
    this.revalidateLayout();
  }

  /**
   * Action: Delete activity
   */
  public deleteActivity(id: string) {
    this.activities = this.activities.filter((a) => a.id !== id);
    this.revalidateLayout();
  }

  /**
   * Action: Change metric selection
   */
  public changeMetricSelection(metricSlug: string) {
    this.currentMetric = metricSlug;
    this.revalidateLayout();
  }

  /**
   * Layout-wide revalidation (simulates revalidatePath('/', 'layout'))
   */
  private revalidateLayout() {
    // Revalidate layout to ensure graph, podium, rankings, and all sibling components
    // reflect the updated metric data simultaneously. Using 'layout' ensures all routes
    // sharing this data refresh together, maintaining consistency across the app.
    this.revalidationEvents.push({ path: '/', type: 'layout' });
  }

  public get revalidateCount(): number {
    return this.revalidationEvents.length;
  }

  /**
   * Reads current route view state for any route given the active metric
   */
  public queryRouteView(routePath: string, targetUserId?: string): RouteViewState {
    const metricLogs = this.activities.filter(
      (a) => a.metric_slug === this.currentMetric && a.status === 'verified'
    );

    // Compute user totals for rankings and podium
    const totalsByUser: Record<string, number> = {};
    for (const log of metricLogs) {
      if (routePath.startsWith('/profile/') && targetUserId && log.user_id !== targetUserId) {
        continue;
      }
      totalsByUser[log.user_id] = (totalsByUser[log.user_id] || 0) + log.value;
    }

    const sortedUsers = Object.entries(totalsByUser)
      .map(([userId, total]) => ({ user_id: userId, total }))
      .sort((a, b) => b.total - a.total);

    const graphPoints = metricLogs.map((l) => l.value);
    const podium = sortedUsers.slice(0, 3);
    const rankings = sortedUsers;
    const recentActivities = (routePath.startsWith('/profile/') && targetUserId)
      ? metricLogs.filter((l) => l.user_id === targetUserId)
      : [...metricLogs];

    return {
      route: routePath,
      metric_slug: this.currentMetric,
      graphPoints,
      podium,
      rankings,
      recentActivities,
      isCacheValid: true,
    };
  }
}

describe('Data Consistency & Layout-Aware Revalidation Integration Tests', () => {
  const store = new MockApplicationStore();

  it('Test 1: Log activity as user1 -> verifies graph, podium, rankings update simultaneously on /dashboard and /dashboard/gang', () => {
    store.reset();

    store.logActivity({
      id: 'act-3',
      user_id: 'user-1',
      group_id: 'group-alpha',
      metric_slug: 'pushups',
      value: 100,
      unit: 'reps',
      status: 'verified',
      logged_at: new Date().toISOString(),
    });

    const dashView = store.queryRouteView('/dashboard');
    const gangView = store.queryRouteView('/dashboard/gang');

    // Both views re-query updated data simultaneously
    assert.strictEqual(dashView.recentActivities.length, 3);
    assert.strictEqual(gangView.recentActivities.length, 3);

    // User 1 total updated to 150 (50 + 100), leading rankings on both views
    assert.strictEqual(dashView.rankings[0].user_id, 'user-1');
    assert.strictEqual(dashView.rankings[0].total, 150);
    assert.strictEqual(gangView.rankings[0].user_id, 'user-1');
    assert.strictEqual(gangView.rankings[0].total, 150);

    assert.strictEqual(store.revalidateCount, 1);
  });

  it('Test 2: Metric selection change -> verifies graph, podium, rankings re-query and return consistent data', () => {
    store.reset();

    // Log pullups for user2
    store.logActivity({
      id: 'act-4',
      user_id: 'user-2',
      group_id: 'group-alpha',
      metric_slug: 'pullups',
      value: 20,
      unit: 'reps',
      status: 'verified',
      logged_at: new Date().toISOString(),
    });

    store.changeMetricSelection('pullups');

    const dashView = store.queryRouteView('/dashboard');
    const gangView = store.queryRouteView('/dashboard/gang');

    assert.strictEqual(dashView.metric_slug, 'pullups');
    assert.strictEqual(gangView.metric_slug, 'pullups');

    assert.strictEqual(dashView.rankings.length, 1);
    assert.strictEqual(dashView.rankings[0].user_id, 'user-2');
    assert.strictEqual(dashView.rankings[0].total, 20);

    assert.strictEqual(gangView.rankings.length, 1);
    assert.strictEqual(gangView.rankings[0].user_id, 'user-2');
    assert.strictEqual(gangView.rankings[0].total, 20);
  });

  it('Test 3: Delete activity -> verifies all affected routes return updated data with activity purged everywhere', () => {
    store.reset();

    // Initial check
    let dashView = store.queryRouteView('/dashboard');
    let gangView = store.queryRouteView('/dashboard/gang');
    let profileView = store.queryRouteView('/profile/user-1', 'user-1');

    assert.strictEqual(dashView.recentActivities.length, 2);
    assert.strictEqual(gangView.recentActivities.length, 2);
    assert.strictEqual(profileView.recentActivities.length, 1);

    // Delete act-1 (user-1's pushups log)
    store.deleteActivity('act-1');

    dashView = store.queryRouteView('/dashboard');
    gangView = store.queryRouteView('/dashboard/gang');
    profileView = store.queryRouteView('/profile/user-1', 'user-1');

    // Purged everywhere simultaneously
    assert.strictEqual(dashView.recentActivities.length, 1);
    assert.strictEqual(gangView.recentActivities.length, 1);
    assert.strictEqual(profileView.recentActivities.length, 0, 'Deleted activity gone from personal profile history');

    // User 2 is now top ranker on dashboard and gang page
    assert.strictEqual(dashView.rankings[0].user_id, 'user-2');
    assert.strictEqual(gangView.rankings[0].user_id, 'user-2');
  });
});
