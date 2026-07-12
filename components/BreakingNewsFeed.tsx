'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Newspaper, Trash2, Check, X } from 'lucide-react';
import { approveActivityAction, rejectActivityAction, deleteActivityAction } from '@/app/actions/vote';
import UserAvatar from './UserAvatar';

export type FeedItem = {
  id:          string | number;
  name:        string;        // display name (nickname ?? full_name)
  avatar_url?: string;
  message:     string;        // NL sentence
  relativeTime: string;       // "2h ago", "Yesterday", "Jul 4"
  status:      'pending' | 'verified' | 'rejected';
  user_id:     string;        // log owner ID
  vote_count:  number;        // number of approvals
  hasVoted:    boolean;       // has the logged-in user approved?
};

interface BreakingNewsFeedProps {
  items: FeedItem[];
  currentUserId: string;
}

/**
 * Real-time Breaking News feed — interactive scrollable ledger list
 * with peer approvals, peer rejections, and author deletion options.
 */
export default function BreakingNewsFeed({ items, currentUserId }: BreakingNewsFeedProps) {
  const router = useRouter();
  const [isPendingAction, startTransition] = useTransition();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  
  // Local state to track optimistic approvals
  const [localApprovals, setLocalApprovals] = useState<Record<string, { count: number; approved: boolean }>>({});

  const hideItem = (id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(String(id));
      return next;
    });
  };

  const handleApprove = (logId: string | number, logOwnerId: string) => {
    if (isPendingAction) return;

    // Optimistic state
    setLocalApprovals((prev) => ({
      ...prev,
      [logId]: {
        count: (localApprovals[logId]?.count ?? items.find(i => i.id === logId)?.vote_count ?? 0) + 1,
        approved: true,
      }
    }));

    startTransition(async () => {
      const res = await approveActivityAction(String(logId), currentUserId, logOwnerId);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error);
        // Rollback optimistic state
        setLocalApprovals((prev) => {
          const next = { ...prev };
          delete next[logId];
          return next;
        });
      }
    });
  };

  const handleReject = (logId: string | number) => {
    if (isPendingAction) return;

    // Optimistic hide
    hideItem(String(logId));

    startTransition(async () => {
      const res = await rejectActivityAction(String(logId), currentUserId);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error);
        // Restore/Rollback
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(String(logId));
          return next;
        });
      }
    });
  };

  const handleDelete = (logId: string | number) => {
    if (isPendingAction) return;

    // Optimistic hide
    hideItem(String(logId));

    startTransition(async () => {
      const res = await deleteActivityAction(String(logId), currentUserId);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error);
        // Restore/Rollback
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(String(logId));
          return next;
        });
      }
    });
  };

  const visibleItems = items.filter((item) => !hiddenIds.has(String(item.id)) && item.status !== 'rejected');
  const hasItems = visibleItems.length > 0;

  return (
    <div className="rounded-[24px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-6 flex flex-col max-h-[640px]">
      <h2 className="text-base font-bold text-[#111827] mb-5">Recent Activities</h2>

      {/* Constrained Vertically Scrollable Container */}
      <div className="flex-1 max-h-[500px] overflow-y-auto pr-1 select-none scrollbar-thin">
        {hasItems ? (
          <ul className="flex flex-col gap-4" aria-label="Activity feed">
            {visibleItems.map((item) => {
              const isPending = item.status === 'pending';
              const isOwner = String(item.user_id) === String(currentUserId);

              // Read approval states merging local overrides
              const approvedState = localApprovals[item.id] || {
                count: item.vote_count,
                approved: item.hasVoted,
              };

              return (
                <li key={item.id} className="flex items-center justify-between gap-4 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                  {/* Left Side: Avatar + Message */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <UserAvatar
                      user={{ avatar_url: item.avatar_url, full_name: item.name }}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="text-[13px] text-[#111827] leading-snug">
                        {item.message}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[11px] text-[#9CA3AF] tabular-nums">
                          {item.relativeTime}
                        </span>
                        {isPending && (
                          <>
                            <span className="text-slate-300 select-none text-[10px]">•</span>
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide bg-[#FEF3C7] text-[#92400E] rounded-full px-1.5 py-0.2 select-none">
                              ⏳ Pending
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Action buttons */}
                  <div className="flex-shrink-0 flex items-center gap-1.5">
                    {/* Display deletion options for authors */}
                    {isOwner ? (
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={isPendingAction}
                        className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-full px-2.5 py-1 transition cursor-pointer active:scale-95 disabled:opacity-50"
                        type="button"
                      >
                        <Trash2 size={10} />
                        Delete
                      </button>
                    ) : isPending ? (
                      // Peer voting options
                      approvedState.approved ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 select-none">
                          ✅ Approved • {approvedState.count}/3
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleApprove(item.id, item.user_id)}
                            disabled={isPendingAction}
                            className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-full px-2.5 py-1 transition cursor-pointer active:scale-95 disabled:opacity-50"
                            type="button"
                          >
                            <Check size={10} strokeWidth={3} />
                            Approve ({approvedState.count}/3)
                          </button>
                          <button
                            onClick={() => handleReject(item.id)}
                            disabled={isPendingAction}
                            className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-full px-2.5 py-1 transition cursor-pointer active:scale-95 disabled:opacity-50"
                            type="button"
                          >
                            <X size={10} strokeWidth={3} />
                            Reject
                          </button>
                        </div>
                      )
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center select-none">
            <Newspaper size={28} className="text-[#E5E7EB]" />
            <p className="text-sm font-semibold text-[#9CA3AF]">No activity yet</p>
            <p className="text-xs text-[#D1D5DB]">
              Group news will appear here once someone logs an activity.
            </p>
          </div>
        )}
      </div>

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
