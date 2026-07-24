'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { Trophy, Swords, Plus, Clock, ChevronDown, Check } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import CreateLeagueModal from '@/components/challenges/CreateLeagueModal';
import TimerConfigModal from '@/components/challenges/TimerConfigModal';
import MatchDetailsModal from '@/components/challenges/MatchDetailsModal';
import LiveMatchTimer from '@/components/challenges/LiveMatchTimer';
import {
  type LeagueAssignment,
  type LeagueChallenge,
  type LeagueMatch,
  type GroupMemberProfile,
  createLeagueMatch,
  updatePlayerScoreAction,
  completeLeagueMatch,
  getLeagueMatchPlayerScores,
  type PlayerScoreRow,
} from '@/app/actions/leagues';

interface LeagueMatchPanelProps {
  assignments: LeagueAssignment[];
  challenges: LeagueChallenge[];
  matches: LeagueMatch[];
  members?: GroupMemberProfile[];
}

const DEFAULT_CHALLENGES = [
  { id: 'c-pushups', name: '100 Push-ups', description: '100 total push-ups target' },
  { id: 'c-squats', name: '100 Squats', description: '100 total bodyweight squats' },
  { id: 'c-steps', name: '10,000 Steps', description: '10k daily step count target' },
  { id: 'c-plank', name: '10 min Plank', description: '10 cumulative plank minutes' },
];

