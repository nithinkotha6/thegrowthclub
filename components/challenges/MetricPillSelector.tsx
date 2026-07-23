'use client';

import { useRef } from 'react';
import { METRICS_LIST } from '@/lib/config/challenge-tiers';

interface MetricPillSelectorProps {
  selectedMetric: string;
  onMetricChange: (metric: string) => void;
}

export function MetricPillSelector({ selectedMetric, onMetricChange }: MetricPillSelectorProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="w-full overflow-hidden">
      <div
        ref={scrollContainerRef}
        className="flex items-center gap-3 overflow-x-auto py-2 px-1 text-xs select-none"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        {METRICS_LIST.map((metric) => {
          const isActive = selectedMetric === metric.id;
          return (
            <button
              key={metric.id}
              type="button"
              onClick={() => onMetricChange(metric.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-extrabold whitespace-nowrap transition cursor-pointer active:scale-95 shadow-xs ${
                isActive
                  ? 'bg-[#0F1F3C] text-[#CEFF00] shadow-md border border-[#CEFF00]/40'
                  : 'bg-[#E8E8E8] text-[#0F1F3C] hover:bg-slate-300'
              }`}
            >
              <span className="text-sm">{metric.icon}</span>
              <span>{metric.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MetricPillSelector;
