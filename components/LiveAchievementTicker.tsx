/**
 * LiveAchievementTicker — single-line infinite-scroll achievement feed.
 * Pinned activities tag (25%-30% width) + CSS-only linear scrolling track.
 */

import { createClient } from '@/lib/supabase/server';

/* ── Sentence formatter ────────────────────────────────────────────────── */

type LogRow = {
  value: number;
  metric_slug: string;
  unit: string;
  profiles: { full_name: string | null; nickname: string | null } | null;
};

function formatAchievement(log: LogRow): string {
  const name = log.profiles?.nickname ?? log.profiles?.full_name?.split(' ')[0] ?? 'Someone';
  const val  = Number(log.value);
  const slug = log.metric_slug ?? '';
  const unit = log.unit ?? '';

  switch (slug) {
    case 'long_run':
      return val >= 10
        ? `${name} crushed a ${val} ${unit} long run today 🏃‍♂️🔥`
        : `${name} knocked out a ${val} ${unit} run 🏃`;

    case 'weight':
      return `${name} checked in at ${val} ${unit} ⚖️`;

    case 'highest_steps':
      return val >= 15000
        ? `${name} logged an insane ${val.toLocaleString()} steps today 👟🔥`
        : `${name} clocked ${val.toLocaleString()} steps 👟`;

    case 'marathon':
      return `${name} completed a marathon in ${val} ${unit} 🏅`;

    case 'car_top_speed':
      return val >= 100
        ? `${name} pushed the Hycross to ${val} ${unit} — speed demon! 🚗💨`
        : `${name} clocked ${val} ${unit} in the Hycross 🚗`;

    case 'underwater_swim':
      return val >= 50
        ? `${name} swam ${val} meters underwater on one breath — INCREDIBLE 🤿`
        : `${name} swam ${val} meters underwater 🤿`;

    case 'most_beers':
      return val >= 10
        ? `${name} put away ${val} beers — absolute legend 🍺🏆`
        : `${name} had ${val} beer${val !== 1 ? 's' : ''} 🍺`;

    case 'catan_wins':
      return `${name} won a game of Catan! 🎲 Settlers beware…`;

    case 'national_parks':
      return `${name} visited a national park 🏔️ Living the dream!`;

    default: {
      const display = slug.replace(/_/g, ' ');
      return `${name} logged ${val} ${unit} of ${display} 🏆`;
    }
  }
}

/* ── Main component ──────────────────────────────────────────────────── */
export default async function LiveAchievementTicker({ groupId }: { groupId: string }) {
  const supabase = await createClient();

  // Fetch 15 most recent verified logs scoped to this group.
  const { data: logs } = await supabase
    .from('metric_logs')
    .select(`
      value,
      metric_slug,
      unit,
      profiles!inner ( full_name, nickname )
    `)
    .eq('group_id', groupId)
    .eq('status', 'verified')
    .order('logged_at', { ascending: false })
    .limit(15);

  const rows = (logs ?? []) as unknown as LogRow[];

  const sentences: string[] =
    rows.length > 0
      ? rows.map(formatAchievement)
      : [
          'Be the first to log an activity! 🚀',
          'Log your first run, lift, or swim to appear here 🏆',
          'The Growth Club is warming up… 🔥',
        ];

  const doubled = [...sentences, ...sentences];

  return (
    <div
      className="overflow-hidden whitespace-nowrap flex w-full bg-slate-900 border-y-2 border-emerald-500/30 py-2.5 relative select-none items-center"
      aria-label="Live achievement ticker"
      role="marquee"
    >
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0%); }
          to { transform: translateX(-50%); }
        }
        .animate-ticker-marquee {
          display: flex;
          white-space: nowrap;
          animation: marquee 60s linear infinite;
        }
        @keyframes flashGreen {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .flash-green-dot {
          animation: flashGreen 1s infinite;
        }
      `}</style>

      {/* Pinned Broadcast Tag (compact 25%-30% horizontal space on mobile) */}
      <div className="z-10 bg-slate-900 pl-3 pr-2 py-1 flex-shrink-0 w-[28%] max-w-[125px] md:w-auto md:max-w-none flex items-center gap-1.5 font-mono font-black tracking-wider text-emerald-400 uppercase text-[9px] md:text-xs border-r border-slate-800">
        <span className="w-2 h-2 rounded-full bg-emerald-500 flash-green-dot flex-shrink-0" />
        <span className="truncate">RECENT ACTIVITIES</span>
      </div>

      {/* Scrolling Track Content */}
      <div className="flex-grow overflow-hidden flex items-center">
        <div className="animate-ticker-marquee" style={{ willChange: 'transform' }}>
          {doubled.map((sentence, i) => (
            <span key={i} className="inline-flex items-center gap-2 font-mono font-bold tracking-wide text-emerald-300 text-sm md:text-base mr-16">
              <span>{sentence}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
