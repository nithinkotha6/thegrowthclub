import { ChevronRight } from 'lucide-react';

const FEED = [
  {
    id: 1,
    emoji: '🏃',
    name: 'Nithin',
    action: 'Completed my 5K Run',
    metric: '2.1 mi • 24:31',
    date: 'Jul 9',
    bg: 'bg-[#1A1A1A]',
  },
  {
    id: 2,
    emoji: '🍺',
    name: 'Ashray',
    action: 'drank 12 Beers in one go!!',
    metric: '12 beers',
    date: 'Jul 8',
    bg: 'bg-[#1A1A1A]',
  },
  {
    id: 3,
    emoji: '🏅',
    name: 'Rahul',
    action: 'Finished 10K Run in Dallas',
    metric: '6.2 mi • 58:12',
    date: 'Jul 8',
    bg: 'bg-[#1A1A1A]',
  },
  {
    id: 4,
    emoji: '💪',
    name: 'Mouye',
    action: 'Deadlift 100 kg – New high',
    metric: '100 kg',
    date: 'Jul 7',
    bg: 'bg-[#1A1A1A]',
  },
  {
    id: 5,
    emoji: '⚡',
    name: 'Narri',
    action: 'Top Speed in Austin 112 m/hr',
    metric: '112 mph',
    date: 'Jul 6',
    bg: 'bg-[#1A1A1A]',
  },
];

/**
 * Real-time Breaking News feed card.
 * Spec: Features.md §4 — circular icon, bold name, metric value, right-aligned date.
 */
export default function BreakingNewsFeed() {
  return (
    <div className="rounded-[24px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-6 flex flex-col">
      <h2 className="text-base font-bold text-[#111827] mb-5">Breaking News</h2>

      <ul className="flex flex-col gap-4 flex-1" aria-label="Activity feed">
        {FEED.map((item) => (
          <li key={item.id} className="flex items-start gap-3">
            {/* Circular dark icon */}
            <div
              className={`w-9 h-9 rounded-full ${item.bg} flex-shrink-0 flex items-center justify-center text-[15px]`}
              aria-hidden="true"
            >
              {item.emoji}
            </div>

            {/* Text block */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-[#111827] leading-snug">
                <span className="font-bold">{item.name}</span>
                {' — '}
                {item.action}
              </p>
              <p className="text-[11px] text-[#6B7280] mt-0.5 tabular-nums">
                {item.metric}
              </p>
            </div>

            {/* Date — right-aligned */}
            <span className="text-[11px] text-[#6B7280] flex-shrink-0 tabular-nums">
              {item.date}
            </span>
          </li>
        ))}
      </ul>

      <a
        href="#"
        className="mt-5 text-[12px] font-medium text-[#6B7280] hover:text-[#111827] flex items-center gap-1 transition-colors"
      >
        View all news
        <ChevronRight size={13} />
      </a>
    </div>
  );
}
