# 06 — API Routes & Server Actions

> **Last updated:** 2026-07-19
> **Pattern**: Next.js App Router Server Actions (`'use server'`) + Route Handlers (`/api/*`)
> **Authentication Check**: Re-verified inside each Server Action independently using cookie validation
> **Client Execution**: Server actions are called directly from client views as asynchronous functions

### Revision Log
| Date | Commit | Sections Touched | Summary |
|---|---|---|---|
| 2026-07-18 | fa4c8bb | §1.6, §2 (new) | Add explicit signature/logic for `adminUpdatePersistentMood` (previously only bullet-listed). Add §2 index of Route Handlers (webhooks + cron + wearables OAuth) with method, auth, `maxDuration`. |
| 2026-07-18 | (post-fa4c8bb) | §1.6 | `persistent_mood` allowed set reduced to `'Normal', 'Angry', 'Sad', 'Arrogant', 'Sarcastic'` per new migration `0021_remove_deprecated_moods_and_vocab.sql` (`'Horny', 'Happy', 'Flirting', 'Romantic'` removed). |
| 2026-07-18 | (security audit) | §1.1, §1.6 | SEC-01: document new server-side admin role check in `requireAdminSession()` and auth guard added to `adminToggleBotMute`/`getBotMuteStatus`. SEC-04: document PIN hashing (bcrypt) replacing plaintext compare in `loginWithPersonalPinAction` and `adminResetPin`. See Findings_and_Recommendations.md SEC-01/SEC-04. |
| 2026-07-19 | (Documentation audit) | §2 | Corrected stale "daily-whistle is the only cron scheduled" claim (three more crons — `reset-monthly-streaks`, `monthly-summary`, plus `sync-wearables` — are also active). Added `/api/cron/reset-monthly-streaks`, `/api/cron/monthly-summary`, `/api/push/subscribe`, `/api/push/send` route entries. |
| 2026-07-22 | (Leagues Democratization) | §1.4 | Democratized `assignLeagueTeam` and `createLeagueChallenge` in `app/actions/leagues.ts` (removed `requireAdminSession` restriction; open to all group members). Added `getGroupMembers()` server action to retrieve group roster for player team assignment in the Challenges → Leagues tab. |

---

## 1. Complete Server Actions Index

### 1.1 Authentication & Group Management Actions

Source: [app/actions/auth.ts](../app/actions/auth.ts)

- **`getGroupsAction`**
  - **Signature**: `(): Promise<{ groups: Group[]; error?: string }>`
  - **Client**: Anon client (public access to allow login selector initialization)
  - **Logic**: Selects `id`, `name` from `groups` where `invite_code` is not null, ordered by `name` ascending.

- **`loginWithPersonalPinAction`**
  - **Signature**: `(groupId: string, pin: string): Promise<LoginResult>`
  - **Client**: Admin client (service role to read PINs)
  - **Logic**: Fetches the group's `group_members` + `profiles` roster and verifies the PIN in application code (SEC-04: PINs are bcrypt-hashed, so exact-match filtering can no longer happen in the query itself).
  - **Security**: Verifies PIN via `verifyPin()` (`lib/security.ts`) — `bcrypt.compare()` against the stored hash, with a one-time fallback to `safeCompare()` for any legacy plaintext PIN, which is transparently re-hashed on successful login. Introduces 1000ms delay + `lib/rateLimit.ts` ip/group lockout on failure. Sets JWT session cookie `app_session`.

- **`signUpAction`**
  - **Signature**: `(inviteCode, fullName, nickname, email, pin, gender, phoneNumber): Promise<SignUpResult>`
  - **Client**: Admin client
  - **Logic**: Matches `inviteCode` to group. Performs checks to prevent duplicates (same email OR phone_number; same composite fullName + nickname). Inserts profile, inserts `group_members` record, encodes session JWT, sets cookie.

- **`restoreSessionAction`**
  - **Signature**: `(token: string): Promise<{ success: boolean; error?: string }>`
  - **Logic**: Calls `decodeSession(token)`. If valid, resets cookie `app_session` with standard options, returning success.

