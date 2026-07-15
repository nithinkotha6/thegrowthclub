'use client';

import React, { useState } from 'react';
import { Watch, Heart, Moon, Zap, RefreshCw, Smartphone, Award, Flame } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import CheerButton from '@/components/CheerButton';
import { disconnectWearableAction } from '@/app/actions/wearables';

interface GroupMember {
  id: string;
  full_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  total_xp: number;
  current_level: number;
}

interface MetricLog {
  id: string;
  user_id: string;
  metric_slug: string;
  value: number;
  logged_at: string;
  profiles: {
    id: string;
    nickname: string | null;
    full_name: string | null;
    avatar_url: string | null;
    total_xp: number;
    current_level: number;
  } | null;
}

interface WearablesClientPageProps {
  connection: any;
  personalLogs: any[];
  members: any[];
  groupLogs: any[];
  userId: string;
  groupId: string;
}

export default function WearablesClientPage({
  connection,
  personalLogs,
  members,
  groupLogs,
  userId,
  groupId,
}: WearablesClientPageProps) {
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [activeMetric, setActiveMetric] = useState<'steps' | 'sleep' | 'resting_hr'>('steps');
  const [isPending, setIsPending] = useState(false);

  // ── 1. Fetch personal scores ─────────────────────────────────────────────
  const getLatestPersonalValue = (slug: string) => {
    const log = personalLogs.find((l) => l.metric_slug === slug);
    return log ? Number(log.value) : null;
  };

  const personalSleep = getLatestPersonalValue('wearable_sleep');
  const personalSteps = getLatestPersonalValue('wearable_steps');
  const personalRestingHr = getLatestPersonalValue('wearable_resting_hr');

  // ── 2. Timeframe calculations ──────────────────────────────────────────
  const now = new Date();
  const getStartDate = () => {
    if (timeframe === 'daily') return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (timeframe === 'weekly') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // monthly
  };

  const startDate = getStartDate();
  const dbMetricSlug =
    activeMetric === 'steps' ? 'wearable_steps' :
    activeMetric === 'sleep' ? 'wearable_sleep' :
    'wearable_resting_hr';

  const unit =
    activeMetric === 'steps' ? 'steps' :
    activeMetric === 'sleep' ? 'hrs' :
    'bpm';

  const metricLabel =
    activeMetric === 'steps' ? 'Steps' :
    activeMetric === 'sleep' ? 'Sleep' :
    'Resting HR';

  // ── 3. Deduplicated Rankings Aggregation ─────────────────────────────────
  const scoreboardData = members
    .map((member) => {
      if (!member) return null;

      const userLogs = groupLogs.filter(
        (l) =>
          l.user_id === member.id &&
          l.metric_slug === dbMetricSlug &&
          new Date(l.logged_at) >= startDate
      );

      let score = 0;
      const hasLogged = userLogs.length > 0;

      if (hasLogged) {
        const values = userLogs.map((l) => Number(l.value));
        if (timeframe === 'daily') {
          score = Math.max(...values);
        } else {
          if (activeMetric === 'steps') {
            score = values.reduce((sum, val) => sum + val, 0);
          } else if (activeMetric === 'sleep') {
            score = values.reduce((sum, val) => sum + val, 0) / values.length;
          } else {
            score = Math.min(...values); // Resting HR is absolute lowest PR
          }
        }
      }

      // Formatting roundings
      const roundedScore = activeMetric === 'steps' ? Math.round(score) : Math.round(score * 10) / 10;

      return {
        profile: member as GroupMember,
        score: roundedScore,
        hasLogged,
      };
    })
    .filter((entry): entry is { profile: GroupMember; score: number; hasLogged: boolean } => entry !== null);

  // Sorting
  scoreboardData.sort((a, b) => {
    if (!a.hasLogged && !b.hasLogged) return 0;
    if (a.hasLogged && !b.hasLogged) return -1;
    if (!a.hasLogged && b.hasLogged) return 1;

    // Resting HR is lower is better
    if (activeMetric === 'resting_hr') {
      return a.score - b.score;
    }
    return b.score - a.score;
  });

  // ── 4. Connection Handlers ───────────────────────────────────────────────

  const handleDisconnect = async () => {
    setIsPending(true);
    try {
      await disconnectWearableAction(userId);
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-y-6 px-4 md:px-8 pt-4 pb-24 min-h-screen bg-[#F7F8FA] min-w-0">
      
      {/* ── Page Header ────────────────────────────────────────────── */}
      <header>
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-[#111827] leading-none flex items-center gap-3">
          <Watch className="text-[#CEFF00] w-10 h-10 stroke-[2.5]" />
          Wearables
        </h1>
        <p className="mt-2 text-[11px] font-bold tracking-[0.18em] text-[#6B7280] uppercase">
          Automated Device Sync & Scoreboard
        </p>
        <svg width="220" height="14" viewBox="0 0 220 14" fill="none" aria-hidden="true" className="mt-1">
          <path d="M2 10 C30 3, 70 13, 110 7 S165 2, 218 6" stroke="#CEFF00" strokeWidth="2.8" strokeLinecap="round" fill="none" />
        </svg>
      </header>

      {/* ── Connection Status Indicator Card ──────────────────────── */}
      <div className="bg-white rounded-[24px] border border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${connection ? 'bg-[#CEFF00]/10 text-gray-900' : 'bg-slate-100 text-slate-400'}`}>
            <Smartphone size={20} className={connection ? 'text-gray-900 animate-pulse' : ''} />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm text-[#111827]">
                {connection ? (connection.provider === 'google_fit' ? 'Google Fit' : connection.provider) : 'No Device Connected'}
              </h3>
              {connection && connection.provider === 'google_fit' && (
                <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-0.5">
                  Connected ✓
                </span>
              )}
            </div>
            <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
              {connection 
                ? `Active · Last synced: ${new Date(connection.last_synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` 
                : 'Connect Google Fit to sync stats automatically'}
            </p>
          </div>
        </div>
        
        {connection ? (
          <button
            onClick={handleDisconnect}
            disabled={isPending}
            className="px-4 py-2 text-xs font-black uppercase tracking-wider bg-red-50 text-red-600 rounded-xl hover:bg-red-100 active:scale-95 transition-all cursor-pointer"
          >
            Disconnect
          </button>
        ) : (
          <a
            href="/api/wearables/connect/google"
            className="px-4 py-2.5 text-xs font-black uppercase tracking-wider bg-[#CEFF00] text-gray-900 rounded-xl hover:bg-[#b5e000] active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
          >
            Connect Google Fit
          </a>
        )}
      </div>

      {/* ── Overview Summary Cards Grid (Pillar 1) ─────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Sleep */}
        <div className="bg-white rounded-[24px] border border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-5 flex flex-col justify-between min-h-[110px]">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-black uppercase tracking-wider text-[#6B7280]">Sleep Duration</span>
            <Moon size={18} className="text-[#3b82f6]" />
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-black text-gray-900 tabular-nums">
              {personalSleep !== null ? personalSleep : '—'}
            </span>
            <span className="text-xs font-extrabold text-[#6B7280] uppercase">hrs</span>
          </div>
        </div>

        {/* Card 2: Steps */}
        <div className="bg-white rounded-[24px] border border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-5 flex flex-col justify-between min-h-[110px]">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-black uppercase tracking-wider text-[#6B7280]">Daily Steps</span>
            <Zap size={18} className="text-[#f97316]" />
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-black text-gray-900 tabular-nums">
              {personalSteps !== null ? personalSteps.toLocaleString() : '—'}
            </span>
            <span className="text-xs font-extrabold text-[#6B7280] uppercase">steps</span>
          </div>
        </div>

        {/* Card 3: Resting HR */}
        <div className="bg-white rounded-[24px] border border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-5 flex flex-col justify-between min-h-[110px]">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-black uppercase tracking-wider text-[#6B7280]">Resting Heart Rate</span>
            <Heart size={18} className="text-[#ef4444]" />
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-black text-gray-900 tabular-nums">
              {personalRestingHr !== null ? personalRestingHr : '—'}
            </span>
            <span className="text-xs font-extrabold text-[#6B7280] uppercase">bpm</span>
          </div>
        </div>
      </div>

      {/* ── Scoreboard Container (Pillar 2) ───────────────────────── */}
      <div className="bg-white rounded-[24px] border border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-5 flex flex-col gap-5">
        
        {/* Timeframe Toggle Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-black text-[#111827] uppercase tracking-wide flex items-center gap-2">
            <Award className="w-5 h-5 text-gray-500" />
            Group Scoreboard
          </h2>
          
          {/* Segmented Control [Daily | Weekly | Monthly] */}
          <div className="flex bg-slate-100 rounded-xl p-1 self-start sm:self-auto select-none">
            {(['daily', 'weekly', 'monthly'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-4 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  timeframe === t
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-slate-500 hover:text-gray-800'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Horizontal Metric Selector Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'steps', label: 'Steps 👟' },
            { id: 'sleep', label: 'Sleep 😴' },
            { id: 'resting_hr', label: 'Resting HR ❤️' },
          ].map((m) => {
            const isActive = activeMetric === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setActiveMetric(m.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl min-h-[44px] text-sm font-bold whitespace-nowrap flex-shrink-0 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#CEFF00] text-gray-900 shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200/80'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* PVP Scoreboard Leaderboard List */}
        <div className="flex flex-col gap-2.5">
          {scoreboardData.length > 0 ? (
            scoreboardData.map((athlete, index) => {
              const rank = index + 1;
              const isCurrentUser = athlete.profile.id === userId;
              
              // Top-3 Medals
              const medal =
                rank === 1 ? '🥇' :
                rank === 2 ? '🥈' :
                rank === 3 ? '🥉' :
                rank.toString();

              return (
                <div
                  key={athlete.profile.id}
                  className={`rounded-2xl p-3 flex items-center justify-between border transition-all duration-200 hover:shadow-[0_4px_15px_rgba(0,0,0,0.03)] ${
                    isCurrentUser
                      ? 'bg-[#CEFF00]/10 border-[#CEFF00]'
                      : 'bg-white border-[#E5E7EB]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Rank container */}
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-gray-900 select-none">
                      {medal}
                    </div>

                    {/* Avatar */}
                    <UserAvatar user={athlete.profile} size="lg2" />

                    {/* Member Details */}
                    <div>
                      <p className="font-bold text-[#111827] text-sm">
                        {athlete.profile.nickname || athlete.profile.full_name}
                      </p>
                      <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider tabular-nums mt-0.5">
                        Lv {athlete.profile.current_level} · {athlete.profile.total_xp.toLocaleString()} XP
                      </p>
                    </div>
                  </div>

                  {/* Value and Cheer Button */}
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="font-black text-base text-[#111827] tabular-nums tracking-tight">
                        {athlete.hasLogged
                          ? activeMetric === 'steps'
                            ? athlete.score.toLocaleString()
                            : athlete.score
                          : '—'}
                      </span>
                      <span className="text-[10px] font-black text-[#6B7280] ml-1 uppercase">
                        {unit}
                      </span>
                    </div>
                    
                    <CheerButton
                      targetUserId={athlete.profile.id}
                      targetName={athlete.profile.nickname || athlete.profile.full_name || 'Athlete'}
                      metricLabel={metricLabel}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-xs text-[#9CA3AF] font-bold">
              No synced data found for this timeframe. 😴
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
