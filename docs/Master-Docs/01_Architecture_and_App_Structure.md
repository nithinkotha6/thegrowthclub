# 01 — Architecture & App Structure

> **System**: Beyond Yesterday ("The Growth Club")
> **Framework**: Next.js 16.2.10 (App Router, React 19.2.4)
> **Runtime**: Vercel Serverless Functions (Node.js, Edge-compatible)
> **Database**: Supabase (PostgreSQL + Row Level Security)
> **AI Provider**: Google Gemini via Vercel AI SDK (`@ai-sdk/google`)

---

## 1. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         VERCEL (Hosting)                            │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────┐ │
│  │  Next.js     │  │  API Routes  │  │  Vercel Cron Jobs          │ │
│  │  App Router  │  │  /api/…      │  │  (vercel.json schedules)   │ │
│  └──────┬──────┘  └──────┬───────┘  └────────────┬───────────────┘ │
│         │                │                        │                 │
│         │  Server Actions (RSC)                   │                 │
│         ▼                ▼                        ▼                 │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    lib/supabase/server.ts                     │   │
│  │  createClient()  → anon key + x-group-id header (RLS)       │   │
│  │  createAdminClient() → service_role key (bypasses RLS)       │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    SUPABASE (PostgreSQL + Storage)                   │
│  ┌────────────┐ ┌────────────┐ ┌───────────────┐ ┌──────────────┐  │
│  │  profiles   │ │ metric_logs│ │ memories      │ │ chat_history │  │
│  │  groups     │ │ log_votes  │ │ memory_comments│ │ system_settings│
│  │  group_members│ metrics_config│ wearable_*  │ │ bot_persistent_│
│  └────────────┘ └────────────┘ └───────────────┘ └──state─────────┘│
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Google Gemini │  │ Green API    │  │ Google Health API v4     │  │
│  │ (AI SDK)      │  │ (WhatsApp)   │  │ (Wearables Sync)        │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│  ┌──────────────┐                                                   │
│  │ Telegram Bot  │                                                   │
│  │ (Webhook)     │                                                   │
│  └──────────────┘                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Authentication Model — Kiosk Pattern

