import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';
import UserAvatar from '@/components/UserAvatar';

export default async function CommunityPage() {
  // ── Session Authentication ─────────────────────────────────────────────
  const cookieStore = await cookies();
  const token       = cookieStore.get(SESSION_COOKIE)?.value;
  const session     = token ? await decodeSession(token) : null;
  if (!session) redirect('/');

  const { groupId } = session;

  // ── Fetch Roster Data from Supabase ─────────────────────────────────────
  const supabase = await createClient();

  // 1. Fetch group details for the roster header
  const { data: group } = await supabase
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .single();

  // 2. Fetch all profiles linked to group members
  const { data: membersRaw } = await supabase
    .from('group_members')
    .select(`
      user_id,
      profiles!inner ( id, full_name, nickname, avatar_url, total_xp, current_level )
    `)
    .eq('group_id', groupId);

  // Extract profiles list sorted by total XP descending (leaderboard-like directory order)
  const roster = (membersRaw ?? [])
    .map((m: any) => m.profiles)
    .filter(Boolean)
    .sort((a: any, b: any) => b.total_xp - a.total_xp);

  return (
    <div className="p-4 md:p-8 flex-1 flex flex-col bg-[#F7F8FA] min-w-0 overflow-y-auto">
      {/* ── Group Roster Header ──────────────────────────────────────── */}
      <header className="mb-6">
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-[#111827] leading-none flex items-center gap-3">
          <Users className="text-[#CEFF00] w-10 h-10 stroke-[2.5]" />
          Community
        </h1>
        <p className="mt-2 text-[11px] font-bold tracking-[0.18em] text-[#6B7280] uppercase">
          {group?.name ?? 'Texas Buds'} Roster · {roster.length} Member{roster.length !== 1 ? 's' : ''}
        </p>
        <svg width="250" height="14" viewBox="0 0 250 14" fill="none" aria-hidden="true" className="mt-1">
          <path d="M2 10 C35 3, 80 13, 125 7 S190 2, 248 6" stroke="#CEFF00" strokeWidth="2.8" strokeLinecap="round" fill="none" />
        </svg>
      </header>

      {/* ── User Roster Grid ─────────────────────────────────────────── */}
      {roster.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
          {roster.map((profile: any, index) => {
            return (
              <div
                key={profile.id}
                className="bg-white rounded-[24px] border border-white/5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] p-5 flex flex-col items-center text-center transition-all duration-300 hover:shadow-md hover:-translate-y-1 animate-in fade-in zoom-in-95 duration-300"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Large Centered Reusable UserAvatar */}
                <div className="mb-4 relative">
                  <UserAvatar
                    user={profile}
                    size="xl"
                    className="shadow-inner"
                  />
                  <div className="absolute -bottom-1.5 -right-1.5 bg-[#111827] border-2 border-white text-[10px] font-black text-[#CEFF00] rounded-full w-6 h-6 flex items-center justify-center shadow">
                    {profile.current_level}
                  </div>
                </div>

                {/* Name Details */}
                <div className="flex flex-col w-full min-w-0">
                  <h3 className="font-extrabold text-sm text-[#111827] truncate w-full">
                    {profile.full_name}
                  </h3>
                  <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mt-0.5 truncate w-full">
                    {profile.nickname || 'Club Member'}
                  </p>
                </div>

                {/* XP and Level badging */}
                <div className="mt-4 flex items-center justify-center gap-1.5 flex-wrap w-full">
                  <span className="bg-[#CEFF00]/10 border border-[#CEFF00]/20 text-[#111827] text-[10px] font-extrabold px-3 py-1 rounded-full tracking-wide">
                    Lvl {profile.current_level}
                  </span>
                  <span className="bg-zinc-100 border border-zinc-200 text-zinc-600 text-[10px] font-bold px-3 py-1 rounded-full tabular-nums">
                    {profile.total_xp.toLocaleString()} XP
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-[24px] border border-white/5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] p-12 text-center flex flex-col items-center justify-center gap-2">
          <Users size={32} className="text-[#E5E7EB]" />
          <p className="text-sm font-bold text-[#9CA3AF]">Your community has no athletes yet.</p>
          <p className="text-xs text-[#D1D5DB]">Use your group invite code during signup to add members!</p>
        </div>
      )}
    </div>
  );
}
