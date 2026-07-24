'use client';

import { useState, useEffect } from 'react';
import { X, Trophy, Swords, Calendar } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import {
  type LeagueMatch,
  type LeagueChallenge,
  type LeagueAssignment,
  type PlayerScoreRow,
  getLeagueMatchPlayerScores,
} from '@/app/actions/leagues';

interface MatchDetailsModalProps {
  isOpen: boolean;
  match: LeagueMatch | null;
  challenge: LeagueChallenge | null;
  assignments: LeagueAssignment[];
  onClose: () => void;
}

export function MatchDetailsModal({
  isOpen,
  match,
  challenge,
  assignments,
  onClose,
}: MatchDetailsModalProps) {
  const [playerScores, setPlayerScores] = useState<PlayerScoreRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && match?.id) {
      setLoading(true);
      getLeagueMatchPlayerScores(match.id).then((res) => {
        if (res.success) {
          setPlayerScores(res.scores);
        }
        setLoading(false);
      });
    }
  }, [isOpen, match?.id]);

  if (!isOpen || !match) return null;

  const titansMembers = assignments.filter((a) => a.team_name === 'TITANS');
  const rebelsMembers = assignments.filter((a) => a.team_name === 'REBELS');

  const winnerText =
    match.winner_team === 'TITANS'
      ? '🏆 TITANS WIN!'
      : match.winner_team === 'REBELS'
      ? '🏆 REBELS WIN!'
      : '🤝 TIE MATCH!';

  const formattedDate = match.completed_at
    ? new Date(match.completed_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date(match.created_at).toLocaleDateString();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="bg-[#0A1628] border-2 border-[#CEFF00] rounded-3xl p-6 md:p-8 max-w-2xl w-full text-white shadow-2xl flex flex-col gap-6 relative max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white transition cursor-pointer p-1 rounded-full hover:bg-white/10"
        >
          <X size={20} />
        </button>

        {/* Winner Banner */}
        <div className="flex flex-col items-center justify-center text-center gap-1.5 border-b border-white/10 pb-5 pt-2">
          <span className="text-2xl font-black text-[#CEFF00] uppercase tracking-wider">
            {winnerText}
          </span>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
            <Swords size={14} className="text-[#CEFF00]" />
            <span>{challenge?.name || 'League Match'}</span>
            <span>•</span>
            <Calendar size={14} />
            <span>{formattedDate}</span>
          </div>
        </div>

        {/* Team Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ── TITANS Team Card ────────────────────────────────────── */}
          <div className="bg-[#0F1F3C] border border-[#CEFF00]/40 rounded-2xl p-4 flex flex-col justify-between gap-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-sm font-black text-[#CEFF00] tracking-wider">TITANS</span>
                <span className="text-[10px] font-bold uppercase text-slate-400">
                  {titansMembers.length} Players
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {titansMembers.map((m) => {
                  const pScore = playerScores.find((s) => s.user_id === m.user_id)?.score ?? 0;
                  const name = m.profiles?.nickname || m.profiles?.full_name || 'Member';

                  return (
                    <div
                      key={m.user_id}
                      className="flex items-center justify-between gap-3 bg-[#0A1628]/60 p-2.5 rounded-xl border border-white/5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar
                          user={{ avatar_url: m.profiles?.avatar_url, nickname: name }}
                          size="sm"
                          className="w-8 h-8 rounded-full border border-[#CEFF00]"
                        />
                        <span className="text-xs font-bold text-white truncate">{name}</span>
                      </div>
                      <span className="text-xs font-black text-[#CEFF00] tracking-tight">
                        {pScore}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-white/10 pt-3 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                TEAM SCORE
              </span>
              <span className="text-2xl font-black text-[#CEFF00] tabular-nums">
                {match.titans_score}
              </span>
            </div>
          </div>

          {/* ── REBELS Team Card ────────────────────────────────────── */}
          <div className="bg-[#0F1F3C] border border-purple-500/40 rounded-2xl p-4 flex flex-col justify-between gap-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-sm font-black text-purple-400 tracking-wider">REBELS</span>
                <span className="text-[10px] font-bold uppercase text-slate-400">
                  {rebelsMembers.length} Players
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {rebelsMembers.map((m) => {
                  const pScore = playerScores.find((s) => s.user_id === m.user_id)?.score ?? 0;
                  const name = m.profiles?.nickname || m.profiles?.full_name || 'Member';

                  return (
                    <div
                      key={m.user_id}
                      className="flex items-center justify-between gap-3 bg-[#0A1628]/60 p-2.5 rounded-xl border border-white/5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar
                          user={{ avatar_url: m.profiles?.avatar_url, nickname: name }}
                          size="sm"
                          className="w-8 h-8 rounded-full border border-purple-400"
                        />
                        <span className="text-xs font-bold text-white truncate">{name}</span>
                      </div>
                      <span className="text-xs font-black text-purple-400 tracking-tight">
                        {pScore}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-white/10 pt-3 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                TEAM SCORE
              </span>
              <span className="text-2xl font-black text-purple-400 tabular-nums">
                {match.rebels_score}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MatchDetailsModal;
