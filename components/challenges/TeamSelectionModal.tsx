'use client';

import { useState } from 'react';
import { X, Users, Check, Shield, Zap } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import { type GroupMemberProfile } from '@/app/actions/leagues';

interface TeamSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: GroupMemberProfile[];
  /** Pre-fill from previously confirmed selection */
  initialTitans?: GroupMemberProfile[];
  initialRebels?: GroupMemberProfile[];
  onConfirm: (titans: GroupMemberProfile[], rebels: GroupMemberProfile[]) => void;
}

type TeamSlot = 'TITANS' | 'REBELS' | null;

export function TeamSelectionModal({
  isOpen,
  onClose,
  members,
  initialTitans = [],
  initialRebels = [],
  onConfirm,
}: TeamSelectionModalProps) {
  // Map: userId → team slot
  const [assignments, setAssignments] = useState<Record<string, TeamSlot>>(() => {
    const map: Record<string, TeamSlot> = {};
    for (const m of initialTitans) map[m.user_id] = 'TITANS';
    for (const m of initialRebels) map[m.user_id] = 'REBELS';
    return map;
  });

  if (!isOpen) return null;

  const titansMembers = members.filter((m) => assignments[m.user_id] === 'TITANS');
  const rebelsMembers = members.filter((m) => assignments[m.user_id] === 'REBELS');
  const unassignedMembers = members.filter((m) => !assignments[m.user_id]);

  const canConfirm = titansMembers.length >= 1 && rebelsMembers.length >= 1;

  const handleToggle = (userId: string, targetTeam: TeamSlot) => {
    setAssignments((prev) => {
      const current = prev[userId];
      // Clicking the same team again → unassign
      if (current === targetTeam) {
        const next = { ...prev };
        delete next[userId];
        return next;
      }
      // Assign to target (removes from previous team automatically)
      return { ...prev, [userId]: targetTeam };
    });
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    const titans = members.filter((m) => assignments[m.user_id] === 'TITANS');
    const rebels = members.filter((m) => assignments[m.user_id] === 'REBELS');
    onConfirm(titans, rebels);
  };

  const getTeamStyle = (userId: string) => {
    const team = assignments[userId];
    if (team === 'TITANS') return 'titans';
    if (team === 'REBELS') return 'rebels';
    return 'none';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 animate-in fade-in duration-200">
      <div className="bg-[#0A1628] border-2 border-[#CEFF00] rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#CEFF00]/10 text-[#CEFF00]">
              <Users size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Select Team Members
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Assign members to TITANS or REBELS for this match
              </p>
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

        {/* Team Column Headers */}
        <div className="grid grid-cols-2 gap-0 px-6 pt-4 pb-2 flex-shrink-0">
          {/* TITANS header */}
          <div className="flex items-center gap-2 pr-3">
            <div className="p-1.5 rounded-lg bg-[#CEFF00]/15">
              <Zap size={13} className="text-[#CEFF00]" />
            </div>
            <div>
              <span className="text-xs font-black text-[#CEFF00] uppercase tracking-wider">TITANS</span>
              <span className="ml-2 text-[10px] font-bold text-slate-400">
                {titansMembers.length} SELECTED
              </span>
            </div>
          </div>

          {/* REBELS header */}
          <div className="flex items-center gap-2 pl-3 border-l border-white/10">
            <div className="p-1.5 rounded-lg bg-purple-500/15">
              <Shield size={13} className="text-purple-400" />
            </div>
            <div>
              <span className="text-xs font-black text-purple-400 uppercase tracking-wider">REBELS</span>
              <span className="ml-2 text-[10px] font-bold text-slate-400">
                {rebelsMembers.length} SELECTED
              </span>
            </div>
          </div>
        </div>

        {/* Member List */}
        <div className="overflow-y-auto flex-1 px-6 pb-4">
          {members.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm font-medium">
              No group members found.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {members.map((m) => {
                const name = m.nickname || m.full_name || 'Member';
                const teamStyle = getTeamStyle(m.user_id);
                const isTitan = teamStyle === 'titans';
                const isRebel = teamStyle === 'rebels';

                return (
                  <div
                    key={m.user_id}
                    className={`relative flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                      isTitan
                        ? 'bg-[#CEFF00]/8 border-[#CEFF00]/50'
                        : isRebel
                        ? 'bg-purple-500/8 border-purple-500/50'
                        : 'bg-[#0F1F3C] border-white/10'
                    }`}
                  >
                    {/* Avatar */}
                    <UserAvatar
                      user={{ avatar_url: m.avatar_url, nickname: name }}
                      size="sm"
                      className={`w-9 h-9 rounded-full border-2 flex-shrink-0 ${
                        isTitan
                          ? 'border-[#CEFF00]'
                          : isRebel
                          ? 'border-purple-400'
                          : 'border-white/20'
                      }`}
                    />

                    {/* Name */}
                    <span className="text-xs font-bold text-white truncate flex-1 min-w-0">
                      {name}
                    </span>

                    {/* Team Toggle Buttons */}
                    <div className="flex gap-1.5 flex-shrink-0">
                      {/* TITANS button */}
                      <button
                        type="button"
                        onClick={() => handleToggle(m.user_id, 'TITANS')}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer select-none ${
                          isTitan
                            ? 'bg-[#CEFF00] text-black shadow-sm'
                            : 'bg-white/8 text-slate-400 hover:bg-[#CEFF00]/15 hover:text-[#CEFF00]'
                        }`}
                      >
                        {isTitan && <Check size={10} />}
                        <span>T</span>
                      </button>

                      {/* REBELS button */}
                      <button
                        type="button"
                        onClick={() => handleToggle(m.user_id, 'REBELS')}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer select-none ${
                          isRebel
                            ? 'bg-purple-500 text-white shadow-sm'
                            : 'bg-white/8 text-slate-400 hover:bg-purple-500/15 hover:text-purple-400'
                        }`}
                      >
                        {isRebel && <Check size={10} />}
                        <span>R</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Validation hint */}
        {!canConfirm && members.length > 0 && (
          <div className="px-6 pb-2 flex-shrink-0">
            <p className="text-[11px] font-bold text-amber-400 text-center">
              {titansMembers.length === 0 && rebelsMembers.length === 0
                ? 'Assign at least 1 member to each team to continue.'
                : titansMembers.length === 0
                ? 'Assign at least 1 member to TITANS.'
                : 'Assign at least 1 member to REBELS.'}
            </p>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex gap-3 px-6 py-4 border-t border-white/10 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-white/20 text-slate-300 font-extrabold text-xs uppercase tracking-wider hover:bg-white/5 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-[2] py-3 rounded-2xl bg-[#CEFF00] hover:bg-[#b8e600] text-black font-black text-xs uppercase tracking-wider transition cursor-pointer shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Check size={14} />
            Confirm Teams ({titansMembers.length} vs {rebelsMembers.length})
          </button>
        </div>
      </div>
    </div>
  );
}

export default TeamSelectionModal;
