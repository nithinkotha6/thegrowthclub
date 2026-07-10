import { PersonStanding, Zap, Dumbbell, Timer, Flame } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Circumference of SVG donut circle with r=22: 2π*22 ≈ 138.23
const CIRC = 2 * Math.PI * 22;

const KPI_ITEMS = [
  {
    id: 'activities',
    label: 'TOTAL ACTIVITIES',
    value: '28',
    unit: '',
    icon: PersonStanding,
    color: '#34C759',
    progress: 70,
    delta: '+12% vs last week',
    deltaClass: 'text-[#16A34A]',
  },
  {
    id: 'speed',
    label: 'TOP SPEED (BEST)',
    value: '112',
    unit: 'mph',
    icon: Zap,
    color: '#FF3B30',
    progress: 80,
    delta: 'New record!',
    deltaClass: 'text-[#FF3B30]',
  },
  {
    id: 'lift',
    label: 'HEAVIEST LIFT',
    value: '100',
    unit: 'kg',
    icon: Dumbbell,
    color: '#AF52DE',
    progress: 75,
    delta: 'New PR!',
    deltaClass: 'text-[#AF52DE]',
  },
  {
    id: 'run',
    label: 'LONGEST RUN',
    value: '10.2',
    unit: 'mi',
    icon: Timer,
    color: '#007AFF',
    progress: 65,
    delta: 'Great work!',
    deltaClass: 'text-[#007AFF]',
  },
  {
    id: 'calories',
    label: 'CALORIES BURNED',
    value: '4,250',
    unit: 'kcal',
    icon: Flame,
    color: '#CEFF00',
    progress: 85,
    delta: '+18% vs last week',
    deltaClass: 'text-[#65A30D]',
  },
];

function DonutIcon({
  Icon,
  color,
  progress,
}: {
  Icon: LucideIcon;
  color: string;
  progress: number;
}) {
  const filled = (progress / 100) * CIRC;
  return (
    <div className="relative w-14 h-14 flex-shrink-0">
      {/* SVG donut ring — starts at top via rotate-[-90deg] on the group */}
      <svg viewBox="0 0 52 52" className="w-14 h-14" aria-hidden="true">
        {/* Track */}
        <circle
          cx="26" cy="26" r="22"
          fill="none"
          stroke="#F3F4F6"
          strokeWidth="3.5"
        />
        {/* Progress arc */}
        <circle
          cx="26" cy="26" r="22"
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${CIRC}`}
          strokeDashoffset={CIRC * 0.25} /* rotate start to 12 o'clock */
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      {/* Icon centered over the donut */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Icon size={20} style={{ color }} strokeWidth={2.2} />
      </div>
    </div>
  );
}

/**
 * Bottom row — 5 KPI summary cards.
 * Spec: Features.md §5 — donut-stroke icon, large numeric value, delta tag.
 */
export default function KpiCards() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {KPI_ITEMS.map(({ id, label, value, unit, icon, color, progress, delta, deltaClass }) => (
        <div
          key={id}
          className="rounded-[24px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-5 flex flex-col gap-3"
        >
          <DonutIcon Icon={icon} color={color} progress={progress} />

          <div>
            <p className="text-[10px] font-bold tracking-wider text-[#6B7280] uppercase leading-tight">
              {label}
            </p>
            <p className="text-3xl font-black text-[#111827] leading-tight mt-0.5 tabular-nums">
              {value}
              {unit && (
                <span className="text-base font-semibold text-[#6B7280] ml-1">
                  {unit}
                </span>
              )}
            </p>
            <p className={`text-[11px] font-semibold mt-1 ${deltaClass}`}>
              {delta}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
