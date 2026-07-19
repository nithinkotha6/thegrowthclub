'use client';

import React, { useState, useTransition } from 'react';
import { createMetricDefinition } from '@/app/actions/metrics';
import { Plus, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface CreateMetricPanelProps {
  onCreated: (definition: any) => void;
}

export default function CreateMetricPanel({ onCreated }: CreateMetricPanelProps) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (!name.trim() || !unit.trim()) return;

    startTransition(async () => {
      const res = await createMetricDefinition(name, unit, sortDirection, requiresVerification);
      if (res.success && res.definition) {
        setName('');
        setUnit('');
        setSortDirection('desc');
        setRequiresVerification(false);
        onCreated(res.definition);
        setStatus({ success: true, message: `Metric "${res.definition.name}" successfully created!` });
      } else {
        setStatus({ success: false, message: res.error || 'Failed to create metric.' });
      }
    });
  };

  return (
    <div className="max-w-2xl mx-auto w-full">
      <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 flex flex-col gap-4 shadow-sm">
        <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
          Create Custom Metric
        </h2>
        <p className="text-slate-500 text-xs">
          Add a new metric like &quot;Pushups&quot; or &quot;Book Pages&quot;. New metrics immediately integrate with the dynamic dashboard selectors and leaderboard scores.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="metric-name" className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Metric Name
            </label>
            <input
              id="metric-name"
              type="text"
              required
              disabled={isPending}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pushups, Book Pages, Water Intake"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#CEFF00] focus:border-[#CEFF00] placeholder-slate-400 disabled:opacity-50 min-h-[44px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="metric-unit" className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Measurement Unit
            </label>
            <input
              id="metric-unit"
              type="text"
              required
              disabled={isPending}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. Reps, Pages, Liters, Miles"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#CEFF00] focus:border-[#CEFF00] placeholder-slate-400 disabled:opacity-50 min-h-[44px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="metric-sort" className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Leaderboard Sort Order
            </label>
            <select
              id="metric-sort"
              value={sortDirection}
              onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}
              disabled={isPending}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#CEFF00] focus:border-[#CEFF00] disabled:opacity-50 min-h-[44px] appearance-none"
            >
              <option value="desc" className="bg-white text-slate-900">Higher is Better (Descending - e.g. reps, speed)</option>
              <option value="asc" className="bg-white text-slate-900">Lower is Better (Ascending - e.g. time, weight loss)</option>
            </select>
          </div>

          <label htmlFor="metric-requires-verification" className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 cursor-pointer select-none">
            <input
              id="metric-requires-verification"
              type="checkbox"
              checked={requiresVerification}
              onChange={(e) => setRequiresVerification(e.target.checked)}
              disabled={isPending}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#CEFF00] focus:ring-[#CEFF00] disabled:opacity-50"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-slate-900">Requires peer verification</span>
              <span className="text-xs text-slate-500">Big or easy-to-fake claims (e.g. top speed, extreme feats) can require 3 group approvals before counting, instead of verifying instantly like everyday metrics.</span>
            </span>
          </label>

          {status && (
            <div
              className={[
                'flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm mt-1 border',
                status.success
                  ? 'bg-god-green/10 border-god-green/30 text-god-green'
                  : 'bg-god-red/10 border-god-red/30 text-god-red',
              ].join(' ')}
              role="status"
            >
              {status.success ? (
                <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              )}
              <span>{status.message}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending || !name.trim() || !unit.trim()}
            className="w-full bg-[#CEFF00] hover:bg-[#CEFF00]/90 text-black text-xs font-bold py-3.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 transition"
          >
            {isPending ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Creating Metric...
              </>
            ) : (
              <>
                <Plus size={15} strokeWidth={2.5} />
                Create Custom Metric
              </>
            )}
          </button>
        </form>
      </section>
    </div>
  );
}
