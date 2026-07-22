'use client';

import { useState, useTransition } from 'react';
import { Trophy, Trash2, Swords, Plus, ShieldAlert } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import CreateLeagueModal from '@/components/challenges/CreateLeagueModal';
import {
  type LeagueAssignment,
  type LeagueChallenge,
  type LeagueMatch,
  type GroupMemberProfile,
  createLeagueMatch,
  updateLeagueMatchScore,
  completeLeagueMatch,
  deleteLeagueMatch,
} from '@/app/actions/leagues';

interface LeagueMatchPanelProps {
  assignments: LeagueAssignment[];
  challenges: LeagueChallenge[];
  matches: LeagueMatch[];
  members?: GroupMemberProfile[];
}

export default function LeagueMatchPanel({
  assignments,
  challenges,
  matches,
  members = [],
}: LeagueMatchPanelProps) {
  const [activeChallengeId, setActiveChallengeId] = useState(challenges[0]?.id ?? '');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localScores, setLocalScores] = useState<Record<string, { titans: number; rebels: number }>>({});

  const titans = assignments.filter((a) => a.team_name === 'TITANS');
  const rebels = assignments.filter((a) => a.team_name === 'REBELS');

  // Active open match for selected challenge type (if any)
  const openMatch = matches.find((m) => m.league_challenge_id === activeChallengeId && !m.completed_at) ?? null;
  const recentMatches = matches.filter((m) => m.league_challenge_id === activeChallengeId).slice(0, 10);

  const scores = openMatch
    ? localScores[openMatch.id] ?? { titans: openMatch.titans_score, rebels: openMatch.rebels_score }
    : { titans: 0, rebels: 0 };

  const handleScoreChange = (matchId: string, team: 'titans' | 'rebels', value: number) => {
    setLocalScores((prev) => ({
      ...prev,
      [matchId]: { ...(prev[matchId] ?? scores), [team]: value },
    }));
    startTransition(async () => {
      const next = { ...scores, [team]: value };
      const res = await updateLeagueMatchScore(matchId, next.titans, next.rebels);
      if (!res.success) setError(res.error);
    });
  };

  const handleComplete = (matchId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await completeLeagueMatch(matchId);
      if (!res.success) setError(res.error);
    });
  };

  const handleDelete = (matchId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await deleteLeagueMatch(matchId);
      if (!res.success) setError(res.error);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── Challenge Selector & Democratized "+ Create League" Bar ─── */}
      <div className="flex items-center justify-between gap-3 overflow-x-auto scrollbar-hide bg-slate-900 text-white rounded-2xl p-2.5 border border-slate-800">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {challenges.length === 0 && (
            <span className="text-xs text-slate-400 font-bold px-2">No league challenge types yet.</span>
          )}
          {challenges.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveChallengeId(c.id)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition cursor-pointer ${
                activeChallengeId === c.id
                  ? 'bg-[#CEFF00] text-black shadow-xs'
                  : 'bg-white/10 text-slate-300 hover:text-white'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#CEFF00] text-black font-black text-xs uppercase tracking-wider rounded-xl transition cursor-pointer hover:bg-[#b8e600] flex-shrink-0 active:scale-95 shadow-md"
        >
          <Plus size={16} strokeWidth={3} /> Create League
        </button>
      </div>

      {error && <p className="text-xs font-bold text-red-600 px-1">{error}</p>}

      {/* ── Active League Match Section ───────────────────────────── */}
      {openMatch ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            {([
              { team: 'TITANS' as const, members: titans, key: 'titans' as const },
              { team: 'REBELS' as const, members: rebels, key: 'rebels' as const },
            ]).map(({ team, members: teamMembers, key }) => {
              const isWinner = openMatch.winner_team === team;
              return (
                <div
                  key={team}
                  className={`rounded-2xl border p-4 flex flex-col justify-between gap-4 transition shadow-sm ${
                    isWinner
                      ? 'bg-[#FFF8DC] border-[#E5C55A] ring-2 ring-[#E5C55A]/50'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                      {isWinner && <Trophy size={16} className="text-[#B8912F]" />} {team}
                    </h4>
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase">
                      {teamMembers.length} Players
                    </span>
                  </div>

                  {/* Member avatars */}
                  <div className="flex flex-wrap gap-1.5 min-h-[36px] items-center">
                    {teamMembers.map((m) => (
                      <UserAvatar
                        key={m.user_id}
                        user={{
                          nickname: m.profiles?.nickname ?? null,
                          full_name: m.profiles?.full_name ?? null,
                          avatar_url: m.profiles?.avatar_url ?? null,
                        }}
                        size="sm"
                      />
                    ))}
                    {teamMembers.length === 0 && (
                      <span className="text-xs text-slate-400 italic">No members assigned</span>
                    )}
                  </div>

                  {/* Score input / display */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Team Score</label>
                    <input
                      type="number"
                      min={0}
                      value={key === 'titans' ? scores.titans : scores.rebels}
                      onChange={(e) => handleScoreChange(openMatch.id, key, Number(e.target.value))}
                      disabled={isPending || !!openMatch.completed_at}
                      className="w-full text-center text-3xl font-black rounded-xl border border-slate-200 py-2.5 bg-slate-50 disabled:opacity-60 tabular-nums focus:outline-none focus:border-[#CEFF00]"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {!openMatch.completed_at && (
            <button
              type="button"
              onClick={() => handleComplete(openMatch.id)}
              disabled={isPending}
              className="w-full py-4 rounded-2xl bg-[#111827] text-[#CEFF00] font-black text-xs uppercase tracking-wider disabled:opacity-40 cursor-pointer hover:bg-slate-900 transition flex items-center justify-center gap-2 shadow-lg"
            >
              <Swords size={16} /> COMPLETE CHALLENGE
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3 shadow-xs">
          <div className="p-3 rounded-full bg-[#CEFF00]/20 text-[#658000]">
            <Swords size={28} />
          </div>
          <h3 className="text-base font-extrabold text-slate-900 uppercase tracking-tight">No Active Match</h3>
          <p className="text-xs text-slate-500 max-w-xs">
            Start a new team match to pit TITANS against REBELS and aggregate live scores!
          </p>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="mt-2 px-6 py-3 bg-[#CEFF00] text-black font-black text-xs uppercase tracking-wider rounded-xl transition cursor-pointer hover:bg-[#b8e600]"
          >
            Create League Match
          </button>
        </div>
      )}

      {/* ── Recent Matches Section ─────────────────────────────────── */}
      <div className="flex flex-col gap-3 pt-2">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Recent Matches</h4>
        {recentMatches.length === 0 && (
          <p className="text-xs text-slate-400 font-bold bg-white border border-slate-200 rounded-xl p-4 text-center">
            No past matches recorded yet.
          </p>
        )}
        {recentMatches.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-xs"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-extrabold text-slate-800 tabular-nums">
                TITANS <span className="text-slate-900 font-black">{m.titans_score}</span> —{' '}
                <span className="text-slate-900 font-black">{m.rebels_score}</span> REBELS
              </span>
              {m.winner_team && (
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#CEFF00]/20 text-[#658000]">
                  {m.winner_team === 'TIE' ? 'Tie' : `${m.winner_team} Won`}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleDelete(m.id)}
              disabled={isPending}
              className="p-1.5 rounded-xl text-red-500 hover:bg-red-50 cursor-pointer disabled:opacity-50 transition"
              title="Delete match record"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* ── Create League Modal ────────────────────────────────────── */}
      <CreateLeagueModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        challenges={challenges}
        assignments={assignments}
        members={members}
      />
    </div>
  );
}
