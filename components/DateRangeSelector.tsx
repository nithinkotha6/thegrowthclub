'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { RANGE_OPTIONS, type RangeValue } from '@/lib/metrics';

interface DateRangeSelectorProps {
  activeRange: RangeValue;
}

/**
 * Dropdown that updates the `?range=` URL param while preserving `?metric=`.
 * Server Component page re-renders with the new range to refetch data.
 * Spec: Pillar 1B — Functional Calendar Timeframe Dropdown.
 */
export default function DateRangeSelector({ activeRange }: DateRangeSelectorProps) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  function setRange(range: RangeValue) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', range);
    router.push(`${pathname}?${params.toString()}`);
  }

  const activeLabel = RANGE_OPTIONS.find((r) => r.value === activeRange)?.label ?? 'Last 7 Days';

  return (
    <div className="relative">
      <select
        id="date-range-picker"
        value={activeRange}
        onChange={(e) => setRange(e.target.value as RangeValue)}
        aria-label="Select date range"
        className="appearance-none cursor-pointer flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-xl pl-9 pr-8 py-2.5 text-xs md:text-sm font-medium text-[#111827] shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-[#111827]/10"
      >
        {RANGE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {/* Calendar icon overlay */}
      <CalendarDays
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]"
        aria-hidden="true"
      />
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B7280]"
        aria-hidden="true"
      />
    </div>
  );
}
