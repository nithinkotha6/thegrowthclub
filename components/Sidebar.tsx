'use client';

import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Activity,
  BarChart2,
  Users,
  Trophy,
  ShoppingBag,
  LogOut,
  Image,
  Watch,
} from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard',   href: '/dashboard' },
  { icon: Activity,        label: 'Activity',    href: '#' },
  { icon: BarChart2,       label: 'Leaderboard', href: '/dashboard/leaderboard' },
  { icon: Users,           label: 'Gang',        href: '/dashboard/gang' },
  { icon: Watch,           label: 'Wearables',   href: '/dashboard/wearables' },
  { icon: Image,           label: 'Memories',    href: '/dashboard/memories' },
  { icon: Trophy,          label: 'Challenges',  href: '#' },
  { icon: ShoppingBag,     label: 'Gear',        href: '#' },
];

interface SidebarProps {
  userName:     string;
  groupName:    string;
  userId:       string;
  totalXp:      number;
  currentLevel: number;
}

/**
 * Dark-theme left sidebar — client component using dynamic pathname.
 * bg: #0A0A0A | accent: #CEFF00 (Neon Lime)
 */
export default function Sidebar({ userName, groupName, totalXp, currentLevel }: SidebarProps) {
  const pathname = usePathname();

  // XP within the current level (each level = 1000 XP)
  const xpInLevel       = totalXp % 1000;
  const xpBarPct        = Math.min(100, xpInLevel / 10); // 0–100
  const initials = userName?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <aside
      className="hidden md:flex flex-col w-[240px] min-h-screen bg-[#0A0A0A] px-4 py-6 flex-shrink-0"
      aria-label="Sidebar navigation"
    >
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
          <div
            className="w-10 h-10 rounded-full bg-[#CEFF00] flex-shrink-0 flex items-center justify-center animate-pulse"
            aria-hidden="true"
          >
            <span className="text-[#0A0A0A] text-sm font-black">{initials}</span>
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-white text-sm font-semibold truncate">{userName}</span>
            <span className="text-[#6B7280] text-xs">The Growth Club</span>
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

      {/* ── Switch Group (Logout) ────────────────────────────────── */}
      <form action={logoutAction}>
        <button
          id="switch-group-btn"
          type="submit"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors group cursor-pointer"
          aria-label="Switch group and clear session"
        >
          <LogOut size={16} strokeWidth={2} className="group-hover:translate-x-[-2px] transition-transform" />
          Switch Group
        </button>
      </form>

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
