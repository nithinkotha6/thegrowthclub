## 1. Core Dashboard Functionality

### Dashboard Home (`/dashboard`)
- **Metric Selection pills:** Horizontal list of selectable tracked items. Dynamically switches the active parameter graphed on the ECharts widget.
- **ECharts Trend Graph (Robinhood Style):** Plots performance scores over selected date ranges (e.g., Last 7 Days, Last 30 Days).
  - *Scrubbing Crosshair:* Vertical line tracking points on dragging or hovering.
  - *Tooltip Descending Sort:* The tooltip box displays and ranks all matching users sorted descending by value.
  - *Null Connection Normalization:* Empty dates (rest days) connect lines continuously to avoid drops to 0.
  - *Avatar Endpoints:* User profile pictures (or initials badges) are drawn at the final data point of each line, using staggered pixel offsets to prevent collisions.
- **Breaking News Ledger:** Real-time social feed listing recent group achievements. Items display:
  - `<UserAvatar />` displaying profile photo or letters.
  - Action descriptions (e.g. "Athlete logged 185 lbs of weight").
  - Relative timestamp text (e.g., "3 hours ago").
  - *Vote Controls:* Peers see approval (✅) and reject (❌) buttons to vote on pending logs. Authors see a delete (🗑️) button.

### Leaderboard Tab (`/dashboard/leaderboard`)
- **Staggered Podium Pedestal Header:** Displays the top 3 members.
  - 1st Place: Center column, tallest height container, Gold medal badge.
  - 2nd Place: Left column, medium height container, Silver medal badge.
  - 3rd Place: Right column, shortest height container, Bronze medal badge.
  - Card elements display: User avatar, Level, nickname, and exact calculated score.
- **Ranking List Grid:** Displays ranks 4 and below inside a structured list displaying names, levels, XP bars, and scores.

### Gang Tab (`/dashboard/gang`)
- Directory grid listing every active member in the scoped group.
- Roster cards display large user avatars, full name, nickname, level, and XP totals.

### Wearables Tab (`/dashboard/wearables`)
- OAuth pipeline linking external fitness accounts (Google Fit) to profiles.
- Display cards indicate active connections, provider types, and last synchronized timestamps.
- Lists daily tracked wearable metrics: steps, sleep duration, and resting heart rates.

### Memories Tab (`/dashboard/memories`)
- Shared community photo album.
- *Image Upload Panel:* Accepts file selection. Compresses images client-side via HTML5 Canvas (downscales to max 1200px width/height and saves as JPEG at 0.85 quality). Uploads are base64-encoded and sent to Supabase storage folders.
- *Comments Section:* Interactive comments panel listing comments with initials avatars and timestamps, with a text field to insert new comment messages.

### Settings Tab (`/settings/metrics`)
- Pin-gate padlock dashboard.
- Active admin modules:
  - *AI Tone Dispatcher:* Trigger manual group broadcasts.
  - *Log Editor:* Database table listing recent logs, search bar, filters by member and metric, and inline modification boxes.
  - *AI Brain Editor:* Upserts member lore metrics and seed slang databases.
  - *Manage Users:* Soft-deactivates profiles or hard-deletes records.
  - *Metric Definitions Manager:* Dynamic metrics table config.

---

## 2. Technical System Settings & Database Control

| Key / Keypad Control | DB Table Target | Action Triggered |
|---|---|---|
| PIN Lock Validator | Session storage only | Validates against master password to unlock Admin console components (`god_mode_unlocked: true`) |
| Bot Muted Button | `system_settings` | Upserts `key: 'bot_muted'` with values `'true'` or `'false'` |
| User Active Toggle | `profiles` | Updates `is_active` boolean (soft hide from rosters and leaderboards) |
| Hard Delete Button | `profiles` | Deletes row from profiles database cascading all associated logs |
| Metric Hide Button | `metric_definitions` | Sets `is_hidden` boolean to prevent rendering on metrics selectors |
| Kiosk PIN Reset Form | `profiles` | Updates `pin` column with sanitized 4-digit character string |
| Role Selection | `group_members` | Updates `role` (`admin`, `co-admin`, `member`) |

---

## 3. UI/UX Color Specifications & Layout Standard

All components strictly implement a clean, light-mode reskin scheme modeled after the Wearables interface.

- **Page Canvas:** `#F7F8FA`
- **Module Cards:** `#FFFFFF` (`bg-white border border-slate-200 shadow-sm rounded-xl`)
- **Primary Accent Action Highlight:** `#CEFF00` (Neon Lime/Yellow)
  - Active navigation indicators use `#CEFF00` text, left border rules, and a `bg-white/5` sidebar backdrop.
  - Active metric pills use `bg-[#CEFF00] text-[#111827]` scale highlights.
