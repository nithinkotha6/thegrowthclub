'use client';

import { useState, useTransition } from 'react';
import {
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  X,
  RotateCcw,
} from 'lucide-react';
import {
  type DailyGoal,
  type DailyGoalCompletion,
  logDailyGoalCompletion,
  deleteDailyGoalCompletion,
} from '@/app/actions/dailyGoals';
import { DAILY_GOAL_METRICS } from '@/lib/config/daily-goals';
import ConsistencyHeatmap from './ConsistencyHeatmap';

interface DailyGoalsPanelProps {
  goals: DailyGoal[];
  completions: DailyGoalCompletion[];
  userId: string;
}

/** Formats a date into a clean display label (e.g., "Today", "Yesterday", "Mon, Jul 21"). */
function formatDateLabel(date: Date): string {
  const now = new Date();
  const todayStr = now.toDateString();
  const dateStr = date.toDateString();

  if (dateStr === todayStr) {
    return 'Today';
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dateStr === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Converts Date object to YYYY-MM-DD string for input[type=date]. */
function toInputDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Checks if two Date ISO strings or Date objects match the same calendar day (local browser time). */
function isSameDay(isoString: string, targetDate: Date): boolean {
  const d = new Date(isoString);
  return (
    d.getFullYear() === targetDate.getFullYear() &&
    d.getMonth() === targetDate.getMonth() &&
    d.getDate() === targetDate.getDate()
  );
}

export default function DailyGoalsPanel({ goals, completions, userId }: DailyGoalsPanelProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();
  const [pendingGoalId, setPendingGoalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Map goals available: prioritize predefined metrics order, fallback to goals from DB
  const displayGoals = (() => {
    if (goals.length === 0) return [];

    // Map predefined goal configs to DB goals by matching title / slug
    const matched = DAILY_GOAL_METRICS.map((preset) => {
      const dbGoal = goals.find(
        (g) =>
          g.title.toLowerCase().includes(preset.slug.replace(/_/g, ' ')) ||
          g.title.toLowerCase().includes(preset.name.toLowerCase()) ||
          preset.name.toLowerCase().includes(g.title.toLowerCase())
      );
      return dbGoal || null;
    }).filter((g): g is DailyGoal => g !== null);

    // Append any extra DB goals not in predefined set
    const remaining = goals.filter((g) => !matched.some((m) => m.id === g.id));
    return [...matched, ...remaining];
  })();

  // Build a map of completions for the currently selected date: goalId -> completionId
  const selectedDateCompletionsByGoal = new Map<string, string>();
  for (const c of completions) {
    if (c.user_id === userId && isSameDay(c.completed_at, selectedDate)) {
      selectedDateCompletionsByGoal.set(c.daily_goal_id, c.id);
    }
  }

  const handlePrevDay = () => {
    setError(null);
    const prev = new Date(selectedDate);
    prev.setDate(selectedDate.getDate() - 1);
    setSelectedDate(prev);
  };

  const handleNextDay = () => {
    setError(null);
    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + 1);
    setSelectedDate(next);
  };

  const handleResetToToday = () => {
    setError(null);
    setSelectedDate(new Date());
    setShowCalendar(false);
  };

  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    const [year, month, day] = e.target.value.split('-').map(Number);
    if (year && month && day) {
      const newDate = new Date(year, month - 1, day);
      setSelectedDate(newDate);
      setShowCalendar(false);
    }
  };

  const handleToggleGoal = (goalId: string, existingCompletionId: string | null) => {
    setError(null);
    setPendingGoalId(goalId);

    // Generate ISO timestamp for selectedDate (noon local time to prevent timezone shift)
    const targetDateISO = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      12,
      0,
      0
    ).toISOString();

    startTransition(async () => {
      const res = existingCompletionId
        ? await deleteDailyGoalCompletion(existingCompletionId)
        : await logDailyGoalCompletion(goalId, targetDateISO);

      if (!res.success) {
        setError(res.error);
      }
      setPendingGoalId(null);
    });
  };

  const isSelectedToday = selectedDate.toDateString() === new Date().toDateString();

  return (
    <div className="flex flex-col gap-5">
      {/* ── Date Navigator (< Today >) ────────────────────────────────── */}
      <div className="flex items-center justify-between bg-slate-900 text-white rounded-2xl px-4 py-3 border border-slate-800 shadow-md">
        <button
          type="button"
          onClick={handlePrevDay}
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer active:scale-95"
          title="Previous day"
          aria-label="Previous day"
        >
          <ChevronLeft size={20} strokeWidth={2.5} />
        </button>

        <button
          type="button"
          onClick={() => setShowCalendar(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-slate-800/80 transition cursor-pointer text-center group"
          title="Click to select date"
        >
          <CalendarIcon size={16} className="text-[#CEFF00] group-hover:scale-110 transition-transform" />
          <span className="text-sm font-black tracking-wide uppercase">
            {formatDateLabel(selectedDate)}
          </span>
          {!isSelectedToday && (
            <span className="text-[10px] font-extrabold bg-[#CEFF00]/20 text-[#CEFF00] px-2 py-0.5 rounded-full uppercase tracking-wider">
              Selected
            </span>
          )}
        </button>

        <div className="flex items-center gap-1">
          {!isSelectedToday && (
            <button
              type="button"
              onClick={handleResetToToday}
              className="p-1.5 rounded-xl text-[#CEFF00] hover:bg-slate-800 transition cursor-pointer"
              title="Jump to Today"
            >
              <RotateCcw size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={handleNextDay}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer active:scale-95"
            title="Next day"
            aria-label="Next day"
          >
            <ChevronRight size={20} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* ── Calendar Date Picker Modal ───────────────────────────────── */}
      {showCalendar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#111111] border border-white/10 text-white rounded-2xl p-6 w-full max-w-sm shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                <CalendarIcon size={16} className="text-[#CEFF00]" /> Select Goal Date
              </h3>
              <button
                type="button"
                onClick={() => setShowCalendar(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Choose Date</label>
              <input
                type="date"
                value={toInputDateString(selectedDate)}
                onChange={handleDateInputChange}
                className="w-full bg-slate-900 text-white border border-white/20 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#CEFF00] transition"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleResetToToday}
                className="flex-1 bg-[#CEFF00] hover:bg-[#b8e600] text-black font-black text-xs uppercase tracking-wider py-2.5 px-4 rounded-xl transition cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={handlePrevDay}
                className="flex-1 bg-white/10 hover:bg-white/15 text-white font-bold text-xs uppercase tracking-wider py-2.5 px-4 rounded-xl transition cursor-pointer"
              >
                Yesterday
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Predefined Goal Checkbox Cards ───────────────────────────── */}
      <div className="flex flex-col gap-3">
        {displayGoals.length === 0 && (
          <p className="text-xs text-slate-400 font-bold text-center py-6">
            No daily goals set up yet.
          </p>
        )}

        {displayGoals.map((goal) => {
          const completionId = selectedDateCompletionsByGoal.get(goal.id) ?? null;
          const isChecked = !!completionId;
          const isBusy = isPending && pendingGoalId === goal.id;

          return (
            <button
              key={goal.id}
              type="button"
              disabled={isBusy}
              onClick={() => handleToggleGoal(goal.id, completionId)}
              className={`flex items-center justify-between gap-4 rounded-2xl border p-4 text-left transition cursor-pointer active:scale-[0.99] disabled:opacity-50 ${
                isChecked
                  ? 'bg-[#CEFF00]/10 border-[#CEFF00]/40 shadow-sm'
                  : 'bg-white border-slate-200 hover:bg-slate-50 shadow-sm'
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                {isChecked ? (
                  <CheckCircle2 size={24} className="text-[#658000] flex-shrink-0" />
                ) : (
                  <Circle size={24} className="text-slate-300 flex-shrink-0" />
                )}
                <div className="flex flex-col leading-tight min-w-0">
                  <span
                    className={`text-base font-extrabold tracking-tight ${
                      isChecked ? 'text-slate-900 line-through decoration-[#658000]/60' : 'text-slate-900'
                    }`}
                  >
                    {goal.title}
                  </span>
                  {goal.description && (
                    <span className="text-xs text-slate-500 font-medium truncate mt-0.5">
                      {goal.description}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-shrink-0">
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
                    isChecked
                      ? 'bg-[#CEFF00] text-black shadow-xs'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isChecked ? 'Completed' : 'Pending'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs font-bold text-red-600 px-1">{error}</p>}

      {/* ── CONSISTENCY HEATMAP (30-day habit completion patterns) ─── */}
      <ConsistencyHeatmap userId={userId} goals={displayGoals} completions={completions} />
    </div>
  );
}
