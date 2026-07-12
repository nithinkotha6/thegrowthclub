import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Trophy, Award } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';
import UserAvatar from '@/components/UserAvatar';

// Curated list of metrics for ranking
const LEADERBOARD_METRICS = [
  { id: 'long_run',         label: 'Long Run',          unit: 'mi',     isCumulative: true  },
  { id: 'top_speed',        label: 'Top Speed',         unit: 'mph',    isCumulative: false },
  { id: 'weight',           label: 'Weight',            unit: 'lbs',    isCumulative: false },
  { id: 'highest_steps',   label: 'Highest Steps',     unit: 'steps',  isCumulative: false },
  { id: 'marathon',         label: 'Marathon',          unit: 'hrs',    isCumulative: false },
  { id: 'car_top_speed',   label: 'Car Top Speed',     unit: 'mph',    isCumulative: false },
  { id: 'underwater_swim', label: 'Underwater Swim',   unit: 'meters', isCumulative: false },
  { id: 'most_beers',      label: 'Most Beers',        unit: 'beers',  isCumulative: false },
  { id: 'catan_wins',      label: 'Catan Wins',        unit: 'wins',   isCumulative: true  },
  { id: 'national_parks',  label: 'National Parks',    unit: 'parks',  isCumulative: true  },
  { id: 'have_partner',    label: 'Have Partner? 👀',  unit: 'status', isCumulative: false },
  { id: 'total_activities', label: 'Total Activities', unit: 'logs',   isCumulative: true  },
];

interface LeaderboardPageProps {
  searchParams: Promise<{ metric?: string }>;
}

