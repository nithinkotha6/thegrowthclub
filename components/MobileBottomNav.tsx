'use client';

import { LayoutDashboard, Activity, BarChart2, Users, Settings } from 'lucide-react';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { icon: LayoutDashboard, label: 'Home',        href: '/dashboard' },
  { icon: Activity,        label: 'Activity',    href: '#' },
  { icon: BarChart2,       label: 'Performance', href: '#' },
  { icon: Users,           label: 'Community',   href: '#' },
  { icon: Settings,        label: 'Settings',    href: '#' },
];

/**
 * Fixed bottom navigation bar — visible only on mobile (hidden md:hidden).
 * Mirrors the sidebar nav for small screens.
 */
export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0A0A0A] border-t border-white/10 flex items-center justify-around px-2 h-16 safe-area-pb"
      aria-label="Mobile navigation"
    >
      {ITEMS.map(({ icon: Icon, label, href }) => {
        const active = pathname === href;
        return (
          <a
            key={label}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="flex flex-col items-center gap-1 flex-1 py-2 transition-colors"
          >
            <Icon
              size={20}
              strokeWidth={active ? 2.5 : 1.8}
              style={{ color: active ? '#CEFF00' : '#9CA3AF' }}
            />
            <span
              className="text-[9px] font-semibold tracking-wide"
              style={{ color: active ? '#CEFF00' : '#9CA3AF' }}
            >
              {label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
