'use client';

import { METRIC_PROGRESSION_CATALOG, normalizeMetricSlug } from '@/lib/config/challenge-tiers';

interface CurrentHighestCardProps {
  metric: string;
  value: number;
}

export function CurrentHighestCard({ metric, value }: CurrentHighestCardProps) {
  const normSlug = normalizeMetricSlug(metric);
  const config = METRIC_PROGRESSION_CATALOG[normSlug] || METRIC_PROGRESSION_CATALOG['push_ups'];
  const labelUpper = config.label.toUpperCase();

  return (
    <div className="bg-white border-2 border-[#CEFF00] rounded-2xl p-6 md:p-8 flex flex-col items-center justify-center text-center gap-1.5 shadow-md my-4">
      <span className="text-3xl animate-bounce">🔥</span>
      <h2 className="text-5xl md:text-6xl font-black text-[#0F1F3C] tracking-tight tabular-nums">
        {value}
      </h2>
      <p className="text-xs font-black uppercase tracking-wider text-slate-400 mt-1">
        CURRENT HIGHEST {labelUpper}
      </p>
    </div>
  );
}

export default CurrentHighestCard;