- **`selectProfileAction`**
  - **Signature**: `(userId, groupId, groupName, userName): Promise<void>`
  - **Logic**: Sets `app_session` cookie directly with parameters, then executes Next.js server-side `redirect('/dashboard')`.

- **`logoutAction`**
  - **Signature**: `(): Promise<void>`
  - **Logic**: Resets `app_session` cookie with `maxAge: 0` to delete it, then calls `redirect('/')`.

---

### 1.2 Ingestion & Logging Actions

Source: [app/actions/ingest.ts](../app/actions/ingest.ts), [app/actions/logDirect.ts](../app/actions/logDirect.ts)

- **`ingestActivity`**
  - **Signature**: `(rawText: string, userId: string, groupId: string): Promise<IngestResult>`
  - **Client**: Admin client
  - **Logic**: Resolves configs and definitions. Invokes Gemini to extract `{ metric_slug, value, unit }`. Matches slug case-insensitively. Inserts `metric_logs` row. Triggers revalidation.

- **`logDirectActivity`**
  - **Signature**: `(metricSlug, value, unit, userId, groupId): Promise<DirectLogResult>`
  - **Client**: Admin client
  - **Logic**: Direct INSERT into `metric_logs`. Skips AI. Assigns status based on slug (`car_top_speed`/`most_beers` → `'pending'`).

- **`logActivityManual`**
  - **Signature**: `(metricSlug, value, unit, userId, groupId, caption?, durationSeconds?, loggedAtDate?): Promise<DirectLogResult>`
  - **Client**: Admin client
  - **Logic**:
    1. Validates `loggedAtDate` pattern. Appends `T12:00:00Z` to custom dates.
    2. Attempts INSERT including `caption` and `duration_seconds`.
    3. On failure due to missing database columns, catches error, console-warns, and retries INSERT omitting optional columns.
    4. revalidatePath('/', 'layout').

---

### 1.3 Voting & Verification Actions

Source: [app/actions/vote.ts](../app/actions/vote.ts)

- **`processVerificationVote`**
  - **Signature**: `({ logId, vote }: { logId: string; vote: 'approve' | 'reject' }): Promise<VoteResult>`
  - **Client**: Admin client (resolves database operations via service role fallback)
  - **Workflow**:
    1. Verifies caller session is active and user is in target group.
    2. Enforces peer validation check: `log.user_id !== voterId` (cannot approve self).
    3. If `vote === 'approve'`:
       - Checks for existing vote row in `log_votes` to block double-voting.
       - Inserts vote row.
       - Counts total votes dynamically. If unique count >= 3, updates `status = 'verified'` in `metric_logs`.
    4. If `vote === 'reject'`:
       - Deletes all rows in `log_votes` matching `log_id`.
       - Deletes parent row in `metric_logs`.
    5. Calls `revalidatePath('/', 'layout')`.

- **`deleteActivityAction`**
  - **Signature**: `(logId: string, userId: string): Promise<VoteResult>`
  - **Client**: Admin client
  - **Logic**: Verifies caller is log owner. Cascades delete across child rows in `log_votes`, `approvals`, `comments`, `memory_comments`, and `xp_transactions` inside try/catch blocks, then deletes the parent `metric_logs` row.

---

### 1.4 Dynamic Custom Metrics CRUD

Source: [app/actions/metrics.ts](../app/actions/metrics.ts)

- **`createMetricDefinition`**
  - **Signature**: `(name, unit, sortDirection): Promise<{ success: boolean; definition?: any; error?: string }>`
  - **Client**: Admin client
  - **Logic**: Inserts row into `metric_definitions` using caller's session `groupId`.
  - **Revalidation**: Invokes `revalidatePath('/settings/metrics')`, `revalidatePath('/dashboard')`, `revalidatePath('/dashboard/leaderboard')`.

- **`adminFetchMetricDefinitions`**
  - **Signature**: `(groupId: string): Promise<{ success: boolean; data: any[]; error?: string }>`
  - **Logic**: Selects rows from `metric_definitions` where `group_id = groupId`, ordered by name.

