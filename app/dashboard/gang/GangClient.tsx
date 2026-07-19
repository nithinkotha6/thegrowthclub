'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import useSWR from 'swr';
import { fetchGangRoster, GangProfile } from '@/app/actions/gang';
import UserAvatar from '@/components/UserAvatar';
import StreakBadge from '@/components/StreakBadge';

interface GangClientProps {
  initialData: Awaited<ReturnType<typeof fetchGangRoster>>;
}

export default function GangClient({ initialData }: GangClientProps) {
  const router = useRouter();
  const { data, error } = useSWR('gang-roster', () => fetchGangRoster(), {
    fallbackData: initialData,
    revalidateOnFocus: false,
    revalidateOnMount: false,
    dedupingInterval: 3600000, // 1 hour stale time cache
  });

  const roster = data?.success ? data.roster : [];
  const groupName = data?.success ? data.groupName : 'Texas Buds';
  const fetchError = error ? 'Failed to fetch roster data.' : (!data?.success && data?.error ? data.error : null);

  return (
    <div className="p-4 md:p-8 flex-1 flex flex-col bg-[#F7F8FA] min-w-0 overflow-y-auto">
      {/* ── Group Roster Header ──────────────────────────────────────── */}
      <header className="mb-6">
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-[#111827] leading-none flex items-center gap-3">
          <Users className="text-[#CEFF00] w-10 h-10 stroke-[2.5]" />
          Gang
        </h1>
        <p className="mt-2 text-[11px] font-bold tracking-[0.18em] text-[#6B7280] uppercase">
          {groupName} Roster · {roster.length} Member{roster.length !== 1 ? 's' : ''}
        </p>
        <svg width="250" height="14" viewBox="0 0 250 14" fill="none" aria-hidden="true" className="mt-1">
          <path d="M2 10 C35 3, 80 13, 125 7 S190 2, 248 6" stroke="#CEFF00" strokeWidth="2.8" strokeLinecap="round" fill="none" />
        </svg>
      </header>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-xs font-bold mb-4">
          {fetchError}
        </div>
      )}

      {/* ── User Roster Grid ─────────────────────────────────────────── */}
      {roster.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
          {roster.map((profile: GangProfile, index) => {
            return (
              <div
                key={profile.id}
                className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col items-center text-center p-6 transition-[transform,box-shadow] duration-200 ease-out hover:shadow-md hover:-translate-y-1 animate-in fade-in zoom-in-95 duration-300"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                {/* Large Centered Reusable UserAvatar — tap to view profile */}
                <button
                  type="button"
                  onClick={() => router.push(`/profile/${profile.id}`)}
                  className="mb-2 relative cursor-pointer"
                  aria-label={`View ${profile.nickname || profile.full_name}'s profile`}
                >
                  <UserAvatar
                    user={profile}
                    size="3xl"
                    className="shadow-inner"
                    priority={index < 4}
                  />
                  <div className="absolute -bottom-1.5 -left-1.5 bg-[#111827] border-2 border-white text-[10px] font-black text-[#CEFF00] rounded-full w-6 h-6 flex items-center justify-center shadow tabular-nums">
                    {profile.current_level}
                  </div>
                  <StreakBadge count={profile.streak_count} />
                </button>

                {/* Name Details */}
                <div className="flex flex-col items-center text-center w-full min-w-0">
                  <h3 className="text-slate-900 font-black text-base md:text-lg truncate w-full">
                    {profile.nickname || profile.full_name}
                  </h3>
                  <p className="text-slate-500 uppercase text-xs font-semibold mt-0.5 truncate w-full">
                    {profile.full_name || 'Club Member'}
                  </p>
                </div>

                {/* XP and Level badging */}
                <div className="mt-4 flex items-center justify-center gap-1.5 flex-wrap w-full">
                  <span className="bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-extrabold px-3 py-1 rounded-full tracking-wide tabular-nums">
                    Lvl {profile.current_level}
                  </span>
                  <span className="bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-bold px-3 py-1 rounded-full tabular-nums tracking-tight">
                    {profile.total_xp.toLocaleString()} XP
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-card shadow-raised p-12 text-center flex flex-col items-center justify-center gap-2">
          <Users size={32} className="text-slate-400" />
          <p className="text-sm font-bold text-slate-900">Your gang has no athletes yet.</p>
          <p className="text-xs text-slate-500">Use your group invite code during signup to add members!</p>
        </div>
      )}
    </div>
  );
}
