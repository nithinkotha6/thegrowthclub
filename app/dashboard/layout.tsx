import { Suspense }              from 'react';
import { cookies }               from 'next/headers';
import { redirect }              from 'next/navigation';
import Sidebar                   from '@/components/Sidebar';
import MobileBottomNav           from '@/components/MobileBottomNav';
import LiveAchievementTicker     from '@/components/LiveAchievementTicker';
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

  // Fetch live XP + level for the sidebar profile block
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('total_xp, current_level')
    .eq('id', session.userId)
    .single();

  const totalXp      = (profile as any)?.total_xp      ?? 0;
  const currentLevel = (profile as any)?.current_level ?? 1;

  return (
    <div className="flex h-full min-h-screen">
      {/* Sidebar — receives live session + XP data */}
      <Sidebar
        userName={session.userName}
        groupName={session.groupName}
        userId={session.userId}
        totalXp={totalXp}
        currentLevel={currentLevel}
      />

      {/* Light main content — pb-16 on mobile to clear fixed bottom nav */}
      <main
        className="flex-1 bg-[#F7F8FA] min-w-0 overflow-y-auto pb-16 md:pb-0 flex flex-col"
        id="main-content"
      >
        {/* Live Achievement Ticker — full-bleed dark top bar */}
        <Suspense
          fallback={
            <div className="w-full h-9 bg-[#0A0A0A] border-b border-white/5 flex items-center px-3">
              <span className="text-[10px] font-black text-[#CEFF00] tracking-[0.2em] uppercase animate-pulse">
                LIVE
              </span>
            </div>
          }
        >
          {/* Pass groupId so ticker only shows logs from this group */}
          <LiveAchievementTicker groupId={session.groupId} />
        </Suspense>

        {/* Page-specific content — session passed via searchParams or server context */}
        {children}
      </main>

      <MobileBottomNav />
    </div>
  );
}

