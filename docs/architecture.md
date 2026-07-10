# System Architecture & Communication Map

## 1. Infrastructure Overview

| Layer | Technology |
|---|---|
| Hosting & Serverless API | Vercel (Next.js 15 App Router) |
| Database, Auth, Storage | Supabase Cloud (PostgreSQL 15) |
| Bot Ingestion Interface | Telegram Bot API via Webhooks |
| AI Processing Engine | Google Gemini 2.0 Flash (via `@ai-sdk/google`) |

---

## 2. Database Schema (v3 — Migration 0002)

### Core Tables

```
groups            id (UUID PK), name, invite_code (UNIQUE)
profiles          id (UUID PK → auth.users), full_name, avatar_url,
                  total_xp, current_level, telegram_user_id (TEXT UNIQUE)
group_members     user_id (→ profiles), group_id (→ groups),
                  joined_at  │  PK: (user_id, group_id)  ← many-to-many
```

### Event Engine

```
metric_logs       id (UUID PK), user_id, group_id, metric_slug (TEXT),
                  value (NUMERIC), unit (TEXT), status (pending|verified|rejected),
                  evidence_url, logged_at
```

`metric_slug` is stored directly (e.g. `'deadlift'`, `'beers'`) rather than a FK
into `metrics_config`. This allows the Telegram bot and AI pipeline to insert in
one step without a secondary lookup. `metrics_config` is still used for XP reward
lookup and display names.

### Peer-Review Engine

```
log_votes         id (UUID PK), log_id (→ metric_logs), user_id (→ profiles),
                  cast_at  │  UNIQUE(log_id, user_id) — prevents double-voting
```

**Auto-verify trigger** (`trg_auto_verify`): fires `AFTER INSERT` on `log_votes`.
When `count(votes for log_id) >= 3`, the trigger flips `metric_logs.status →
'verified'`, which in turn fires the XP award trigger.

**XP trigger** (`trg_award_xp_v2`): fires `AFTER UPDATE OF status` on
`metric_logs`. Looks up `xp_reward` from `metrics_config` by slug; defaults to
25 XP for unknown slugs. Updates `total_xp` and recomputes `current_level` on the
author's profile row atomically.

---

## 3. Multi-Tenant Isolation (Many-to-Many)

A user can belong to **multiple groups simultaneously** via `group_members`.

### RLS Isolation Predicate

A security-definer helper function `shares_group_with_caller(target_user_id)` is
used as the core isolation predicate:

```sql
-- Returns true if caller and target share at least one group
select exists (
  select 1
    from group_members a
    join group_members b on a.group_id = b.group_id
   where a.user_id = auth.uid()
     and b.user_id = target_user_id
);
```

### RLS Policy Summary

| Table | SELECT | INSERT |
|---|---|---|
| `groups` | group_id in caller's memberships | — |
| `group_members` | same group_id as caller | own user_id only |
| `profiles` | own row OR shares_group_with_caller() | own user_id only |
| `metric_logs` | group_id in caller's memberships | own user_id + valid group_id |
| `log_votes` | log's group_id in caller's memberships | share group + NOT own log |

The `log_votes` INSERT policy enforces **no self-voting at the database level** —
a separate application-layer check is unnecessary.

---

## 4. Dynamic Query Engine (`lib/queries.ts`)

All dashboard data flows through typed server-side utility functions. The key function:

```typescript
getDashboardData(supabase, groupId, metricSlug?, days?, limit?)
```

- Applies **two isolation fences**: explicit `group_id` parameter (index scan) + RLS
- Appends `.eq('metric_slug', metricSlug)` only when a slug is provided (no SQL injection risk — Supabase JS uses parameterized queries)
- Joins `profiles` via `!inner` for author name + avatar
- Aggregates KPI stats server-side — no raw arrays serialized to the browser

