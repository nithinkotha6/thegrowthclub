# Product Features & Functional Requirements (100% MATCH SPEC)

## 1. The Split-Theme Layout Architecture [COMPLETED]
The interface utilizes a strict split-layout design to maximize contrast and focus.
- **Left Sidebar:** Dark theme (`bg-[#0A0A0A]`). Fixed width, occupying the left margin of the screen.
- **Main Dashboard Area:** Light theme (`bg-[#F7F8FA]`). Flexible CSS Grid occupying the remaining viewport.
- **Widgets & Cards:** Pure white (`bg-white`) with large `24px` border radiuses and soft, transparent shadows.

## 2. Sidebar Components (Dark Theme) [COMPLETED]
- **Primary Navigation:** Vertical menu list containing: 
  - `Dashboard` (Active state: accented with Neon Lime `#CEFF00` text and a subtle left border/indicator).
  - `Activity`, `Performance`, `Community`, `Challenges`, `Gear`, `Settings` (Inactive state: white/grey text with respective Lucide icons).
- **Gamified User Profile Block:** Positioned near the bottom of the navigation.
  - Displays the user's avatar.
  - Displays "You" and "Level 14" stacked vertically.
  - Contains a horizontal progress bar (Neon Lime) tracking Experience Points, with text `4,250 XP` right-aligned beneath it.
- **Promotional Poster:** A fixed image placeholder at the very bottom of the sidebar featuring the text "JUST SHOW UP."

## 3. Header & Metric Toggles (Top Row, Light Theme) [COMPLETED]
- **Title Block:** 
  - Huge, black, uppercase typography reading **"THE GROWTH CLUB"**.
  - Subtitle: "TRAIN TOGETHER. COMPETE TOGETHER. GROW TOGETHER." 
  - A stylized, hand-drawn green underline accent placed beneath the subtitle.
- **Controls (Top Right):** 
  - **Date Range Picker:** A white dropdown button (e.g., `Jul 4 - Jul 10, 2025`). Changing this dynamically re-fetches the database rows for all charts.
  - **Add Activity Button:** A solid black button with a white `+` icon and text `+ Add Activity`.
- **Metric Selectors (Pills):** A horizontal row of 4 large toggle buttons that dictate the data shown in the main chart below:
  - `Long Run` (Pastel Green background, black text/icon)
  - `Deadlift` (Pastel Purple background, black text/icon)
  - `Top Speed` (Pastel Red background, red text/icon)
  - `Weight` (Pastel Teal/Cyan background, black text/icon)

## 4. Primary Charting & Social Feed (Middle Row)
- **Main Trend Chart (ECharts):** [COMPLETED]
  - **Title:** e.g., "Highest no of Beers" with a "Weekly Progress" subtitle and an "All Athletes" dropdown on the right.
  - **Grid:** X-axis shows days of the week (`MON`, `TUE` ... `SUN`). Y-axis shows numeric values. Faint dashed horizontal lines.
  - **Visuals:** Multi-series line graph.
  - **Leading Indicators:** Profile avatar plotted at the terminal node using ECharts native `image://` protocol.
- **Breaking News Stream:** [COMPLETED]
  - A right-aligned vertical widget displaying a real-time feed of group accomplishments.
  - Each item features: A circular dark icon placeholder on the left, the user's name bolded alongside a description (e.g., "**Nithin** - Completed my 5K Run"), the exact metric (`2.1 mi • 24:31`), and the date (`Jul 9`) right-aligned.
  - A "View all news >" link at the bottom of the card.

## 5. Aggregate PR Widgets & Bar Chart (Bottom Row) [COMPLETED]
- **KPI Summary Row:** A horizontal flex-container holding 5 specific metric cards.
  - **Cards Included:** `TOTAL ACTIVITIES`, `TOP SPEED (BEST)`, `HEAVIEST LIFT`, `LONGEST RUN`, `CALORIES BURNED`.
  - **Visual Structure:** Each card contains a circular icon wrapped in a colorful SVG donut-chart stroke. Next to the icon is the raw numeric value (massive font), the unit, and a green delta indicator (e.g., `+12% vs last week`) or a purple "New PR!" tag.

## 6. Background Workflows & Core Integrations
- **Manual AI Ingestion Modal:** [COMPLETED]
  - Opens shadcn/ui Dialog on button click.
  - Natural language parsing through Next.js Server Action + Gemini.
  - Inserts directly into `metric_logs`.
  - Successful feedback displays success state and auto-closes in 2 seconds.
- **Multi-Tenancy Setup:** [COMPLETED]
  - `groups` table mapped to users with unique `invite_code`.
  - RLS policies configured to isolate data by tenant group.
- **The XP Engine / Gamification:** [PENDING / NEXT STEPS]
  - XP levels automatic recalculations and visual integration updating sidebar.
- **Proof Gallery & 3-Vote Verification:** [PENDING / NEXT STEPS]
  - 3 unique peer approvals required before metric status transitions to `verified`.
- **Telegram Webhook:** [PENDING / NEXT STEPS]
  - Telegram integration to ingest workout updates and proof media.