import {
  LayoutDashboard,
  Activity,
  BarChart2,
  Users,
  Trophy,
  ShoppingBag,
  Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Activity,        label: "Activity",  active: false },
  { icon: BarChart2,       label: "Performance", active: false },
  { icon: Users,           label: "Community", active: false },
  { icon: Trophy,          label: "Challenges", active: false },
  { icon: ShoppingBag,     label: "Gear",      active: false },
  { icon: Settings,        label: "Settings",  active: false },
];

/**
 * Dark-theme left sidebar.
 * Spec: frontend.md §1, Features.md §2
 * bg: #0A0A0A | accent: #CEFF00 (Neon Lime)
 */
export default function Sidebar() {
  return (
    <aside
      className="hidden md:flex flex-col w-[240px] min-h-screen bg-[#0A0A0A] px-4 py-6 flex-shrink-0"
      aria-label="Sidebar navigation"
    >
      {/* ── Primary Navigation ───────────────────────────────────── */}
      <nav className="flex flex-col gap-1 flex-1" aria-label="Primary">
        {NAV_ITEMS.map(({ icon: Icon, label, active }) => (
          <a
            key={label}
            href="#"
            aria-current={active ? "page" : undefined}
            className={[
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
              active
                ? "text-[#CEFF00] border-l-2 border-[#CEFF00] pl-[10px] bg-white/5"
                : "text-[#9CA3AF] hover:text-white hover:bg-white/5",
            ].join(" ")}
          >
            <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
            {label}
          </a>
        ))}
      </nav>

      {/* ── Gamified User Profile Block ───────────────────────────── */}
      <div className="mt-auto mb-4 px-2">
        {/* Avatar + name + level */}
        <div className="flex items-center gap-3 mb-3">
          {/* Avatar placeholder */}
          <div
            className="w-10 h-10 rounded-full bg-[#CEFF00] flex-shrink-0"
            aria-hidden="true"
          />
          <div className="flex flex-col leading-tight">
            <span className="text-white text-sm font-semibold">You</span>
            <span className="text-[#6B7280] text-xs">Level 14</span>
          </div>
        </div>

        {/* XP progress bar */}
        <div>
          <div
            className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden"
            role="progressbar"
            aria-valuenow={4250}
            aria-valuemax={5000}
            aria-label="XP progress"
          >
            <div
              className="h-full rounded-full bg-[#CEFF00]"
              style={{ width: "85%" }}
            />
          </div>
          <p className="text-right text-[#6B7280] text-[10px] mt-1 tabular-nums">
            4,250 XP
          </p>
        </div>
      </div>

      {/* ── Promotional Poster ────────────────────────────────────── */}
      <div
        className="rounded-2xl bg-[#1A1A1A] border border-white/10 px-4 py-5 flex flex-col items-center justify-center min-h-[96px]"
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
