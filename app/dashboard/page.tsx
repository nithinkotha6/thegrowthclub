import { Suspense } from 'react';
import { cookies }   from 'next/headers';
import { redirect }  from 'next/navigation';
import { createAdminClient }  from '@/lib/supabase/server';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';
import { METRIC_PILLS, RANGE_OPTIONS, PROGRESSION_CHALLENGE_TYPES, type RangeValue } from '@/lib/metrics';
import { getChartData, getFeedItems } from '@/lib/queries';
import type { FeedRow } from '@/lib/queries';
import AddActivityModal        from '@/components/AddActivityModal';
import MetricChart             from '@/components/MetricChartDynamic';
import BreakingNewsFeed, { type FeedItem } from '@/components/BreakingNewsFeed';
import MetricPillSelector      from '@/components/MetricPillSelector';
import DateRangeSelector       from '@/components/DateRangeSelector';
import VotingPanel             from '@/components/VotingPanel';
import LiveAchievementTicker   from '@/components/LiveAchievementTicker';
import PeerReviewModal         from '@/components/PeerReviewModal';
import SwitchUserButton         from '@/components/SwitchUserButton';
import ChallengesModule        from '@/components/ChallengesModule';
import { getDailyGoals, getDailyGoalCompletions } from '@/app/actions/dailyGoals';
import { getMyChallengeProgression, getChallengeHistory } from '@/app/actions/progression';
import { getLeagueAssignments, getLeagueChallenges, getLeagueMatches } from '@/app/actions/leagues';

/**
 * Dashboard page — async Server Component.
 * URL search params are the single source of truth for filtering:
 *   ?metric=<slug>   — which metric to chart (default: long_run)
 *   ?range=<value>   — date range (default: 7d)
 * Spec: architecture.md §7, Pillar 1
 */

/* ── Natural Language Feed Formatter ───────────────────────────────────────── */