export default function LeagueMatchPanel({
  assignments,
  challenges: propChallenges,
  matches,
  members = [],
}: LeagueMatchPanelProps) {
  // Merge prop challenges with default fallback options
  const challenges = useMemo(() => {
    return propChallenges.length > 0 ? propChallenges : DEFAULT_CHALLENGES;
  }, [propChallenges]);

  const [selectedChallengeId, setSelectedChallengeId] = useState<string>(challenges[0]?.id ?? '');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [isTimerModalOpen, setIsTimerModalOpen] = useState<boolean>(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);

  const [selectedMatchForDetails, setSelectedMatchForDetails] = useState<LeagueMatch | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState<boolean>(false);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [celebrationWinner, setCelebrationWinner] = useState<string | null>(null);

  // Active open match for selected challenge
  const openMatch = useMemo(
    () => matches.find((m) => m.league_challenge_id === selectedChallengeId && !m.completed_at) ?? null,
    [matches, selectedChallengeId]
  );

  const recentMatches = useMemo(
    () => matches.filter((m) => m.completed_at != null),
    [matches]
  );

  // Individual player score state for active match
  const [playerScoresMap, setPlayerScoresMap] = useState<Record<string, number>>({});
  const [isTimerExpired, setIsTimerExpired] = useState<boolean>(false);

  useEffect(() => {
    if (openMatch?.id) {
      getLeagueMatchPlayerScores(openMatch.id).then((res) => {
        if (res.success) {
          const map: Record<string, number> = {};
          for (const s of res.scores) {
            map[s.user_id] = s.score;
          }
          setPlayerScoresMap(map);
        }
      });
    }
  }, [openMatch?.id]);

  const titans = assignments.filter((a) => a.team_name === 'TITANS');
  const rebels = assignments.filter((a) => a.team_name === 'REBELS');

  const selectedChallenge = challenges.find((c) => c.id === selectedChallengeId) ?? challenges[0];

  // Aggregated team scores calculated in real-time
  const titansTeamScore = useMemo(() => {
    let sum = 0;
    for (const m of titans) {
      sum += Number(playerScoresMap[m.user_id]) || 0;
    }
    return sum;
  }, [titans, playerScoresMap]);

  const rebelsTeamScore = useMemo(() => {
    let sum = 0;
    for (const m of rebels) {
      sum += Number(playerScoresMap[m.user_id]) || 0;
    }
    return sum;
  }, [rebels, playerScoresMap]);

  // Start new match
  const handleStartMatch = () => {
    setError(null);
    startTransition(async () => {
      const res = await createLeagueMatch(selectedChallengeId, timerSeconds ?? undefined);
      if (!res.success) setError(res.error);
    });
  };

  // Handle individual player score input
  const handlePlayerScoreChange = (targetUserId: string, teamName: 'TITANS' | 'REBELS', rawVal: string) => {
    if (!openMatch) return;
    const num = Number(rawVal);
    if (!Number.isFinite(num) || num < 0) return;

    setPlayerScoresMap((prev) => ({ ...prev, [targetUserId]: num }));

    startTransition(async () => {
      await updatePlayerScoreAction(openMatch.id, targetUserId, teamName, num);
    });
  };

  // Complete match
  const handleCompleteMatch = (matchId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await completeLeagueMatch(matchId);
      if (res.success) {
        setCelebrationWinner(res.winner);
        setTimeout(() => setCelebrationWinner(null), 4000);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto py-2">
      {/* ── PART 2: Challenge Control Bar (Top) ───────────────────────── */}
      <div className="bg-[#0F1F3C] border border-white/10 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        {/* Left Section: Challenge Dropdown + START + Set Timer */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap w-full md:w-auto">
          {/* Challenge Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              className="bg-[#CEFF00] text-black px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-md hover:bg-[#b8e600] transition"
            >
              <Swords size={15} />
              <span>{selectedChallenge?.name || 'Select Challenge'}</span>
              <ChevronDown size={14} />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-64 bg-[#0A1628] border-2 border-[#CEFF00] rounded-2xl p-2 z-40 shadow-2xl flex flex-col gap-1">
                {challenges.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedChallengeId(c.id);
                      setIsDropdownOpen(false);
                    }}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-left transition cursor-pointer ${
                      selectedChallengeId === c.id
                        ? 'bg-[#CEFF00] text-black'
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{c.name}</span>
                    {selectedChallengeId === c.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* START Match Button */}
          <button
            type="button"
            onClick={handleStartMatch}
            disabled={isPending || !selectedChallengeId || !!openMatch}
            className="bg-[#CEFF00] hover:bg-[#b8e600] text-black px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-40 cursor-pointer shadow-md transition"
          >
            {openMatch ? 'MATCH IN PROGRESS' : 'START'}
          </button>

          {/* Set Timer Button */}
          <button
            type="button"
            onClick={() => setIsTimerModalOpen(true)}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 border transition cursor-pointer ${
              timerSeconds
                ? 'bg-[#CEFF00]/15 border-[#CEFF00] text-[#CEFF00]'
                : 'bg-[#0A1628] border-white/20 text-slate-300 hover:border-white/40'
            }`}
          >
            <Clock size={15} />
            <span>
              {timerSeconds
                ? `${Math.floor(timerSeconds / 60)}:${String(timerSeconds % 60).padStart(2, '0')}`
                : '⏱️ Set Timer'}
            </span>
          </button>
        </div>

        {/* Right Section: + CREATE LEAGUE Button */}
        <div className="w-full md:w-auto flex justify-end">
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="w-full sm:w-auto bg-[#CEFF00] hover:bg-[#b8e600] text-black px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition"
          >
            <Plus size={16} />
            <span>CREATE LEAGUE</span>
          </button>
        </div>
      </div>

      {error && <p className="text-xs font-bold text-red-500 px-1">{error}</p>}

      {/* ── Celebration Toast ────────────────────────────────────────── */}
      {celebrationWinner && (
        <div className="bg-[#CEFF00] text-black border-2 border-black p-4 rounded-2xl text-center font-black text-sm uppercase tracking-wider shadow-2xl animate-bounce">
          🎉 {celebrationWinner === 'TIE' ? "IT'S A TIE MATCH!" : `${celebrationWinner} WINS THE CHALLENGE!`} 🎉
        </div>
      )}

      {/* ── PART 4 & 5: Active Match Display with Individual Scores & Live Timer ── */}
      {openMatch ? (
        <div className="flex flex-col gap-5">
          {/* Live Countdown Timer */}
          {openMatch.timer_duration_seconds && openMatch.timer_started_at && (
            <div className="flex justify-center">
              <LiveMatchTimer
                durationSeconds={openMatch.timer_duration_seconds}
                startedAt={openMatch.timer_started_at}
                onTimeUp={() => setIsTimerExpired(true)}
              />
            </div>
          )}

          {/* Team Comparison Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* ── TITANS Team Card ────────────────────────────────────── */}
            <div className="bg-[#0A1628] border-2 border-[#CEFF00] rounded-3xl p-5 md:p-6 shadow-xl flex flex-col justify-between gap-5">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="text-lg font-black text-[#CEFF00] tracking-wider">TITANS</h3>
                  <span className="text-xs font-bold uppercase text-slate-400">
                    {titans.length} PLAYERS
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {titans.map((m) => {
                    const name = m.profiles?.nickname || m.profiles?.full_name || 'Member';
                    const userScore = playerScoresMap[m.user_id] ?? 0;

                    return (
                      <div
                        key={m.user_id}
                        className="flex items-center justify-between gap-3 bg-[#0F1F3C] p-3 rounded-2xl border border-white/10"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            user={{ avatar_url: m.profiles?.avatar_url, nickname: name }}
                            size="md"
                            className="w-10 h-10 rounded-full border-2 border-[#CEFF00]"
                          />
                          <span className="text-xs font-bold text-white truncate">{name}</span>
                        </div>

                        {/* Individual Player Score Input Box */}
                        <input
                          type="number"
                          min={0}
                          disabled={isTimerExpired || isPending}
                          value={userScore === 0 ? '' : userScore}
                          placeholder="Score"
                          onChange={(e) =>
                            handlePlayerScoreChange(m.user_id, 'TITANS', e.target.value)
                          }
                          className="w-20 bg-[#0A1628] border border-white/20 focus:border-[#CEFF00] rounded-xl px-2.5 py-1.5 text-center text-xs font-black text-[#CEFF00] focus:outline-none disabled:opacity-40"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team Total Score (Auto-aggregates) */}
              <div className="border-t border-white/10 pt-4 flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                  TEAM SCORE
                </span>
                <span className="text-3xl font-black text-[#CEFF00] tabular-nums">
                  {titansTeamScore}
                </span>
              </div>
            </div>

            {/* ── REBELS Team Card ────────────────────────────────────── */}
            <div className="bg-[#0A1628] border-2 border-purple-500 rounded-3xl p-5 md:p-6 shadow-xl flex flex-col justify-between gap-5">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="text-lg font-black text-purple-400 tracking-wider">REBELS</h3>
                  <span className="text-xs font-bold uppercase text-slate-400">
                    {rebels.length} PLAYERS
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {rebels.map((m) => {
                    const name = m.profiles?.nickname || m.profiles?.full_name || 'Member';
                    const userScore = playerScoresMap[m.user_id] ?? 0;

                    return (
                      <div
                        key={m.user_id}
                        className="flex items-center justify-between gap-3 bg-[#0F1F3C] p-3 rounded-2xl border border-white/10"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            user={{ avatar_url: m.profiles?.avatar_url, nickname: name }}
                            size="md"
                            className="w-10 h-10 rounded-full border-2 border-purple-400"
                          />
                          <span className="text-xs font-bold text-white truncate">{name}</span>
                        </div>

                        {/* Individual Player Score Input Box */}
                        <input
                          type="number"
                          min={0}
                          disabled={isTimerExpired || isPending}
                          value={userScore === 0 ? '' : userScore}
                          placeholder="Score"
                          onChange={(e) =>
                            handlePlayerScoreChange(m.user_id, 'REBELS', e.target.value)
                          }
                          className="w-20 bg-[#0A1628] border border-white/20 focus:border-purple-400 rounded-xl px-2.5 py-1.5 text-center text-xs font-black text-purple-400 focus:outline-none disabled:opacity-40"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team Total Score (Auto-aggregates) */}
              <div className="border-t border-white/10 pt-4 flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                  TEAM SCORE
                </span>
                <span className="text-3xl font-black text-purple-400 tabular-nums">
                  {rebelsTeamScore}
                </span>
              </div>
            </div>
          </div>

          {/* COMPLETE CHALLENGE Button */}
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleCompleteMatch(openMatch.id)}
            className="w-full py-4 rounded-2xl bg-[#CEFF00] hover:bg-[#b8e600] text-black font-black text-sm uppercase tracking-wider shadow-2xl transition cursor-pointer disabled:opacity-40"
          >
            {isPending ? 'COMPLETING...' : 'COMPLETE CHALLENGE'}
          </button>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center text-slate-500 flex flex-col items-center gap-2">
          <Swords size={32} className="text-slate-400" />
          <p className="text-sm font-bold text-[#0F1F3C]">No active match for {selectedChallenge?.name}.</p>
          <p className="text-xs text-slate-400">Click START above to begin a live match.</p>
        </div>
      )}

      {/* ── PART 8: Recent Matches History & Details Popup Trigger ─────── */}
      <div className="flex flex-col gap-3 mt-4 border-t border-slate-200 pt-5">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">RECENT MATCHES</h4>
        {recentMatches.length === 0 && (
          <p className="text-xs text-slate-400 font-medium">No past matches recorded yet.</p>
        )}

        <div className="flex flex-col gap-2">
          {recentMatches.map((m) => {
            const ch = challenges.find((c) => c.id === m.league_challenge_id);
            const winnerText = m.winner_team
              ? m.winner_team === 'TIE'
                ? 'TIE'
                : `${m.winner_team} WON`
              : 'COMPLETED';

            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setSelectedMatchForDetails(m);
                  setIsDetailsModalOpen(true);
                }}
                className="flex items-center justify-between gap-4 bg-white border border-slate-200 hover:border-[#CEFF00] p-4 rounded-2xl text-left transition cursor-pointer shadow-xs active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                    <Trophy size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-[#0F1F3C]">
                      {ch?.name || 'League Match'}
                    </span>
                    <p className="text-[11px] text-slate-400 font-medium">
                      {new Date(m.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-sm font-black text-[#0F1F3C] tabular-nums">
                    TITANS {m.titans_score} — {m.rebels_score} REBELS
                  </span>
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
                      m.winner_team === 'TITANS'
                        ? 'bg-[#CEFF00] text-black'
                        : m.winner_team === 'REBELS'
                        ? 'bg-purple-500 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {winnerText}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Timer Config Modal */}
      <TimerConfigModal
        isOpen={isTimerModalOpen}
        onClose={() => setIsTimerModalOpen(false)}
        onConfirm={(sec) => setTimerSeconds(sec)}
        initialSeconds={timerSeconds ?? 600}
      />

      {/* Create League Modal */}
      <CreateLeagueModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        challenges={challenges}
        members={members}
        assignments={assignments}
      />

      {/* Match Details Popup Modal */}
      <MatchDetailsModal
        isOpen={isDetailsModalOpen}
        match={selectedMatchForDetails}
        challenge={challenges.find((c) => c.id === selectedMatchForDetails?.league_challenge_id) ?? null}
        assignments={assignments}
        onClose={() => setIsDetailsModalOpen(false)}
      />
    </div>
  );
}
