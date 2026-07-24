'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface LiveMatchTimerProps {
  durationSeconds: number;
  startedAt: string; // ISO date string
  onTimeUp?: () => void;
}

export function LiveMatchTimer({ durationSeconds, startedAt, onTimeUp }: LiveMatchTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    const startTime = new Date(startedAt).getTime();
    const now = Date.now();
    const elapsed = Math.floor((now - startTime) / 1000);
    return Math.max(0, durationSeconds - elapsed);
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const startTime = new Date(startedAt).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
      const rem = Math.max(0, durationSeconds - elapsed);

      setRemainingSeconds(rem);

      if (rem === 0) {
        clearInterval(interval);
        onTimeUp?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [durationSeconds, startedAt, onTimeUp]);

  const h = Math.floor(remainingSeconds / 3600);
  const m = Math.floor((remainingSeconds % 3600) / 60);
  const s = remainingSeconds % 60;

  const formatted =
    h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const isExpired = remainingSeconds === 0;

  return (
    <div
      className={`flex items-center justify-center gap-2.5 py-3 px-6 rounded-2xl border-2 shadow-lg select-none transition-all ${
        isExpired
          ? 'bg-red-950/80 border-red-500 text-red-400'
          : 'bg-[#0A1628] border-[#CEFF00] text-[#CEFF00]'
      }`}
    >
      <Clock size={20} className={isExpired ? 'animate-bounce text-red-400' : 'animate-pulse text-[#CEFF00]'} />
      <span className="text-xl md:text-2xl font-black tracking-widest tabular-nums">
        {isExpired ? "TIME'S UP!" : formatted}
      </span>
    </div>
  );
}

export default LiveMatchTimer;
