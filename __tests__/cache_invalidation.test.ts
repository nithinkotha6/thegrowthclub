import { describe, it } from 'node:test';
import assert from 'node:assert';

interface RouteCacheState {
  route: string;
  activities: { id: string; metric_slug: string; value: number }[];
  isStale: boolean;
}

export class MockCacheManager {
  private cacheRegistry: Map<string, RouteCacheState> = new Map();
  public invalidationCalls: { originalPath: string; type?: 'layout' | 'page' }[] = [];

  constructor() {
    this.reset();
  }

  public reset() {
    this.cacheRegistry.clear();
    this.invalidationCalls = [];

    // Seed mock route caches with an initial activity
    const initialActivity = { id: 'act-101', metric_slug: 'pushups', value: 50 };

    this.cacheRegistry.set('/dashboard', {
      route: '/dashboard',
      activities: [initialActivity],
      isStale: false,
    });

    this.cacheRegistry.set('/dashboard/gang', {
      route: '/dashboard/gang',
      activities: [initialActivity],
      isStale: false,
    });

    this.cacheRegistry.set('/profile/user-789', {
      route: '/profile/user-789',
      activities: [initialActivity],
      isStale: false,
    });
  }

  /**
   * Simulates Next.js revalidatePath(path, type)
   */
  public revalidatePath(originalPath: string, type?: 'layout' | 'page') {
    this.invalidationCalls.push({ originalPath, type });

    if (type === 'layout' && (originalPath === '/' || originalPath === '')) {
      // Invalidate all routes under the layout
      for (const [route, state] of this.cacheRegistry.entries()) {
        this.cacheRegistry.set(route, { ...state, activities: [], isStale: true });
      }
    } else {
      // Single exact path invalidation
      const state = this.cacheRegistry.get(originalPath);
      if (state) {
        this.cacheRegistry.set(originalPath, { ...state, activities: [], isStale: true });
      }
    }
  }

  public getRouteState(route: string): RouteCacheState | undefined {
    return this.cacheRegistry.get(route);
  }
}

describe('Cache Invalidation & Route Revalidation Tests', () => {
  const cacheManager = new MockCacheManager();

  it('demonstrates exact-path invalidation flaw (legacy behavior)', () => {
    cacheManager.reset();

    // Old behavior: revalidatePath('/dashboard')
    cacheManager.revalidatePath('/dashboard');

    const dashState = cacheManager.getRouteState('/dashboard');
    const gangState = cacheManager.getRouteState('/dashboard/gang');
    const profileState = cacheManager.getRouteState('/profile/user-789');

    assert.strictEqual(dashState?.isStale, true, '/dashboard should be invalidated');
    assert.strictEqual(gangState?.isStale, false, '/dashboard/gang remains stale/cached in legacy exact-path mode');
    assert.strictEqual(profileState?.isStale, false, '/profile/user-789 remains stale/cached in legacy exact-path mode');
  });

  it('verifies layout-wide revalidation purges cache across all dependent routes', () => {
    cacheManager.reset();

    // New behavior: revalidatePath('/', 'layout')
    cacheManager.revalidatePath('/', 'layout');

    const dashState = cacheManager.getRouteState('/dashboard');
    const gangState = cacheManager.getRouteState('/dashboard/gang');
    const profileState = cacheManager.getRouteState('/profile/user-789');

    assert.strictEqual(dashState?.isStale, true, '/dashboard invalidated');
    assert.strictEqual(gangState?.isStale, true, '/dashboard/gang invalidated');
    assert.strictEqual(profileState?.isStale, true, '/profile/user-789 invalidated');

    assert.strictEqual(dashState?.activities.length, 0, 'No ghost activity on /dashboard');
    assert.strictEqual(gangState?.activities.length, 0, 'No ghost activity on /dashboard/gang');
    assert.strictEqual(profileState?.activities.length, 0, 'No ghost activity on /profile/user-789');
  });

  it('logs revalidation call with layout type', () => {
    cacheManager.reset();

    cacheManager.revalidatePath('/', 'layout');

    assert.strictEqual(cacheManager.invalidationCalls.length, 1);
    assert.strictEqual(cacheManager.invalidationCalls[0].originalPath, '/');
    assert.strictEqual(cacheManager.invalidationCalls[0].type, 'layout');
  });
});
