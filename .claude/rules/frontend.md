# Frontend & UI Rules (PIXEL-PERFECT DESIGN SPEC)

## 1. The Split-Theme Architecture
The application does NOT use a global dark or light theme. It uses a strict split-layout:
- **Left Sidebar:** Dark Theme (`bg-[#0A0A0A]`, Text: `#FFFFFF`).
- **Main Dashboard Area:** Light Theme (`bg-[#F7F8FA]`, Text: `#111827`).
- **Cards/Widgets:** Pure White (`bg-white`), with soft, large borders (`rounded-[24px]`) and extremely subtle shadows (`shadow-[0_2px_10px_rgba(0,0,0,0.04)]`).

## 2. Exact Color Palette (Mandatory Hex Codes)
You must use these exact Tailwind arbitrary values:
- **Neon Lime Accent:** `#CEFF00` (Used for active sidebar link, XP bar, "JUST SHOW UP" text, and line chart trends).
- **Primary Text (Light area):** `#111827` (Main headings) & `#6B7280` (Subtitles/dates).
- **Metric Toggle Pills (Top Row):**
  - Long Run: `bg-[#EAFCDB]` with text/icon `#1E1E1E`
  - Deadlift: `bg-[#F3E8FF]` with text/icon `#1E1E1E`
  - Top Speed: `bg-[#FFE5E5]` with text/icon `#FF3B30`
  - Weight: `bg-[#E0F4F4]` with text/icon `#1E1E1E`
- **Line Chart Colors:** Red (`#FF3B30`), Blue (`#007AFF`), Purple (`#AF52DE`), Green (`#34C759`), Yellow (`#FFCC00`).

## 3. Typography & Layout Strictness
- **Font:** Use `Inter` or `Geist` (sans-serif) heavily weighted. Headers like "THE GROWTH CLUB" must be `font-black` (900 weight), uppercase, and tightly tracked (`tracking-tight`).
- **Grid:** The main dashboard is a flexible CSS Grid. The top row has the chart (occupying ~65% width) and the Breaking News feed (occupying ~35% width).
- **Sidebar Placeholders:** Render exact placeholders for Activity, Performance, Community, Challenges, Gear, Settings. Include the "JUST SHOW UP" poster placeholder at the bottom.

## 4. Charting & Widget Specifics
- **Line Chart (ECharts):** Hide all grid lines except horizontal ones (make them dashed and very light grey). Hide the Y-axis line. Place avatars exactly at the end of the line series with the numeric value in bold next to the avatar.
- **KPI Cards (Bottom Row):** The icons must be wrapped in a circular SVG donut chart representing progress, matching the color of the specific metric.
- **Activity Bar Chart:** Ensure the bars are grouped side-by-side (Lime Green for "This Week", Light Grey for "Last Week").