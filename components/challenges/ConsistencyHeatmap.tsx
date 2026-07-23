'use client';

import { useState, useMemo } from 'react';
import { Flame, Calendar, Award } from 'lucide-react';
import type { DailyGoal, DailyGoalCompletion } from '@/app/actions/dailyGoals';
import { DAILY_GOAL_METRICS } from '@/lib/config/daily-goals';
import {
  getLast30Days,
  calculateIntensityForAll,
  calculateIntensityForMetric,
  getColorForIntensity,
  calculateStreak,
  calculateCompletionRate,
  type HeatmapIntensity,
} from '@/lib/utils/heatmapColors';

interface ConsistencyHeatmapProps {
  userId: string;
  goals?: DailyGoal[];
  completions: DailyGoalCompletion[];
}

export const METRIC_OPTIONS = [
  { value: 'all', label: 'ALL METRICS', icon: '📊' },
  { value: 'steps', label: '10,000 steps', icon: '👣' },
  { value: 'push_ups', label: '50 Push-ups', icon: '💪' },
  { value: 'squats', label: '50 squads', icon: '🏋️' },
  { value: 'gym_streak', label: 'Gym streak', icon: '🏃' },
  { value: 'diet', label: 'Diet', icon: '🥗' },
];

export function ConsistencyHeatmap({ userId, goals = [], completions }: ConsistencyHeatmapProps) {
  const [selectedMetric, setSelectedMetric] = useState<string>('all');

  // Build byDateMap: date (YYYY-MM-DD) -> Set of completed metric slugs
  const byDateMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};

    for (const c of completions) {
      if (c.user_id !== userId) continue;
      const dateStr = new Date(c.completed_at).toISOString().split('T')[0];
      if (!map[dateStr]) {
        map[dateStr] = new Set();
      }

      // Match goal by ID or title to preset slug
      const matchingGoal = goals.find((g) => g.id === c.daily_goal_id);
      const title = matchingGoal?.title?.toLowerCase() || '';
      let slug = c.daily_goal_id;

      for (const preset of DAILY_GOAL_METRICS) {
        if (
          title.includes(preset.slug.replace(/_/g, ' ')) ||
          title.includes(preset.name.toLowerCase()) ||
          preset.name.toLowerCase().includes(title)
        ) {
          slug = preset.slug;
          break;
        }
      }

      map[dateStr].add(slug);
    }

    return map;
  }, [completions, goals, userId]);

  // Last 30 days YYYY-MM-DD
  const last30Dates = useMemo(() => getLast30Days(), []);

  // Compute cell data for 30 days grid
  const gridCells = useMemo(() => {
    return last30Dates.map((dateStr) => {
      const [year, month, day] = dateStr.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat
      const completedSet = byDateMap[dateStr] || new Set();

      let intensity: HeatmapIntensity = 0;
      if (selectedMetric === 'all') {
        intensity = calculateIntensityForAll(completedSet.size);
      } else {
        const isCompleted = completedSet.has(selectedMetric);
        intensity = calculateIntensityForMetric(isCompleted);
      }

      return {
        dateStr,
        dayOfMonth: day,
        dayOfWeek,
        count: completedSet.size,
        intensity,
        completedSlugs: Array.from(completedSet),
      };
    });
  }, [last30Dates, byDateMap, selectedMetric]);

  // Streak & Completion Rate calculation
  const streak = useMemo(
    () => calculateStreak(byDateMap, selectedMetric, DAILY_GOAL_METRICS.length),
    [byDateMap, selectedMetric]
  );

  const completionRate = useMemo(
    () => calculateCompletionRate(byDateMap, selectedMetric, DAILY_GOAL_METRICS.length),
    [byDateMap, selectedMetric]
  );

  // Organize 30 days into calendar week rows (Sun - Sat)
  const calendarWeeks = useMemo(() => {
    const weeks: (typeof gridCells[number] | null)[][] = [];
    if (gridCells.length === 0) return weeks;

    let currentWeek: (typeof gridCells[number] | null)[] = [];
    const firstCell = gridCells[0];

    // Pad beginning of first week
    for (let i = 0; i < firstCell.dayOfWeek; i++) {
      currentWeek.push(null);
    }

    for (const cell of gridCells) {
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(cell);
    }

    // Pad end of last week
    while (currentWeek.length > 0 && currentWeek.length < 7) {
      currentWeek.push(null);
    }
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return weeks;
  }, [gridCells]);

  return (
    <div className="bg-[#0A1628] border-2 border-[#CEFF00] rounded-3xl p-5 md:p-6 shadow-2xl text-white mt-5 flex flex-col gap-5">
      {/* ── Header & Dropdown Selector ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#CEFF00]/15 text-[#CEFF00]">
            <Calendar size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">Consistency Map</h3>
            <p className="text-[11px] text-slate-400 font-bold">30-day habit completion patterns</p>
          </div>
        </div>

        <div className="w-full sm:w-auto">
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="w-full sm:w-auto bg-[#0F1F3C] text-white border-2 border-[#CEFF00] rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider focus:outline-none cursor-pointer"
          >
            {METRIC_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#0A1628] text-white">
                {opt.icon} {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Heatmap Grid (Days Header & Week Rows) ───────────────── */}
      <div className="flex flex-col gap-2">
        {/* Day Labels (S M T W T F S) */}
        <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-400">
          <span>S</span>
          <span>M</span>
          <span>T</span>
          <span>W</span>
          <span>T</span>
          <span>F</span>
          <span>S</span>
        </div>

        {/* Calendar Week Rows */}
        <div className="flex flex-col gap-2">
          {calendarWeeks.map((week, weekIdx) => (
            <div key={weekIdx} className="grid grid-cols-7 gap-2">
              {week.map((cell, dayIdx) => {
                if (!cell) {
                  return <div key={`empty-${weekIdx}-${dayIdx}`} className="w-full aspect-square" />;
                }

                const bgColor = getColorForIntensity(cell.intensity);
                const textColor = 'text-slate-950 font-black';

                const tooltipText =
                  selectedMetric === 'all'
                    ? `${cell.dateStr}: ${cell.count} of ${DAILY_GOAL_METRICS.length} habits completed`
                    : `${cell.dateStr}: ${
                        cell.intensity === 4 ? 'Completed' : 'Not completed'
                      }`;

                return (
                  <div
                    key={cell.dateStr}
                    style={{ backgroundColor: bgColor }}
                    title={tooltipText}
                    className={`w-full aspect-square rounded-xl flex items-center justify-center text-[10px] md:text-xs tracking-tight cursor-pointer transition-transform hover:scale-110 hover:shadow-lg hover:z-10 select-none ${textColor}`}
                  >
                    {cell.dayOfMonth}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Legend & Stats Footer ─────────────────────────────────── */}
      <div className="flex flex-col gap-4 border-t border-white/10 pt-4">
        {/* Color Legend */}
        <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] font-bold text-slate-300">
          <span className="uppercase tracking-wider text-[10px] text-slate-400">Legend:</span>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-md bg-[#FFFFFF] border border-slate-400/40" />
              <span>None (0)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-md bg-[#E8FF80]" />
              <span>Partial (1-3)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-md bg-[#DFFF33]" />
              <span>Good (4)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-md bg-[#E5FF00]" />
              <span>Perfect (5)</span>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="bg-[#0F1F3C] border border-white/10 rounded-2xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame size={18} className="text-[#CEFF00]" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Current Streak
              </span>
            </div>
            <span className="text-sm md:text-base font-black text-[#CEFF00] tabular-nums">
              {streak} days 🔥
            </span>
          </div>

          <div className="bg-[#0F1F3C] border border-white/10 rounded-2xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award size={18} className="text-[#CEFF00]" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Completion Rate
              </span>
            </div>
            <span className="text-sm md:text-base font-black text-[#CEFF00] tabular-nums">
              {completionRate}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConsistencyHeatmap;
