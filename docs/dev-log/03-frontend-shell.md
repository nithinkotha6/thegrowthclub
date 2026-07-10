# Dev Log — Frontend Shell

## 2026-07-10 | Step 3: Dashboard Layout Shell

- Modified `app/layout.tsx` — Geist font, correct metadata title, full-height body
- Created `components/Sidebar.tsx` — dark sidebar (`#0A0A0A`), 7 nav items, Neon Lime (`#CEFF00`) active state + left-border indicator, avatar/level block, XP progress bar, "JUST SHOW UP." poster
- Created `app/dashboard/layout.tsx` — flex split: Sidebar + `bg-[#F7F8FA]` main area
- Created `app/dashboard/page.tsx` — header with correct typography, placeholder card slots (`rounded-[24px]`, `bg-white`, exact shadow)
- Modified `app/page.tsx` — server-side redirect to `/dashboard`

## 2026-07-10 | Step 4: Header & Metric Pill Visual Diff Fix

- Modified `components/Sidebar.tsx` — removed erroneous "The Growth Club" brand text from sidebar top
- Modified `app/dashboard/page.tsx` — header flex row (title + SVG green underline left; date picker + Add Activity button right); 4-pill metric selector row with exact spec colours; placeholder cards preserved

