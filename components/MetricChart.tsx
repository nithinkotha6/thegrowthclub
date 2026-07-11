'use client';

import React, { useState } from 'react';
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
 * Custom function to generate base64 encoded SVG data URI for custom circular avatar endpoints.
 * Renders avatar image if present, otherwise displays 1-2 letter initials with athlete's line color border.
 */
const getAvatarSvgUri = (name: string, avatarUrl: string | null, color: string) => {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  let content = '';
  if (avatarUrl && avatarUrl.startsWith('http')) {
    content = `
      <circle cx="12" cy="12" r="10" fill="#111827" />
      <clipPath id="clip-${encodeURIComponent(name)}">
        <circle cx="12" cy="12" r="9.5" />
      </clipPath>
      <image href="${avatarUrl}" x="2.5" y="2.5" width="19" height="19" clip-path="url(#clip-${encodeURIComponent(name)})" />
    `;
  } else {
    content = `
      <circle cx="12" cy="12" r="10" fill="#111827" />
      <text x="12" y="15.5" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="bold" fill="#ffffff" text-anchor="middle">${initials}</text>
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
    ${content}
    <circle cx="12" cy="12" r="11" fill="none" stroke="${color}" stroke-width="2" />
  </svg>`;

  const base64 = btoa(unescape(encodeURIComponent(svg)));
  return `image://data:image/svg+xml;base64,${base64}`;
};

/**
 * ECharts chronological line chart — live server-fetched data only.
 * Hardened to support missing/null data without zero-plunging.
 * Styled with Robinhood/TradingView stock market UX aesthetics.
 */
export default function MetricChart({
  dateLabels,
  series,
  title,
  unit,
  metricLabel,
  rangeLabel,
}: MetricChartProps) {
  const [isolatedUserId, setIsolatedUserId] = useState<string | null>(null);

  console.log('[MetricChart debug] dateLabels:', JSON.stringify(dateLabels));
  console.log('[MetricChart debug] series:', JSON.stringify(series, null, 2));

  const hasData = series.length > 0 && dateLabels.length > 0;

  // Filter series based on interactive legend selection (isolated line vs all)
  const filteredSeries = isolatedUserId
    ? series.filter((s) => s.userId === isolatedUserId)
    : series;

  // Compute collision-mitigating horizontal offsets for endpoints
  const endpointGroups: Record<number, { userId: string; value: number }[]> = {};

  filteredSeries.forEach((s) => {
    // Find the last index that has a non-null value
    const lastIdx = s.points.reduce((acc: number, val, idx) => (val !== null ? idx : acc), -1);
    if (lastIdx !== -1) {
      const val = s.points[lastIdx] as number;
      if (!endpointGroups[lastIdx]) {
        endpointGroups[lastIdx] = [];
      }
      endpointGroups[lastIdx].push({ userId: s.userId, value: val });
    }
  });

  // Calculate standard max and threshold to determine collisions (within 3% of vertical range)
  const allVals = filteredSeries.flatMap((s) => s.points).filter((v): v is number => v !== null);
  const maxVal = allVals.length > 0 ? Math.max(...allVals) : 100;
  const collisionThreshold = maxVal * 0.03;

  // Map userId -> offset amount in px
  const horizontalOffsets: Record<string, number> = {};

  Object.entries(endpointGroups).forEach(([lastIdxStr, athletes]) => {
    // Sort athletes by value descending
    athletes.sort((a, b) => b.value - a.value);

    let i = 0;
    while (i < athletes.length) {
      const cluster = [athletes[i]];
      let j = i + 1;
      while (j < athletes.length && Math.abs(athletes[j].value - athletes[i].value) < collisionThreshold) {
        cluster.push(athletes[j]);
        j++;
      }

      if (cluster.length > 1) {
        cluster.forEach((ath, idx) => {
          // Offset formula: e.g. for N=2: -4, 4; for N=3: -8, 0, 8
          const offset = (idx - (cluster.length - 1) / 2) * 8;
          horizontalOffsets[ath.userId] = offset;
        });
      } else {
        horizontalOffsets[athletes[i].userId] = 0;
      }

      i = j;
    }
  });

  // Isolated athlete readout variables
  const isolatedAthlete = series.find((s) => s.userId === isolatedUserId);
  const isolatedLatestValue = isolatedAthlete
    ? isolatedAthlete.points.reduce((acc: number | null, val) => (val !== null ? val : acc), null)
    : null;

  const option = {
    grid: { left: 48, right: 48, top: 24, bottom: 32, containLabel: false },
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
      axisPointer: {
        type: 'line',
        lineStyle: { color: 'rgba(156, 163, 175, 0.4)', width: 1, type: 'dashed' },
      },
      backgroundColor: '#fff',
      borderColor: '#E5E7EB',
      textStyle: { color: '#111827', fontSize: 12 },
      confine: true,
      transitionDuration: 0.1,
      formatter: (params: any[]) => {
        const date = params[0]?.axisValue ?? '';
        // Sort athletes by value descending (highest score first)
        const sortedParams = [...params]
          .filter((p) => p.value !== null && p.value !== undefined)
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

        const lines = sortedParams.map(
          (p) =>
            `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px;"></span>` +
            `<b>${p.seriesName}</b>: ${p.value} ${unit}`,
        );
        return `<div style="font-size:11px"><b>${date}</b><br/>${lines.length > 0 ? lines.join('<br/>') : 'No activities logged'}</div>`;
      },
    },
    series: filteredSeries.map((s) => ({
      type: 'line',
      name: s.name,
      smooth: true,
      connectNulls: true, // Float smoothly over missing rest days instead of plunging to zero
      symbol: 'circle',
      lineStyle: { color: s.color, width: 2.5 },
      // Solid/gradient area fills disabled on multi-user view; only enabled if isolated to single user
      areaStyle: filteredSeries.length === 1 ? {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: `${s.color}22` },
            { offset: 1, color: `${s.color}00` },
          ],
        },
      } : undefined,
      data: s.points.map((v, i) => {
        if (v === null || v === undefined) {
          return null;
        }

        const lastIdx = s.points.reduce((acc: number, val, idx) => (val !== null ? idx : acc), -1);
        const isLastValid = i === lastIdx;

        if (isLastValid) {
          const terminalSymbol = getAvatarSvgUri(s.name, s.avatar_url, s.color);
          const xOffset = horizontalOffsets[s.userId] ?? 0;

          return {
            value: v,
            symbol: terminalSymbol,
            symbolSize: 24,
            symbolOffset: [xOffset, 0],
            itemStyle: { opacity: 1 },
          };
        }

        return {
          value: v,
          symbol: 'circle',
          symbolSize: 0,
          itemStyle: { opacity: 0 },
        };
      }),
    })),
  };

  return (
    <div className="rounded-[24px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-6 flex flex-col gap-4">
      {/* Card header */}
      <div>
        <div className="flex items-start justify-between mb-2">
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

        {/* Large Typography display for isolated athlete */}
        {isolatedAthlete && isolatedLatestValue !== null && (
          <div className="mb-4 animate-in fade-in slide-in-from-top-1 duration-300">
            <span className="text-5xl font-black text-[#111827] tracking-tight">
              {isolatedLatestValue}
            </span>
            <span className="text-sm font-bold text-[#6B7280] ml-2 uppercase">
              {unit}
            </span>
            <p className="text-[10px] font-bold text-[#34C759] uppercase tracking-wider mt-1 animate-pulse">
              Current Lead · Isolated
            </p>
          </div>
        )}

        {/* Interactive legend header to isolate lines */}
        {hasData && (
          <div className="flex flex-wrap gap-2 mb-2">
            {series.map((s) => {
              const isIsolated = isolatedUserId === s.userId;
              const latestVal = s.points.reduce((acc: number | null, val) => (val !== null ? val : acc), null);
              return (
                <button
                  key={s.userId}
                  onClick={() => {
                    setIsolatedUserId(prev => prev === s.userId ? null : s.userId);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-all duration-200 cursor-pointer ${
                    isIsolated
                      ? 'bg-[#111827] text-white border-[#111827] shadow-sm scale-102'
                      : 'bg-[#F9FAFB] text-[#4B5563] border-[#E5E7EB] hover:bg-[#F3F4F6]'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span>{s.name}</span>
                  {latestVal !== null && (
                    <span className={`text-[10px] font-mono font-bold ${isIsolated ? 'text-[#CEFF00]' : 'text-[#9CA3AF]'}`}>
                      {latestVal}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {hasData ? (
        <div className="h-[272px] w-full relative">
          <ReactECharts
            option={option}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'canvas' }}
            notMerge={true}
          />
        </div>
      ) : (
        <div className="h-[272px] flex flex-col items-center justify-center gap-3 text-center px-8">
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
