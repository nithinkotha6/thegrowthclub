'use client';

import ReactECharts from 'echarts-for-react';
import { Users, ChevronDown } from 'lucide-react';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const MOCK_USERS = [
  { name: 'Nithin', color: '#FF3B30', data: [0,  2,  5,  9, 13, 17, 19] },
  { name: 'Ashray', color: '#007AFF', data: [0,  3,  7, 10, 12, 15, 17] },
  { name: 'Rahul',  color: '#AF52DE', data: [0,  2,  6,  9, 11, 14, 16] },
  { name: 'Mouye',  color: '#34C759', data: [0,  1,  3,  5,  7,  8,  9] },
  { name: 'Narri',  color: '#FFCC00', data: [0,  1,  2,  3,  4,  5,  6] },
];

/**
 * ECharts multi-series line chart.
 * Spec: Features.md §4, frontend.md §4
 * - Horizontal dashed gridlines only; Y-axis line hidden.
 * - Colored avatar-circle terminals at the last (SUN) data point.
 * - Bold numeric value label to the right of each terminal node.
 */
export default function MetricChart() {
  const option = {
    grid: { left: 36, right: 72, top: 16, bottom: 28, containLabel: false },
    xAxis: {
      type: 'category',
      data: DAYS,
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9CA3AF', fontSize: 11, fontWeight: 600 },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 22,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9CA3AF', fontSize: 11 },
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
    },
    series: MOCK_USERS.map((u) => ({
      type: 'line',
      name: u.name,
      smooth: true,
      symbol: 'circle',
      lineStyle: { color: u.color, width: 2.5 },
      data: u.data.map((v, i) => {
        const isLast = i === DAYS.length - 1;
        return {
          value: v,
          symbolSize: isLast ? 30 : 0,
          itemStyle: isLast
            ? { color: u.color, borderColor: '#fff', borderWidth: 3 }
            : { opacity: 0 },
          label: {
            show: isLast,
            position: 'right',
            formatter: `${v}`,
            fontWeight: 'bold',
            fontSize: 14,
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
          <h2 className="text-base font-bold text-[#111827]">
            Highest no of Beers 🍺
          </h2>
          <p className="text-xs text-[#6B7280] mt-0.5">Weekly Progress</p>
        </div>
        <button className="flex items-center gap-1.5 text-xs text-[#6B7280] bg-[#F7F8FA] rounded-lg px-3 py-1.5 font-medium hover:bg-gray-100 transition-colors">
          <Users size={12} />
          All Athletes
          <ChevronDown size={11} />
        </button>
      </div>

      {/* Chart — fills full width, height fixed; canvas resizes via style */}
      <ReactECharts
        option={option}
        style={{ height: 272, width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