function formatActivityMessage(log: FeedRow): string {
  const name = log.profiles?.nickname || log.profiles?.full_name || 'Someone';
  const val  = Number(log.value);
  const unit = log.unit ?? '';
  const slug = log.metric_slug ?? '';

  switch (slug) {
    case 'top_golf':
      return val >= 250
        ? `${name} hit an absolute bomb! ${val} ${unit} drive at Top Golf ⛳🔥`
        : `${name} hit a ${val} ${unit} shot at Top Golf ⛳`;

    case 'weight':
      return `${name} logged a ${val} ${unit} body weight check-in ⚖️`;
    case 'highest_steps':
      return val >= 15000
        ? `${name} walked an insane ${val.toLocaleString()} steps today 👟🔥`
        : `${name} clocked ${val.toLocaleString()} steps today 👟`;
    case 'marathon':
      return `${name} completed a marathon in ${val} ${unit} 🏅`;
    case 'car_top_speed':
      return val >= 100
        ? `${name} pushed the Hycross to ${val} ${unit} — speed demon! 🚗💨`
        : `${name} clocked ${val} ${unit} in the Hycross 🚗`;
    case 'underwater_swim':
      return val >= 50
        ? `${name} swam ${val} meters underwater on one breath — INCREDIBLE 🤿`
        : `${name} swam ${val} meters underwater 🤿`;
    case 'most_beers':
      return val >= 10
        ? `${name} put away ${val} beers — legend 🍺🏆`
        : `${name} had ${val} beer${val !== 1 ? 's' : ''} last night 🍺`;
    case 'catan_wins':
      return `${name} won Catan! 🎲 On a roll…`;
    case 'national_parks':
      return `${name} visited a national park — living the life! 🏔️`;
    default: {
      // DATA-01 fix: custom metrics are identified by a metric_definitions
      // UUID stored in metric_slug — resolve the real name via the joined
      // metric_definitions row instead of formatting the raw UUID text.
      const customName = log.metric_definitions?.name;
      const display = customName || slug.replace(/_/g, ' ');
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
  const supabase = createAdminClient();

  // Query custom dynamic metric definitions from database defensively (Pillar 4)
  let dbDefinitions = null;
  const { data: activeDefinitions, error: hideQueryErr } = await supabase
    .from('metric_definitions')
    .select('*')
    .eq('group_id', groupId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: true });

  if (hideQueryErr) {
    console.warn('[dashboard] Failed to query with is_hidden filter (migration might be pending), falling back to full list.');
    const { data: fallbackDefinitions } = await supabase
      .from('metric_definitions')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });
    dbDefinitions = fallbackDefinitions;
  } else {
    dbDefinitions = activeDefinitions;
  }

  const customPills = (dbDefinitions || []).map((def) => ({
    id: def.id,
    label: def.name,
    unit: def.unit,
    isCumulative: true,
    isBoolean: false,
    bg: 'bg-slate-100',
    color: 'text-slate-700',
    activeBg: 'bg-[#CEFF00]',
    sort_direction: def.sort_direction
  }));

  const allPills = [...METRIC_PILLS, ...customPills];
  const validSlugs = allPills.map((p) => p.id) as string[];
  const rawMetric = params.metric ?? 'top_golf';
  const activeMetric = validSlugs.includes(rawMetric) ? rawMetric : 'top_golf';

  const validRanges  = RANGE_OPTIONS.map((r) => r.value) as string[];
  const rawRange     = params.range ?? '7d';
  const activeRange  = validRanges.includes(rawRange) ? (rawRange as RangeValue) : '7d';

  const activePill  = allPills.find((p) => p.id === activeMetric)!;
  const activeRangeLabel = RANGE_OPTIONS.find((r) => r.value === activeRange)?.label ?? 'Last 7 Days';

  // ── Parallel data fetch (PERF-03: independent queries fire concurrently) ─
  const sortDirection = ('sort_direction' in activePill ? activePill.sort_direction : 'desc') as 'asc' | 'desc';
  const isAscending = sortDirection === 'asc';

  const resolveChartData = async () => {
    if (!params.range) {
      const testData = await getChartData(supabase, groupId, activeMetric, '7d', activePill.isCumulative);
      if (testData.dateLabels.length < 2) {
        return getChartData(supabase, groupId, activeMetric, 'all', activePill.isCumulative);
      }
      return testData;
    }
    return getChartData(supabase, groupId, activeMetric, activeRange, activePill.isCumulative);
  };

  const [
    { data: recordData },
    chartData,
    feedRows,
    dailyGoalsRes,
    dailyGoalCompletionsRes,
    progressionRes,
    challengeHistoryRes,
    leagueAssignmentsRes,
    leagueChallengesRes,
    leagueMatchesRes,
  ] = await Promise.all([
    supabase
      .from('metric_logs')
      .select('value, user_id, profiles(nickname, full_name)')
      .eq('group_id', groupId)
      .eq('metric_slug', activeMetric)
      .eq('status', 'verified')
      .order('value', { ascending: isAscending })
      .limit(1),
    resolveChartData(),
    getFeedItems(supabase, groupId, 12),
    getDailyGoals(),
    getDailyGoalCompletions(),
    getMyChallengeProgression(),
    getChallengeHistory(),
    getLeagueAssignments(),
    getLeagueChallenges(),
    getLeagueMatches(),
  ]);

  const recordHolder = recordData && recordData.length > 0 ? recordData[0] : null;
  const recordValue = recordHolder ? Number(recordHolder.value) : null;
  const recordProfile = recordHolder?.profiles as any;
  const recordHolderName = recordProfile
    ? (recordProfile.nickname || recordProfile.full_name || 'Athlete')
    : 'Athlete';

  const { dateLabels, series, bucketSize } = chartData;


  // ── Feed items with NL messages ─────────────────────────────────────────
  const feedItems: FeedItem[] = feedRows.map((log) => ({
    id:           log.id,
    name:         log.profiles?.nickname || log.profiles?.full_name || 'Athlete',
    full_name:    log.profiles?.full_name ?? '',
    nickname:     log.profiles?.nickname ?? '',
    avatar_url:   log.profiles?.avatar_url ?? '',
    message:      formatActivityMessage(log),
    relativeTime: relativeTime(log.logged_at),
    status:       log.status as 'pending' | 'verified' | 'rejected',
    user_id:      log.user_id,
    vote_count:   log.log_votes?.length || 0,
    hasVoted:     log.log_votes?.some((v) => String(v.user_id) === String(userId)) || false,
  }));

  // ── Chart title ──────────────────────────────────────────────────────────
  const chartTitle = `${activePill.label} — ${activeRangeLabel}`;

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F8FA]">

      {/* ── Row 1: Live Ticker — full-bleed, sits at absolute top ─── */}
      <div className="w-full flex-shrink-0">
        <Suspense
          fallback={
            <div className="w-full h-9 bg-[#0A0A0A] border-b border-white/5 flex items-center px-3">
              <span className="text-[10px] font-black text-[#CEFF00] tracking-[0.2em] uppercase animate-pulse">
                LIVE
              </span>
            </div>
          }
        >
          <LiveAchievementTicker groupId={groupId} />
        </Suspense>
      </div>

      {/* ── Rows 2-5: Padded content column ──────────────────────── */}
      <div className="flex flex-col gap-4 px-4 md:px-8 pt-4 pb-24">

        {/* ── Row 2: Page Header ──────────────────────────────────── */}
        <header className="flex items-center justify-between gap-4">
          <div>
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
          <Suspense fallback={
            <div className="p-2.5 bg-white border border-[#E5E7EB] rounded-full w-11 h-11 animate-pulse" />
          }>
            <PeerReviewBellWrapper groupId={groupId} userId={userId} />
          </Suspense>
        </header>

        {/* ── Row 3: Controls Row (Range Selector + Add Activity) ─── */}
        <div className="flex items-center justify-between gap-2">
          <DateRangeSelector activeRange={activeRange} />
          <AddActivityModal userId={userId} groupId={groupId} customPills={customPills} />
        </div>

        {/* ── Row 4: Horizontal Scrolling Metric Pill Selector ─────── */}
        <MetricPillSelector activeMetric={activeMetric} customPills={customPills} />

        {/* ── Group-ID Debug Banner (only when data is empty) ─────── */}
        {series.length === 0 && feedRows.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-mono text-amber-800">
            <p className="font-bold mb-1">⚠️ No data returned for your session group.</p>
            <p>Session <code>group_id</code>: <span className="font-bold select-all">{groupId}</span></p>
            <p className="mt-1 text-amber-600">Compare this UUID against the <code>group_id</code> column in
            your <code>metric_logs</code> table. If they differ, log out and log back in with the correct group.</p>
          </div>
        )}

        {/* ── Row 5: Primary Chart Card + Breaking News Feed ─────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 md:gap-6">
          <MetricChart
            dateLabels={dateLabels}
            series={series}
            title={chartTitle}
            unit={activePill.unit}
            metricLabel={activePill.label}
            rangeLabel={activeRangeLabel}
            bucketSize={bucketSize}
            recordValue={recordValue}
            recordHolderName={recordHolderName}
          />
          <BreakingNewsFeed items={feedItems} currentUserId={userId} />
        </div>

        {/* ── Challenges Module: Daily Goals | Challenges | Leagues ── */}
        <ChallengesModule
          userId={userId}
          dailyGoals={dailyGoalsRes.success ? dailyGoalsRes.goals : []}
          dailyGoalCompletions={dailyGoalCompletionsRes.success ? dailyGoalCompletionsRes.completions : []}
          progression={progressionRes.success ? progressionRes.progression : []}
          challengeHistory={challengeHistoryRes.success ? challengeHistoryRes.history : []}
          progressionChallengeTypes={PROGRESSION_CHALLENGE_TYPES}
          leagueAssignments={leagueAssignmentsRes.success ? leagueAssignmentsRes.assignments : []}
          leagueChallenges={leagueChallengesRes.success ? leagueChallengesRes.challenges : []}
          leagueMatches={leagueMatchesRes.success ? leagueMatchesRes.matches : []}
        />

        {/* Center-aligned Switch User button at the bottom */}
        <div className="flex justify-center mt-6">
          <SwitchUserButton />
        </div>

      </div>
    </div>
  );
}

async function PeerReviewBellWrapper({ groupId, userId }: { groupId: string; userId: string }) {
  const supabase = createAdminClient();
  
  // Fetch pending logs for the group excluding the user's own
  const { data: pendingLogs } = await supabase
    .from('metric_logs')
    .select('id')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .neq('user_id', userId);

  let activeCount = 0;
  if (pendingLogs && pendingLogs.length > 0) {
    const logIds = pendingLogs.map((l) => l.id);
    const { data: myVotes } = await supabase
      .from('log_votes')
      .select('log_id')
      .in('log_id', logIds)
      .eq('user_id', userId);

    const votedLogIds = new Set((myVotes || []).map((v) => v.log_id));
    activeCount = pendingLogs.filter((l) => !votedLogIds.has(l.id)).length;
  }

  return (
    <PeerReviewModal count={activeCount}>
      <VotingPanel groupId={groupId} userId={userId} />
    </PeerReviewModal>
  );
}

