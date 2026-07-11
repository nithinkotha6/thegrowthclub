import { Suspense } from 'react';
import { cookies }   from 'next/headers';
import { redirect }  from 'next/navigation';
import { createClient }  from '@/lib/supabase/server';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';
import { METRIC_PILLS, RANGE_OPTIONS, rangeToDays, type MetricSlug, type RangeValue } from '@/lib/metrics';
import { getChartData, getFeedItems, getDashboardData } from '@/lib/queries';
import type { FeedRow } from '@/lib/queries';
import AddActivityModal   from '@/components/AddActivityModal';
import MetricChart        from '@/components/MetricChart';
import BreakingNewsFeed, { type FeedItem } from '@/components/BreakingNewsFeed';
import KpiCards,          { type KpiData } from '@/components/KpiCards';
import MetricPillSelector from '@/components/MetricPillSelector';
import DateRangeSelector  from '@/components/DateRangeSelector';
import VotingPanel        from '@/components/VotingPanel';

/**
 * Dashboard page — async Server Component.
 * URL search params are the single source of truth for filtering:
 *   ?metric=<slug>   — which metric to chart (default: long_run)
 *   ?range=<value>   — date range (default: 7d)
 * Spec: architecture.md §7, Pillar 1
 */

/* ── Natural Language Feed Formatter ───────────────────────────────────────── */

function formatActivityMessage(log: FeedRow): string {
  const name = log.profiles?.nickname ?? log.profiles?.full_name?.split(' ')[0] ?? 'Someone';
  const val  = Number(log.value);
  const unit = log.unit ?? '';
  const slug = log.metric_slug ?? '';

  switch (slug) {
    case 'long_run':
      return val >= 10
        ? `${name} crushed a ${val} ${unit} long run 🏃‍♂️🔥`
        : `${name} ran ${val} ${unit} 🏃`;
    case 'deadlift':
      return val >= 300
        ? `${name} pulled ${val} ${unit} on deadlifts — absolute BEAST 💪`
        : `${name} hit ${val} ${unit} on deadlifts 💪`;
    case 'top_speed':
      return val >= 20
        ? `${name} clocked a blistering ${val} ${unit} top speed ⚡`
        : `${name} hit ${val} ${unit} top speed ⚡`;
    case 'calories':
      return val >= 600
        ? `${name} torched ${val} ${unit} in an intense session 🔥`
        : `${name} burned ${val} ${unit} 🔥`;
    case 'weight':
      return `${name} logged a ${val} ${unit} body weight check-in ⚖️`;
    case 'beers':
      return `${name} put away ${val} beer${val !== 1 ? 's' : ''} 🍺`;
    case 'squat':
      return `${name} squatted ${val} ${unit} 🦵`;
    case 'bench_press':
      return `${name} benched ${val} ${unit} 🏋️`;
    case 'pull_ups':
      return `${name} repped ${val} pull-up${val !== 1 ? 's' : ''} 🔝`;
    case 'push_ups':
      return `${name} did ${val} push-up${val !== 1 ? 's' : ''} 💥`;
    case 'sleep':
      return `${name} logged ${val} hrs of sleep 😴`;
    case '5k_time':
      return `${name} ran a 5K in ${val} min 🏅`;
    default: {
      const display = slug.replace(/_/g, ' ');
      return `${name} logged ${val} ${unit} of ${display} 🏆`;
    }
  }
}

/* ── Relative Timestamp ─────────────────────────────────────────────────── */

