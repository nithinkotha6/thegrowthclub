# 08 — Client-Side Architecture & UI Component Inventory

> **Style System**: Tailwind CSS v4 (configured via globals.css)
> **Base Styling**: Light mode, high-contrast, cyber-athletic design
> **Interactive Components**: Client components marked with `'use client'`
> **Source of Truth**: [globals.css](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/globals.css), [components/](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/components)

---

## 1. Styling Tokens (Tailwind CSS v4 Standard)

The design system uses CSS custom variables mapped to Tailwind utilities.

| Token Name | Hex Value | CSS Variable Name | UI Usage |
|---|---|---|---|
| **Canvas Background** | `#F7F8FA` | `--canvas-bg` | Page container background (`bg-[#F7F8FA]`) |
| **Module Cards** | `#FFFFFF` | `--card-bg` | Content cards (`bg-white border border-slate-200 shadow-sm rounded-xl`) |
| **Primary Hero Accent** | `#CEFF00` | `--hero-accent` | Neon Lime-Yellow text highlights, active borders, buttons |
| **Main Heading Text** | `#111827` | `--text-primary` | Charcoal black (`text-[#111827] font-black uppercase`) |
| **Muted Text / Labels** | `#6B7280` | `--text-muted` | Medium gray labels (`text-[#6B7280] font-bold text-xs uppercase`) |
| **Destructive Actions** | `#D84315` | `--destructive` | Red borders/backgrounds for deletes (`bg-red-50 text-red-600 border border-red-200`) |
| **Success Actions** | `#4CAF50` | `--success` | Green borders/backgrounds for approvals (`bg-emerald-50 text-emerald-600 border border-emerald-200`) |

---

## 2. Typography & Layout Rules

- **Default Font Family**: Standard system sans-serif font stack. Loaded via Next.js `Geist` font configuration.
- **Main Headings**: Title Case or full UPPERCASE depending on layout hierarchy.
- **Metadata Labels**: Must be full UPPERCASE (e.g., `LIVE`, `GANG ROSTER`).
- **Responsive Layout Grid**:
  - Desktop: Left-anchored dark sidebar (`bg-[#0A0A0A]`, width `240px`).
  - Mobile: Horizontal bottom navigation bar (`MobileBottomNav.tsx`) with high-contrast accent highlight (`#CEFF00`).
- **Page Container Spacing**: Responsive mobile-first padding. Expressed as: `px-4 md:px-8 py-6`.

---

## 3. UI Component Inventory

### 3.1 Settings Tab Components (`/dashboard/settings` / `SettingsClient.tsx`)

Source: [SettingsClient.tsx](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/components/SettingsClient.tsx)

- **Numeric Keypad Authenticator**:
  - Displays a 12-button lockpad overlay on initial load.
  - Intercepts clicks on numbers 0-9, backspace, and clear.
  - Compares the entered PIN against the master group admin PIN.
  - On match, sets `god_mode_unlocked` to `true` in `sessionStorage` and changes state to unlocked.
- **Bot Control Switch**:
  - Horizontal toggle button.
  - Invokes the `adminToggleBotMute` Server Action.
- **User Activation Control**:
  - Inline switch inputs rendered per-member.
  - Invokes `adminToggleUserActive` on value changes.
- **Member Removal Button**:
  - Trash icon button.
  - Triggers a confirmation dialog.
  - Invokes `adminRemoveMember` upon verification.
- **Keypad PIN Reset Form**:
  - Form field accepting 4-digit strings.
  - Validates format: `pin.length === 4 && !isNaN(Number(pin))`.
  - Submit button invokes `adminResetPin`.
- **Role Selection Dropdown**:
  - Dropdown containing options: `member`, `co-admin`, `admin`.
  - Selection changes invoke `adminUpdateMemberRole`.
- **Add Custom Metric Button**:
  - Dialog overlay modal.
  - Inputs: Name (must include emoji), Unit, Sort Direction (`asc`/`desc`).
  - Submit button invokes `createMetricDefinition`.
