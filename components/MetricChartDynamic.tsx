'use client';

import dynamic from 'next/dynamic';
import type { MetricChartProps } from './MetricChart';

/**
 * Code-splits the ECharts-based MetricChart out of the initial dashboard bundle.
 * The skeleton mirrors MetricChart's own card frame so there's no layout shift
 * once the real chart mounts.
 * Spec: Findings_and_Recommendations.md PERF-01
 */
const MetricChart = dynamic<MetricChartProps>(() => import('./MetricChart'), {
  ssr: false,
  loading: () => (
    <div className="rounded-card bg-white shadow-raised p-6 flex flex-col gap-4 animate-pulse">
      <div className="flex items-start justify-between mb-2">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-40 bg-slate-100 rounded" />
          <div className="h-3 w-24 bg-slate-100 rounded" />
        </div>
        <div className="h-6 w-16 bg-slate-100 rounded-lg" />
      </div>
      <div className="h-[272px] w-full bg-slate-50 rounded-xl" />
    </div>
  ),
});

export default MetricChart;
