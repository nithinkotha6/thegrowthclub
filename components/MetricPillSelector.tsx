'use client';

import React, { useState, useTransition, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { METRIC_PILLS, type MetricSlug } from '@/lib/metrics';

export { METRIC_PILLS, type MetricSlug };

// Emoji icons for each metric — lightweight, no icon library needed
const PILL_EMOJIS: Record<string, string> = {
  top_golf:       '⛳',
  weight:         '⚖️',
  highest_steps:  '👟',
  marathon:       '🏅',
  car_top_speed:  '🚗',
  underwater_swim:'🤿',
  most_beers:     '🍺',
  catan_wins:     '🎲',
  national_parks: '🏔️',
};

interface MetricPillSelectorProps {
  activeMetric: string;
  customPills?: { id: string; label: string; unit: string }[];
}

/**
 * Client-side metric pill toggle row.
 * Memoized to eliminate redundant renders.
 * Uses Optimistic UI to toggle active states instantly (<100ms) while Next.js fetches data.
 */
function MetricPillSelector({ activeMetric, customPills }: MetricPillSelectorProps) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [prevActiveMetric, setPrevActiveMetric] = useState<string>(activeMetric);
  const [localActive, setLocalActive] = useState<string>(activeMetric);

  // Sync state during render when prop changes
  if (activeMetric !== prevActiveMetric) {
    setPrevActiveMetric(activeMetric);
    setLocalActive(activeMetric);
  }

  const select = useCallback((slug: string) => {
    setLocalActive(slug);
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('metric', slug);
      router.push(`${pathname}?${params.toString()}`);
    });
  }, [searchParams, pathname, router]);

  const allPills = [
    ...METRIC_PILLS.filter(p => !p.id.startsWith('wearable_')),
    ...(customPills || [])
  ];

  return (
    <div
      className="flex gap-2 overflow-x-auto py-2 scrollbar-none"
      style={{ WebkitOverflowScrolling: 'touch' }}
      role="group"
      aria-label="Metric selector"
    >
      {allPills.map(({ id, label }) => {
        const isActive = id === localActive;
        const emoji    = PILL_EMOJIS[id] ?? '📊';
        return (
          <button
            key={id}
            id={`metric-pill-${id}`}
            aria-pressed={isActive}
            onClick={() => select(id)}
            className={[
              'flex items-center gap-2 px-4 py-2.5 rounded-2xl min-h-[44px]',
              'text-sm font-semibold whitespace-nowrap flex-shrink-0',
              'transition-[transform,background-color] duration-150 ease-out',
              isActive
                ? 'bg-[#CEFF00] text-[#111827] ring-1 ring-black/5 scale-[1.03] shadow-sm font-bold'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200/80',
            ].join(' ')}
          >
            <span className="text-base leading-none">{emoji}</span>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default React.memo(MetricPillSelector);
