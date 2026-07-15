'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createMetricDefinition } from '@/app/actions/metrics';
import { Sliders, Plus, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface MetricDefinition {
  id: string;
  name: string;
  unit: string;
  sort_direction: 'asc' | 'desc';
  created_at: string;
}

export default function SettingsClient({ session }: { session: any }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [definitions, setDefinitions] = useState<MetricDefinition[]>([]);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function loadDefinitions() {
      const { data, error } = await supabase
        .from('metric_definitions')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setDefinitions(data as MetricDefinition[]);
      }
    }
    loadDefinitions();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (!name.trim() || !unit.trim()) return;

    startTransition(async () => {
      const res = await createMetricDefinition(name, unit, sortDirection);
      if (res.success && res.definition) {
        setName('');
        setUnit('');
        setSortDirection('desc');
        setDefinitions([res.definition, ...definitions]);
        setStatus({ success: true, message: `Metric "${res.definition.name}" successfully created!` });
      } else {
        setStatus({ success: false, message: res.error || 'Failed to create metric.' });
      }
    });
  };

  return (
    <div className="flex flex-col gap-6 px-4 md:px-8 pt-6 pb-24">
      {/* Page Header */}
      <header>
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-[#111827] leading-none flex items-center gap-3">
          <Sliders className="text-[#CEFF00] w-10 h-10 stroke-[2.5]" />
          Metric Settings
        </h1>
        <p className="mt-2 text-[11px] font-bold tracking-[0.18em] text-[#6B7280] uppercase">
          Dynamic Trackers · Customize Target KPI Metrics
        </p>
        <svg width="250" height="14" viewBox="0 0 250 14" fill="none" aria-hidden="true" className="mt-1">
          <path d="M2 10 C35 3, 80 13, 120 7 S180 2, 248 6" stroke="#CEFF00" strokeWidth="2.8" strokeLinecap="round" fill="none" />
        </svg>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Creation Form */}
        <section className="bg-white rounded-[24px] border border-slate-200/60 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6 md:p-8 flex flex-col gap-4">
          <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
            Create Custom Tracker
          </h2>
          <p className="text-slate-500 text-xs">
            Add a new tracker like "Pushups" or "Book Pages". New metrics immediately integrate with the dynamic dashboard selectors and leaderboard scores.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="metric-name" className="text-xs font-bold text-[#6B7280] uppercase tracking-wider block">
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
                className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-base text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#111827] disabled:opacity-50 min-h-[44px]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="metric-unit" className="text-xs font-bold text-[#6B7280] uppercase tracking-wider block">
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
                className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-base text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#111827] disabled:opacity-50 min-h-[44px]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="metric-sort" className="text-xs font-bold text-[#6B7280] uppercase tracking-wider block">
                Leaderboard Sort Order
              </label>
              <select
                id="metric-sort"
                value={sortDirection}
                onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}
                disabled={isPending}
                className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-base text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#111827] disabled:opacity-50 min-h-[44px] appearance-none"
              >
                <option value="desc">Higher is Better (Descending - e.g. reps, speed)</option>
                <option value="asc">Lower is Better (Ascending - e.g. time, weight loss)</option>
              </select>
            </div>

            {status && (
              <div
                className={[
                  'flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm mt-1',
                  status.success
                    ? 'bg-[#EAFCDB] text-[#166534]'
                    : 'bg-[#FFE5E5] text-[#991B1B]',
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
              className="flex items-center justify-center gap-2 bg-[#111827] text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px] cursor-pointer mt-2"
            >
              {isPending ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Creating Metric...
                </>
              ) : (
                <>
                  <Plus size={15} strokeWidth={2.5} />
                  Create Tracker
                </>
              )}
            </button>
          </form>
        </section>

        {/* Existing Trackers List */}
        <section className="bg-white rounded-[24px] border border-slate-200/60 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6 md:p-8 flex flex-col gap-4">
          <h2 className="text-lg font-black text-gray-900 tracking-tight">
            Active Custom Trackers
          </h2>
          <p className="text-slate-500 text-xs">
            Dynamic trackers currently registered in the database.
          </p>

          <div className="flex flex-col gap-2.5 mt-2">
            {definitions.length > 0 ? (
              definitions.map((def) => (
                <div
                  key={def.id}
                  className="rounded-2xl p-4 bg-slate-50 border border-slate-200/60 flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">{def.name}</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                      Unit: {def.unit} · Sort: {def.sort_direction === 'desc' ? 'Highest first' : 'Lowest first'}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 font-medium font-mono">
                    {def.id.substring(0, 8)}...
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl text-xs font-bold text-slate-400">
                No custom trackers defined yet. Use the form on the left to add one!
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
