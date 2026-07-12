/**
 * LiveAchievementTicker — single-line infinite-scroll achievement feed.
 *
 * Architecture:
 *  - Server Component: fetches the 15 most recent verified logs from Supabase.
 *  - RLS automatically scopes the query to the logged-in user's group.
 *  - Formats each log into a natural, exciting sentence with emoji.
 *  - Doubles the sentence array so the seamless -50% translateX loop
 *    never shows a gap at any viewport width.
 *  - overflow-hidden on the outer wrapper prevents any horizontal scrollbar.
 *
 * Spec: dashboard §3 enhancement (live achievement broadcast bar)
 */

import { createClient } from '@/lib/supabase/server';

/* ── Sentence formatter ────────────────────────────────────────────────── */

type LogRow = {
  value: number;
  metric_slug: string; // v2 schema: stored directly on the row
  unit: string;
  profiles: { full_name: string | null; nickname: string | null } | null;
};

function formatAchievement(log: LogRow): string {
  const name = log.profiles?.nickname ?? log.profiles?.full_name?.split(' ')[0] ?? 'Someone';
  const val  = Number(log.value);
  const slug = log.metric_slug ?? '';
  const unit = log.unit ?? '';

  switch (slug) {
    // ── running ─────────────────────────────────────────────────────────
    case 'long_run':
      return val >= 10
        ? `${name} crushed a ${val} ${unit} long run today 🏃‍♂️🔥`
        : `${name} knocked out a ${val} ${unit} run 🏃`;


    // ── body metrics ────────────────────────────────────────────────────
    case 'weight':
      return `${name} checked in at ${val} ${unit} ⚖️`;

    // ── steps ───────────────────────────────────────────────────────────
    case 'highest_steps':
      return val >= 15000
        ? `${name} logged an insane ${val.toLocaleString()} steps today 👟🔥`
        : `${name} clocked ${val.toLocaleString()} steps 👟`;

    // ── marathon ────────────────────────────────────────────────────────
    case 'marathon':
      return `${name} completed a marathon in ${val} ${unit} 🏅`;

    // ── car speed ───────────────────────────────────────────────────────
    case 'car_top_speed':
      return val >= 100
        ? `${name} pushed the Hycross to ${val} ${unit} — speed demon! 🚗💨`
        : `${name} clocked ${val} ${unit} in the Hycross 🚗`;

    // ── underwater swim ─────────────────────────────────────────────────
    case 'underwater_swim':
      return val >= 50
        ? `${name} swam ${val} meters underwater on one breath — INCREDIBLE 🤿`
        : `${name} swam ${val} meters underwater 🤿`;

    // ── beers ───────────────────────────────────────────────────────────
    case 'most_beers':
      return val >= 10
        ? `${name} put away ${val} beers — absolute legend 🍺🏆`
        : `${name} had ${val} beer${val !== 1 ? 's' : ''} 🍺`;

    // ── catan wins ──────────────────────────────────────────────────────
    case 'catan_wins':
      return `${name} won a game of Catan! 🎲 Settlers beware…`;

    // ── national parks ──────────────────────────────────────────────────
    case 'national_parks':
      return `${name} visited a national park 🏔️ Living the dream!`;


    // ── generic fallback ────────────────────────────────────────────────
    default: {
      const display = slug.replace(/_/g, ' ');
      return `${name} logged ${val} ${unit} of ${display} 🏆`;
    }
  }
}

/* ── Separator between items ────────────────────────────────────────────── */
function Separator() {
  return (
    <span className="mx-6 text-[#CEFF00]/30 select-none" aria-hidden="true">
      ◆
    </span>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */
export default async function LiveAchievementTicker({ groupId }: { groupId: string }) {
  const supabase = await createClient();

  // Fetch 15 most recent verified logs scoped to this group.
  // groupId is explicit (index scan) + RLS double-fences the result.
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

  // If no data yet, show a warm placeholder so the ticker is never blank
  const sentences: string[] =
    rows.length > 0
      ? rows.map(formatAchievement)
      : [
          'Be the first to log an activity! 🚀',
          'Log your first run, lift, or swim to appear here 🏆',
          'The Growth Club is warming up… 🔥',
        ];

  // Double the array → seamless -50% loop at any screen width
  const doubled = [...sentences, ...sentences];

  return (
    <div
      className="overflow-hidden whitespace-nowrap flex w-full bg-slate-900 border-y-2 border-yellow-400 py-2 relative select-none"
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
          animation: marquee 25s linear infinite;
        }
        @keyframes flashRed {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .flash-red-dot {
          animation: flashRed 1s infinite;
        }
      `}</style>

      {/* Scrolling track */}
      <div className="flex-grow overflow-hidden flex items-center">
        <div className="animate-ticker-marquee" style={{ willChange: 'transform' }}>
          {doubled.map((sentence, i) => (
            <span key={i} className="inline-flex items-center gap-2 font-mono font-black tracking-widest text-yellow-300 uppercase text-xs md:text-sm mr-16">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 flash-red-dot flex-shrink-0" />
              <span className="text-red-500 font-black">[🚨 BREAKING]</span>
              <span>{sentence}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