- **`adminUpdateMetricDefinition`**
  - **Signature**: `(id, name, unit, sortDirection): Promise<{ success: boolean; error?: string }>`
  - **Logic**: Updates name, unit, and sort direction where id matches. Revalidates paths.

- **`adminDeleteMetricDefinition`**
  - **Signature**: `(id: string): Promise<{ success: boolean; error?: string }>`
  - **Logic**: Deletes metric definition row where id matches. Revalidates paths.

- **`adminToggleMetricHidden`**
  - **Signature**: `(id: string, isHidden: boolean): Promise<{ success: boolean; error?: string }>`
  - **Logic**: Updates `is_hidden` column. If query fails due to missing database column, catches error and returns helpful configuration migration warning.

---

### 1.5 Shared Memories Actions

Source: [app/actions/memories.ts](../app/actions/memories.ts)

- **`uploadAndCreateMemoryAction`**
  - **Signature**: `(base64Image, fileName, groupId, userId, caption?): Promise<{ success: boolean; memory?: any; error?: string }>`
  - **Client**: Admin client (bypasses storage/DB boundaries)
  - **Workflow**:
    1. Decodes base64 string to Buffer via `Buffer.from()`.
    2. Builds path: `${groupId}/${Date.now()}-${random}.jpg`.
    3. Uploads image to public bucket `memories` in Supabase Storage.
    4. Retrieves public storage URL via `supabase.storage.from('memories').getPublicUrl(filePath)`.
    5. Inserts record into `memories` table.
    6. Generates Fun AI Caption via Gemini by submitting image buffer + caption context.
    7. Formats caption text with uploader's name.
    8. Dispatches non-blocking POST request to Green API `sendFileByUrl` to broadcast memory in WhatsApp.
    9. Calls revalidatePath.

- **`addMemoryComment`**
  - **Signature**: `(memoryId, content, userId): Promise<{ success: boolean; comment?: any; error?: string }>`
  - **Logic**: Validates memory is in group, inserts record into `memory_comments`.

- **`deleteMemoryAction`**
  - **Signature**: `(memoryId, userId): Promise<{ success: boolean; memory?: any; error?: string }>`
  - **Logic**: Sets `deleted_at = new Date().toISOString()` in `memories` where user matches uploader and group matches caller session.

---

### 1.6 Admin Panel Console Actions

Source: [app/actions/admin.ts](../app/actions/admin.ts)

- **Authorization (SEC-01)**: every action in this file calls `requireAdminSession()`, which verifies the session cookie, that any passed `groupId` matches the session's own `groupId`, AND that the caller holds `role = 'admin'` in that group's `group_members` row (queried directly, not trusted from the client). Previously this helper only checked session validity + group match — any authenticated member could invoke these actions directly. `adminToggleBotMute`/`getBotMuteStatus` previously had no auth check at all and now also call `requireAdminSession()`.
- **`adminToggleBotMute`**: Updates `value` in `system_settings` where `key = 'bot_muted'`.
- **`adminResetPin`**: Hashes the new PIN with `hashPin()` (bcrypt) before updating `pin` in `profiles` where user ID matches (SEC-04).
- **`adminUpdateMemberRole`**: Updates `role` in `group_members` where user and group IDs match.
- **`adminRemoveMember`**: Deletes association row from `group_members`.
- **`adminTriggerPoke`**: Builds Fisky prompt based on target lore, routed slang vocabulary, custom situation context, and gender. Generates roast text via Gemini. Dispatches reply to group via Green API `sendMessage`.
- **`adminEditLog`**: Updates `value` in `metric_logs` where log ID matches.
- **`adminVerifyLog`**: Sets `status = 'verified'` in `metric_logs` directly.
- **`adminDeleteLog`**: Deletes log row.
- **`adminToggleUserActive`**: Updates `is_active` boolean on profile row.
- **`adminHardDeleteUser`**: Deletes profile row (cascades database-wide via constraints).
- **`adminUpsertMemberLore`**: Upserts traits to `member_lore`.
- **`adminUpsertVocabBank`**: Upserts word arrays to `vocab_banks`.
- **`adminDeleteVocabBank`**: Deletes row from `vocab_banks`.
- **`adminUpdatePersistentMood`**
  - **Signature**: `(groupId: string, mood: string, targetUserId: string | null): Promise<{ success: boolean; error?: string }>`
  - **Client**: Admin client
  - **Logic**: Upserts row into `bot_persistent_state` `{group_id, persistent_mood, target_user_id, updated_at}` with `onConflict: 'group_id'`. Revalidates `/settings/metrics`. `persistent_mood` must satisfy the DB CHECK constraint (see migrations 0017 + 0021): one of `'Normal', 'Angry', 'Sad', 'Arrogant', 'Sarcastic'`. (source: `app/actions/admin.ts` L572-603)
