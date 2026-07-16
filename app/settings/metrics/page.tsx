import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/server';
import Sidebar from '@/components/Sidebar';
import MobileBottomNav from '@/components/MobileBottomNav';
import SettingsClient, { type GroupMemberRow, type AdminLogItem } from '@/components/SettingsClient';
import { getBotMuteStatus } from '@/app/actions/admin';

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session) redirect('/');

  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('total_xp, current_level')
    .eq('id', session.userId)
    .single();

  const totalXp = profile ? (profile.total_xp as number) : 0;
  const currentLevel = profile ? (profile.current_level as number) : 1;

  const { data: definitions } = await supabase
    .from('metric_definitions')
    .select('*')
    .eq('group_id', session.groupId)
    .order('created_at', { ascending: false });

  // Query group members to pass to SettingsClient
  const { data: membersRaw } = await supabase
    .from('group_members')
    .select(`
      user_id,
      role,
      profiles!inner ( id, nickname, full_name, avatar_url, phone_number )
    `)
    .eq('group_id', session.groupId);

  const botMuted = await getBotMuteStatus();

  // Query users who logged workouts in the last 7 days to flag slacking members
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data: recentActiveLogs } = await supabase
    .from('metric_logs')
    .select('user_id')
    .eq('group_id', session.groupId)
    .eq('status', 'verified')
    .gte('logged_at', sevenDaysAgo.toISOString());

  const activeUserIdsInLast7Days = Array.from(
    new Set((recentActiveLogs || []).map((l) => l.user_id))
  );

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
        className="flex-1 bg-[#F7F8FA] min-w-0 overflow-y-auto pb-28 pb-safe md:pb-0 flex flex-col"
        id="main-content"
      >
        <SettingsClient 
          session={session} 
          initialDefinitions={definitions || []} 
          initialMembers={(membersRaw || []) as unknown as GroupMemberRow[]}
          initialBotMuted={botMuted}
          activeUserIdsInLast7Days={activeUserIdsInLast7Days}
          initialLogs={(recentLogsRaw || []) as unknown as AdminLogItem[]}
        />
      </main>
      <MobileBottomNav />
    </div>
  );
}