- **Metric Visibility Control**:
  - Hide/unhide toggle in custom definitions list.
  - Invokes `adminToggleMetricHidden`.
- **Banter Poke Form**:
  - Dropdowns: Target Member, Tone Vibe (`ragebait`, `motivate`, `flirt_tease`), Gender Override (`Male`, `Female`, `Gay`, `Neutral`, `Auto`).
  - Textarea: Custom situation context.
  - Submit button invokes `adminTriggerPoke`.
- **Lore Context Editor**:
  - Fields: Stunts array, Good Habits array, Bad Habits array, Catchphrase string, Ego Trigger string, Nemesis lookup.
  - Save button invokes `adminUpsertMemberLore`.
- **Slang Vocabulary Form**:
  - Inputs: Inline text array for slang words.
  - Save buttons invoke `adminUpsertVocabBank`.

### 3.2 Dashboard Components (`/dashboard`)

Source: [BreakingNewsFeed.tsx](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/components/BreakingNewsFeed.tsx), [MetricChart.tsx](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/components/MetricChart.tsx), [AddActivityModal.tsx](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/components/AddActivityModal.tsx)

- **Metric Selector Pill Row**:
  - Horizontal scrolling pill container.
  - Combines 12 static configurations from [metrics.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/metrics.ts) with dynamic non-hidden custom metrics from the database.
  - Selected pill highlights with accent color background (`#CEFF00`).
- **Date Range Selector**:
  - Options: `7d`, `30d`, `90d`, `all`.
  - Determines lookback range for calculations and chart points.
- **Metric Chart Container**:
  - Client component wrapping `echarts-for-react`.
  - Renders line series with custom primary color palette.
  - Downsamples x-axis markers based on range selection (`7d` raw, `30d` 3-day buckets, `90d` 7-day buckets).
  - Dynamically floats user avatar images at the final non-null point of each line.
- **Breaking News Feed**:
  - Vertically scrolling list showing recent verified and pending activities.
  - Fades in items using `animate-in fade-in slide-in-from-bottom-3`.
  - Item elements show athlete details, metric labels, values, duration metadata, and social comment links.
- **Add Activity Modal**:
  - Button toggled modal.
  - Submits textual descriptions to `ingestActivity` Server Action.
  - Tab switcher unlocks manual logging inputs.
  - Manual inputs: Numeric Value, Unit, Logged Date (restrictions: max today, min 30 days ago).
  - Endurance metrics render sub-fields: Hours, Minutes, Seconds. Computes and saves total seconds under `duration_seconds`.
- **Peer Review Modal**:
  - Renders list of logs with `status = 'pending'`.
  - Excludes logs authored by the current session user.
  - Approvals call `approveActivityAction` Server Action.
  - Rejections call `rejectActivityAction` Server Action.

### 3.3 Gang Components (`/dashboard/gang`)

Source: [GangClient.tsx](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/dashboard/gang/GangClient.tsx)

- **Roster Cards Grid**:
  - Displays all active profiles linked to the current group.
  - Card fields: initials/photo via `<UserAvatar />`, current level, nickname/full name, total XP.
  - Ordered chronologically by total XP descending.
  - Transition: `animate-in fade-in zoom-in-95`.

### 3.4 Wearables Components (`/dashboard/wearables`)

Source: [WearablesClientPage.tsx](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/components/WearablesClientPage.tsx)

- **Connection Status Section**:
  - Renders cards for supported providers (`google_fit`, `fitbit`, `whoop`).
  - Active connections display a "Connected" badge alongside the last synced timestamp.
- **Connect Trigger Button**:
  - Fitbit/Google Fit redirect to OAuth route.
  - Whoop triggers a call to `connectWearableAction` (simulated connection).
- **Disconnect Trigger Button**:
  - Destroys connections by calling `disconnectWearableAction`.
