'use client';

import { useMemo } from 'react';
import { METRIC_PROGRESSION_CATALOG, normalizeMetricSlug, type ChallengeTierDef } from '@/lib/config/challenge-tiers';

interface ChallengeTierListProps {
  metric: string;
  currentHighest: number;
  onToggleTier?: (tier: ChallengeTierDef) => void;
}

export function ChallengeTierList({ metric, currentHighest, onToggleTier }: ChallengeTierListProps) {
  const normSlug = normalizeMetricSlug(metric);
  const config = METRIC_PROGRESSION_CATALOG[normSlug] || METRIC_PROGRESSION_CATALOG['push_ups'];

  // Sort tiers: uncompleted tiers at top (order 1), completed tiers at bottom (order 999)
  const sortedTiers = useMemo(() => {
    const list = [...config.tiers];
    return list.sort((a, b) => {
      const aDone = currentHighest >= a.targetValue;
      const bDone = currentHighest >= b.targetValue;
      if (aDone && !bDone) return 1; // move a down
      if (!aDone && bDone) return -1; // move b down
      return a.tierNumber - b.tierNumber;
    });
  }, [config.tiers, currentHighest]);

  return (
    <div className="flex flex-col gap-2.5 my-4">
      {sortedTiers.map((tier) => {
        const isCompleted = currentHighest >= tier.targetValue;

        return (
          <div
            key={tier.tierNumber}
            className={`flex items-center justify-between gap-4 p-4 rounded-xl border transition-all ${
              isCompleted
                ? 'bg-slate-100 border-slate-200 opacity-75 order-last shadow-none'
                : 'bg-white border-slate-200 shadow-xs hover:border-[#CEFF00]'
            }`}
          >
            <div className="flex flex-col leading-tight min-w-0">
              <span
                className={`text-base font-extrabold tracking-tight ${
                  isCompleted ? 'text-slate-500 line-through decoration-slate-400' : 'text-[#0F1F3C]'
                }`}
              >
                {tier.description}
              </span>
              {tier.dailyTarget && (
                <span className="text-[11px] font-bold text-slate-400 mt-0.5">
                  in one whole day
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isCompleted}
                disabled={!isCompleted && currentHighest < tier.targetValue}
                onChange={() => onToggleTier?.(tier)}
                className="w-6 h-6 rounded-md border-slate-300 text-[#0F1F3C] focus:ring-[#CEFF00] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ChallengeTierList;
