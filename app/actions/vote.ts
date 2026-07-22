'use server';

import { createClient as createBaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession } from '@/lib/session';
import { logger } from '@/lib/logger';

function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey.trim() === '') {
    console.warn('WARNING: SUPABASE_SERVICE_ROLE_KEY is not defined. Falling back to anon client.');
    return createBaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return createBaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export type VoteResult = { success: true } | { success: false; error: string };

/**
 * Shared Mutation Handler: verify or reject an activity log.
 * Enforces strict peer voting rules and unique voting.
 */
export async function processVerificationVote({
  logId,
  vote,
}: {
  logId: string;
  vote: 'approve' | 'reject';
}): Promise<VoteResult> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const session = token ? await decodeSession(token) : null;
    let voterId = session?.userId;

    // Check supabase auth just in case
    if (!voterId) {
      const supabase = getAdminClient();
      const { data: { user } } = await supabase.auth.getUser();
      voterId = user?.id;
    }

    if (!voterId) {
      return { success: false, error: 'Unauthorized: Session not found.' };
    }

    const supabase = getAdminClient();

    // Fetch the log details to verify ownership
    const { data: log, error: fetchErr } = await supabase
      .from('metric_logs')
      .select('user_id, group_id, status')
      .eq('id', logId)
      .maybeSingle();
 
    if (fetchErr || !log) {
      return { success: false, error: 'Activity not found.' };
    }

    let voterGroupId = session?.groupId;
    if (!voterGroupId && voterId) {
      const { data: member } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', voterId)
        .limit(1)
        .maybeSingle();
      voterGroupId = member?.group_id;
    }

    if (String(log.group_id) !== String(voterGroupId)) {
      return { success: false, error: 'Unauthorized: You can only vote on activities in your own group.' };
    }
 
    // Strict Peer Voting Rules: Authors cannot approve their own pending logs
    if (String(log.user_id) === String(voterId)) {
      return { success: false, error: 'You cannot verify your own activity.' };
    }

    if (vote === 'approve') {
      // Check if already voted (double-voting check)
      const { data: existing } = await supabase
        .from('log_votes')
        .select('id')
        .eq('log_id', logId)
        .eq('user_id', voterId)
        .maybeSingle();

      if (existing) {
        return { success: false, error: 'You already verified this activity.' };
      }

      // Insert vote
      const { error: insertError } = await supabase
        .from('log_votes')
        .insert({ log_id: logId, user_id: voterId });

      if (insertError) {
        console.error('VOTE INSERT ERROR:', insertError.message);
        return { success: false, error: insertError.message ?? 'Failed to cast vote.' };
      }

      // Check count of unique votes dynamically
      const { data: votes } = await supabase
        .from('log_votes')
        .select('user_id')
        .eq('log_id', logId);

      const uniqueVoterIds = new Set(votes?.map(v => String(v.user_id)));

      if (uniqueVoterIds.size >= 3) {
        // Transition status to verified
        await supabase
          .from('metric_logs')
          .update({ status: 'verified' })
          .eq('id', logId);
      }
    } else if (vote === 'reject') {
      // First, delete child records from log_votes
      await supabase
        .from('log_votes')
        .delete()
        .eq('log_id', logId);

      // Second, delete parent record from metric_logs
      const { error: logError } = await supabase
        .from('metric_logs')
        .delete()
        .eq('id', logId);

      if (logError) {
        return { success: false, error: `Failed to reject activity: ${logError.message}` };
      }
    }

    // Revalidate layout to ensure graph, podium, rankings, and all sibling components
    // reflect the updated metric data simultaneously. Using 'layout' ensures all routes
    // sharing this data refresh together, maintaining consistency across the app.
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err: any) {
    console.error('processVerificationVote exception:', err);
    return { success: false, error: err?.message || 'Server error occurred.' };
  }
}

/**
 * Inserts a vote row for `logId` by `userId`.
 * Calls processVerificationVote for backwards compatibility.
 */
export async function castVoteAction(
  logId: string,
  logOwnerId: string,
  voterId: string,
): Promise<VoteResult> {
  return processVerificationVote({ logId, vote: 'approve' });
}

/**
 * Server Action: cast peer approval vote on a pending activity log.
 */
export async function approveActivityAction(
  logId: string,
  voterId: string,
  logOwnerId: string,
): Promise<VoteResult> {
  return processVerificationVote({ logId, vote: 'approve' });
}

/**
 * Server Action: hard delete / reject pending activity log, clearing child tables.
 */
export async function rejectActivityAction(
  logId: string,
  voterId: string,
): Promise<VoteResult> {
  return processVerificationVote({ logId, vote: 'reject' });
}

/**
 * Server Action: safely delete a metric log if caller matches owner.
 * Performs cascading deletes defensively to clear children tables.
 */
export async function deleteActivityAction(
  logId: string,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let currentUserId = userId;

    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const session = token ? await decodeSession(token) : null;
    currentUserId = currentUserId || session?.userId;

    // Check supabase auth just in case
    if (!currentUserId) {
      const supabase = getAdminClient();
      const { data: { user } } = await supabase.auth.getUser();
      currentUserId = user?.id;
    }

    if (!currentUserId) {
      logger.warn('[deleteActivityAction] Unauthorized attempt - missing session', { logId });
      return { success: false, error: 'Unauthorized: Session not found.' };
    }

    const supabase = getAdminClient();

    // Query target record from metric_logs by id
    const { data: record, error: fetchError } = await supabase
      .from('metric_logs')
      .select('user_id')
      .eq('id', logId)
      .maybeSingle();

    if (fetchError || !record) {
      logger.warn('[deleteActivityAction] Activity record not found', { logId });
      return { success: false, error: 'Activity record not found.' };
    }

    // Permission check
    if (String(record.user_id) !== String(currentUserId)) {
      logger.warn('[deleteActivityAction] Unauthorized deletion attempt', { logId, recordUserId: record.user_id, currentUserId });
      return { success: false, error: 'Unauthorized: You can only delete activities you logged.' };
    }

    // Delete parent record from metric_logs (database ON DELETE CASCADE handles child log_votes)
    const { error: logError } = await supabase
      .from('metric_logs')
      .delete()
      .eq('id', logId);

    if (logError) {
      logger.error('[deleteActivityAction] Activity deletion failed', { logId, error: logError.message });
      return { success: false, error: `Failed to delete activity: ${logError.message}` };
    }

    logger.info('[deleteActivityAction] Activity deleted', { logId });

    // Revalidate layout to ensure graph, podium, rankings, and all sibling components
    // reflect the updated metric data simultaneously. Using 'layout' ensures all routes
    // sharing this data refresh together, maintaining consistency across the app.
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('[deleteActivityAction] Unexpected error deleting activity', { logId, error: errorMsg });
    return { success: false, error: 'Failed to delete activity.' };
  }
}
