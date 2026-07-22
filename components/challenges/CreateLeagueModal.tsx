'use client';

import { useState, useTransition } from 'react';
import { X, Plus, Swords, UserCheck, Shield } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import {
  type LeagueChallenge,
  type LeagueAssignment,
  type GroupMemberProfile,
  type TeamName,
  createLeagueChallenge,
  assignLeagueTeam,
  createLeagueMatch,
} from '@/app/actions/leagues';

interface CreateLeagueModalProps {
  isOpen: boolean;
  onClose: () => void;
  challenges: LeagueChallenge[];
  assignments: LeagueAssignment[];
  members: GroupMemberProfile[];
}

export default function CreateLeagueModal({
  isOpen,
  onClose,
  challenges,
  assignments,
  members,
}: CreateLeagueModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>(challenges[0]?.id ?? '');
  const [newChallengeName, setNewChallengeName] = useState<string>('');
  const [isCreatingNewChallenge, setIsCreatingNewChallenge] = useState<boolean>(challenges.length === 0);

  // Local state for team assignments: userId -> TeamName
  const [teamMap, setTeamMap] = useState<Record<string, TeamName>>(() => {
    const map: Record<string, TeamName> = {};
    for (const a of assignments) {
      map[a.user_id] = a.team_name;
    }
    return map;
  });

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleToggleTeam = (userId: string, targetTeam: TeamName) => {
    setTeamMap((prev) => {
      const current = prev[userId];
      if (current === targetTeam) {
        const next = { ...prev };
        delete next[userId];
        return next;
      }
      return { ...prev, [userId]: targetTeam };
    });
  };

  const handleLaunchLeague = () => {
    setError(null);
    startTransition(async () => {
      try {
        let challengeId = selectedChallengeId;

        // 1. Create new challenge type if typed in
        if (isCreatingNewChallenge || !challengeId) {
          if (!newChallengeName.trim()) {
            setError('Please enter a challenge name.');
            return;
          }
          const cRes = await createLeagueChallenge(newChallengeName.trim());
          if (!cRes.success) {
            setError(cRes.error);
            return;
          }
          challengeId = cRes.challenge.id;
        }

        // 2. Update roster team assignments
        for (const member of members) {
          const team = teamMap[member.user_id];
          if (team) {
            await assignLeagueTeam(member.user_id, team);
          }
        }

        // 3. Create the new match
        const mRes = await createLeagueMatch(challengeId);
        if (!mRes.success) {
          setError(mRes.error);
          return;
        }

        onClose();
      } catch (err: any) {
        setError(err?.message || 'Failed to create league.');
      }
    });
  };

  const titansCount = Object.values(teamMap).filter((t) => t === 'TITANS').length;
  const rebelsCount = Object.values(teamMap).filter((t) => t === 'REBELS').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#111111] border border-white/10 text-white rounded-3xl p-6 w-full max-w-lg shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#CEFF00]/10 text-[#CEFF00]">
              <Swords size={20} />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-wider text-white">Create New League Match</h3>
              <p className="text-xs text-slate-400 font-medium">Democratized for all club members</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl bg-white/5 hover:bg-white/10 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-2xl border border-white/5">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer ${
              step === 1 ? 'bg-[#CEFF00] text-black shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            1. Challenge Type
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer ${
              step === 2 ? 'bg-[#CEFF00] text-black shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            2. Team Roster ({titansCount + rebelsCount})
          </button>
        </div>

        {/* Step 1: Challenge Selector */}
        {step === 1 && (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Select Challenge</label>
              <button
                type="button"
                onClick={() => setIsCreatingNewChallenge(!isCreatingNewChallenge)}
                className="text-xs font-bold text-[#CEFF00] hover:underline cursor-pointer flex items-center gap-1"
              >
                <Plus size={14} /> {isCreatingNewChallenge ? 'Pick Existing' : 'New Challenge'}
              </button>
            </div>

            {!isCreatingNewChallenge && challenges.length > 0 ? (
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                {challenges.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedChallengeId(c.id)}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                      selectedChallengeId === c.id
                        ? 'bg-[#CEFF00]/15 border-[#CEFF00] text-white'
                        : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-sm font-extrabold">{c.name}</span>
                    {selectedChallengeId === c.id && <UserCheck size={16} className="text-[#CEFF00]" />}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={newChallengeName}
                  onChange={(e) => setNewChallengeName(e.target.value)}
                  placeholder="e.g. 100 Push-ups, 50 Squats, 5km Run"
                  className="w-full bg-slate-900 border border-white/20 text-white rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#CEFF00] transition"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-3 w-full py-3 bg-[#CEFF00] text-black font-black text-xs uppercase tracking-wider rounded-2xl transition cursor-pointer hover:bg-[#b8e600]"
            >
              Next: Assign Rosters →
            </button>
          </div>
        )}

        {/* Step 2: Assign Rosters */}
        {step === 2 && (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Member Roster</span>
              <div className="flex gap-3">
                <span className="text-[#CEFF00]">TITANS: {titansCount}</span>
                <span className="text-red-400">REBELS: {rebelsCount}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
              {members.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No members found in group.</p>
              )}
              {members.map((m) => {
                const assigned = teamMap[m.user_id];
                return (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between bg-slate-900 border border-white/10 rounded-2xl p-3"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar user={{ nickname: m.nickname, full_name: m.full_name, avatar_url: m.avatar_url }} size="sm" />
                      <span className="text-xs font-extrabold text-white">
                        {m.nickname || m.full_name || 'Member'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleTeam(m.user_id, 'TITANS')}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                          assigned === 'TITANS'
                            ? 'bg-[#CEFF00] text-black shadow-xs'
                            : 'bg-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        TITANS
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleTeam(m.user_id, 'REBELS')}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                          assigned === 'REBELS'
                            ? 'bg-red-500 text-white shadow-xs'
                            : 'bg-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        REBELS
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {error && <p className="text-xs font-bold text-red-500">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 py-3 bg-white/10 text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition cursor-pointer hover:bg-white/15"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleLaunchLeague}
                disabled={isPending}
                className="flex-2 py-3 bg-[#CEFF00] text-black font-black text-xs uppercase tracking-wider rounded-2xl transition cursor-pointer hover:bg-[#b8e600] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Swords size={16} /> {isPending ? 'Launching...' : 'Launch Match'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