- **`adminUploadAvatarAction`**: Decodes base64, uploads buffer to `avatars` bucket, updates profile `avatar_url`, and revalidates path.

---

## 2. Route Handlers Index

| Route | Method(s) | maxDuration | Auth | Purpose | Source |
|---|---|---|---|---|---|
| `/api/webhooks/whatsapp` | POST | 60 s | `safeCompare(body.instanceData.idInstance, GREEN_API_INSTANCE_ID)` + `chatId === WHATSAPP_GROUP_ID` | Fisky inbound message handler; forks background work via `after()` | `app/api/webhooks/whatsapp/route.ts` |
| `/api/cron/daily-whistle` | GET, POST | 60 s | `Authorization: Bearer CRON_SECRET` via `safeCompare` | Morning briefing per group — one of four crons currently scheduled in `vercel.json` (see docs/09 §0 for the full, current list) | `app/api/cron/daily-whistle/route.ts` |
| `/api/cron/reset-monthly-streaks` | GET, POST | (framework default) | `Authorization: Bearer CRON_SECRET` | Monthly `profiles.streak_count` reset, 1st of month | `app/api/cron/reset-monthly-streaks/route.ts` |
| `/api/cron/monthly-summary` | GET, POST | (framework default) | `Authorization: Bearer CRON_SECRET` | Monthly WhatsApp recap broadcast per group, 1st of month | `app/api/cron/monthly-summary/route.ts` |
| `/api/cron/ai-bookie` | GET, POST | 60 s | `Authorization: Bearer CRON_SECRET` | Weekly Monday prop-bet broadcast — route still exists but its `vercel.json` cron entry was removed (no longer auto-triggered); callable directly with a valid bearer token if reactivated | `app/api/cron/ai-bookie/route.ts` |
| `/api/cron/sync-wearables` | GET | (framework default) | `Authorization: Bearer CRON_SECRET` | Daily wearable sync (Google Health v4 for Fitbit + real WHOOP API v2) | `app/api/cron/sync-wearables/route.ts` |
| `/api/cron/whatsapp-digest` | GET, POST | 60 s | `Authorization: Bearer CRON_SECRET` | Midday leaderboard/summary broadcast — route still exists but its `vercel.json` cron entry was removed (no longer auto-triggered) | `app/api/cron/whatsapp-digest/route.ts` |
| `/api/push/subscribe` | POST, DELETE | (framework default) | Cookie `app_session` → `decodeSession()` | Registers/removes a member's own web-push subscription | `app/api/push/subscribe/route.ts` |
| `/api/push/send` | POST | (framework default) | Cookie `app_session` + `group_members.role === 'admin'` | Admin-only test/utility push send to a target member's subscriptions | `app/api/push/send/route.ts` |
| `/api/wearables/connect/google` | GET | (framework default) | Cookie `app_session` → `decodeSession()` returns session | Initiates OAuth 2.0 authorization redirect | `app/api/wearables/connect/google/route.ts` |
| `/api/wearables/callback/google` | GET | (framework default) | State parameter carries `userId`; no cookie check | Exchanges auth code for tokens; upserts into `wearable_connections` under provider `'fitbit'` [VERIFY — label discrepancy: connect route builds Google auth URL and callback stores `provider: 'fitbit'`, yet sync route routes `fitbit` and `google_fit` cases to `syncGoogleHealthV4`. Intentional aliasing or historical name?] | `app/api/wearables/callback/google/route.ts` |
