'use client';

import { useState, useTransition } from 'react';
import { METRIC_PROGRESSION_CATALOG, normalizeMetricSlug } from '@/lib/config/challenge-tiers';

interface LogValueInputProps {
  metric: string;
  onLogValue: (val: number) => Promise<{ success: boolean; error?: string }>;
}

export function LogValueInput({ metric, onLogValue }: LogValueInputProps) {
  const [value, setValue] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const normSlug = normalizeMetricSlug(metric);
  const config = METRIC_PROGRESSION_CATALOG[normSlug] || METRIC_PROGRESSION_CATALOG['push_ups'];

  const handleLog = () => {
    const num = Number(value);
    if (!value.trim() || !Number.isFinite(num) || num <= 0) {
      setError('Please enter a valid numeric value.');
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await onLogValue(num);
      if (res.success) {
        setValue('');
      } else {
        setError(res.error || 'Failed to log value.');
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 my-4">
      <div className="flex gap-2">
        <input
          type="number"
          min={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleLog();
          }}
          placeholder={`Log a new ${config.label} value...`}
          disabled={isPending}
          className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm text-[#0F1F3C] font-semibold placeholder:text-slate-400 focus:outline-none focus:border-[#CEFF00] focus:ring-1 focus:ring-[#CEFF00] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleLog}
          disabled={isPending || !value.trim()}
          className="px-6 py-3 bg-[#CEFF00] hover:bg-[#b8e600] text-black font-black text-xs uppercase tracking-wider rounded-xl transition cursor-pointer disabled:opacity-40 shadow-xs"
        >
          {isPending ? 'LOGGING...' : 'LOG'}
        </button>
      </div>
      {error && <p className="text-xs font-bold text-red-600 px-1">{error}</p>}
    </div>
  );
}

export default LogValueInput;
