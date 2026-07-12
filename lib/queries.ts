/**
 * lib/queries.ts — Server-side data fetching utilities.
 *
 * All functions accept a Supabase server client and operate server-side only.
 * RLS on the Supabase project ensures all results are automatically scoped
 * to the calling user's groups; the groupId parameter acts as an additional
 * explicit filter for performance (index scan on group_id).
 *
 * Spec: architecture.md §4 (Dynamic Query Engine)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { rangeToDays } from '@/lib/metrics';

/* ── Types ────────────────────────────────────────────────────────────────── */

export type MetricLogRow = {
  id: string;
  user_id: string;
  group_id: string;
  metric_slug: string;
  value: number;
  unit: string;
  status: 'pending' | 'verified' | 'rejected';
  logged_at: string;
  evidence_url: string | null;
  profiles: {
    full_name: string | null;
    nickname:  string | null;
    avatar_url: string | null;
  };
};

// DashboardData type removed as kpi cards were deleted

/**
 * One data point in the chronological chart series.
 * `values` maps userId → value for that date bucket.
 */
export type ChartPoint = {
  date:   string; // "Jul 4" — the x-axis label
  values: Record<string, number>;
};

export type ChartSeries = {
  userId:    string;
  name:      string;    // display name (nickname ?? full_name)
  avatar_url: string;
  color:     string;
  points:    (number | null)[];  // parallel array matching the ChartPoint[] date labels
};

// getDashboardData query removed as kpi cards were deleted

/* ── getChartData ─────────────────────────────────────────────────────────── */

const COLOR_PALETTE = ['#FF3B30', '#007AFF', '#AF52DE', '#34C759', '#FFCC00'];

/**
 * Returns chronological chart series for a specific metric and date range,
 * with automatic bucket downsampling based on the active range:
 *
 *  - 7d  → daily raw data points (bucketSize = 1)
 *  - 30d → 3-day buckets; max/sum per window (bucketSize = 3, ~10 points)
 *  - 90d → 7-day weekly buckets; max/sum per week (bucketSize = 7, ~13 points)
 *  - all → 7-day weekly buckets (bucketSize = 7)
 *
 * - Returns `bucketSize` (1 | 3 | 7) alongside series so the chart can
 *   adapt its X-axis label density and formatting.
 * - Avatar endpoint badges attach to the last non-null point after downsampling.
 *
 * @param supabase      Supabase server client
 * @param groupId       Group UUID
 * @param metricSlug    The metric to chart
 * @param range         Date range string: '7d' | '30d' | '90d' | 'all'
 * @param isCumulative  If true, compute running totals per user per bucket
 */
