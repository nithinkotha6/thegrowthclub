# BEYOND YESTERDAY: COMPREHENSIVE ARCHITECTURAL BLUEPRINT & QUICK REFERENCE

This document serves as the absolute, single source of truth for the entire **Beyond Yesterday: The Growth Club** application. It contains the exact technical specifications, database schemas, styling details, API routing maps, and backend logic necessary to reconstruct the application from scratch.

---

## 1. Core Architectural Pillars

- **PIN-Based Authentication (Kiosk Scoping):** Users authenticate by selecting their profile from a list and typing a 4-digit PIN. The session is encoded as a JWT stored in an HTTP-only cookie (`app_session`) containing `userId`, `groupId`, `groupName`, and `userName`. All database queries are scoped to the session's `groupId`.
- **Dynamic Metric Tracker & ECharts Ledger:** Users log quantitative metrics (runs, weight, steps, speed). A responsive ECharts line chart graphs multi-athlete historical trends using Robinhood-style styling.
- **WhatsApp Banter Engine (Fisky):** An automated assistant running via a webhook endpoint. It replies to group text messages with classy, urban Hyderabadi Telugu slang and star cinema parodies, constrained by a strict mirror-length output clamp and single-line format constraints.
- **Admin Settings Hub (Secret PIN-Gate):** Locked behind a master password validator, exposing log editing, user management (soft deletion/hard drop), metric configuration settings, custom AI lore mappings, and vocab slang routing tables.
- **Google Fit Sync Gateway:** OAuth flow linking user profiles to Google accounts to fetch active steps, sleep, and resting heart rates via cron jobs.

---

## 2. Database Schema (Supabase PostgreSQL 15)

### Core Directory Tables

#### `groups`
- **Purpose:** Tenant separation rooms.
- **Schema:**
  ```sql
  CREATE TABLE public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    whatsapp_instance_id TEXT,
    whatsapp_token TEXT,
    whatsapp_group_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
  ```

#### `profiles`
- **Purpose:** User details, level stats, and soft-delete toggle status.
- **Schema:**
  ```sql
  CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    nickname TEXT,
    email TEXT UNIQUE,
    pin VARCHAR(4) NOT NULL CHECK (pin ~ '^[0-9]{4}$'),
    avatar_url TEXT,
    total_xp INT DEFAULT 0,
    current_level INT DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  CREATE INDEX profiles_is_active_idx ON public.profiles(is_active);
  ```

#### `group_members`
- **Purpose:** Mapping user memberships to tenancy rooms.
- **Schema:**
  ```sql
  CREATE TABLE public.group_members (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'co-admin', 'member')),
    joined_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, group_id)
  );
  ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
  ```

### KPI Logs & Peer Review

#### `metric_definitions`
- **Purpose:** Definitions of active metrics.
- **Schema:**
  ```sql
  CREATE TABLE public.metric_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    sort_direction TEXT NOT NULL CHECK (sort_direction IN ('asc', 'desc')),
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    is_hidden BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ALTER TABLE public.metric_definitions ENABLE ROW LEVEL SECURITY;
  CREATE INDEX metric_definitions_is_hidden_idx ON public.metric_definitions(is_hidden);
  CREATE INDEX metric_definitions_group_id_idx ON public.metric_definitions(group_id);
  ```

#### `metric_logs`
- **Purpose:** Log history of user logs.
- **Schema:**
  ```sql
  CREATE TABLE public.metric_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    metric_slug TEXT NOT NULL,
    value NUMERIC NOT NULL,
    unit TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    evidence_url TEXT,
    caption TEXT,
    logged_at TIMESTAMPTZ DEFAULT now()
  );
  ALTER TABLE public.metric_logs ENABLE ROW LEVEL SECURITY;
  ```

#### `log_votes`
- **Purpose:** Validation approvals for peer-review triggers.
- **Schema:**
  ```sql
  CREATE TABLE public.log_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    log_id UUID REFERENCES public.metric_logs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    cast_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(log_id, user_id)
  );
  ALTER TABLE public.log_votes ENABLE ROW LEVEL SECURITY;
  ```

### AI Context & Slang Banks

#### `member_lore`
- **Purpose:** Stores specific traits and inside joke habits for targeted roasts.
- **Schema:**
  ```sql
  CREATE TABLE public.member_lore (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    stunts TEXT[] DEFAULT '{}',
    good_habits TEXT[] DEFAULT '{}',
    bad_habits TEXT[] DEFAULT '{}',
    ego_trigger TEXT,
    catchphrase TEXT,
    nemesis_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
  );
  ALTER TABLE public.member_lore ENABLE ROW LEVEL SECURITY;
  ```

#### `vocab_banks`
- **Purpose:** Stores tone-specific and target-gender routed slang.
- **Schema:**
  ```sql
  CREATE TABLE public.vocab_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tone TEXT NOT NULL, -- e.g., 'ragebait', 'flirt_tease', 'motivate'
    target_gender TEXT NOT NULL, -- 'Male', 'Female', 'Gay', 'Neutral'
    words TEXT[] NOT NULL,
    UNIQUE(tone, target_gender)
  );
  ALTER TABLE public.vocab_banks ENABLE ROW LEVEL SECURITY;
  ```

