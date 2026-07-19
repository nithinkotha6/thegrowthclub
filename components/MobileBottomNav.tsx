'use client';

import { LayoutDashboard, Trophy, Users, Image, Watch } from 'lucide-react';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { icon: LayoutDashboard, label: 'Home',        href: '/dashboard' },
  { icon: Trophy,          label: 'Challenges',  href: '/dashboard/challenges' },
  { icon: Watch,           label: 'Wearables',   href: '/dashboard/wearables' },
  { icon: Image,           label: 'Memories',    href: '/dashboard/memories' },
  { icon: Users,           label: 'Gang',        href: '/dashboard/gang' },
];

/**
 * Fixed bottom navigation bar — visible only on mobile (hidden md:hidden).
 * Mirrors the sidebar nav for small screens, excluding dead links and settings.
 */
export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0A0A0A] border-t border-white/10 flex items-center justify-around px-2 pb-safe min-h-[64px]"
      aria-label="Mobile navigation"
    >
      {ITEMS.map(({ icon: Icon, label, href }) => {
        const active = href === '/dashboard' ? pathname === href : pathname?.startsWith(href);
        return (
          <a
            key={label}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="flex flex-col items-center justify-center gap-1 flex-1 h-14 transition-colors duration-150 ease-out cursor-pointer"
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
