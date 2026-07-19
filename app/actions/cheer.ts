'use server';

import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/server';

type CheerResult = { success: true; message: string } | { success: false; error: string };

/**
 * Server Action for sending cheers/taunts to a user on the leaderboard.
 * Guarded by session (ISO-08): the caller must have a valid session, and the
 * cheered user (`userId`) must belong to the caller's own group.
 * Currently logs the event on the server and returns a lightweight
 * notification message; no DB write or actual notification is sent yet.
 */
export async function sendCheer(userId: string, targetName: string, metricLabel: string): Promise<CheerResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  const supabase = createAdminClient(session.groupId);
  const { data: targetMembership } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('user_id', userId)
    .eq('group_id', session.groupId)
    .maybeSingle();

  if (!targetMembership) {
    return { success: false, error: 'Unauthorized: user not in your group.' };
  }

  console.log(`[Social Cheer] Cheer sent for ${metricLabel} to user ${targetName} (${userId})`);
  return {
    success: true,
    message: `Sent 🔥 to ${targetName}!`,
  };
}
