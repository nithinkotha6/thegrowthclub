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

export type DashboardData = {
  logs: MetricLogRow[];
  kpi: {
    totalActivities: number;
    topSpeed:        number | null;
    heaviestLift:    number | null;
    longestRun:      number | null;
    caloriesBurned:  number | null;
  };
};

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
  points:    number[];  // parallel array matching the ChartPoint[] date labels
};

/* ── getDashboardData ─────────────────────────────────────────────────────── */

/**
 * Fetches the most recent verified logs for a group within a date range.
 *
 * @param supabase   Supabase server client
 * @param groupId    Group UUID (explicit filter + RLS double-fence)
 * @param metricSlug Optional slug to narrow to one metric
 * @param range      Range string: '7d' | '30d' | '90d' | 'all'
 * @param limit      Maximum rows to return (default 100)
 */
export async function getDashboardData(
  supabase: SupabaseClient,
  groupId: string,
  metricSlug?: string,
  range = '7d',
  limit = 100,
): Promise<DashboardData> {
  const days  = rangeToDays(range);
  const since = new Date();
  since.setDate(since.getDate() - days);

  let query = supabase
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
    .eq('status', 'verified')
    .gte('logged_at', since.toISOString())
    .order('logged_at', { ascending: false })
    .limit(limit);

  if (metricSlug) {
    query = query.eq('metric_slug', metricSlug);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getDashboardData] Supabase error:', error.message);
  }

  const logs = (data ?? []) as unknown as MetricLogRow[];

  const maxOf = (slug: string) => {
    const vals = logs.filter(l => l.metric_slug === slug).map(l => Number(l.value));
    return vals.length ? Math.max(...vals) : null;
  };
  const sumOf = (slug: string) => {
    const vals = logs.filter(l => l.metric_slug === slug).map(l => Number(l.value));
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };

  return {
    logs,
    kpi: {
      totalActivities: logs.length,
      topSpeed:        maxOf('top_speed'),
      heaviestLift:    maxOf('deadlift'),
      longestRun:      maxOf('long_run'),
      caloriesBurned:  sumOf('calories'),
    },
  };
}

/* ── getChartData ─────────────────────────────────────────────────────────── */

const COLOR_PALETTE = ['#FF3B30', '#007AFF', '#AF52DE', '#34C759', '#FFCC00'];

/**
 * Returns chronological chart series for a specific metric and date range.
 *
 * - Fetches verified logs sorted ASC so they plot left→right over time.
 * - Produces a flat list of unique date labels and a parallel `points` array
 *   per user (suitable for direct ECharts series consumption).
 * - Cumulative metrics: the caller must pass `isCumulative=true`; this
 *   function computes a per-user running total over the returned dates.
 *
 * @param supabase      Supabase server client
 * @param groupId       Group UUID
 * @param metricSlug    The metric to chart (e.g. 'deadlift', 'long_run')
 * @param range         Date range string: '7d' | '30d' | '90d' | 'all'
 * @param isCumulative  If true, compute running totals per user per date
 */
export async function getChartData(
  supabase: SupabaseClient,
  groupId: string,
  metricSlug: string,
  range = '7d',
  isCumulative = false,
): Promise<{ dateLabels: string[]; series: ChartSeries[] }> {
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
    console.error('[getChartData] Supabase error:', error.message);
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
    return { dateLabels: [], series: [] };
  }

  // ── Build ordered unique date label list ────────────────────────────────
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Collect all unique dates in chronological order
  const dateSet = new Set<string>();
  for (const r of rows) dateSet.add(fmt(r.logged_at));
  const dateLabels = Array.from(dateSet);

  // ── Build per-user data map ─────────────────────────────────────────────
  // userId → { name, avatar, dateLabel → value }
  const userMap = new Map<string, {
    name:      string;
    avatar_url: string;
    byDate:    Map<string, number>;
  }>();

  for (const r of rows) {
    if (!userMap.has(r.user_id)) {
      const p = r.profiles;
      userMap.set(r.user_id, {
        name:      p.nickname ?? p.full_name ?? 'Athlete',
        avatar_url: p.avatar_url ?? '',
        byDate:    new Map(),
      });
    }
    const entry   = userMap.get(r.user_id)!;
    const dateKey = fmt(r.logged_at);
    // For performance metrics: keep the max value logged on that day
    entry.byDate.set(dateKey, Math.max(entry.byDate.get(dateKey) ?? 0, Number(r.value)));
  }

  // ── Build ChartSeries ───────────────────────────────────────────────────
  const series: ChartSeries[] = [];
  let colorIdx = 0;

  for (const [uid, entry] of userMap) {
    let running = 0;
    const points = dateLabels.map((d) => {
      const v = entry.byDate.get(d) ?? 0;
      if (isCumulative) {
        running += v;
        return running;
      }
      return v;
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

  return { dateLabels, series };
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
      profiles!inner ( full_name, nickname, avatar_url )
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
