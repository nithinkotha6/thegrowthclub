'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, Loader2, ThumbsUp } from 'lucide-react';
import { castVoteAction } from '@/app/actions/vote';

interface VoteButtonProps {
  logId: string;
  logOwnerId: string;
  voterId: string;
  hasVoted: boolean;
}

/**
 * Client-side "Verify" button for the peer-review queue.
 * Calls castVoteAction and shows optimistic confirmed state on success.
 * Spec: architecture.md §2 (log_votes insert → trg_auto_verify trigger)
 */
export default function VoteButton({ logId, logOwnerId, voterId, hasVoted }: VoteButtonProps) {
  const [voted, setVoted] = useState(hasVoted);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTrans] = useTransition();

  async function handleVote() {
    setError(null);
    startTrans(async () => {
      const res = await castVoteAction(logId, logOwnerId, voterId);
      if (res.success) {
        setVoted(true);
      } else {
        setError(res.error);
      }
    });
  }

  if (voted) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-semibold text-[#16A34A] flex-shrink-0">
        <CheckCircle size={13} />
        Verified
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
      <button
        onClick={handleVote}
        disabled={isPending}
        className="flex items-center justify-center gap-1.5 bg-[#111827] text-white text-xs font-semibold px-4 py-2.5 rounded-xl hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
      >
        {isPending ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <ThumbsUp size={12} />
        )}
        Verify
      </button>
      {error && (
        <span className="text-[10px] text-[#EF4444] max-w-[120px] text-right leading-tight">
          {error}
        </span>
      )}
    </div>
  );
}
