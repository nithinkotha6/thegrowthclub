'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import type { ChallengeHistoryEntry } from '@/app/actions/progression';
import { METRIC_PROGRESSION_CATALOG, normalizeMetricSlug } from '@/lib/config/challenge-tiers';

interface ChallengeHistoryProps {
  metric: string;
  history: ChallengeHistoryEntry[];
  userId: string;
  onDeleteEntry: (id: string) => Promise<{ success: boolean; error?: string }>;
}

export function ChallengeHistory({
  metric,
  history,
  userId,
  onDeleteEntry,
}: ChallengeHistoryProps) {
  const [isPending, startTransition] = useTransition();

  if (history.length === 0) return null;

  const normSlug = normalizeMetricSlug(metric);
  const config = METRIC_PROGRESSION_CATALOG[normSlug] || METRIC_PROGRESSION_CATALOG['push_ups'];
  const unitLabel = config.unit === 'seconds' ? 'seconds' : config.label;

  return (
    <div className="flex flex-col gap-2.5 mt-6 border-t border-slate-200 pt-5">
      <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">MILESTONES</h3>
      <div className="flex flex-col gap-2">
        {history.map((entry) => {
          const displayDate = new Date(entry.entry_date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });

          const milestoneText = `${entry.tier_after} ${unitLabel} done 🎯`;

          return (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-[#0F1F3C]">
                  {milestoneText}
                </span>
                <span className="text-slate-400 font-medium ml-2">{displayDate}</span>
              </div>

              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    await onDeleteEntry(entry.id);
                  });
                }}
                className="p-1.5 rounded-lg text-red-500 hover:bg-red-100 transition cursor-pointer disabled:opacity-40"
                title="Delete milestone entry"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ChallengeHistory;
