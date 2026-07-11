import { ThumbsUp, ClipboardList } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import VoteButton from './VoteButton';

type PendingLog = {
  id: string;
  value: number;
  unit: string;
  metric_slug: string;
  user_id: string;
  logged_at: string;
  profiles: { full_name: string | null } | null;
  vote_count: number;
};

/**
 * Server Component — peer-review queue for this group.
 * Fetches pending logs (excluding the current user's own logs),
 * annotates each with its current vote count, then renders the queue.
 * Spec: Features.md §6, architecture.md §2 (log_votes, trg_auto_verify).
 */
export default async function VotingPanel({
  groupId,
  userId,
}: {
  groupId: string;
  userId: string;
}) {
  const supabase = await createClient();

  // Fetch pending logs for this group, excluding the current user's own logs
  const { data: rawLogs } = await supabase
    .from('metric_logs')
    .select(`
      id,
      value,
      unit,
      metric_slug,
      user_id,
      logged_at,
      profiles!inner ( full_name )
    `)
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .neq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(10);

  const logs = (rawLogs ?? []) as unknown as Omit<PendingLog, 'vote_count'>[];

  if (logs.length === 0) return null;

  // Fetch vote counts for these logs in one query
  const logIds = logs.map((l) => l.id);
  const { data: votes } = await supabase
    .from('log_votes')
    .select('log_id')
    .in('log_id', logIds);

  // Count votes per log_id
  const voteCounts: Record<string, number> = {};
  for (const vote of votes ?? []) {
    voteCounts[vote.log_id] = (voteCounts[vote.log_id] ?? 0) + 1;
  }

  // Check which logs the current user has already voted on
  const { data: myVotes } = await supabase
    .from('log_votes')
    .select('log_id')
    .in('log_id', logIds)
    .eq('user_id', userId);

  const myVotedSet = new Set((myVotes ?? []).map((v) => v.log_id));

  const pending: PendingLog[] = logs.map((l) => ({
    ...l,
    vote_count: voteCounts[l.id] ?? 0,
  }));

  return (
    <div className="rounded-[24px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-[#6B7280]" />
          <h2 className="text-base font-bold text-[#111827]">Verify Activities</h2>
        </div>
        <span className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full">
          {pending.length} pending
        </span>
      </div>

      {/* Pending log list */}
      <ul className="flex flex-col gap-3" aria-label="Pending activities for review">
        {pending.map((log) => {
          const name  = log.profiles?.full_name?.split(' ')[0] ?? 'Athlete';
          const slug  = log.metric_slug.replace(/_/g, ' ');
          const date  = new Date(log.logged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const hasVoted = myVotedSet.has(log.id);

          return (
            <li
              key={log.id}
              className="flex items-center gap-3 rounded-2xl bg-[#F7F8FA] px-4 py-3"
            >
              {/* Avatar initial */}
              <div className="w-8 h-8 rounded-full bg-[#1A1A1A] flex-shrink-0 flex items-center justify-center">
                <span className="text-[#CEFF00] text-xs font-black">
                  {log.profiles?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[#111827] font-semibold truncate">
                  {name}
                  <span className="font-normal text-[#6B7280]"> · {slug}</span>
                </p>
                <p className="text-[11px] text-[#6B7280] tabular-nums">
                  {log.value} {log.unit} · {date}
                </p>
              </div>

              {/* Vote count badge */}
              <span className="flex items-center gap-1 text-[11px] font-bold text-[#6B7280] flex-shrink-0">
                <ThumbsUp size={11} />
                {log.vote_count}/3
              </span>

              {/* Vote button — client component */}
              <VoteButton
                logId={log.id}
                logOwnerId={log.user_id}
                voterId={userId}
                hasVoted={hasVoted}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
