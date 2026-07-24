'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import {
  Trophy,
  Swords,
  Plus,
  Clock,
  ChevronDown,
  Check,
  Users,
  Play,
  Zap,
  Shield,
} from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import CreateLeagueModal from '@/components/challenges/CreateLeagueModal';
import TimerConfigModal from '@/components/challenges/TimerConfigModal';
import MatchDetailsModal from '@/components/challenges/MatchDetailsModal';
import LiveMatchTimer from '@/components/challenges/LiveMatchTimer';
import TeamSelectionModal from '@/components/challenges/TeamSelectionModal';
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

// ─── State Machine Types ──────────────────────────────────────────────────────
type MatchStatus = 'NO_MATCH' | 'TEAMS_SELECTED' | 'MATCH_ACTIVE';

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
  // ─── Challenge list ────────────────────────────────────────────────────────
  const challenges = useMemo(() => {
    return propChallenges.length > 0 ? propChallenges : DEFAULT_CHALLENGES;
  }, [propChallenges]);

  // ─── Core State Machine ────────────────────────────────────────────────────
  const [matchStatus, setMatchStatus] = useState<MatchStatus>('NO_MATCH');
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);

  // Explicitly selected team members (null = not yet selected)
  const [titanTeamMembers, setTitanTeamMembers] = useState<GroupMemberProfile[] | null>(null);
  const [rebelTeamMembers, setRebelTeamMembers] = useState<GroupMemberProfile[] | null>(null);

  // Active match (only populated when MATCH_ACTIVE)
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [activeMatch, setActiveMatch] = useState<LeagueMatch | null>(null);

  // Timer
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [isTimerExpired, setIsTimerExpired] = useState<boolean>(false);

  // UI modals
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState<boolean>(false);
  const [isTimerModalOpen, setIsTimerModalOpen] = useState<boolean>(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [selectedMatchForDetails, setSelectedMatchForDetails] = useState<LeagueMatch | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState<boolean>(false);

  // Feedback
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [celebrationWinner, setCelebrationWinner] = useState<string | null>(null);

  // Player score map (only relevant when MATCH_ACTIVE)
  const [playerScoresMap, setPlayerScoresMap] = useState<Record<string, number>>({});

  // ─── Recent matches (completed only, from server-fetched prop) ─────────────
  const recentMatches = useMemo(
    () => matches.filter((m) => m.completed_at != null),
    [matches],
  );

  // ─── Derived challenge info ────────────────────────────────────────────────
  const selectedChallenge = challenges.find((c) => c.id === selectedChallengeId) ?? null;

  // ─── Load player scores when a match becomes active ───────────────────────
  useEffect(() => {
    if (activeMatchId) {
      getLeagueMatchPlayerScores(activeMatchId).then((res) => {
        if (res.success) {
          const map: Record<string, number> = {};
          for (const s of res.scores) map[s.user_id] = s.score;
          setPlayerScoresMap(map);
        }
      });
    }
  }, [activeMatchId]);

  // ─── Aggregated team scores (real-time, client-side) ──────────────────────
  const titansTeamScore = useMemo(() => {
    if (!titanTeamMembers) return 0;
    return titanTeamMembers.reduce((sum, m) => sum + (Number(playerScoresMap[m.user_id]) || 0), 0);
  }, [titanTeamMembers, playerScoresMap]);

  const rebelsTeamScore = useMemo(() => {
    if (!rebelTeamMembers) return 0;
    return rebelTeamMembers.reduce((sum, m) => sum + (Number(playerScoresMap[m.user_id]) || 0), 0);
  }, [rebelTeamMembers, playerScoresMap]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  /** Challenge dropdown: sets challenge, resets teams, stays NO_MATCH */
  const handleSelectChallenge = (challengeId: string) => {
    setSelectedChallengeId(challengeId);
    setTitanTeamMembers(null);
    setRebelTeamMembers(null);
    setMatchStatus('NO_MATCH');
    setIsDropdownOpen(false);
    setError(null);
  };

  /** TeamSelectionModal confirm: sets teams, advances to TEAMS_SELECTED */
  const handleTeamsConfirmed = (titans: GroupMemberProfile[], rebels: GroupMemberProfile[]) => {
    setTitanTeamMembers(titans);
    setRebelTeamMembers(rebels);
    setMatchStatus('TEAMS_SELECTED');
    setIsTeamModalOpen(false);
    setError(null);
  };

  /** START MATCH: validate → create DB record → MATCH_ACTIVE */
  const handleStartMatch = () => {
    if (!selectedChallengeId) {
      setError('Please select a challenge first.');
      return;
    }
    if (!titanTeamMembers || titanTeamMembers.length === 0) {
      setError('TITANS team must have at least 1 member.');
      return;
    }
    if (!rebelTeamMembers || rebelTeamMembers.length === 0) {
      setError('REBELS team must have at least 1 member.');
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await createLeagueMatch(selectedChallengeId, timerSeconds ?? undefined);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setActiveMatchId(res.match.id);
      setActiveMatch(res.match);
      setPlayerScoresMap({});
      setIsTimerExpired(false);
      setMatchStatus('MATCH_ACTIVE');
    });
  };

  /** Individual player score update */
  const handlePlayerScoreChange = (
    targetUserId: string,
    teamName: 'TITANS' | 'REBELS',
    rawVal: string,
  ) => {
    if (!activeMatchId) return;
    const num = Number(rawVal);
    if (!Number.isFinite(num) || num < 0) return;

    setPlayerScoresMap((prev) => ({ ...prev, [targetUserId]: num }));

    startTransition(async () => {
      await updatePlayerScoreAction(activeMatchId, targetUserId, teamName, num);
    });
  };

  /** COMPLETE CHALLENGE: lock match, calculate winner, reset to NO_MATCH */
  const handleCompleteMatch = () => {
    if (!activeMatchId) return;
    setError(null);
    startTransition(async () => {
      const res = await completeLeagueMatch(activeMatchId);
      if (res.success) {
        setCelebrationWinner(res.winner);
        // Full state reset
        setMatchStatus('NO_MATCH');
        setActiveMatchId(null);
        setActiveMatch(null);
        setTitanTeamMembers(null);
        setRebelTeamMembers(null);
        setTimerSeconds(null);
        setIsTimerExpired(false);
        setPlayerScoresMap({});
        setTimeout(() => setCelebrationWinner(null), 5000);
      } else {
        setError(res.error);
      }
    });
  };

  // ─── Derived display helpers ───────────────────────────────────────────────
  const teamsLabel =
    titanTeamMembers && rebelTeamMembers
      ? `👥 ${titanTeamMembers.length} vs ${rebelTeamMembers.length}`
      : '👥 SELECT TEAMS';

  const timerLabel = timerSeconds
    ? `${Math.floor(timerSeconds / 60)}:${String(timerSeconds % 60).padStart(2, '0')}`
    : 'SET TIMER';

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto py-2">

      {/* ── Celebration Toast ─────────────────────────────────────────────── */}
      {celebrationWinner && (
        <div className="bg-[#CEFF00] text-black border-2 border-black p-4 rounded-2xl text-center font-black text-sm uppercase tracking-wider shadow-2xl animate-bounce">
          🎉{' '}
          {celebrationWinner === 'TIE'
            ? "IT'S A TIE MATCH!"
            : `${celebrationWinner} WINS THE CHALLENGE!`}{' '}
          🎉
        </div>
      )}

      {/* ── CONTROL BAR: Full horizontal, never stacks vertically ────────── */}
      <div
        className="bg-[#0F1F3C] border border-white/10 rounded-2xl px-4 py-3 shadow-xl"
        style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
      >
        <div
          className="flex items-center gap-3"
          style={{ flexDirection: 'row', flexWrap: 'nowrap', minWidth: 'max-content' }}
        >
          {/* 1. Challenge Dropdown */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              className="bg-[#CEFF00] text-black px-3.5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md hover:bg-[#b8e600] transition whitespace-nowrap"
              style={{ minHeight: '44px' }}
            >
              <Swords size={13} />
              <span className="hidden sm:inline">
                {selectedChallenge ? selectedChallenge.name : 'CHALLENGE'}
              </span>
              <span className="sm:hidden">
                {selectedChallenge ? selectedChallenge.name.split(' ').slice(0, 2).join(' ') : 'CHALL'}
              </span>
              <ChevronDown size={13} />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-60 bg-[#0A1628] border-2 border-[#CEFF00] rounded-2xl p-2 z-40 shadow-2xl flex flex-col gap-1">
                {challenges.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectChallenge(c.id)}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-left transition cursor-pointer ${
                      selectedChallengeId === c.id
                        ? 'bg-[#CEFF00] text-black'
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{c.name}</span>
                    {selectedChallengeId === c.id && <Check size={13} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-white/15 flex-shrink-0" />

          {/* 2. SELECT TEAMS Button */}
          <button
            type="button"
            onClick={() => setIsTeamModalOpen(true)}
            disabled={!selectedChallengeId || matchStatus === 'MATCH_ACTIVE'}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition cursor-pointer whitespace-nowrap border ${
              titanTeamMembers && rebelTeamMembers
                ? 'bg-[#CEFF00]/12 border-[#CEFF00] text-[#CEFF00]'
                : 'bg-[#0A1628] border-white/20 text-slate-300 hover:border-white/40'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            style={{ minHeight: '44px' }}
          >
            <Users size={13} />
            <span className="hidden sm:inline">{teamsLabel}</span>
            <span className="sm:hidden">
              {titanTeamMembers && rebelTeamMembers ? `${titanTeamMembers.length}v${rebelTeamMembers.length}` : '👥'}
            </span>
          </button>

          {/* 3. SET TIMER Button */}
          <button
            type="button"
            onClick={() => setIsTimerModalOpen(true)}
            disabled={matchStatus === 'MATCH_ACTIVE'}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition cursor-pointer whitespace-nowrap border ${
              timerSeconds
                ? 'bg-[#CEFF00]/12 border-[#CEFF00] text-[#CEFF00]'
                : 'bg-[#0A1628] border-white/20 text-slate-300 hover:border-white/40'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            style={{ minHeight: '44px' }}
          >
            <Clock size={13} />
            <span className="hidden sm:inline">⏱ {timerLabel}</span>
            <span className="sm:hidden">⏱</span>
          </button>

          {/* 4. START MATCH Button */}
          <button
            type="button"
            onClick={handleStartMatch}
            disabled={
              isPending ||
              !selectedChallengeId ||
              !titanTeamMembers ||
              !rebelTeamMembers ||
              matchStatus === 'MATCH_ACTIVE'
            }
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition cursor-pointer whitespace-nowrap shadow-md ${
              matchStatus === 'MATCH_ACTIVE'
                ? 'bg-emerald-500/20 border border-emerald-500 text-emerald-400 cursor-default'
                : 'bg-[#CEFF00] hover:bg-[#b8e600] text-black'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            style={{ minHeight: '44px' }}
          >
            {matchStatus === 'MATCH_ACTIVE' ? (
              <>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="hidden sm:inline">MATCH LIVE</span>
                <span className="sm:hidden">LIVE</span>
              </>
            ) : (
              <>
                <Play size={12} fill="currentColor" />
                <span className="hidden sm:inline">
                  {isPending ? 'STARTING...' : 'START MATCH'}
                </span>
                <span className="sm:hidden">START</span>
              </>
            )}
          </button>

          {/* Spacer pushes CREATE to the right */}
          <div className="flex-shrink-0 w-2" />

          {/* 5. CREATE LEAGUE — compact icon+text or icon-only */}
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex-shrink-0 flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider bg-[#CEFF00] hover:bg-[#b8e600] text-black cursor-pointer shadow-md transition whitespace-nowrap"
            style={{ minHeight: '44px' }}
          >
            <Plus size={14} />
            <span className="hidden md:inline">CREATE</span>
          </button>
        </div>
      </div>

      {/* ── Error Display ─────────────────────────────────────────────────── */}
      {error && (
        <p className="text-xs font-bold text-red-400 px-1 -mt-3">{error}</p>
      )}

      {/* ── MATCH CONTENT: Conditional on matchStatus ─────────────────────── */}
      {matchStatus === 'NO_MATCH' && (
        <div className="bg-[#0A1628] border border-white/10 rounded-2xl p-10 text-center flex flex-col items-center gap-3 shadow-lg">
          <div className="p-4 rounded-2xl bg-white/5">
            <Swords size={32} className="text-slate-500" />
          </div>
          <p className="text-sm font-black uppercase tracking-wider text-white">No Active Match</p>
          <p className="text-xs text-slate-400 font-medium max-w-xs leading-relaxed">
            Select a challenge, choose your teams, and start a match to begin competing!
          </p>
          {selectedChallengeId && !(titanTeamMembers && rebelTeamMembers) && (
            <button
              type="button"
              onClick={() => setIsTeamModalOpen(true)}
              className="mt-2 px-5 py-2.5 rounded-xl bg-[#CEFF00] text-black text-xs font-black uppercase tracking-wider hover:bg-[#b8e600] transition cursor-pointer shadow-md flex items-center gap-2"
            >
              <Users size={13} />
              Select Teams to Continue →
            </button>
          )}
        </div>
      )}

      {matchStatus === 'TEAMS_SELECTED' && titanTeamMembers && rebelTeamMembers && (
        <div className="bg-[#0A1628] border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-lg">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400 text-center">
            Teams Ready — Start the Match
          </p>

          {/* Non-interactive team preview */}
          <div className="flex gap-4" style={{ flexDirection: 'row' }}>
            {/* TITANS preview */}
            <div className="flex-1 bg-[#0F1F3C] border border-[#CEFF00]/30 rounded-2xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap size={12} className="text-[#CEFF00]" />
                <span className="text-[10px] font-black text-[#CEFF00] uppercase tracking-wider">
                  TITANS · {titanTeamMembers.length}
                </span>
              </div>
              {titanTeamMembers.map((m) => (
                <div key={m.user_id} className="flex items-center gap-2">
                  <UserAvatar
                    user={{ avatar_url: m.avatar_url, nickname: m.nickname || m.full_name || 'M' }}
                    size="sm"
                    className="w-7 h-7 rounded-full border border-[#CEFF00]/60 flex-shrink-0"
                  />
                  <span className="text-[11px] font-bold text-white truncate">
                    {m.nickname || m.full_name || 'Member'}
                  </span>
                </div>
              ))}
            </div>

            {/* VS divider */}
            <div className="flex-shrink-0 flex flex-col items-center justify-center gap-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">vs</span>
            </div>

            {/* REBELS preview */}
            <div className="flex-1 bg-[#0F1F3C] border border-purple-500/30 rounded-2xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Shield size={12} className="text-purple-400" />
                <span className="text-[10px] font-black text-purple-400 uppercase tracking-wider">
                  REBELS · {rebelTeamMembers.length}
                </span>
              </div>
              {rebelTeamMembers.map((m) => (
                <div key={m.user_id} className="flex items-center gap-2">
                  <UserAvatar
                    user={{ avatar_url: m.avatar_url, nickname: m.nickname || m.full_name || 'M' }}
                    size="sm"
                    className="w-7 h-7 rounded-full border border-purple-400/60 flex-shrink-0"
                  />
                  <span className="text-[11px] font-bold text-white truncate">
                    {m.nickname || m.full_name || 'Member'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleStartMatch}
            disabled={isPending}
            className="w-full py-3.5 rounded-2xl bg-[#CEFF00] hover:bg-[#b8e600] text-black font-black text-sm uppercase tracking-wider transition cursor-pointer shadow-lg disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Play size={14} fill="currentColor" />
            {isPending ? 'STARTING...' : 'START MATCH'}
          </button>
        </div>
      )}

      {matchStatus === 'MATCH_ACTIVE' && activeMatch && titanTeamMembers && rebelTeamMembers && (
        <div className="flex flex-col gap-5">
          {/* Live Countdown Timer */}
          {activeMatch.timer_duration_seconds && activeMatch.timer_started_at && (
            <div className="flex justify-center">
              <LiveMatchTimer
                durationSeconds={activeMatch.timer_duration_seconds}
                startedAt={activeMatch.timer_started_at}
                onTimeUp={() => setIsTimerExpired(true)}
              />
            </div>
          )}

          {/* Team Comparison Cards — ALWAYS side-by-side, all breakpoints */}
          <div
            className="flex gap-4"
            style={{ flexDirection: 'row', alignItems: 'stretch' }}
          >
            {/* ── TITANS Team Card ────────────────────────────────────────── */}
            <div
              className="bg-[#0A1628] border-2 border-[#CEFF00] rounded-3xl p-4 shadow-xl flex flex-col justify-between gap-4"
              style={{ flex: '1 1 0', minWidth: 0 }}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Zap size={13} className="text-[#CEFF00]" />
                    <h3 className="text-sm font-black text-[#CEFF00] tracking-wider">TITANS</h3>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    {titanTeamMembers.length} PLAYERS
                  </span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {titanTeamMembers.map((m) => {
                    const name = m.nickname || m.full_name || 'Member';
                    const userScore = playerScoresMap[m.user_id] ?? 0;
                    return (
                      <div
                        key={m.user_id}
                        className="flex items-center justify-between gap-2 bg-[#0F1F3C] p-2.5 rounded-2xl border border-white/10"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <UserAvatar
                            user={{ avatar_url: m.avatar_url, nickname: name }}
                            size="sm"
                            className="w-8 h-8 rounded-full border-2 border-[#CEFF00] flex-shrink-0"
                          />
                          <span className="text-[11px] font-bold text-white truncate">{name}</span>
                        </div>
                        <input
                          type="number"
                          min={0}
                          disabled={isTimerExpired || isPending}
                          value={userScore === 0 ? '' : userScore}
                          placeholder="0"
                          onChange={(e) =>
                            handlePlayerScoreChange(m.user_id, 'TITANS', e.target.value)
                          }
                          className="w-16 bg-[#0A1628] border border-white/20 focus:border-[#CEFF00] rounded-xl px-2 py-1.5 text-center text-xs font-black text-[#CEFF00] focus:outline-none disabled:opacity-40 flex-shrink-0"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team Total */}
              <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  TOTAL
                </span>
                <span className="text-2xl font-black text-[#CEFF00] tabular-nums">
                  {titansTeamScore}
                </span>
              </div>
            </div>

            {/* ── REBELS Team Card ────────────────────────────────────────── */}
            <div
              className="bg-[#0A1628] border-2 border-purple-500 rounded-3xl p-4 shadow-xl flex flex-col justify-between gap-4"
              style={{ flex: '1 1 0', minWidth: 0 }}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Shield size={13} className="text-purple-400" />
                    <h3 className="text-sm font-black text-purple-400 tracking-wider">REBELS</h3>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    {rebelTeamMembers.length} PLAYERS
                  </span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {rebelTeamMembers.map((m) => {
                    const name = m.nickname || m.full_name || 'Member';
                    const userScore = playerScoresMap[m.user_id] ?? 0;
                    return (
                      <div
                        key={m.user_id}
                        className="flex items-center justify-between gap-2 bg-[#0F1F3C] p-2.5 rounded-2xl border border-white/10"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <UserAvatar
                            user={{ avatar_url: m.avatar_url, nickname: name }}
                            size="sm"
                            className="w-8 h-8 rounded-full border-2 border-purple-400 flex-shrink-0"
                          />
                          <span className="text-[11px] font-bold text-white truncate">{name}</span>
                        </div>
                        <input
                          type="number"
                          min={0}
                          disabled={isTimerExpired || isPending}
                          value={userScore === 0 ? '' : userScore}
                          placeholder="0"
                          onChange={(e) =>
                            handlePlayerScoreChange(m.user_id, 'REBELS', e.target.value)
                          }
                          className="w-16 bg-[#0A1628] border border-white/20 focus:border-purple-400 rounded-xl px-2 py-1.5 text-center text-xs font-black text-purple-400 focus:outline-none disabled:opacity-40 flex-shrink-0"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team Total */}
              <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  TOTAL
                </span>
                <span className="text-2xl font-black text-purple-400 tabular-nums">
                  {rebelsTeamScore}
                </span>
              </div>
            </div>
          </div>

          {/* COMPLETE CHALLENGE Button */}
          <button
            type="button"
            disabled={isPending}
            onClick={handleCompleteMatch}
            className="w-full py-4 rounded-2xl bg-[#CEFF00] hover:bg-[#b8e600] text-black font-black text-sm uppercase tracking-wider shadow-2xl transition cursor-pointer disabled:opacity-40"
          >
            {isPending ? 'COMPLETING...' : 'COMPLETE CHALLENGE'}
          </button>
        </div>
      )}

      {/* ── Recent Matches History ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 mt-2 border-t border-white/10 pt-5">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
          RECENT MATCHES
        </h4>
        {recentMatches.length === 0 && (
          <p className="text-xs text-slate-500 font-medium">No past matches recorded yet.</p>
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
                className="flex items-center justify-between gap-4 bg-[#0A1628] border border-white/10 hover:border-[#CEFF00]/40 p-4 rounded-2xl text-left transition cursor-pointer shadow-xs active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-xl bg-white/5 text-slate-400 flex-shrink-0">
                    <Trophy size={15} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-black uppercase tracking-wider text-white truncate block">
                      {ch?.name || 'League Match'}
                    </span>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {new Date(m.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs font-black text-slate-300 tabular-nums whitespace-nowrap">
                    {m.titans_score} — {m.rebels_score}
                  </span>
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full whitespace-nowrap ${
                      m.winner_team === 'TITANS'
                        ? 'bg-[#CEFF00] text-black'
                        : m.winner_team === 'REBELS'
                        ? 'bg-purple-500 text-white'
                        : 'bg-white/10 text-slate-400'
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

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <TeamSelectionModal
        isOpen={isTeamModalOpen}
        onClose={() => setIsTeamModalOpen(false)}
        members={members}
        initialTitans={titanTeamMembers ?? []}
        initialRebels={rebelTeamMembers ?? []}
        onConfirm={handleTeamsConfirmed}
      />

      <TimerConfigModal
        isOpen={isTimerModalOpen}
        onClose={() => setIsTimerModalOpen(false)}
        onConfirm={(sec) => setTimerSeconds(sec)}
        initialSeconds={timerSeconds ?? 600}
      />

      <CreateLeagueModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        challenges={challenges}
        members={members}
        assignments={assignments}
      />

      <MatchDetailsModal
        isOpen={isDetailsModalOpen}
        match={selectedMatchForDetails}
        challenge={
          challenges.find((c) => c.id === selectedMatchForDetails?.league_challenge_id) ?? null
        }
        assignments={assignments}
        onClose={() => setIsDetailsModalOpen(false)}
      />
    </div>
  );
}