#### `chat_history`
- **Purpose:** In-memory memory context for WhatsApp webhooks.
- **Schema:**
  ```sql
  CREATE TABLE public.chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    sender_name TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
  ```

### Database Triggers & Functions
1. **Auto-Verify Trigger (`trg_auto_verify`):** Fired `AFTER INSERT ON log_votes`. When `count(votes)` for a `log_id` is `>= 3`, updates `metric_logs.status = 'verified'`.
2. **XP & Leveling trigger (`trg_award_xp_v2`):** Fired `AFTER UPDATE OF status ON metric_logs`. When status becomes `verified`, awards 25 XP to the author's profile. Recomputes levels using:
   $$\text{Level} = \lfloor 1 + \sqrt{\text{total\_xp} / 500} \rfloor + 1$$

---

## 3. UI/UX Elements & Styling Standards (The Wearables Clone)

The layout is built with a strict **light-canvas/white-cards** theme mapping, using **Neon Yellow/Green (`#CEFF00`)** primary highlights. Dark cards and pastel layouts are prohibited.

### Style Tokens (Tailwind CSS Configurations)
- **Main App Canvas Bg:** `#F7F8FA`
- **Left Sidebar Navigation Bg:** `#0A0A0A` (Fixed vertical layout, `width: 240px`)
- **UI Content Card Surfaces:** `#FFFFFF` with outline `border border-slate-200 shadow-sm rounded-xl`
- **Primary Yellow/Green Accent:** `#CEFF00` (Hover action state shifts)
- **Destructive Danger Color:** `#D84315` / `bg-red-50 text-red-600 border-red-200`
- **Success Color:** `#4CAF50` / `bg-emerald-50 text-emerald-600 border-emerald-200`
- **Typography:** Main headers `text-slate-900 font-extrabold tracking-tight`, Subtitles/Muted copy `text-slate-500 text-xs`.

### Key Component Interfaces

#### 1. Navigation Sidebar (Left Sidebar, Dark Theme)
- **Container:** `hidden md:flex flex-col w-[240px] min-h-screen bg-[#0A0A0A] px-4 py-6`
- **Active Nav Item:** `text-[#CEFF00] border-l-2 border-[#CEFF00] pl-[10px] bg-white/5`
- **Inactive Nav Item:** `text-[#9CA3AF] hover:text-white hover:bg-white/5`
- **XP Progress Bar Container:** `w-full h-1.5 rounded-full bg-white/10 overflow-hidden`
- **XP Progress Bar Fill:** `h-full rounded-full bg-[#CEFF00]`
- **Initials Avatar Fallback:** `w-10 h-10 rounded-full bg-[#CEFF00] flex items-center justify-center` with `text-[#0A0A0A] text-sm font-black`

#### 2. Metric Pills Selector (Horizontal Slider)
- **Container:** `flex gap-2 overflow-x-auto py-2 scrollbar-none`
- **Active Pill Button:** `bg-[#CEFF00] text-[#111827] ring-1 ring-black/5 scale-[1.03] shadow-sm font-bold px-4 py-2.5 rounded-2xl min-h-[44px] text-sm whitespace-nowrap`
- **Inactive Pill Button:** `bg-slate-100 text-slate-500 hover:bg-slate-200/80 px-4 py-2.5 rounded-2xl min-h-[44px] text-sm whitespace-nowrap`

#### 3. Structured Modal Forms (e.g., Add Activity)
- **Modal Panel Overlay:** `DialogContent` with `rounded-[24px] p-7 sm:max-w-md bg-white border border-slate-200 shadow-xl`
- **Form Select Option Field:** `w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-base text-[#111827] bg-white focus:ring-2 focus:ring-[#111827]`
- **AI Assist Textarea:** `w-full resize-none rounded-xl border border-[#E5E7EB] px-4 py-3 text-base text-[#111827] placeholder:text-[#9CA3AF] focus:ring-2 focus:ring-[#111827]`
- **Submit Buttons:** `w-full font-bold uppercase tracking-wider text-xs bg-[#111827] text-white hover:bg-black p-3.5 rounded-xl disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2`
- **Endurance Duration picker inputs (HH:MM:SS):** Nested in `grid grid-cols-3 gap-2` using `flex items-center gap-1 bg-white rounded-xl border border-[#E5E7EB] px-3 py-1.5` with inner `input` centering numbers, plus label indicators (`H`, `M`, `S`).

#### 4. Settings Keypad Authenticator (Master Password Form)
- Displays if `window.sessionStorage.getItem('god_mode_unlocked')` is not `'true'`.
- Centered grid with a dark-slate theme viewport containing key code entries.
- **PIN Unlock Text Input:** `w-full text-center tracking-[1.5em] text-2xl font-black rounded-xl border border-slate-200 px-4 py-3 bg-slate-50 text-slate-900 focus:outline-none`
- **Unlock button:** Styled like standard Submit buttons, validating inputs against a configured password.

