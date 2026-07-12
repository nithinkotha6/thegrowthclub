'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Newspaper } from 'lucide-react';
import { castVoteAction } from '@/app/actions/vote';
import UserAvatar from './UserAvatar';

export type FeedItem = {
  id:          string | number;
  name:        string;        // display name (nickname ?? full_name)
  avatar_url?: string;
  message:     string;        // NL sentence: "Nithin deadlifted 325 lbs 🔥"
  relativeTime: string;       // "2h ago", "Yesterday", "Jul 4"
  status:      'pending' | 'verified';
  user_id:     string;        // log owner ID
  vote_count:  number;        // number of approvals
  hasVoted:    boolean;       // has the logged-in user approved?
};

interface BreakingNewsFeedProps {
  items: FeedItem[];
  currentUserId: string;
}

/**
 * Real-time Breaking News feed — natural language activity messages with
 * relative timestamps, user avatars, and inline peer approval vote buttons.
 */
export default function BreakingNewsFeed({ items, currentUserId }: BreakingNewsFeedProps) {
  const hasItems = items.length > 0;

  return (
    <div className="rounded-[24px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-6 flex flex-col">
      <h2 className="text-base font-bold text-[#111827] mb-5">Breaking News</h2>

      {hasItems ? (
        <ul className="flex flex-col gap-4 flex-1" aria-label="Activity feed">
          {items.map((item) => {
            const isPending = item.status === 'pending';

            return (
              <li key={item.id} className="flex items-start gap-3 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
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
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-[#FEF3C7] text-[#92400E] rounded-full px-2 py-0.5">
                        ⏳ Pending
                      </span>
                      <InlineFeedVoteButton
                        logId={item.id}
                        logOwnerId={item.user_id}
                        currentUserId={currentUserId}
                        initialVoteCount={item.vote_count}
                        initialHasVoted={item.hasVoted}
                      />
                    </div>
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

/**
 * Inline vote button rendering thumbs-up controls for feed items.
 */
function InlineFeedVoteButton({
  logId,
  logOwnerId,
  currentUserId,
  initialVoteCount,
  initialHasVoted,
}: {
  logId: string | number;
  logOwnerId: string;
  currentUserId: string;
  initialVoteCount: number;
  initialHasVoted: boolean;
}) {
  const router = useRouter();
  const [hasVoted, setHasVoted] = useState(initialHasVoted);
  const [voteCount, setVoteCount] = useState(initialVoteCount);
  const [isPending, startTransition] = useTransition();

  const isSelf = logOwnerId === currentUserId;

  const handleVote = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isSelf || hasVoted || isPending) return;

    startTransition(async () => {
      const res = await castVoteAction(String(logId), logOwnerId, currentUserId);
      if (res.success) {
        setHasVoted(true);
        setVoteCount((c) => c + 1);
        router.refresh();
      } else {
        alert(res.error);
      }
    });
  };

  if (isSelf) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 select-none">
        👍 {voteCount}/3 approvals
      </span>
    );
  }

  if (hasVoted) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 select-none">
        ✅ Approved • {voteCount}/3
      </span>
    );
  }

  return (
    <button
      onClick={handleVote}
      disabled={isPending}
      className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-full px-2.5 py-0.5 transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
      type="button"
    >
      👍 Approve • {voteCount}/3
    </button>
  );
}
