'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { PersonStanding, Dumbbell, Zap, Scale, Flame } from 'lucide-react';
import { METRIC_PILLS, type MetricSlug } from '@/lib/metrics';

// Map slug → Lucide icon (client-side only — icons use React, can't go in plain lib file)
const PILL_ICONS: Record<MetricSlug, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  long_run:  PersonStanding,
  deadlift:  Dumbbell,
  top_speed: Zap,
  weight:    Scale,
  calories:  Flame,
};

export { METRIC_PILLS, type MetricSlug };

interface MetricPillSelectorProps {
  activeMetric: MetricSlug;
}

/**
 * Client-side metric pill toggle row.
 * On click, pushes `?metric=<slug>` to the URL — the parent Server Component
 * re-renders with the new searchParam and runs the correct Supabase query.
 * Spec: Features.md §3 — metric toggles drive chart re-fetch.
 */
export default function MetricPillSelector({ activeMetric }: MetricPillSelectorProps) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  function select(slug: MetricSlug) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('metric', slug);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div
      className="flex gap-2 md:gap-3 mb-6 overflow-x-auto pb-1 scrollbar-none"
      role="group"
      aria-label="Metric selector"
    >
      {METRIC_PILLS.map(({ id, label, bg, activeBg, color }) => {
        const isActive = id === activeMetric;
        const Icon     = PILL_ICONS[id];
        return (
          <button
            key={id}
            id={`metric-pill-${id}`}
            aria-pressed={isActive}
            onClick={() => select(id)}
            className={[
              'flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 rounded-2xl',
              'text-sm font-semibold whitespace-nowrap flex-shrink-0 transition-all duration-200',
              isActive ? `${activeBg} ${color} ring-2 ring-black/10 scale-[1.03] shadow-sm` : `${bg} ${color} opacity-80 hover:opacity-100`,
            ].join(' ')}
          >
            <Icon size={17} strokeWidth={isActive ? 2.5 : 2} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