#### 5. God Mode Logs table (Log Editor)
- **Log Item Row:** Clean, alternating white tables with borders (`border-b border-slate-200 hover:bg-slate-50 text-slate-900 bg-white`).
- **Log Edit Inline Form:** Input text values are inline textboxes `w-20 px-2 py-1 border border-slate-200 rounded text-xs text-slate-900 bg-slate-50`.
- **Log Search Input:** `w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400`.
- **Search Filters:** Select selectors grouped above the table to filter by specific Member (`profiles.id`) and Metric slug.

---

## 4. Server Actions API Interfaces (Mutations & Fetchers)

Every data mutation is handled via serverless Next.js Server Actions with caching invalidation hooks (`revalidatePath`).

### Metrics Configuration Actions (`app/actions/metrics.ts`)
- **`createMetricDefinition(name, unit, sortDirection)`:**
  - Validates fields, parses emoji checks (guarantees exactly 1 emoji prefix, prepending default `📊 ` if none detected), fetches user group scope, inserts definition, invalidates path.
- **`adminFetchMetricDefinitions(groupId)`:**
  - Queries active metric rows.
- **`adminUpdateMetricDefinition(id, name, unit, sortDirection)`:**
  - Updates definition, runs emoji check, invalidates paths.
- **`adminDeleteMetricDefinition(id)`:**
  - Deletes metric definitions, cascades logs, invalidates cache.
- **`adminToggleMetricHidden(id, isHidden)`:**
  - Toggles metrics soft-hide status in DB.

### Group & AI Settings Console Actions (`app/actions/admin.ts`)
- **`adminToggleBotMute(isMuted)`:** Toggles the `bot_muted` setting in the `system_settings` table.
- **`adminResetPin(userId, newPin)`:** Resets 4-digit PIN for target member.
- **`adminUpdateMemberRole(userId, groupId, newRole)`:** Edits user access level.
- **`adminRemoveMember(userId, groupId)`:** Deletes connection mapping.
- **`adminToggleUserActive(userId, isActive)`:** Updates `profiles.is_active` soft-delete state.
- **`adminHardDeleteUser(userId)`:** Drops the user profile record cascading all associated logs.
- **`adminFetchAllLore()`:** Queries `member_lore` rows.
- **`adminUpsertMemberLore(userId, data)`:** Updates stunts array, habits, ego triggers, nemesis target.
- **`adminFetchVocabBanks()`:** Queries `vocab_banks` records.
- **`adminUpsertVocabBank(id, tone, gender, words)`:** Updates or inserts slang collections.
- **`adminDeleteVocabBank(id)`:** Drops vocab set.

---

## 5. AI Ingestion & Dispatch Pipelines

### Webhook Bot Banter Pipeline (`/api/webhooks/whatsapp`)
1. **Payload Verification:** Incoming JSON is validated against instance credential keys (`GREEN_API_INSTANCE_ID`).
2. **Text Parsing:** The raw message text is extracted from Green API nested body formats. If `/clear` matches, wipes short-term logs in `chat_history`.
3. **Context Construction:** Retrieves 10 recent messages in `chat_history` (clears context window if inactivity exceeds 30 minutes). Fetches latest 5 verified logs and pod leaderboard.
4. **Mirror Output Clamping:** Scales output maximum dynamically:
   $$\text{Target Words} = \max(15, \text{User Input Words} \times 3)$$
5. **Instruction Generation:** Builds system prompt calling `buildGroupAssistantPrompt(dbContext, targetWordLimit)`. Rules enforce:
   - Speaking strictly in romanized Telugu (Latin alphabet text). Telugu script is banned.
   - Injecting natural slang terms (`Orey`, `Macha`, `Lite le`).
   - Using star comedy and dialogue parodies (Balayya, Brahmanandam). Cliché references like Baahubali and Pushpa are banned.
   - Returning output as a single continuous line (no `\n` characters allowed).
6. **Gemini Invocations:** Calls the model and posts replies back via Green API sendMessage.

### Admin Tone Dispatch Poke Pipeline (`adminTriggerPoke`)
1. Fetches profiles and checks gender style override parameters (`male`/`female`/`gay`/`auto`).
2. Queries target user inside jokes and habits (`member_lore` query). Resolves nemesis.
3. Retrieves custom words array list from vocabulary bank (`vocab_banks` match query).
4. Compiles situational context text block, calls Gemini Studio with a 60-word length clamp, and dispatches to WhatsApp instantly.

---

## 6. Environment Configurations (`.env.local`)

To run or replicate this setup, the following variables must be configured:

```env
# Supabase Keys
NEXT_PUBLIC_SUPABASE_URL="https://your-supabase-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOi..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."

# Gemini API
GEMINI_API_KEY="AIzaSy..."

# Green API WhatsApp Credentials
GREEN_API_INSTANCE_ID="110185..."
GREEN_API_TOKEN="4a7b5c..."
WHATSAPP_GROUP_ID="1203632..."

# Session Scopes
SESSION_SECRET="your-32-character-secret-key-here"
CRON_SECRET="your-cron-secret-authorization-token"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```
