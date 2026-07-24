'use client';

import { METRIC_PROGRESSION_CATALOG, normalizeMetricSlug } from '@/lib/config/challenge-tiers';

interface CurrentHighestCardProps {
  metric: string;
  value: number;
}

export function CurrentHighestCard({ metric, value }: CurrentHighestCardProps) {
  const normSlug = normalizeMetricSlug(metric);
  const config = METRIC_PROGRESSION_CATALOG[normSlug] || METRIC_PROGRESSION_CATALOG['push_ups'];
  const labelUpper = config.label.toUpperCase();

  return (
    <div className="bg-white border-2 border-[#CEFF00] rounded-2xl p-6 md:p-8 flex flex-col items-center justify-center text-center gap-1.5 shadow-md my-4">
      <style jsx>{`
        @keyframes fireBurn {
          0% {
            opacity: 0.8;
            transform: scaleY(1) scaleX(1);
            filter: brightness(1);
          }
          25% {
            opacity: 1;
            transform: scaleY(1.15) scaleX(0.92);
            filter: brightness(1.15) hue-rotate(-10deg);
          }
          50% {
            opacity: 0.9;
            transform: scaleY(0.95) scaleX(1.05);
            filter: brightness(0.95) hue-rotate(5deg);
          }
          75% {
            opacity: 1;
            transform: scaleY(1.2) scaleX(0.88);
            filter: brightness(1.25) hue-rotate(-5deg);
          }
          100% {
            opacity: 0.8;
            transform: scaleY(1) scaleX(1);
            filter: brightness(1);
          }
        }

        .animated-fire {
          display: inline-block;
          animation: fireBurn 0.85s ease-in-out infinite;
          transform-origin: bottom center;
        }
      `}</style>

      <h2 className="text-5xl md:text-6xl font-black text-[#0F1F3C] tracking-tight tabular-nums flex items-center justify-center gap-2">
        <span>{value}</span>
        <span className="animated-fire text-4xl md:text-5xl select-none">🔥</span>
      </h2>

      <p className="text-xs font-black uppercase tracking-wider text-slate-400 mt-1">
        CURRENT HIGHEST {labelUpper}
      </p>
    </div>
  );
}

export default CurrentHighestCard;