export async function getChartData(
  supabase: SupabaseClient,
  groupId: string,
  metricSlug: string,
  range = '7d',
  isCumulative = false,
): Promise<{ dateLabels: string[]; series: ChartSeries[]; bucketSize: 1 | 3 | 7 }> {
  if (!groupId || !metricSlug) {
    console.error('[getChartData] missing groupId or metricSlug:', { groupId, metricSlug });
    return { dateLabels: [], series: [], bucketSize: 1 };
  }

  // ── Determine bucket size from range ───────────────────────────────────
  const bucketSize: 1 | 3 | 7 =
    range === '90d' || range === 'all' ? 7 :
    range === '30d'                    ? 3 : 1;

  const days  = rangeToDays(range);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('metric_logs')
    .select(`
      id,
      user_id,
      value,
      logged_at,
      profiles!inner ( full_name, nickname, avatar_url )
    `)
    .eq('group_id', groupId)
    .eq('metric_slug', metricSlug)
    .eq('status', 'verified')
    .gte('logged_at', since.toISOString())
    .order('logged_at', { ascending: true }); // ASC → chronological left→right

  if (error) {
    console.error('[getChartData] Supabase error:', error.message, '| groupId:', groupId, '| slug:', metricSlug, '| code:', error.code);
  }

  type Row = {
    id: string;
    user_id: string;
    value: number;
    logged_at: string;
    profiles: { full_name: string | null; nickname: string | null; avatar_url: string | null };
  };

  const rows = (data ?? []) as unknown as Row[];

  if (rows.length === 0) {
    return { dateLabels: [], series: [], bucketSize };
  }

  // ── Bucket key formatter ─────────────────────────────────────────────────
  // Maps an ISO timestamp to a stable label that groups dates into one bucket.
  // Uses epoch-day arithmetic so buckets are consistent calendar-agnostic windows.
  function getBucketKey(iso: string): string {
    const d = new Date(iso);
    if (bucketSize === 1) {
      // Daily: "Jul 4"
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (bucketSize === 3) {
      // 3-day bucket: label is the start of the 3-day epoch window
      const epochDay = Math.floor(d.getTime() / (1000 * 60 * 60 * 24));
      const windowStart = epochDay - (epochDay % 3);
      const bucketStart = new Date(windowStart * 24 * 60 * 60 * 1000);
      return bucketStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      // 7-day bucket: label is start of the weekly epoch window
      const epochDay = Math.floor(d.getTime() / (1000 * 60 * 60 * 24));
      const windowStart = epochDay - (epochDay % 7);
      const bucketStart = new Date(windowStart * 24 * 60 * 60 * 1000);
      return bucketStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  // ── Build ordered unique bucket label list ──────────────────────────────
  // JS Set maintains insertion order (ES2015+), so chronological order is preserved
  const bucketSet = new Set<string>();
  for (const r of rows) bucketSet.add(getBucketKey(r.logged_at));
  const dateLabels = Array.from(bucketSet);

  // ── Build per-user data map ─────────────────────────────────────────────
  // userId → { name, avatar, bucketKey → aggregated value }
  const userMap = new Map<string, {
    name:      string;
    avatar_url: string;
    byBucket:  Map<string, number>;
  }>();

  for (const r of rows) {
    if (!userMap.has(r.user_id)) {
      const p = r.profiles;
      userMap.set(r.user_id, {
        name:      p.nickname ?? p.full_name ?? 'Athlete',
        avatar_url: p.avatar_url ?? '',
        byBucket:  new Map(),
      });
    }
    const entry     = userMap.get(r.user_id)!;
    const bucketKey = getBucketKey(r.logged_at);
    // Performance/best metrics: keep the max value in the bucket window
    // Cumulative metrics: sum all values within the bucket window
    if (isCumulative) {
      entry.byBucket.set(bucketKey, (entry.byBucket.get(bucketKey) ?? 0) + Number(r.value));
    } else {
      entry.byBucket.set(bucketKey, Math.max(entry.byBucket.get(bucketKey) ?? 0, Number(r.value)));
    }
  }

  // ── Build ChartSeries ───────────────────────────────────────────────────
  const series: ChartSeries[] = [];
  let colorIdx = 0;

  for (const [uid, entry] of userMap) {
    let running = 0;
    let hasAnyLogs = false;
    const points = dateLabels.map((d) => {
      const hasVal = entry.byBucket.has(d);
      const v = entry.byBucket.get(d) ?? 0;
      if (isCumulative) {
        if (hasVal) {
          running += v;
          hasAnyLogs = true;
        }
        return hasAnyLogs ? running : null;
      }
      return hasVal ? v : null;
    });

    series.push({
      userId:    uid,
      name:      entry.name,
      avatar_url: entry.avatar_url,
      color:     COLOR_PALETTE[colorIdx % COLOR_PALETTE.length],
      points,
    });
    colorIdx++;
  }

  return { dateLabels, series, bucketSize };
}

/* ── getFeedItems ─────────────────────────────────────────────────────────── */

export type FeedRow = {
  id: string;
  user_id: string;
  metric_slug: string;
  value: number;
  unit: string;
  status: 'pending' | 'verified' | 'rejected';
  logged_at: string;
  profiles: { full_name: string | null; nickname: string | null; avatar_url: string | null };
  log_votes?: { user_id: string }[];
};

/**
 * Returns the most recent activity logs for the Breaking News feed.
 * Includes both verified and pending so the feed feels live.
 * Ordered DESC (newest at top). Limit default 12.
 */
export async function getFeedItems(
  supabase: SupabaseClient,
  groupId: string,
  limit = 12,
): Promise<FeedRow[]> {
  const { data, error } = await supabase
    .from('metric_logs')
    .select(`
      id,
      user_id,
      metric_slug,
      value,
      unit,
      status,
      logged_at,
      profiles!inner ( full_name, nickname, avatar_url ),
      log_votes(user_id)
    `)
    .eq('group_id', groupId)
    .in('status', ['verified', 'pending'])
    .order('logged_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[getFeedItems] Supabase error:', error.message);
  }

  return (data ?? []) as unknown as FeedRow[];
}

/* ── getGroupIdForUser ────────────────────────────────────────────────────── */

export async function getGroupIdForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  return (data as { group_id: string } | null)?.group_id ?? null;
}

/* ── getPendingLogsForGroup ───────────────────────────────────────────────── */

export async function getPendingLogsForGroup(
  supabase: SupabaseClient,
  groupId: string,
  callerId: string,
): Promise<MetricLogRow[]> {
  const { data, error } = await supabase
    .from('metric_logs')
    .select(`
      id,
      user_id,
      group_id,
      metric_slug,
      value,
      unit,
      status,
      logged_at,
      evidence_url,
      profiles!inner ( full_name, nickname, avatar_url )
    `)
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .neq('user_id', callerId)
    .order('logged_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('[getPendingLogsForGroup] Supabase error:', error.message);
  }

  return (data ?? []) as unknown as MetricLogRow[];
}
