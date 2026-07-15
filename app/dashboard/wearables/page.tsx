import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';
import WearablesClientPage from '@/components/WearablesClientPage';

export default async function WearablesPage() {
  // ── Session Authentication ─────────────────────────────────────────────
  const cookieStore = await cookies();
  const token       = cookieStore.get(SESSION_COOKIE)?.value;
  const session     = token ? await decodeSession(token) : null;
  if (!session) redirect('/');

  const { groupId, userId, userName } = session;

  const supabase = createAdminClient();

  // 1. Fetch connection status for active user
  const { data: connection } = await supabase
    .from('wearable_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  // 2. Fetch the active user's current automated scores (most recent logs)
  const { data: personalLogs } = await supabase
    .from('metric_logs')
    .select('metric_slug, value, logged_at')
    .eq('user_id', userId)
    .eq('status', 'verified')
    .in('metric_slug', ['wearable_sleep', 'wearable_steps', 'wearable_resting_hr'])
    .order('logged_at', { ascending: false });

  // 3. Fetch all group member profiles
  const { data: membersRaw } = await supabase
    .from('group_members')
    .select(`
      user_id,
      profiles!inner ( id, full_name, nickname, avatar_url, total_xp, current_level )
    `)
    .eq('group_id', groupId);

  // 4. Fetch group logs for the last 30 days (for Weekly & Monthly scoreboards)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: groupLogs } = await supabase
    .from('metric_logs')
    .select(`
      id,
      user_id,
      metric_slug,
      value,
      logged_at,
      profiles:user_id ( id, nickname, full_name, avatar_url, total_xp, current_level )
    `)
    .eq('group_id', groupId)
    .eq('status', 'verified')
    .in('metric_slug', ['wearable_sleep', 'wearable_steps', 'wearable_resting_hr'])
    .gte('logged_at', thirtyDaysAgo.toISOString())
    .order('logged_at', { ascending: false });

  return (
    <WearablesClientPage
      connection={connection || null}
      personalLogs={personalLogs || []}
      members={(membersRaw ?? []).map(m => m.profiles)}
      groupLogs={groupLogs || []}
      userId={userId}
      groupId={groupId}
    />
  );
}