Supporting functions:
- `getGroupIdForUser(supabase, userId)` — resolves primary group for a user
- `getPendingLogsForGroup(supabase, groupId, callerId)` — peer-review queue (excludes caller's own logs)

---

## 5. Data Ingestion Paths

### Path A — Manual (Dashboard Modal)

1. User clicks `+ Add Activity` → shadcn Dialog opens
2. Raw text submitted → Next.js Server Action (`ingestActivity`)
3. `generateText` (Gemini) + manual JSON parse → `{ metric_slug, value, unit }`
4. Insert into `metric_logs` with `status: 'pending'`
5. Peer-review votes accumulate → auto-verify trigger fires at 3 votes

### Path B — Telegram Bot Webhook (`/api/telegram`)

1. User sends message to Telegram bot
2. Telegram calls `POST /api/telegram` with `X-Telegram-Bot-Api-Secret-Token` header
3. Route verifies header against `TELEGRAM_WEBHOOK_SECRET` env var — rejects otherwise
4. `telegram_user_id` (from Telegram payload) → profile lookup → group_id resolution
5. **AI Extraction (Anti-Injection)**:
   - `generateObject` (Gemini) with strict Zod schema `{ metric_slug, value, unit }`
   - Hard system prompt explicitly forbids roleplay, jailbreaks, and non-extraction tasks
   - Model cannot output anything outside the Zod schema shape
6. Parameterized Supabase JS insert — no raw SQL, no string concatenation
7. `status: 'pending'` → enters peer-review queue
8. Unknown users receive silent 200 OK (prevents user enumeration)

### Security Layers Summary

| Threat | Mitigation |
|---|---|
| Unauthorized webhook calls | `X-Telegram-Bot-Api-Secret-Token` header check |
| Prompt injection via Telegram message | Hard system prompt + `generateObject` Zod schema |
| SQL injection | Supabase JS parameterized methods only |
| User enumeration | Silent 200 OK for unknown telegram_user_id |
| Cross-group data leakage | RLS double-fence (explicit group_id + Postgres policy) |
| Self-vote abuse | `log_votes` INSERT policy: `ml.user_id <> auth.uid()` |
| Double-voting | `UNIQUE(log_id, user_id)` constraint on `log_votes` |

---

## 6. Environment Variables Required

| Variable | Where Used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server Supabase client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Telegram webhook (service-role, server-only) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `@ai-sdk/google` auto-detection |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook route secret token verification |
| `SESSION_SECRET` | Kiosk JWT cookie encryption key (min 32 chars) |

---

## 7. Kiosk Auth Model & Room Session Security

### Strict Room Session (Personal PINs & 1-Step Login)
The kiosk application operates entirely decoupled from traditional Supabase Auth. Authentication and tenant-scoping are enforced at the application level:
1. **1-Step Selection & Personal PIN Verification**: The user selects a group (publicly visible) and enters their 4-digit personal PIN (stored as `pin` in the `profiles` table).
2. **Database Verification**: The server action `loginWithPersonalPinAction` queries the database joining `profiles` and `group_members` to find a matching user who belongs to the selected `groupId` with the exact `pin`.
3. **Session Cookie**: If a match is found, the server issues a signed, HTTP-only `app_session` cookie containing `{ userId, groupId, groupName, userName }`.
4. **Welcome Animation (Party Poppers)**: On successful login, the frontend renders a 2.5-second success state saying "Welcome back, [First Name]!" and fires a lightweight, pure-CSS falling confetti animation.
5. **Client-Side Redirect**: After the animation completes, client-side navigation (`router.push('/dashboard')`) is triggered.
6. **Request Proxy Guard**: Next.js 16 request proxy (`proxy.ts`) intercepts `/dashboard` paths. Any request without a valid, unexpired `app_session` cookie is strictly redirected back to `/`.

### Kiosk Database RLS Strategy
Since clients access the landing page unauthenticated, specific table policies allow read operations for anonymous users:
- **`groups`**: Accessible via `SELECT` to public/anonymous users so the dropdown list can populate. (Only `id` and `name` are loaded; the PIN code is handled privately during verification).
- **`profiles` / `group_members`**: Readable by `anon` client to verify credentials and map users to groups.
- **SQL RLS Fix**:
```sql
DROP POLICY IF EXISTS "groups: anon can list group names" ON public.groups;
CREATE POLICY "groups: anon can read"
  ON public.groups FOR SELECT
  TO anon
  USING (true);
```