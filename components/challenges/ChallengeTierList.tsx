'use client';

import { useMemo } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { METRIC_PROGRESSION_CATALOG, normalizeMetricSlug, type ChallengeTierDef } from '@/lib/config/challenge-tiers';

interface ChallengeTierListProps {
  metric: string;
  completedTierNumbers: Set<number>;
  onToggleTier?: (tier: ChallengeTierDef) => void;
}

export function ChallengeTierList({
  metric,
  completedTierNumbers,
  onToggleTier,
}: ChallengeTierListProps) {
  const normSlug = normalizeMetricSlug(metric);
  const config = METRIC_PROGRESSION_CATALOG[normSlug] || METRIC_PROGRESSION_CATALOG['push_ups'];

  // Separate tiers into incomplete (top) and completed (bottom)
  const { incompleteTiers, completedTiers } = useMemo(() => {
    const all = config.tiers;
    const inc: ChallengeTierDef[] = [];
    const comp: ChallengeTierDef[] = [];

    for (const t of all) {
      if (completedTierNumbers.has(t.tierNumber)) {
        comp.push(t);
      } else {
        inc.push(t);
      }
    }

    // Sort incomplete ascending by tierNumber (progressive unlock order)
    inc.sort((a, b) => a.tierNumber - b.tierNumber);
    // Sort completed ascending by tierNumber
    comp.sort((a, b) => a.tierNumber - b.tierNumber);

    return { incompleteTiers: inc, completedTiers: comp };
  }, [config.tiers, completedTierNumbers]);

  return (
    <div className="flex flex-col gap-4 my-4">
      {/* ── 1. Incomplete Tiers (Displayed prominently at top) ──────── */}
      <div className="flex flex-col gap-2.5">
        {incompleteTiers.map((tier) => (
          <button
            key={tier.tierNumber}
            type="button"
            onClick={() => onToggleTier?.(tier)}
            className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-white border-slate-200 hover:bg-slate-50 shadow-xs hover:border-[#CEFF00] text-left transition-all cursor-pointer active:scale-[0.99]"
          >
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-base font-extrabold tracking-tight text-[#0F1F3C]">
                {tier.description}
              </span>
              {tier.dailyTarget && (
                <span className="text-[11px] font-bold text-slate-400 mt-0.5">
                  in one whole day
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Circle size={24} className="text-slate-300 hover:text-[#CEFF00] flex-shrink-0" />
            </div>
          </button>
        ))}
      </div>

      {/* ── 2. Completed Tiers (Moved to bottom with reduced opacity) ──── */}
      {completedTiers.length > 0 && (
        <div className="flex flex-col gap-2.5 pt-3 border-t border-slate-200">
          <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            COMPLETED MILESTONES ({completedTiers.length})
          </h4>
          <div className="flex flex-col gap-2 opacity-75">
            {completedTiers.map((tier) => (
              <button
                key={tier.tierNumber}
                type="button"
                onClick={() => onToggleTier?.(tier)}
                className="flex items-center justify-between gap-4 p-3.5 rounded-2xl border bg-[#CEFF00]/10 border-[#CEFF00]/40 text-left transition-all cursor-pointer active:scale-[0.99]"
              >
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-base font-extrabold tracking-tight text-slate-900 line-through decoration-[#658000]/60">
                    {tier.description}
                  </span>
                  {tier.dailyTarget && (
                    <span className="text-[11px] font-bold text-slate-400 mt-0.5">
                      in one whole day
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <CheckCircle2 size={24} className="text-[#658000] flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ChallengeTierList;
