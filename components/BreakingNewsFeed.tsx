import { ChevronRight, Newspaper } from 'lucide-react';

export type FeedItem = {
  id:          string | number;
  name:        string;        // display name (nickname ?? full_name)
  avatar_url?: string;
  message:     string;        // NL sentence: "Nithin deadlifted 325 lbs 🔥"
  relativeTime: string;       // "2h ago", "Yesterday", "Jul 4"
  status:      'pending' | 'verified';
};

interface BreakingNewsFeedProps {
  items: FeedItem[];
}

/**
 * Real-time Breaking News feed — natural language activity messages with
 * relative timestamps and pending/verified status badges.
 * Spec: Features.md §4, Pillar 3
 */
export default function BreakingNewsFeed({ items }: BreakingNewsFeedProps) {
  const hasItems = items.length > 0;

  return (
    <div className="rounded-[24px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-6 flex flex-col">
      <h2 className="text-base font-bold text-[#111827] mb-5">Breaking News</h2>

      {hasItems ? (
        <ul className="flex flex-col gap-4 flex-1" aria-label="Activity feed">
          {items.map((item) => {
            const isImage   = item.avatar_url?.startsWith('http');
            const initials  = item.name?.charAt(0)?.toUpperCase() ?? '?';
            const isPending = item.status === 'pending';

            return (
              <li key={item.id} className="flex items-start gap-3">
                {/* Circular avatar */}
                <div
                  className="w-9 h-9 rounded-full bg-[#1A1A1A] flex-shrink-0 flex items-center justify-center text-[15px] overflow-hidden"
                  aria-hidden="true"
                >
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.avatar_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[#CEFF00] text-xs font-black">{initials}</span>
                  )}
                </div>

                {/* Text block */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[#111827] leading-snug">
                    {item.message}
                  </p>
                  {isPending && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold uppercase tracking-wide bg-[#FEF3C7] text-[#92400E] rounded-full px-2 py-0.5">
                      ⏳ Pending verification
                    </span>
                  )}
                </div>

                {/* Relative time — right-aligned */}
                <span className="text-[11px] text-[#9CA3AF] flex-shrink-0 tabular-nums mt-0.5">
                  {item.relativeTime}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-10 text-center">
          <Newspaper size={28} className="text-[#E5E7EB]" />
          <p className="text-sm font-semibold text-[#9CA3AF]">No activity yet</p>
          <p className="text-xs text-[#D1D5DB]">
            Group news will appear here once someone logs an activity.
          </p>
        </div>
      )}

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
