'use client';

import { ChevronRight, Newspaper } from 'lucide-react';
import UserAvatar from './UserAvatar';

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
 * relative timestamps, user avatars, and pending/verified status badges.
 */
export default function BreakingNewsFeed({ items }: BreakingNewsFeedProps) {
  const hasItems = items.length > 0;

  return (
    <div className="rounded-[24px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-6 flex flex-col">
      <h2 className="text-base font-bold text-[#111827] mb-5">Breaking News</h2>

      {hasItems ? (
        <ul className="flex flex-col gap-4 flex-1" aria-label="Activity feed">
          {items.map((item) => {
            const isPending = item.status === 'pending';

            return (
              <li key={item.id} className="flex items-start gap-3">
                {/* Reusable UserAvatar component */}
                <UserAvatar
                  user={{ avatar_url: item.avatar_url, full_name: item.name }}
                  size="md"
                />

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
