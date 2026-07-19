import { cookies }               from 'next/headers';
import { redirect }              from 'next/navigation';
import Sidebar                   from '@/components/Sidebar';
import MobileBottomNav           from '@/components/MobileBottomNav';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';
import { createClient }          from '@/lib/supabase/server';

/**
 * Dashboard shell layout — async Server Component.
 * Reads the `app_session` cookie, decodes the session, and passes
 * { userId, groupId, groupName, userName } to child pages and the Sidebar.
 *
 * The middleware already guarantees the cookie is present and valid by the
 * time this layout runs — but we decode again here to get the typed payload.
 * Spec: architecture.md §7, frontend.md §1
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Decode the session cookie (middleware already verified it's valid)
  const cookieStore = await cookies();
  const token       = cookieStore.get(SESSION_COOKIE)?.value;
  const session     = token ? await decodeSession(token) : null;

  // Safety net — should never happen if middleware is correctly configured
  if (!session) redirect('/');

  // Fetch live XP + level + avatar for the sidebar profile block
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('total_xp, current_level, avatar_url')
    .eq('id', session.userId)
    .single();

  const totalXp      = profile ? (profile.total_xp as number) : 0;
  const currentLevel = profile ? (profile.current_level as number) : 1;
  const avatarUrl     = profile ? (profile.avatar_url as string | null) : null;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — receives live session + XP data */}
      <Sidebar
        userName={session.userName}
        groupName={session.groupName}
        userId={session.userId}
        totalXp={totalXp}
        currentLevel={currentLevel}
        avatarUrl={avatarUrl}
      />

      {/* Light main content — pb-28 on mobile to clear fixed bottom nav + safe areas */}
      <main
        className="flex-1 bg-[#F7F8FA] min-w-0 overflow-y-auto pb-28 pb-safe md:pb-0 flex flex-col"
        id="main-content"
      >


        {/* Page-specific content — session passed via searchParams or server context */}
        {children}
      </main>

      <MobileBottomNav />
    </div>
  );
}

