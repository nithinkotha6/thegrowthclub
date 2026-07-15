import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/server';
import Sidebar from '@/components/Sidebar';
import MobileBottomNav from '@/components/MobileBottomNav';
import SettingsClient from '@/components/SettingsClient';
 
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
    .order('created_at', { ascending: false });
 
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
        <SettingsClient session={session} initialDefinitions={definitions || []} />
      </main>
      <MobileBottomNav />
    </div>
  );
}
