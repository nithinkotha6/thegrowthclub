import { CalendarDays, ChevronDown, Plus, PersonStanding, Dumbbell, Zap, Scale } from 'lucide-react';
import MetricChart from '@/components/MetricChart';
import BreakingNewsFeed from '@/components/BreakingNewsFeed';
import KpiCards from '@/components/KpiCards';

/**
 * Dashboard page — full shell with real components.
 * Spec: Features.md §3–§5, frontend.md §2–§4
 */

const METRIC_PILLS = [
  { id: 'long_run',  label: 'Long Run',  icon: PersonStanding, bg: 'bg-[#EAFCDB]', color: 'text-[#1E1E1E]' },
  { id: 'deadlift',  label: 'Deadlift',  icon: Dumbbell,       bg: 'bg-[#F3E8FF]', color: 'text-[#1E1E1E]' },
  { id: 'top_speed', label: 'Top Speed', icon: Zap,            bg: 'bg-[#FFE5E5]', color: 'text-[#FF3B30]' },
  { id: 'weight',    label: 'Weight',    icon: Scale,          bg: 'bg-[#E0F4F4]', color: 'text-[#1E1E1E]' },
];

export default function DashboardPage() {
  return (
    <div className="p-4 md:p-8">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">

        {/* Left — Brand block */}
        <div className="min-w-0">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-[#111827] leading-none">
            The Growth Club
          </h1>
          <p className="mt-2 text-[11px] font-bold tracking-[0.18em] text-[#6B7280] uppercase">
            Train Together. Compete Together. Grow Together.
          </p>
          {/* Hand-drawn green underline accent */}
          <svg
            width="340" height="14" viewBox="0 0 340 14"
            fill="none" aria-hidden="true" className="mt-0.5 max-w-full"
          >
            <path
              d="M2 10 C40 3, 90 13, 140 7 S210 2, 260 8 S305 12, 338 6"
              stroke="#22C55E" strokeWidth="2.8" strokeLinecap="round" fill="none"
            />
          </svg>
        </div>

        {/* Right — Controls */}
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          <button
            id="date-range-picker"
            className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-xl px-3 md:px-4 py-2.5 text-xs md:text-sm font-medium text-[#111827] shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:bg-gray-50 transition-colors"
          >
            <CalendarDays size={14} className="text-[#6B7280]" />
            <span className="hidden sm:inline">Jul 4 – Jul 10, 2025</span>
            <span className="sm:hidden">Jul 4–10</span>
            <ChevronDown size={13} className="text-[#6B7280]" />
          </button>

          <button
            id="add-activity-btn"
            className="flex items-center gap-1.5 bg-[#111827] text-white rounded-xl px-3 md:px-4 py-2.5 text-xs md:text-sm font-semibold hover:bg-black transition-colors"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">Add Activity</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </header>

      {/* ── Metric Selector Pills — horizontal scroll on mobile ────────── */}
      <div
        className="flex gap-2 md:gap-3 mb-6 overflow-x-auto pb-1 scrollbar-none"
        role="group"
        aria-label="Metric selector"
      >
        {METRIC_PILLS.map(({ id, label, icon: Icon, bg, color }) => (
          <button
            key={id}
            id={`metric-pill-${id}`}
            aria-pressed={id === 'long_run'}
            className={[
              'flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 rounded-2xl',
              'text-sm font-semibold whitespace-nowrap flex-shrink-0 transition-opacity',
              bg, color,
            ].join(' ')}
          >
            <Icon size={17} strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Middle row: Chart + Breaking News ─────────────────────────── */}
      {/*   Desktop: side-by-side (~65/35). Mobile: stacked single column. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 md:gap-6 mb-5 md:mb-6">
        <MetricChart />
        <BreakingNewsFeed />
      </div>

      {/* ── Bottom row: 5 KPI summary cards ───────────────────────────── */}
      <KpiCards />

    </div>
  );
}