export default async function LeaderboardPage({ searchParams }: LeaderboardPageProps) {
  // ── Session Authentication ─────────────────────────────────────────────
  const cookieStore = await cookies();
  const token       = cookieStore.get(SESSION_COOKIE)?.value;
  const session     = token ? await decodeSession(token) : null;
  if (!session) redirect('/');

  const { groupId } = session;

  // ── Search Parameter Resolution ─────────────────────────────────────────
  const params = await searchParams;
  const rawMetric = params.metric ?? 'long_run';
  const metricPill = LEADERBOARD_METRICS.find((m) => m.id === rawMetric) ?? LEADERBOARD_METRICS[0];
  const activeMetric = metricPill.id;

  // ── Fetch Data from Supabase ────────────────────────────────────────────
  const supabase = await createClient();

  // 1. Fetch group details for header display
  const { data: group } = await supabase
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .single();

  // 2. Fetch all members belonging to the active group
  const { data: membersRaw } = await supabase
    .from('group_members')
    .select(`
      user_id,
      profiles!inner ( id, full_name, nickname, avatar_url, total_xp, current_level )
    `)
    .eq('group_id', groupId);

  // 3. Fetch all verified logs to compute ranks
  const { data: logsRaw } = await supabase
    .from('metric_logs')
    .select('user_id, value, metric_slug')
    .eq('group_id', groupId)
    .eq('status', 'verified');

  interface LeaderboardEntry {
    profile: {
      id: string;
      full_name: string | null;
      nickname: string | null;
      avatar_url: string | null;
      total_xp: number;
      current_level: number;
    };
    score: number;
    hasLogged: boolean;
  }

  type MemberProfile = {
    profiles: {
      id: string;
      full_name: string | null;
      nickname: string | null;
      avatar_url: string | null;
      total_xp: number;
      current_level: number;
    } | null;
  };

  type MetricLog = {
    user_id: string;
    value: number;
    metric_slug: string;
  };

  const members = (membersRaw as unknown as MemberProfile[]) ?? [];
  const logs = (logsRaw as unknown as MetricLog[]) ?? [];

  // ── In-Memory Aggregation ───────────────────────────────────────────────
  const leaderboard: LeaderboardEntry[] = members.map((m) => {
    const profile = m.profiles;
    if (!profile) return null;

    const userLogs = logs.filter((l) => l.user_id === profile.id);

    let score = 0;
    let hasLogged = false;

    if (activeMetric === 'total_activities') {
      score = userLogs.length;
      hasLogged = score > 0;
    } else {
      const metricLogs = userLogs.filter((l) => l.metric_slug === activeMetric);
      hasLogged = metricLogs.length > 0;

      if (hasLogged) {
        if (metricPill.isCumulative) {
          score = metricLogs.reduce((sum, l) => sum + Number(l.value), 0);
        } else {
          score = Math.max(...metricLogs.map((l) => Number(l.value)));
        }
      }
    }

    // Round scores to 1 decimal place if floating
    const roundedScore = Math.round(score * 10) / 10;

    return {
      profile: {
        id: profile.id,
        full_name: profile.full_name,
        nickname: profile.nickname,
        avatar_url: profile.avatar_url,
        total_xp: profile.total_xp,
        current_level: profile.current_level,
      },
      score: roundedScore,
      hasLogged,
    };
  })
  .filter((entry): entry is LeaderboardEntry => entry !== null)
  // Sort strictly in descending order
  .sort((a, b) => b.score - a.score);

  // Distribute into Podium and Table lists
  const podiumAthletes = leaderboard.slice(0, 3);
  const tableAthletes  = leaderboard.slice(3);

  // Placeholders if group has fewer than 3 athletes
  const firstPlace  = podiumAthletes[0] ?? null;
  const secondPlace = podiumAthletes[1] ?? null;
  const thirdPlace  = podiumAthletes[2] ?? null;

  return (
    <div className="flex flex-col gap-y-4 px-4 md:px-8 pt-4 pb-24 min-h-screen bg-[#F7F8FA] min-w-0">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <header>
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-[#111827] leading-none flex items-center gap-3">
          <Trophy className="text-[#CEFF00] w-10 h-10 stroke-[2.5]" />
          Leaderboard
        </h1>
        <p className="mt-2 text-[11px] font-bold tracking-[0.18em] text-[#6B7280] uppercase">
          {group?.name ?? 'Texas Buds'} · Competitive Rankings
        </p>
        <svg width="220" height="14" viewBox="0 0 220 14" fill="none" aria-hidden="true" className="mt-1">
          <path d="M2 10 C30 3, 70 13, 110 7 S165 2, 218 6" stroke="#CEFF00" strokeWidth="2.8" strokeLinecap="round" fill="none" />
        </svg>
      </header>

      {/* ── Metric Pill Selector ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto py-2 scrollbar-hide max-w-full">
        {LEADERBOARD_METRICS.map((m) => {
          const isSelected = activeMetric === m.id;
          return (
            <a
              key={m.id}
              href={`/dashboard/leaderboard?metric=${m.id}`}
              id={`metric-pill-${m.id}`}
              className={`px-4 rounded-full border text-xs font-bold whitespace-nowrap transition-[transform,background-color] duration-150 ease-out cursor-pointer min-h-[44px] flex items-center justify-center ${
                isSelected
                  ? 'bg-[#111827] text-[#CEFF00] border-[#111827] shadow-sm scale-102'
                  : 'bg-white text-[#4B5563] border-[#E5E7EB] hover:bg-[#F9FAFB]'
              }`}
            >
              {m.label}
            </a>
          );
        })}
      </div>

      {/* ── Olympic Podium (Top 3) ───────────────────────────────────── */}
      <div 
        className="flex items-end justify-center gap-3 md:gap-6 bg-white rounded-[24px] border border-white/5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] p-6 max-w-full overflow-hidden"
        style={{ minHeight: '340px' }}
      >
        {/* 2nd Place (Left Pedestal) */}
        <div className="flex flex-col items-center order-1 w-1/3 max-w-[150px]">
          {secondPlace ? (
            <div className="flex flex-col items-center w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
              <UserAvatar 
                user={secondPlace.profile} 
                size="lg" 
                borderColor="#C0C0C0" 
                className="mb-2 shadow-md hover:scale-105"
              />
              <span className="text-[11px] font-bold text-[#111827] truncate max-w-full">
                {secondPlace.profile.nickname || secondPlace.profile.full_name}
              </span>
              <span className="text-[10px] font-bold text-[#6B7280] mb-2">
                {secondPlace.score} {metricPill.unit}
              </span>
              <div className="w-full h-24 bg-gradient-to-t from-zinc-200/50 to-zinc-50 border border-zinc-200 rounded-t-xl flex flex-col items-center justify-center shadow-inner">
                <span className="text-2xl font-black text-zinc-400">2</span>
                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Silver</span>
              </div>
            </div>
          ) : (
            <div className="w-full h-24 bg-zinc-50 border border-zinc-100 rounded-t-xl flex items-center justify-center">
              <span className="text-xs font-bold text-[#9CA3AF]">—</span>
            </div>
          )}
        </div>

        {/* 1st Place (Center Pedestal) */}
        <div className="flex flex-col items-center order-2 w-1/3 max-w-[180px]">
          {firstPlace ? (
            <div className="flex flex-col items-center w-full animate-in fade-in slide-in-from-bottom-6 duration-700">
              <div className="relative mb-2">
                <Award className="absolute -top-6 left-1/2 -translate-x-1/2 text-yellow-400 w-6 h-6 animate-bounce" />
                <UserAvatar 
                  user={firstPlace.profile} 
                  size="xl" 
                  borderColor="#FFD700" 
                  className="shadow-xl scale-105 hover:scale-110"
                />
              </div>
              <span className="text-xs font-black text-[#111827] truncate max-w-full">
                {firstPlace.profile.nickname || firstPlace.profile.full_name}
              </span>
              <span className="text-xs font-black text-[#CEFF00] bg-[#111827] px-2 py-0.5 rounded-md mb-2 shadow-sm">
                {firstPlace.score} {metricPill.unit}
              </span>
              <div className="w-full h-36 bg-gradient-to-t from-[#CEFF00]/10 to-[#CEFF00]/5 border-2 border-[#CEFF00]/30 rounded-t-2xl flex flex-col items-center justify-center shadow-lg">
                <span className="text-4xl font-black text-[#111827]">1</span>
                <span className="text-[10px] font-black text-[#111827] uppercase tracking-widest">Champion</span>
              </div>
            </div>
          ) : (
            <div className="w-full h-36 bg-zinc-50 border border-zinc-100 rounded-t-2xl flex items-center justify-center">
              <span className="text-xs font-bold text-[#9CA3AF]">Empty</span>
            </div>
          )}
        </div>

        {/* 3rd Place (Right Pedestal) */}
        <div className="flex flex-col items-center order-3 w-1/3 max-w-[150px]">
          {thirdPlace ? (
            <div className="flex flex-col items-center w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
              <UserAvatar 
                user={thirdPlace.profile} 
                size="lg" 
                borderColor="#CD7F32" 
                className="mb-2 shadow-md hover:scale-105"
              />
              <span className="text-[11px] font-bold text-[#111827] truncate max-w-full">
                {thirdPlace.profile.nickname || thirdPlace.profile.full_name}
              </span>
              <span className="text-[10px] font-bold text-[#6B7280] mb-2">
                {thirdPlace.score} {metricPill.unit}
              </span>
              <div className="w-full h-16 bg-gradient-to-t from-orange-200/50 to-orange-50 border border-orange-200 rounded-t-xl flex flex-col items-center justify-center shadow-inner">
                <span className="text-xl font-black text-amber-700">3</span>
                <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Bronze</span>
              </div>
            </div>
          ) : (
            <div className="w-full h-16 bg-zinc-50 border border-zinc-100 rounded-t-xl flex items-center justify-center">
              <span className="text-xs font-bold text-[#9CA3AF]">—</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Rankings Table (4th Place & Below) ───────────────────────── */}
      <div className="bg-white rounded-[24px] border border-white/5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] p-6">
        <h2 className="text-base font-bold text-[#111827] mb-4">Rankings</h2>

        {tableAthletes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#F3F4F6] text-left text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                  <th className="pb-3 w-16">Rank</th>
                  <th className="pb-3">Athlete</th>
                  <th className="pb-3 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F9FAFB] text-sm text-[#4B5563]">
                {tableAthletes.map((athlete: LeaderboardEntry, index) => {
                  const rank = index + 4;
                  return (
                    <tr key={athlete.profile.id} className="hover:bg-[#F9FAFB] transition-colors group">
                      <td className="py-3.5 font-bold text-gray-500 tabular-nums">#{rank}</td>
                      <td className="py-3.5 flex items-center gap-3">
                        <UserAvatar user={athlete.profile} size="sm" />
                        <div>
                          <p className="font-bold text-[#111827]">
                            {athlete.profile.nickname || athlete.profile.full_name}
                          </p>
                          <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
                            Lv {athlete.profile.current_level} · {athlete.profile.total_xp.toLocaleString()} XP
                          </p>
                        </div>
                      </td>
                      <td className="py-3.5 text-right font-black text-[#111827] tabular-nums">
                        {athlete.score} <span className="text-xs font-bold text-[#6B7280]">{metricPill.unit}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-[#9CA3AF] font-bold">
            No further rankings. Invite more athletes to grow the competition! 🏃‍♀️
          </div>
        )}
      </div>
    </div>
  );
}
