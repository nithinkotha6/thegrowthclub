'use server';

import { createClient as createBaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

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
 * Inserts a vote row for `logId` by `userId`.
 * Enforces:
 *  - No self-voting (log owner cannot vote).
 *  - No double-voting (unique peers can vote only once).
 *  - Automatically verifies status to 'verified' when >= 3 unique votes exist.
 */
export async function castVoteAction(
  logId: string,
  logOwnerId: string,
  voterId: string,
): Promise<VoteResult> {
  try {
    if (String(logOwnerId) === String(voterId)) {
      return { success: false, error: 'You cannot verify your own activity.' };
    }

    const supabase = getAdminClient();

    // Check if already voted (double-voting check)
    const { data: existing, error: checkError } = await supabase
      .from('log_votes')
      .select('id')
      .eq('log_id', logId)
      .eq('user_id', voterId)
      .maybeSingle();

    if (checkError) {
      console.error('VOTE CHECK ERROR:', checkError.message);
    }

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
    const { data: votes, error: votesError } = await supabase
      .from('log_votes')
      .select('user_id')
      .eq('log_id', logId);

    if (votesError) {
      console.error('VOTES COUNT FETCH ERROR:', votesError.message);
    }

    const uniqueVoterIds = new Set(votes?.map(v => String(v.user_id)));

    if (uniqueVoterIds.size >= 3) {
      // Transition status to verified
      const { error: updateError } = await supabase
        .from('metric_logs')
        .update({ status: 'verified' })
        .eq('id', logId);

      if (updateError) {
        console.error('STATUS UPDATE ERROR:', updateError.message);
      }
    }

    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: any) {
    console.error('castVoteAction exception:', err);
    return { success: false, error: err?.message || 'Server error occurred during verification.' };
  }
}

/**
 * Server Action: cast peer approval vote on a pending activity log.
 */
export async function approveActivityAction(
  logId: string,
  voterId: string,
  logOwnerId: string,
): Promise<VoteResult> {
  return castVoteAction(logId, logOwnerId, voterId);
}

/**
 * Server Action: update log status to 'rejected'.
 */
export async function rejectActivityAction(
  logId: string,
  voterId: string,
): Promise<VoteResult> {
  try {
    const supabase = getAdminClient();
    const { error } = await supabase
      .from('metric_logs')
      .update({ status: 'rejected' })
      .eq('id', logId);

    if (error) {
      console.error('[rejectActivityAction] Error:', error.message);
      return { success: false, error: 'Failed to reject activity.' };
    }

    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: any) {
    console.error('[rejectActivityAction] exception:', err);
    return { success: false, error: err?.message || 'Server error occurred.' };
  }
}

/**
 * Server Action: safely delete a metric log if caller matches owner.
 * Performs cascading deletes defensively to clear children tables.
 */
export async function deleteActivityAction(
  logId: string,
  userId: string,
): Promise<VoteResult> {
  try {
    const supabase = getAdminClient();

    // 1. Defensively delete child records from log_votes first to prevent foreign key errors
    const { error: votesError } = await supabase
      .from('log_votes')
      .delete()
      .eq('log_id', logId);

    if (votesError) {
      console.error('[deleteActivityAction] Failed to delete child votes:', votesError.message);
    }

    // 2. Delete parent record from metric_logs
    const { error: logError } = await supabase
      .from('metric_logs')
      .delete()
      .eq('id', logId)
      .eq('user_id', userId);

    if (logError) {
      console.error('[deleteActivityAction] Log delete error:', logError.message);
      return { success: false, error: `Failed to delete activity: ${logError.message}` };
    }

    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: any) {
    console.error('[deleteActivityAction] Exception:', err);
    return { success: false, error: err?.message || 'Server error occurred during deletion.' };
  }
}
