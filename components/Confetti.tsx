'use client';

import { useEffect, useState } from 'react';

type Particle = {
  id: number;
  left: string;
  delay: string;
  duration: string;
  size: string;
  color: string;
  shape: 'circle' | 'square' | 'triangle';
};

const COLORS = [
  'bg-[#CEFF00]', // Neon Lime
  'bg-[#FF3B30]', // Neon Red
  'bg-[#007AFF]', // iOS Blue
  'bg-[#AF52DE]', // iOS Purple
  'bg-[#34C759]', // iOS Green
  'bg-[#FFCC00]', // iOS Yellow
];

/**
 * Lightweight, zero-dependency DOM-based Confetti Party Popper.
 * Animates colorful falling particles.
 */
export default function Confetti() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const generated: Particle[] = Array.from({ length: 80 }).map((_, i) => {
      const sizeNum = Math.floor(Math.random() * 10) + 6; // 6px to 16px
      const shapes: ('circle' | 'square' | 'triangle')[] = ['circle', 'square', 'triangle'];
      return {
        id: i,
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 2}s`,
        duration: `${Math.random() * 2 + 2}s`, // 2s to 4s
        size: `${sizeNum}px`,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        shape: shapes[Math.floor(Math.random() * shapes.length)],
      };
    });
    setParticles(generated);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden="true">
      {particles.map((p) => {
        let shapeClass = '';
        let styleObj: React.CSSProperties = {
          left: p.left,
          width: p.size,
          height: p.size,
          animationDelay: p.delay,
          animationDuration: p.duration,
        };

        if (p.shape === 'circle') {
          shapeClass = 'rounded-full';
        } else if (p.shape === 'triangle') {
          styleObj = {
            ...styleObj,
            clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
          };
        }

        return (
          <div
            key={p.id}
            className={`absolute top-0 -mt-10 animate-confetti ${p.color} ${shapeClass}`}
            style={styleObj}
          />
        );
      })}
    </div>
  );
}