- **No Supabase Auth**. No `auth.users` table. Profiles are plain UUIDs in `public.profiles`.
- Identity is carried via HTTP-only cookie `app_session` containing a signed JWT.
- JWT payload: `{ userId, groupId, groupName, userName }` (source: [session.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/session.ts))
- Signing: `jose` library, HS256, secret from `SESSION_SECRET` env var.
- Cookie config: `httpOnly: true`, `secure: true` in production, `sameSite: 'lax'`, `maxAge: 30 days`, `path: '/'` (source: [session.ts L72-80](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/session.ts#L72-L80))
- **No middleware.ts** exists. Auth guard lives inside `DashboardLayout` — calls `decodeSession()`, redirects to `/` on failure (source: [dashboard/layout.tsx L23-28](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/dashboard/layout.tsx#L23-L28))
- Login flow: PIN entry on landing page → `verifyPinAndLogin()` server action → issues cookie (source: [auth.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/auth.ts))

---

## 3. Directory Tree (Key Paths Only)

```
beyond-yesterday-app/
├── app/
│   ├── layout.tsx              # Root layout (Geist fonts, metadata)
│   ├── page.tsx                # Landing page (kiosk auth, PIN login, signup)
│   ├── signup/page.tsx         # Signup form (client component)
│   ├── dashboard/
│   │   ├── layout.tsx          # Auth gate, sidebar, mobile nav
│   │   ├── page.tsx            # Main dashboard (chart, feed, pills)
│   │   ├── leaderboard/       # Leaderboard page
│   │   ├── memories/          # Photo memories gallery
│   │   ├── gang/              # Group roster page
│   │   ├── wearables/         # Wearables connection page
│   │   └── settings/          # God Mode admin panel
│   ├── actions/
│   │   ├── auth.ts            # Signup, login, PIN, group management
│   │   ├── ingest.ts          # NL → structured metric via Gemini
│   │   ├── admin.ts           # Admin tools (lore, avatar, user mgmt)
│   │   ├── vote.ts            # Peer verification voting engine
│   │   ├── metrics.ts         # CRUD for metric_definitions
│   │   ├── memories.ts        # Photo upload, comments, soft-delete
│   │   ├── gang.ts            # Roster fetcher
│   │   ├── logDirect.ts       # Manual metric log (no AI)
│   │   ├── cheer.ts           # Social cheer stub
│   │   └── wearables.ts       # Mock wearable connect/disconnect
│   └── api/
│       ├── webhooks/whatsapp/  # Green API → Fisky bot handler
│       ├── telegram/           # Telegram → metric extraction
│       ├── cron/
│       │   ├── daily-whistle/  # Morning briefing broadcast
│       │   ├── ai-bookie/      # Monday prop bet broadcast
│       │   ├── sync-wearables/ # Google Health v4 + Whoop sync
│       │   └── whatsapp-digest/# Midday digest broadcast
│       └── wearables/
│           ├── connect/google/ # OAuth2 initiation
│           └── callback/google/# OAuth2 callback
├── components/                 # 20+ React components
├── lib/
│   ├── session.ts             # JWT sign/decode, cookie config
│   ├── queries.ts             # Chart data + feed queries
│   ├── metrics.ts             # Static METRIC_PILLS config
│   ├── security.ts            # Timing-safe string compare
│   ├── whatsapp.ts            # Green API message sender
│   ├── audio.ts               # Client-side audio player
│   ├── supabase/
│   │   ├── server.ts          # createClient, createAdminClient
│   │   └── client.ts          # Browser-side Supabase client
│   └── ai/
│       ├── google.ts          # googleProvider singleton
│       └── prompts.ts         # Fisky system prompt builder
├── utils/
│   ├── geminiPool.ts          # Multi-key rotation + model cascade
│   └── slangRouter.ts        # Tone/gender → slang vocabulary
├── sql/
│   └── consolidated_schema.sql # Full DB schema (921 lines)
├── supabase/migrations/       # Numbered migration SQL files
├── vercel.json                # Cron schedules
├── next.config.ts             # Image remote patterns (wildcard)
└── package.json               # Dependencies
```

---

## 4. Server/Client Component Boundary

| Layer | Component Type | Key Files |
|---|---|---|
| **Root Layout** | Server | `app/layout.tsx` |
| **Landing Page** | Client (`'use client'`) | `app/page.tsx` |
| **Dashboard Layout** | Server | `app/dashboard/layout.tsx` |
| **Dashboard Page** | Server (data fetching) | `app/dashboard/page.tsx` |
| **Chart** | Client | `components/MetricChart.tsx` (echarts-for-react) |
| **Feed** | Client | `components/BreakingNewsFeed.tsx` |
| **Sidebar** | Client | `components/Sidebar.tsx` |
| **Modal / Forms** | Client | `AddActivityModal.tsx`, `PeerReviewModal.tsx`, `SettingsClient.tsx` |
| **Pills / Selectors** | Client | `MetricPillSelector.tsx`, `DateRangeSelector.tsx` |
| **Vote Button** | Client | `VoteButton.tsx` |

Pattern: Server Components fetch data and pass serialized props. Client Components handle interactivity, calling Server Actions directly.

---

## 5. Supabase Client Factories

Defined in [server.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/supabase/server.ts):

| Factory | Key Used | RLS Behavior | Header Injection |
|---|---|---|---|
| `createClient()` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Enforced | Reads `app_session` cookie → injects `x-group-id` header into Supabase global headers |
| `createAdminClient()` | `SUPABASE_SERVICE_ROLE_KEY` | **Bypassed** | None |

- `createAdminClient()` attempts service role key first; falls back to anon key with empty `x-group-id` (source: [server.ts L42-68](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/supabase/server.ts#L42-L68))
- RLS policies use `current_setting('request.headers', true)::json->>'x-group-id'` for group isolation (source: [consolidated_schema.sql L684-748](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/sql/consolidated_schema.sql#L684-L748))

---

## 6. Deployment Configuration

| Config | Value | Source |
|---|---|---|
| **Host** | Vercel | vercel.json |
| **Framework** | Next.js 16 | package.json |
| **Node.js Version** | [UNKNOWN — see 04_Security_and_Gap_Analysis.md] | |
| **Max Function Duration** | 60s (explicitly set on webhook + cron routes) | `export const maxDuration = 60` |
| **Images** | Wildcard remote patterns (`**` for all hosts) | [next.config.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/next.config.ts) |

---

## 7. Dependency Map

| Package | Version | Purpose |
|---|---|---|
| `next` | 16.2.10 | App Router framework |
| `react` / `react-dom` | 19.2.4 | UI rendering |
| `@supabase/supabase-js` | ^2.110.2 | Database client |
| `@supabase/ssr` | ^0.12.0 | Server-side Supabase cookie handling |
| `ai` | ^7.0.19 | Vercel AI SDK (generateText, generateObject) |
| `@ai-sdk/google` | ^4.0.11 | Gemini model provider |
| `jose` | ^6.2.3 | JWT sign/verify (HS256) |
| `zod` | ^4.4.3 | Schema validation (Telegram extraction, ingestion) |
| `echarts` / `echarts-for-react` | ^6.1.0 / ^3.0.6 | Charting |
| `swr` | ^2.4.2 | Client-side data fetching |
| `lucide-react` | ^1.24.0 | Icon set |
| `shadcn` | ^4.13.0 | UI component primitives |
| `tailwindcss` | ^4 | CSS utility framework |
| `class-variance-authority` | ^0.7.1 | Component variant utility |

---

## 8. Cron Schedule

Defined in [vercel.json](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/vercel.json):

| Job | Path | Schedule (UTC) | Authorization |
|---|---|---|---|
| Daily Whistle | `/api/cron/daily-whistle` | `0 3 * * *` (03:00 daily) | `Bearer CRON_SECRET` |
| AI Bookie | `/api/cron/ai-bookie` | `0 13 * * 1` (13:00 Monday) | `Bearer CRON_SECRET` |
| Wearables Sync | `/api/cron/sync-wearables` | `0 0 * * *` (midnight daily) | `Bearer CRON_SECRET` |
| WhatsApp Digest | `/api/cron/whatsapp-digest` | `0 12 * * *` (12:00 daily) | `Bearer CRON_SECRET` |

All cron handlers validate `Authorization: Bearer <CRON_SECRET>` via `safeCompare()`.
