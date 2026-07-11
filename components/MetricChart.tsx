'use client';

import ReactECharts from 'echarts-for-react';
import type { ChartSeries } from '@/lib/queries';

export type { ChartSeries };

interface MetricChartProps {
  dateLabels:   string[];   // chronological x-axis: ["Jul 4", "Jul 5", …]
  series:       ChartSeries[];
  title:        string;     // e.g. "Deadlift — Last 30 Days"
  unit:         string;     // e.g. "lbs", "mi", "kcal"
  metricLabel:  string;     // e.g. "Deadlift" — used in empty state
  rangeLabel:   string;     // e.g. "Last 7 Days" — used in empty state
}

/**
 * ECharts chronological line chart — live server-fetched data only.
 * X-axis: actual date labels sorted ascending (oldest → newest).
 * Y-axis: unit-aware labels and tooltip formatters.
 * Empty state: contextual message with metric + timeframe names.
 * Spec: Features.md §4, Pillar 2
 */
export default function MetricChart({
  dateLabels,
  series,
  title,
  unit,
  metricLabel,
  rangeLabel,
}: MetricChartProps) {
  const hasData = series.length > 0 && dateLabels.length > 0;

  const option = {
    grid: { left: 48, right: 80, top: 16, bottom: 32, containLabel: false },
    xAxis: {
      type: 'category',
      data: dateLabels,
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#9CA3AF',
        fontSize: 11,
        fontWeight: 600,
        // Show every Nth label so they don't crowd on long ranges
        interval: dateLabels.length > 14 ? Math.ceil(dateLabels.length / 7) - 1 : 0,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#9CA3AF',
        fontSize: 11,
        formatter: (v: number) => `${v}${unit ? ` ${unit}` : ''}`,
      },
      splitLine: {
        lineStyle: { type: 'dashed', color: '#F3F4F6', width: 1 },
      },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: '#E5E7EB', width: 1 } },
      backgroundColor: '#fff',
      borderColor: '#E5E7EB',
      textStyle: { color: '#111827', fontSize: 12 },
      formatter: (params: any[]) => {
        const date = params[0]?.axisValue ?? '';
        const lines = params
          .filter((p) => p.value !== 0)
          .map(
            (p) =>
              `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px;"></span>` +
              `<b>${p.seriesName}</b>: ${p.value} ${unit}`,
          );
        return `<div style="font-size:11px"><b>${date}</b><br/>${lines.join('<br/>')}</div>`;
      },
    },
    series: series.map((s) => ({
      type: 'line',
      name: s.name,
      smooth: true,
      symbol: 'circle',
      lineStyle: { color: s.color, width: 2.5 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: `${s.color}22` },
            { offset: 1, color: `${s.color}00` },
          ],
        },
      },
      data: s.points.map((v, i) => {
        const isLast = i === s.points.length - 1;
        const terminalSymbol =
          isLast && s.avatar_url && s.avatar_url.startsWith('http')
            ? `image://${s.avatar_url}`
            : 'circle';
        return {
          value: v,
          symbol: terminalSymbol,
          symbolSize: isLast ? 30 : 0,
          itemStyle: isLast
            ? { color: s.color, borderColor: '#fff', borderWidth: 3 }
            : { opacity: 0 },
          label: {
            show: isLast && v > 0,
            position: 'right',
            formatter: `${v} ${unit}`,
            fontWeight: 'bold',
            fontSize: 13,
            color: '#111827',
          },
        };
      }),
    })),
  };

  return (
    <div className="rounded-[24px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-6">
      {/* Card header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-[#111827]">{title}</h2>
          <p className="text-xs text-[#6B7280] mt-0.5">
            {hasData ? `${series.length} athlete${series.length !== 1 ? 's' : ''} tracked` : rangeLabel}
          </p>
        </div>
        {hasData && (
          <span className="text-[10px] font-bold text-[#6B7280] bg-[#F7F8FA] rounded-lg px-2.5 py-1.5 uppercase tracking-wide">
            {unit}
          </span>
        )}
      </div>

      {hasData ? (
        <ReactECharts
          option={option}
          style={{ height: 272, width: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      ) : (
        <div className="h-[272px] flex flex-col items-center justify-center gap-3 text-center px-8">
          {/* Upward-climbing graph icon */}
          <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10 text-[#E5E7EB]">
            <path
              d="M6 36 L14 24 L22 29 L30 16 L38 20 L46 10"
              stroke="currentColor" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
          <div>
            <p className="text-sm font-bold text-[#9CA3AF]">
              No {metricLabel} logged in this timeframe yet.
            </p>
            <p className="text-xs text-[#D1D5DB] mt-1">
              Be the first to set the pace! 🏁
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
