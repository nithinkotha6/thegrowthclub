'use client';

import { useState, useTransition } from 'react';
import { CheckSquare, Square, Trash2, ListChecks } from 'lucide-react';
import {
  type DailyGoal,
  type DailyGoalCompletion,
  logDailyGoalCompletion,
  deleteDailyGoalCompletion,
} from '@/app/actions/dailyGoals';

interface DailyGoalsPanelProps {
  goals: DailyGoal[];
  completions: DailyGoalCompletion[];
  userId: string;
}

/** True if the given completion happened today (local browser date). */
function isToday(isoString: string): boolean {
  const d = new Date(isoString);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export default function DailyGoalsPanel({ goals, completions, userId }: DailyGoalsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [pendingGoalId, setPendingGoalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Goals the current user has already completed *today* — drives checkbox state.
  const myTodayCompletionByGoal = new Map<string, string>(); // goalId -> completionId
  for (const c of completions) {
    if (c.user_id === userId && isToday(c.completed_at)) {
      myTodayCompletionByGoal.set(c.daily_goal_id, c.id);
    }
  }

  const handleToggle = (goalId: string, existingCompletionId: string | null) => {
    setError(null);
    setPendingGoalId(goalId);
    startTransition(async () => {
      const res = existingCompletionId
        ? await deleteDailyGoalCompletion(existingCompletionId)
        : await logDailyGoalCompletion(goalId);
      if (!res.success) setError(res.error);
      setPendingGoalId(null);
    });
  };

  const handleDeleteCompletion = (completionId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await deleteDailyGoalCompletion(completionId);
      if (!res.success) setError(res.error);
    });
  };

  const recent = completions.slice(0, 12);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Static goal cards ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5">
        {goals.length === 0 && (
          <p className="text-xs text-slate-400 font-bold text-center py-6">No daily goals set up yet.</p>
        )}
        {goals.map((goal) => {
          const completionId = myTodayCompletionByGoal.get(goal.id) ?? null;
          const isChecked = !!completionId;
          const isBusy = isPending && pendingGoalId === goal.id;
          return (
            <button
              key={goal.id}
              type="button"
              disabled={isBusy}
              onClick={() => handleToggle(goal.id, completionId)}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition cursor-pointer disabled:opacity-50 ${
                isChecked
                  ? 'bg-[#CEFF00]/10 border-[#CEFF00]/40'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              {isChecked ? (
                <CheckSquare size={20} className="text-[#7a9900] flex-shrink-0" />
              ) : (
                <Square size={20} className="text-slate-300 flex-shrink-0" />
              )}
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-extrabold text-slate-900">{goal.title}</span>
                {goal.description && (
                  <span className="text-xs text-slate-500 truncate">{goal.description}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs font-bold text-red-600">{error}</p>}

      {/* ── Recent Activities (Daily) ────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <ListChecks size={14} /> Recent Activities
        </h4>
        {recent.length === 0 && <p className="text-xs text-slate-400">No completions logged yet.</p>}
        {recent.map((c) => {
          const goal = goals.find((g) => g.id === c.daily_goal_id);
          const name = c.profiles?.nickname || c.profiles?.full_name || 'Someone';
          return (
            <div key={c.id} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-slate-700 truncate">
                {name} completed <span className="font-black">{goal?.title ?? 'a goal'}</span>
              </span>
              {c.user_id === userId && (
                <button
                  type="button"
                  onClick={() => handleDeleteCompletion(c.id)}
                  disabled={isPending}
                  className="p-1 rounded text-red-500 hover:bg-red-50 cursor-pointer disabled:opacity-50 flex-shrink-0"
                  title="Delete completion"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
