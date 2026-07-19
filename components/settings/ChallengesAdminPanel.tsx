'use client';

import { useState, useTransition } from 'react';
import { Plus, CheckCircle, AlertCircle } from 'lucide-react';
import type { GroupMemberRow } from '@/components/SettingsClient';
import { adminCreateDailyGoal } from '@/app/actions/dailyGoals';
import { adminAssignLeagueTeam, adminCreateLeagueChallenge, type TeamName } from '@/app/actions/leagues';

interface ChallengesAdminPanelProps {
  members: GroupMemberRow[];
}

/**
 * Settings-tab admin panel for the Dashboard & Challenges module:
 * create Daily Goals, assign League teams (TITANS/REBELS), and create
 * League Challenge types. Mirrors the existing small-form admin panel
 * pattern (e.g. CreateMetricPanel).
 */
export default function ChallengesAdminPanel({ members }: ChallengesAdminPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Daily Goal form
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDescription, setGoalDescription] = useState('');

  // League challenge type form
  const [challengeName, setChallengeName] = useState('');

  // League assignment form
  const [assignUserId, setAssignUserId] = useState('');
  const [assignTeam, setAssignTeam] = useState<TeamName>('TITANS');

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim()) return;
    startTransition(async () => {
      const res = await adminCreateDailyGoal(goalTitle, goalDescription);
      if (res.success) {
        setGoalTitle('');
        setGoalDescription('');
        setStatus({ success: true, message: `Daily goal "${res.goal.title}" created.` });
      } else {
        setStatus({ success: false, message: res.error });
      }
    });
  };

  const handleCreateChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeName.trim()) return;
    startTransition(async () => {
      const res = await adminCreateLeagueChallenge(challengeName);
      if (res.success) {
        setChallengeName('');
        setStatus({ success: true, message: `League challenge "${res.challenge.name}" created.` });
      } else {
        setStatus({ success: false, message: res.error });
      }
    });
  };

  const handleAssignTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignUserId) return;
    startTransition(async () => {
      const res = await adminAssignLeagueTeam(assignUserId, assignTeam);
      setStatus(
        res.success
          ? { success: true, message: 'Team assignment updated.' }
          : { success: false, message: res.error },
      );
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-6 col-span-1 lg:col-span-2 shadow-sm">
      <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight">🏆 Dashboard & Challenges Admin</h3>

      {/* Daily Goal creation */}
      <form onSubmit={handleCreateGoal} className="flex flex-col gap-2">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">New Daily Goal</h4>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={goalTitle}
            onChange={(e) => setGoalTitle(e.target.value)}
            placeholder="e.g. Gym Streak, 10,000 steps"
            disabled={isPending}
            className="flex-1 min-w-[180px] rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50 disabled:opacity-50"
          />
          <input
            type="text"
            value={goalDescription}
            onChange={(e) => setGoalDescription(e.target.value)}
            placeholder="Description (optional)"
            disabled={isPending}
            className="flex-1 min-w-[180px] rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isPending || !goalTitle.trim()}
            className="px-4 py-2 rounded-lg bg-[#CEFF00] text-black text-xs font-black disabled:opacity-40 cursor-pointer flex items-center gap-1"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </form>

      {/* League challenge type creation */}
      <form onSubmit={handleCreateChallenge} className="flex flex-col gap-2">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">New League Challenge Type</h4>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={challengeName}
            onChange={(e) => setChallengeName(e.target.value)}
            placeholder="e.g. Lunges, Push-ups"
            disabled={isPending}
            className="flex-1 min-w-[180px] rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isPending || !challengeName.trim()}
            className="px-4 py-2 rounded-lg bg-[#CEFF00] text-black text-xs font-black disabled:opacity-40 cursor-pointer flex items-center gap-1"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </form>

      {/* League team assignment */}
      <form onSubmit={handleAssignTeam} className="flex flex-col gap-2">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Assign League Team</h4>
        <div className="flex gap-2 flex-wrap">
          <select
            value={assignUserId}
            onChange={(e) => setAssignUserId(e.target.value)}
            disabled={isPending}
            className="flex-1 min-w-[160px] rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50 disabled:opacity-50"
          >
            <option value="">Select member…</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profiles?.nickname || m.profiles?.full_name || m.user_id}
              </option>
            ))}
          </select>
          <select
            value={assignTeam}
            onChange={(e) => setAssignTeam(e.target.value as TeamName)}
            disabled={isPending}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50 disabled:opacity-50"
          >
            <option value="TITANS">TITANS</option>
            <option value="REBELS">REBELS</option>
          </select>
          <button
            type="submit"
            disabled={isPending || !assignUserId}
            className="px-4 py-2 rounded-lg bg-[#CEFF00] text-black text-xs font-black disabled:opacity-40 cursor-pointer flex items-center gap-1"
          >
            <Plus size={14} /> Assign
          </button>
        </div>
      </form>

      {status && (
        <div className={`p-3 text-xs flex items-start gap-2 rounded-xl border ${
          status.success ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          {status.success ? <CheckCircle size={14} className="mt-0.5" /> : <AlertCircle size={14} className="mt-0.5" />}
          <span>{status.message}</span>
        </div>
      )}
    </div>
  );
}
