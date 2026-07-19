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
  metric_definition_id: string | null;
  metric_definitions: { name: string; unit: string } | null;
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
      metric_definition_id,
      metric_definitions ( name, unit ),
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

/* ── getLeaderboardEntries ────────────────────────────────────────────────── */

export type LeaderboardProfile = {
  id: string;
  full_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  total_xp: number;
  current_level: number;
  streak_count: number;
};

export type LeaderboardEntry = {
  profile: LeaderboardProfile;
  score: number;
  hasLogged: boolean;
};

/**
 * Ranking aggregation shared by the dashboard's Podium/Rankings and (formerly)
 * the standalone leaderboard route. Same algorithm moved verbatim from
 * `app/dashboard/leaderboard/page.tsx` — no scoring-logic changes — just
 * parameterized by `activeRange` so it can share the dashboard's single
 * source-of-truth metric/range state instead of running its own filters.
 */
export async function getLeaderboardEntries(
  supabase: SupabaseClient,
  groupId: string,
  activeMetric: string,
  activeRange: string,
  metricPill: { isCumulative: boolean; sort_direction?: string },
): Promise<LeaderboardEntry[]> {
  const MEMBERS_SELECT_WITH_STREAK = `
      user_id,
      profiles!inner ( id, full_name, nickname, avatar_url, total_xp, current_level, streak_count, is_active )
    `;
  const MEMBERS_SELECT_NO_STREAK = `
      user_id,
      profiles!inner ( id, full_name, nickname, avatar_url, total_xp, current_level, is_active )
    `;

  let hasStreakColumn = true;
  let membersRaw: unknown[] | null;
  {
    const { data, error } = await supabase
      .from('group_members')
      .select(MEMBERS_SELECT_WITH_STREAK)
      .eq('group_id', groupId)
      .neq('profiles.is_active', false);

    if (error) {
      // Defensive fallback: migration 0039 (profiles.streak_count) may not be
      // applied to this DB yet — retry without it instead of silently
      // returning an empty ranking (matches the is_hidden fallback pattern
      // already used in app/dashboard/page.tsx).
      console.warn('[getLeaderboardEntries] Query with streak_count failed (migration 0039 might be pending), falling back without it:', error.message);
      hasStreakColumn = false;
      const { data: fallbackData, error: fallbackErr } = await supabase
        .from('group_members')
        .select(MEMBERS_SELECT_NO_STREAK)
        .eq('group_id', groupId)
        .neq('profiles.is_active', false);
      if (fallbackErr) console.error('[getLeaderboardEntries] Member fallback query error:', fallbackErr.message);
      membersRaw = fallbackData ?? [];
    } else {
      membersRaw = data ?? [];
    }
  }

  const sinceIso = new Date(Date.now() - rangeToDays(activeRange) * 86_400_000).toISOString();

  const runLogsQuery = (withStreak: boolean) => {
    const q = supabase
      .from('metric_logs')
      .select(`
      user_id,
      value,
      metric_slug,
      logged_at,
      profiles!inner ( id, full_name, nickname, avatar_url, total_xp, current_level${withStreak ? ', streak_count' : ''}, is_active )
    `)
      .eq('group_id', groupId)
      .eq('status', 'verified')
      .gte('logged_at', sinceIso)
      .neq('profiles.is_active', false);

    if (activeMetric !== 'total_activities') {
      q.eq('metric_slug', activeMetric);
    }
    return q;
  };

  let logsRaw: unknown[] | null;
  {
    const { data, error } = await runLogsQuery(hasStreakColumn);
    if (error && hasStreakColumn) {
      console.warn('[getLeaderboardEntries] Logs query with streak_count failed, falling back without it:', error.message);
      const { data: fallbackData, error: fallbackErr } = await runLogsQuery(false);
      if (fallbackErr) console.error('[getLeaderboardEntries] Logs fallback query error:', fallbackErr.message);
      logsRaw = fallbackData ?? [];
    } else {
      logsRaw = data ?? [];
    }
  }

  type MemberProfile = { profiles: LeaderboardProfile | null };
  type LogWithProfile = {
    user_id: string;
    value: number;
    metric_slug: string;
    logged_at: string;
    profiles: LeaderboardProfile | null;
  };

  const members = ((membersRaw as unknown as MemberProfile[]) ?? []).map((m) => ({
    profiles: m.profiles ? { ...m.profiles, streak_count: m.profiles.streak_count ?? 0 } : m.profiles,
  }));
  const logs = ((logsRaw as unknown as LogWithProfile[]) ?? []).map((l) => ({
    ...l,
    profiles: l.profiles ? { ...l.profiles, streak_count: l.profiles.streak_count ?? 0 } : l.profiles,
  }));

  const userMap = new Map<string, LeaderboardEntry>();

  for (const m of members) {
    if (m.profiles) {
      userMap.set(m.profiles.id, { profile: m.profiles, score: 0, hasLogged: false });
    }
  }

  const isLowerBetter = activeMetric === 'marathon' || metricPill.sort_direction === 'asc';

  if (activeMetric === 'weight') {
    const userLogsMap = new Map<string, LogWithProfile[]>();
    for (const log of logs) {
      if (!userLogsMap.has(log.user_id)) userLogsMap.set(log.user_id, []);
      userLogsMap.get(log.user_id)!.push(log);
    }

    for (const [userId, userLogs] of userLogsMap.entries()) {
      if (userLogs.length === 0) continue;
      userLogs.sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());

      const firstLog = userLogs[0];
      const lastLog = userLogs[userLogs.length - 1];
      const delta = Number(lastLog.value) - Number(firstLog.value);

      const existing = userMap.get(userId);
      if (existing) {
        existing.score = delta;
        existing.hasLogged = true;
      } else if (firstLog.profiles) {
        userMap.set(userId, { profile: firstLog.profiles, score: delta, hasLogged: true });
      }
    }
  } else {
    for (const log of logs) {
      const profile = log.profiles;
      if (!profile) continue;

      const existing = userMap.get(log.user_id);
      const logValue = Number(log.value);

      if (!existing) {
        userMap.set(log.user_id, {
          profile,
          score: activeMetric === 'total_activities' ? 1 : logValue,
          hasLogged: true,
        });
        continue;
      }

      if (activeMetric === 'total_activities') {
        existing.score = existing.hasLogged ? existing.score + 1 : 1;
        existing.hasLogged = true;
      } else if (metricPill.isCumulative) {
        existing.score = existing.hasLogged ? existing.score + logValue : logValue;
        existing.hasLogged = true;
      } else if (!existing.hasLogged) {
        existing.score = logValue;
        existing.hasLogged = true;
      } else {
        existing.score = isLowerBetter ? Math.min(existing.score, logValue) : Math.max(existing.score, logValue);
      }
    }
  }

  return Array.from(userMap.values())
    .map((entry) => ({ ...entry, score: Math.round(entry.score * 10) / 10 }))
    .sort((a, b) => {
      if (a.hasLogged && !b.hasLogged) return -1;
      if (!a.hasLogged && b.hasLogged) return 1;
      if (!a.hasLogged && !b.hasLogged) return 0;
      return isLowerBetter ? a.score - b.score : b.score - a.score;
    });
}

