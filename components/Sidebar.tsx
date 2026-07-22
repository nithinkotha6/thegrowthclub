'use client';

import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Trophy,
  Users,
  LogOut,
  Image,
  Watch,
  Settings,
} from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import UserAvatar from '@/components/UserAvatar';

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard',   href: '/dashboard' },
  { icon: Trophy,          label: 'Challenges',  href: '/dashboard/challenges' },
  { icon: Users,           label: 'Gang',        href: '/dashboard/gang' },
  { icon: Watch,           label: 'Wearables',   href: '/dashboard/wearables' },
  { icon: Image,           label: 'Memories',    href: '/dashboard/memories' },
  { icon: Settings,        label: 'Settings',    href: '/settings/metrics' },
];

interface SidebarProps {
  userName:     string;
  groupName:    string;
  userId:       string;
  totalXp:      number;
  currentLevel: number;
  avatarUrl?:   string | null;
}

/**
 * Dark-theme left sidebar — client component using dynamic pathname.
 * bg: #0A0A0A | accent: #CEFF00 (Neon Lime)
 */
export default function Sidebar({ userName, groupName, totalXp, currentLevel, avatarUrl }: SidebarProps) {
  const pathname = usePathname();

  // Quadratic XP level progression (matching award_xp_on_verify trigger formula)
  // Level = floor(1 + sqrt(xp / 500)) + 1
  const currentLvl = currentLevel ?? 1;
  let xpBarPct = 0;
  if (currentLvl >= 2) {
    const xpMinCurrent = 500 * Math.pow(currentLvl - 2, 2);
    const xpMinNext    = 500 * Math.pow(currentLvl - 1, 2);
    const xpRange      = xpMinNext - xpMinCurrent;
    const xpProgress   = totalXp - xpMinCurrent;
    xpBarPct = xpRange > 0 ? Math.min(100, Math.max(0, (xpProgress / xpRange) * 100)) : 0;
  } else {
    xpBarPct = 100;
  }

  return (
    <aside
      className="hidden md:flex flex-col w-[240px] min-h-screen bg-[#0A0A0A] px-4 py-6 flex-shrink-0"
      aria-label="Sidebar navigation"
    >
      {/* ── Brand Logo Header ── */}
      <div className="flex items-center gap-3 px-2 mb-6">
        <img
          src="/logo.jpg"
          alt="The Growth Club Logo"
          className="w-9 h-9 rounded-xl object-cover border border-[#CEFF00]/30 shadow-sm flex-shrink-0"
        />
        <div className="flex flex-col min-w-0">
          <span className="text-white font-black text-xs tracking-tight uppercase leading-none truncate">
            The Growth Club
          </span>
          <span className="text-[#CEFF00] text-[9px] font-bold tracking-wider uppercase mt-1">
            Train. Compete. Grow.
          </span>
        </div>
      </div>

      {/* ── Primary Navigation ───────────────────────────────────── */}
      <nav className="flex flex-col gap-1 flex-1" aria-label="Primary">
        {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
          // Exact match for dashboard home, prefix match for others
          const active = href === '/dashboard' ? pathname === href : pathname?.startsWith(href) && href !== '#';
          return (
            <a
              key={label}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                active
                  ? 'text-[#CEFF00] border-l-2 border-[#CEFF00] pl-[10px] bg-white/5'
                  : 'text-[#9CA3AF] hover:text-white hover:bg-white/5',
              ].join(' ')}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </a>
          );
        })}
      </nav>

      {/* ── Live User Profile Block ──────────────────────────────── */}
      <div className="mt-auto mb-4 px-2">
        {/* Group badge */}
        <div className="mb-3">
          <span className="inline-flex items-center gap-1.5 bg-[#CEFF00]/10 border border-[#CEFF00]/20 text-[#CEFF00] rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-[#CEFF00]" aria-hidden="true" />
            {groupName}
          </span>
        </div>

        {/* Avatar + name + level */}
        <div className="flex items-center gap-3 mb-3">
          <UserAvatar
            user={{ avatar_url: avatarUrl, full_name: userName, nickname: userName }}
            size="lg"
            className="flex-shrink-0"
          />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-white text-sm font-semibold truncate">{userName}</span>
            <span className="text-[#6B7280] text-xs">{groupName}</span>
          </div>
        </div>

        {/* XP progress bar — live data from profiles table */}
        <div>
          <div
            className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden"
            role="progressbar"
            aria-label={`XP progress — Level ${currentLevel}`}
            aria-valuenow={xpBarPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-[#CEFF00] transition-[width] duration-500 ease-out"
              style={{ width: `${xpBarPct}%` }}
            />
          </div>
          <p className="text-right text-[#6B7280] text-[10px] mt-1">
            {totalXp.toLocaleString()} XP · Lv {currentLevel}
          </p>
        </div>
      </div>

      {/* ── Switch User (Logout) ────────────────────────────────── */}
      <button
        id="switch-user-sidebar-btn"
        onClick={() => {
          localStorage.removeItem('kiosk_session');
          logoutAction();
        }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors group cursor-pointer"
        aria-label="Switch user and clear session"
      >
        <span className="group-hover:rotate-180 transition-transform duration-300">🔄</span>
        Switch User
      </button>

      {/* ── Promotional Poster ───────────────────────────────────── */}
      <div
        className="mt-3 rounded-2xl bg-[#1A1A1A] border border-white/10 px-4 py-5 flex flex-col items-center justify-center min-h-[96px]"
        aria-label="Promotional poster"
      >
        <p
          className="text-[#CEFF00] font-black text-lg tracking-tight uppercase text-center leading-tight"
          aria-label="Just show up"
        >
          JUST<br />SHOW UP.
        </p>
      </div>
    </aside>
  );
}
