'use client';

import { useMemo } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
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
          <button
            key={tier.tierNumber}
            type="button"
            onClick={() => onToggleTier?.(tier)}
            className={`flex items-center justify-between gap-4 p-4 rounded-2xl border text-left transition-all cursor-pointer active:scale-[0.99] ${
              isCompleted
                ? 'bg-[#CEFF00]/10 border-[#CEFF00]/40 shadow-xs order-last'
                : 'bg-white border-slate-200 hover:bg-slate-50 shadow-xs hover:border-[#CEFF00]'
            }`}
          >
            {/* Left Side: Tier Description & Subtitle */}
            <div className="flex flex-col leading-tight min-w-0">
              <span
                className={`text-base font-extrabold tracking-tight ${
                  isCompleted ? 'text-slate-900 line-through decoration-[#658000]/60' : 'text-[#0F1F3C]'
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

            {/* Far Right Side: Completely Round Checkbox Indicator */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {isCompleted ? (
                <CheckCircle2 size={24} className="text-[#658000] flex-shrink-0" />
              ) : (
                <Circle size={24} className="text-slate-300 hover:text-[#CEFF00] flex-shrink-0" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default ChallengeTierList;
