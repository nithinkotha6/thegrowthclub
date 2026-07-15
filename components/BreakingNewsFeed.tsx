'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Newspaper, Check, X, MoreHorizontal } from 'lucide-react';
import { processVerificationVote, deleteActivityAction } from '@/app/actions/vote';
import UserAvatar from './UserAvatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export type FeedItem = {
  id:          string | number;
  name:        string;        // display name (nickname ?? full_name)
  full_name?:  string;
  nickname?:   string;
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
 * Real-time activities feed — interactive scrollable ledger list
 * with peer approvals, peer rejections, and author ellipsis menu option deletion.
 */
function BreakingNewsFeed({ items, currentUserId }: BreakingNewsFeedProps) {
  const router = useRouter();
  const [isPendingAction, startTransition] = useTransition();
  const [deletingItem, setDeletingItem] = useState<FeedItem | null>(null);

  const handleApprove = (logId: string | number) => {
    if (isPendingAction) return;

    startTransition(async () => {
      const res = await processVerificationVote({ logId: String(logId), vote: 'approve' });
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error);
      }
    });
  };

  const handleReject = (logId: string | number) => {
    if (isPendingAction) return;

    startTransition(async () => {
      const res = await processVerificationVote({ logId: String(logId), vote: 'reject' });
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error);
      }
    });
  };

  const handleDelete = (logId: string | number) => {
    if (isPendingAction) return;

    startTransition(async () => {
      const res = await deleteActivityAction(String(logId), currentUserId);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error);
      }
    });
  };

  const visibleItems = items.filter((item) => item.status !== 'rejected');
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

              return (
                <li key={item.id} className="flex items-center justify-between gap-4 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                  {/* Left Side: Avatar + Message */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <UserAvatar
                      user={{
                        avatar_url: item.avatar_url,
                        full_name: item.full_name,
                        nickname: item.nickname,
                      }}
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

                  {/* Right Side: Action buttons or More options ellipsis */}
                  <div className="flex-shrink-0 flex items-center gap-1.5 ml-auto">
                    {isOwner ? (
                      // Subtle ellipsis More Options button
                      <button
                        onClick={() => setDeletingItem(item)}
                        className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer flex items-center justify-center animate-in fade-in"
                        type="button"
                        title="More Options"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    ) : isPending ? (
                      // Peer voting options (Approve / Reject)
                      <div className="flex items-center gap-1.5">
                        {item.hasVoted ? (
                          <span className="p-2 rounded-full text-emerald-600 bg-emerald-50 select-none flex items-center justify-center animate-in scale-in" title={`Approved (${item.vote_count}/3)`}>
                            <Check size={16} strokeWidth={3} />
                          </span>
                        ) : (
                          <button
                            onClick={() => handleApprove(item.id)}
                            disabled={isPendingAction}
                            className="p-2 rounded-full text-indigo-600 hover:bg-slate-100 transition-colors active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center justify-center"
                            type="button"
                            title={`Approve (${item.vote_count}/3)`}
                          >
                            <Check size={16} strokeWidth={3} />
                          </button>
                        )}
                        <button
                          onClick={() => handleReject(item.id)}
                          disabled={isPendingAction}
                          className="p-2 rounded-full text-rose-600 hover:bg-slate-100 transition-colors active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center"
                          type="button"
                          title="Reject"
                        >
                          <X size={16} strokeWidth={3} />
                        </button>
                      </div>
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

      {/* Confirmation Dialog */}
      <Dialog open={!!deletingItem} onOpenChange={(open) => { if (!open) setDeletingItem(null); }}>
        <DialogContent className="bg-white max-w-sm p-5 rounded-2xl shadow-xl border border-slate-100 flex flex-col gap-4">
          <DialogHeader className="gap-1.5">
            <DialogTitle className="text-base font-bold text-[#111827]">Delete Activity</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Are you sure you want to permanently delete this activity record? This will scrub it from the charts and leaderboards.
            </DialogDescription>
          </DialogHeader>

          {deletingItem && (
            <div className="py-2.5 px-3 border border-slate-100 rounded-xl bg-slate-50 text-slate-700">
              <p className="text-xs font-semibold leading-snug">{deletingItem.message}</p>
              <p className="text-[10px] text-slate-400 mt-1 tabular-nums">{deletingItem.relativeTime}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 mt-2">
            <button
              onClick={() => setDeletingItem(null)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition active:scale-95 cursor-pointer"
              type="button"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (deletingItem) {
                  handleDelete(deletingItem.id);
                  setDeletingItem(null);
                }
              }}
              disabled={isPendingAction}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              type="button"
            >
              🗑 Delete Activity Record
            </button>
          </div>
        </DialogContent>
      </Dialog>

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

export default React.memo(BreakingNewsFeed);