- **Destructive/Danger Button Alert:** Red background highlights (`bg-red-50 text-red-600 border-red-200`)
- **Success/Save Button Indicator:** Emerald background highlights (`bg-emerald-50 text-emerald-600 border-emerald-200`)
- **Main Heading Text:** `#111827` (`text-slate-900 font-extrabold`)
- **Subtitles & Muted Indicators:** `#6B7280` (`text-slate-500`)

---

## 4. Cache Architecture & Data Synchronizations

### 1. Client-Side SWR Caching
- The Gang Tab roster fetches members via Next.js client-side SWR (`swr` package), utilizing a `useSWR` fetcher mapped to cookie sessions:
  ```typescript
  const { data, error } = useSWR('gang-roster', fetchRosterAction, {
    revalidateOnFocus: false,
    dedupingInterval: 3600000 // 1 hour stale deduping cache window
  });
  ```
- Instant rendering of cached rosters eliminates loading states and layout jumps when toggling back and forth between tabs.

### 2. Client-Side Avatar Caching
- User initials avatars are protected against reloading flickers using a global client memory cache in [UserAvatar.tsx](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/components/UserAvatar.tsx):
  ```typescript
  const LOADED_IMAGE_CACHE = new Set<string>();
  // Mark loaded immediately if avatar image URL is present in the memory cache
  ```
- Eliminates layout flickers on mounting transitions.

### 3. Next.js Path Revalidations
- Mutations trigger cached server-side revalidation updates via `revalidatePath` to clear CDN buffers:
  - Settings updates trigger `revalidatePath('/settings/metrics')`.
  - Score changes trigger `revalidatePath('/dashboard')` and `revalidatePath('/dashboard/leaderboard')`.

---

## 5. Metrics, XP, & Level Calculations

- **XP Reward Rules:** Awarded only when a log status transitions to `verified`. Award value is fixed at 25 XP points per verified log.
- **Podium/Leaderboard Calculations:** Scores represent the maximum verified value logged for the specified metric in the active group. Standard values round to 1 decimal place.
- **Endurance/Time Duration Compressions:** Endurance logs (e.g. underwater swim) capture hours, minutes, and seconds. Total compressed duration is saved in the database as numeric seconds, while formatted strings (e.g. `Duration: 00:02:45`) append to captions.
- **Leveling progression formula:**
  $$\text{Level} = \lfloor 1 + \sqrt{\text{total\_xp} / 500} \rfloor + 1$$

---

## 6. AI Webhook & Bot Ingestion Architecture

### 1. Telegram Bot Webhook (`/api/telegram`)
- **Incoming Header:** Verification token `X-Telegram-Bot-Api-Secret-Token` matching `TELEGRAM_WEBHOOK_SECRET`.
- **Payload Schema:**
  ```json
  {
    "update_id": 123456789,
    "message": {
      "message_id": 99,
      "from": {
        "id": 88888888,
        "is_bot": false,
        "first_name": "Athlete",
        "username": "athlete_handle"
      },
      "chat": {
        "id": -999999999,
        "title": "Texas Buds",
        "type": "group"
      },
      "text": "Log 10,000 steps today"
    }
  }
  ```
- **Execution Pipeline:** Match Telegram ID -> Query Profile -> Dynamic Zod Object Extraction -> If standard metric, set status to `verified`, else `pending` (awaits voting) -> Write record to `metric_logs`.

### 2. WhatsApp Bot Webhook (`/api/webhooks/whatsapp`)
- **Incoming Verification:** Validates payload `instanceData.idInstance` matches `GREEN_API_INSTANCE_ID`.
- **Payload Schema:**
  ```json
  {
    "typeWebhook": "incomingMessageReceived",
    "instanceData": {
      "idInstance": 1101851234
    },
    "senderData": {
      "chatId": "1203632@g.us",
      "sender": "919999999999@c.us",
      "senderName": "A group member"
    },
    "messageData": {
      "typeMessage": "textMessage",
      "textMessageData": {
        "textMessage": "What are the leaderboard standings?"
      }
    }
  }
  ```
- **Banter Execution Pipeline:**
  1. Parse message body content. Wipes history if command `/clear` matches.
  2. Query last 10 messages from `chat_history` (wipes memory if last message timestamp exceeds 30 minutes).
  3. Fetch latest 5 verified achievements and Top Golf scores.
  4. Scale output clamp limits:
     $$\text{Limit} = \max(15, \text{Input Word Count} \times 3)$$
  5. Inject romanized Hyderabadi Telugu rules and modern comedy parodies (banning cliché RRR/Pushpa tropes).
  6. Call Gemini Flash API.
  7. Strip all newline characters (`\n`) to force single continuous text message layout format.
  8. Deliver reply back via Green API POST `sendMessage` API.
  9. Append user prompt and assistant output to `chat_history` table.

---

## 7. Git Actions & Workflows

- **Verification Hook:** Pre-commit/Push pipelines trigger manual build check audits via standard script runners:
  ```bash
  npm run build
  ```
- **Sync Pipeline:** Validates Typescript compiles cleanly and Turbopack completes optimizations successfully prior to staging commit trees to origin main.