function relativeTime(isoString: string): string {
  const now   = Date.now();
  const then  = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1)   return 'Just now';
  if (diffMin < 60)  return `${diffMin}m ago`;
  if (diffHr  < 24)  return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7)   return `${diffDay}d ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ metric?: string; range?: string }>;
}) {
  // ── Session ─────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const token       = cookieStore.get(SESSION_COOKIE)?.value;
  const session     = token ? await decodeSession(token) : null;
  if (!session) redirect('/');

  const { groupId, userId } = session;

  // ── Resolve URL params ───────────────────────────────────────────────────
  const params = await searchParams;

  const validSlugs   = METRIC_PILLS.map((p) => p.id) as string[];
  const rawMetric    = params.metric ?? 'long_run';
  const activeMetric = validSlugs.includes(rawMetric) ? (rawMetric as MetricSlug) : 'long_run';

  const validRanges  = RANGE_OPTIONS.map((r) => r.value) as string[];
  const rawRange     = params.range ?? '7d';
  const activeRange  = validRanges.includes(rawRange) ? (rawRange as RangeValue) : '7d';

  const activePill  = METRIC_PILLS.find((p) => p.id === activeMetric)!;
  const activeRangeLabel = RANGE_OPTIONS.find((r) => r.value === activeRange)?.label ?? 'Last 7 Days';

  const supabase = await createClient();

  // ── Diagnostic logging — visible in Next.js terminal ────────────────────
  console.log('[dashboard] session groupId :', groupId);
  console.log('[dashboard] session userId  :', userId);
  console.log('[dashboard] activeMetric    :', activeMetric);
  console.log('[dashboard] activeRange     :', activeRange);

  // ── Parallel data fetch ──────────────────────────────────────────────────
  const [{ dateLabels, series }, feedRows, { kpi: kpiRaw }] = await Promise.all([
    getChartData(supabase, groupId, activeMetric, activeRange, activePill.isCumulative),
    getFeedItems(supabase, groupId, 12),
    getDashboardData(supabase, groupId, undefined, activeRange, 200),
  ]);

  // ── Post-fetch diagnostic logging ────────────────────────────────────────
  console.log('[dashboard] chart series count:', series.length, '| dateLabels:', dateLabels.length);
  console.log('[dashboard] feed rows         :', feedRows.length);
  console.log('[dashboard] kpi totalActivities:', kpiRaw.totalActivities);

  // ── KPI ─────────────────────────────────────────────────────────────────
  const kpiData: KpiData = kpiRaw;

  // ── Feed items with NL messages ─────────────────────────────────────────
  const feedItems: FeedItem[] = feedRows.map((log) => ({
    id:           log.id,
    name:         log.profiles?.nickname ?? log.profiles?.full_name ?? 'Athlete',
    avatar_url:   log.profiles?.avatar_url ?? '',
    message:      formatActivityMessage(log),
    relativeTime: relativeTime(log.logged_at),
    status:       log.status as 'pending' | 'verified',
  }));

  // ── Chart title ──────────────────────────────────────────────────────────
  const chartTitle = `${activePill.label} — ${activeRangeLabel}`;

  return (
    <div className="p-4 md:p-8">

      {/* ── Page Header ──────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-[#111827] leading-none">
            The Growth Club
          </h1>
          <p className="mt-2 text-[11px] font-bold tracking-[0.18em] text-[#6B7280] uppercase">
            Train Together. Compete Together. Grow Together.
          </p>
          <svg width="340" height="14" viewBox="0 0 340 14" fill="none" aria-hidden="true" className="mt-0.5 max-w-full">
            <path d="M2 10 C40 3, 90 13, 140 7 S210 2, 260 8 S305 12, 338 6" stroke="#22C55E" strokeWidth="2.8" strokeLinecap="round" fill="none" />
          </svg>
        </div>

        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          {/* Functional date range dropdown */}
          <DateRangeSelector activeRange={activeRange} />

          {/* Add activity modal — userId from session, not hardcoded */}
          <AddActivityModal userId={userId} groupId={groupId} />
        </div>
      </header>

      {/* ── Metric Pills ─────────────────────────────────────────────── */}
      <MetricPillSelector activeMetric={activeMetric} />

      {/* ── Group-ID Debug Banner (only when data is empty) ─────────────── */}
      {series.length === 0 && feedRows.length === 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-mono text-amber-800">
          <p className="font-bold mb-1">⚠️ No data returned for your session group.</p>
          <p>Session <code>group_id</code>: <span className="font-bold select-all">{groupId}</span></p>
          <p className="mt-1 text-amber-600">Compare this UUID against the <code>group_id</code> column in
          your <code>metric_logs</code> table. If they differ, log out and log back in with the correct group.</p>
        </div>
      )}

      {/* ── Chart + Feed ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 md:gap-6 mb-5 md:mb-6">
        <MetricChart
          dateLabels={dateLabels}
          series={series}
          title={chartTitle}
          unit={activePill.unit}
          metricLabel={activePill.label}
          rangeLabel={activeRangeLabel}
        />
        <BreakingNewsFeed items={feedItems} />
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────── */}
      <KpiCards data={kpiData} />

      {/* ── Peer-Review Voting Panel ──────────────────────────────────── */}
      <div className="mt-5 md:mt-6">
        <Suspense fallback={null}>
          <VotingPanel groupId={groupId} userId={userId} />
        </Suspense>
      </div>

    </div>
  );
}
