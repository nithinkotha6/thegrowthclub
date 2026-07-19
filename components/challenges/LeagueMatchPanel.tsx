'use client';

import { useState, useTransition } from 'react';
import { Trophy, Trash2, Swords } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import {
  type LeagueAssignment,
  type LeagueChallenge,
  type LeagueMatch,
  createLeagueMatch,
  updateLeagueMatchScore,
  completeLeagueMatch,
  deleteLeagueMatch,
} from '@/app/actions/leagues';

interface LeagueMatchPanelProps {
  assignments: LeagueAssignment[];
  challenges: LeagueChallenge[];
  matches: LeagueMatch[];
}

export default function LeagueMatchPanel({ assignments, challenges, matches }: LeagueMatchPanelProps) {
  const [activeChallengeId, setActiveChallengeId] = useState(challenges[0]?.id ?? '');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localScores, setLocalScores] = useState<Record<string, { titans: number; rebels: number }>>({});

  const titans = assignments.filter((a) => a.team_name === 'TITANS');
  const rebels = assignments.filter((a) => a.team_name === 'REBELS');

  // Most recent open (not completed, not deleted) match for the active challenge type.
  const openMatch = matches.find((m) => m.league_challenge_id === activeChallengeId && !m.completed_at) ?? null;
  const recentMatches = matches.filter((m) => m.league_challenge_id === activeChallengeId).slice(0, 8);

  const scores = openMatch
    ? localScores[openMatch.id] ?? { titans: openMatch.titans_score, rebels: openMatch.rebels_score }
    : { titans: 0, rebels: 0 };

  const handleCreateMatch = () => {
    if (!activeChallengeId) return;
    setError(null);
    startTransition(async () => {
      const res = await createLeagueMatch(activeChallengeId);
      if (!res.success) setError(res.error);
    });
  };

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
      {/* ── Challenge type selector (horizontal scroll) ─────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {challenges.length === 0 && <p className="text-xs text-slate-400 font-bold">No league challenge types yet.</p>}
        {challenges.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveChallengeId(c.id)}
            className={`px-4 py-2 rounded-full text-xs font-black whitespace-nowrap transition cursor-pointer ${
              activeChallengeId === c.id ? 'bg-[#111827] text-[#CEFF00]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {error && <p className="text-xs font-bold text-red-600">{error}</p>}

      {!openMatch && activeChallengeId && (
        <button
          type="button"
          onClick={handleCreateMatch}
          disabled={isPending}
          className="w-full py-3 rounded-xl bg-[#CEFF00] text-black text-xs font-black uppercase tracking-wider disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"
        >
          <Swords size={14} /> Start New Match
        </button>
      )}

      {/* ── Two-column team grid ─────────────────────────────────────── */}
      {openMatch && (
        <div className="grid grid-cols-2 gap-3">
          {([
            { team: 'TITANS' as const, members: titans, key: 'titans' as const },
            { team: 'REBELS' as const, members: rebels, key: 'rebels' as const },
          ]).map(({ team, members, key }) => {
            const isWinner = openMatch.winner_team === team;
            return (
              <div
                key={team}
                className={`rounded-2xl border p-4 flex flex-col gap-3 transition ${
                  isWinner ? 'bg-[#FFF8DC] border-[#E5C55A]' : 'bg-white border-slate-200'
                }`}
              >
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  {isWinner && <Trophy size={14} className="text-[#B8912F]" />} {team}
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {members.map((m) => (
                    <UserAvatar
                      key={m.user_id}
                      user={{ nickname: m.profiles?.nickname ?? null, full_name: m.profiles?.full_name ?? null, avatar_url: m.profiles?.avatar_url ?? null }}
                      size="sm"
                    />
                  ))}
                  {members.length === 0 && <span className="text-[10px] text-slate-400">No members assigned</span>}
                </div>
                <input
                  type="number"
                  min={0}
                  value={key === 'titans' ? scores.titans : scores.rebels}
                  onChange={(e) => handleScoreChange(openMatch.id, key, Number(e.target.value))}
                  disabled={isPending || !!openMatch.completed_at}
                  className="w-full text-center text-2xl font-black rounded-xl border border-slate-200 py-2 bg-slate-50 disabled:opacity-60 tabular-nums"
                />
              </div>
            );
          })}
        </div>
      )}

      {openMatch && !openMatch.completed_at && (
        <button
          type="button"
          onClick={() => handleComplete(openMatch.id)}
          disabled={isPending}
          className="w-full py-3 rounded-xl bg-[#111827] text-[#CEFF00] text-xs font-black uppercase tracking-wider disabled:opacity-40 cursor-pointer"
        >
          Complete Challenge
        </button>
      )}

      {/* ── Recent Activities (league matches) ───────────────────────── */}
      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Recent Matches</h4>
        {recentMatches.length === 0 && <p className="text-xs text-slate-400">No matches logged yet.</p>}
        {recentMatches.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-slate-700">
              TITANS {m.titans_score} — {m.rebels_score} REBELS
              {m.winner_team && <span className="ml-2 font-black text-[#B8912F]">{m.winner_team === 'TIE' ? 'Tie' : `${m.winner_team} won`}</span>}
            </span>
            <button
              type="button"
              onClick={() => handleDelete(m.id)}
              disabled={isPending}
              className="p-1 rounded text-red-500 hover:bg-red-50 cursor-pointer disabled:opacity-50"
              title="Delete match"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
