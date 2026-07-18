# 06 — API Routes & Server Actions

> **Pattern**: Next.js App Router Server Actions (`'use server'`) + Route Handlers (`/api/*`)
> **Authentication Check**: Re-verified inside each Server Action independently using cookie validation
> **Client Execution**: Server actions are called directly from client views as asynchronous functions

---

## 1. Complete Server Actions Index

### 1.1 Authentication & Group Management Actions

Source: [app/actions/auth.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/auth.ts)

- **`getGroupsAction`**
  - **Signature**: `(): Promise<{ groups: Group[]; error?: string }>`
  - **Client**: Anon client (public access to allow login selector initialization)
  - **Logic**: Selects `id`, `name` from `groups` where `invite_code` is not null, ordered by `name` ascending.

- **`loginWithPersonalPinAction`**
  - **Signature**: `(groupId: string, pin: string): Promise<LoginResult>`
  - **Client**: Admin client (service role to read PINs)
  - **Logic**: Matches profiles linked to group via `group_members` where `pin = inputPin`.
  - **Security**: Verifies PIN using `safeCompare()` in application code. Introduces 1000ms delay on failure. Sets JWT session cookie `app_session`.

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

Source: [app/actions/ingest.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/ingest.ts), [app/actions/logDirect.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/logDirect.ts)

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

Source: [app/actions/vote.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/vote.ts)

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

Source: [app/actions/metrics.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/metrics.ts)

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

Source: [app/actions/memories.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/memories.ts)

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

Source: [app/actions/admin.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/admin.ts)

- **`adminToggleBotMute`**: Updates `value` in `system_settings` where `key = 'bot_muted'`.
- **`adminResetPin`**: Updates `pin` in `profiles` where user ID matches.
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
- **`adminUpdatePersistentMood`**: Upserts `persistent_mood` and `target_user_id` inside `bot_persistent_state`.
- **`adminUploadAvatarAction`**: Decodes base64, uploads buffer to `avatars` bucket, updates profile `avatar_url`, and revalidates path.
