'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { METRIC_PILLS, type MetricSlug } from '@/lib/metrics';

export { METRIC_PILLS, type MetricSlug };

// Emoji icons for each metric — lightweight, no icon library needed
const PILL_EMOJIS: Record<string, string> = {
  long_run:       '🏃',
  top_speed:      '⚡',
  weight:         '⚖️',
  highest_steps:  '👟',
  marathon:       '🏅',
  car_top_speed:  '🚗',
  underwater_swim:'🤿',
  most_beers:     '🍺',
  catan_wins:     '🎲',
  national_parks: '🏔️',
  have_partner:   '💘',
};

interface MetricPillSelectorProps {
  activeMetric: MetricSlug;
}

/**
 * Client-side metric pill toggle row.
 * Horizontally scrollable on mobile — swipe through all 11 metrics.
 * On click, pushes `?metric=<slug>` to the URL.
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
      className="flex gap-2 overflow-x-auto py-2 scrollbar-none"
      style={{ WebkitOverflowScrolling: 'touch' }}
      role="group"
      aria-label="Metric selector"
    >
      {METRIC_PILLS.map(({ id, label, bg, activeBg, color }) => {
        const isActive = id === activeMetric;
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
                ? `${activeBg} ${color} ring-2 ring-black/10 scale-[1.03] shadow-sm`
                : `${bg} ${color} opacity-80 hover:opacity-100`,
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
