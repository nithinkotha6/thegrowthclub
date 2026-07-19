import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import Sidebar from '@/components/Sidebar';
import MobileBottomNav from '@/components/MobileBottomNav';
import SettingsClient, { type GroupMemberRow, type AdminLogItem } from '@/components/SettingsClient';
import { getBotMuteStatus } from '@/app/actions/admin';

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session) redirect('/');

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('total_xp, current_level')
    .eq('id', session.userId)
    .single();

  const totalXp = profile ? (profile.total_xp as number) : 0;
  const currentLevel = profile ? (profile.current_level as number) : 1;

  // Query group members defensively (first with role, fall back to simple if missing)
  let membersRaw: unknown[] | null = null;
  const { data: firstTryMembers, error: firstTryError } = await supabase
    .from('group_members')
    .select(`
      user_id,
      role,
      profiles!inner ( id, nickname, full_name, avatar_url, is_active )
    `)
    .eq('group_id', session.groupId);

  if (firstTryError) {
    console.warn('[settings/metrics] First members query failed (likely missing role), retrying simple columns:', firstTryError.message);
    const { data: secondTryMembers } = await supabase
      .from('group_members')
      .select(`
        user_id,
        profiles!inner ( id, nickname, full_name, avatar_url, is_active )
      `)
      .eq('group_id', session.groupId);
    membersRaw = secondTryMembers;
  } else {
    membersRaw = firstTryMembers;
  }

  const botMuted = await getBotMuteStatus();

  // Fetch all recent logs of the group for the God Mode Log Editor
  const { data: recentLogsRaw } = await supabase
    .from('metric_logs')
    .select(`
      id,
      value,
      unit,
      metric_slug,
      logged_at,
      status,
      user_id,
      profiles!inner ( id, nickname, full_name )
    `)
    .eq('group_id', session.groupId)
    .order('logged_at', { ascending: false })
    .limit(100);

  // Fetch bot persistent state for the group
  const { data: persistentState } = await supabase
    .from('bot_persistent_state')
    .select('persistent_mood, target_user_id')
    .eq('group_id', session.groupId)
    .maybeSingle();

  const initialPersistentMood = persistentState?.persistent_mood || 'Normal';
  const initialPersistentTarget = persistentState?.target_user_id || '';

  const { data: groupRow } = await supabase
    .from('groups')
    .select('id, name, invite_code, whatsapp_instance_id, whatsapp_token, whatsapp_group_id')
    .eq('id', session.groupId)
    .maybeSingle();

  return (
    <div className="flex min-h-screen">
      <Sidebar
        userName={session.userName}
        groupName={session.groupName}
        userId={session.userId}
        totalXp={totalXp}
        currentLevel={currentLevel}
      />
      <main
        className="flex-1 bg-[#F7F8FA] min-w-0 overflow-y-auto pb-28 pb-safe md:pb-0 flex flex-col text-slate-900"
        id="main-content"
      >
        <SettingsClient 
          session={session} 
          initialMembers={(membersRaw || []) as unknown as GroupMemberRow[]}
          initialBotMuted={botMuted}
          initialLogs={(recentLogsRaw || []) as unknown as AdminLogItem[]}
          initialPersistentMood={initialPersistentMood}
          initialPersistentTarget={initialPersistentTarget}
          initialGroupDetails={groupRow || null}
        />
      </main>
      <MobileBottomNav />
    </div>
  );
}
