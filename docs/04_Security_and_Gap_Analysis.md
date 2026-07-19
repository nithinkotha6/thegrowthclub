# 04 — Security & Gap Analysis

> **Last updated:** 2026-07-19
> **Scope**: Threat surface audit, verified security controls, and confirmed gaps.
> **Method**: Static analysis of source files. No production access or penetration testing performed.

### Revision Log
| Date | Commit | Sections Touched | Summary |
|---|---|---|---|
| 2026-07-19 | (Documentation audit) | §1.1, §1.3, §1.4, §3, §4, §5.1 | Removed all stale Telegram references (integration fully removed from the codebase in an earlier pass; this doc had drifted). Added `push_subscriptions` to the RLS matrix. Added `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY` to the secret inventory. Re-added `NEXT_PUBLIC_APP_URL` (now wired up in `daily-whistle`'s footer link, no longer unused). |
| 2026-07-18 | fa4c8bb | §1.2, §2.1, §2.2, §3, §4 | Correct JWT TTL (24h, not 30d) and cookie SameSite (`strict`, not Lax); downgrade §2.1 middleware-missing finding — `proxy.ts` (Next 16 replacement) is present and guards `/dashboard/:path*`; correct dev-secret fallback string in §2.2; add `member_lore` and `vocab_banks` to RLS matrix with `USING (true)` open-policy warning; remove `NEXT_PUBLIC_APP_URL` from secret inventory (unused in `.ts`/`.tsx` code). |
| 2026-07-18 | (security audit) | §1.8 (new), §2.1, §2.2, §2.4, §2.5, §2.8, §2.11 (new) | SEC-01: fixed — `requireAdminSession()` now checks `group_members.role === 'admin'`, not just session validity; closes a privilege-escalation gap where any authenticated member could call admin-only Server Actions (previously understated as a "UI-only" bypass in §2.5). `adminToggleBotMute`/`getBotMuteStatus` gained an auth check (previously had none). SEC-02: removed plaintext-PIN `console.log` in `loginWithPersonalPinAction`. SEC-03: dev-secret JWT fallback in §2.2 now requires `NODE_ENV === 'development'` exactly, closing the staging/preview silent-known-key gap. SEC-04: PINs are now bcrypt-hashed (§2.8 downgraded from open gap to fixed, with lazy migration for legacy plaintext rows). SEC-05: `createAdminClient()` (§2.4) now throws instead of silently falling back to the anon client. SEC-06: baseline security headers added to `next.config.ts` (§1.8); CSP left open (§2.11). Proxy matcher already covers `/settings/*` (§2.1 confirmed fixed). See Findings_and_Recommendations.md SEC-01 through SEC-08. |
| 2026-07-18 | (wearables accuracy pass) | §4 | Added `WHOOP_CLIENT_ID`/`WHOOP_CLIENT_SECRET` (real WHOOP OAuth integration replacing the prior mock) and the dynamically-named `WEARABLE_KEY_<PROVIDER>_<NICKNAME>` per-user refresh-token fallback to the secret inventory. |
| 2026-07-18 | (feature cleanup) | §1.6, §4 | Telegram ingestion channel removed entirely — removed its webhook-verification row from §1.6 and its `TELEGRAM_WEBHOOK_SECRET` row from §4. |
| 2026-07-18 | (feature cleanup) | §1.6, §4 | Telegram ingestion channel removed entirely — removed its webhook-verification row from §1.6 and its `TELEGRAM_WEBHOOK_SECRET` row from §4. |

---

## 1. Verified Security Controls

### 1.1 Timing-Safe Comparisons

- `safeCompare()` in [lib/security.ts](../lib/security.ts) — XOR-based constant-time string comparison
- Used for: webhook secret verification, cron token verification, instance ID matching
- Applied in: WhatsApp webhook, all cron handlers

### 1.2 JWT Session Security

- HS256 signing via `jose` (source: [session.ts](../lib/session.ts))
- HTTP-only, Secure (production only), `SameSite: 'strict'` cookie
- **24-hour expiration** enforced at signing time (`SESSION_TTL_SECONDS = 60 * 60 * 24` — source: `lib/session.ts` L17)

### 1.3 SQL Injection Prevention

- All database operations use Supabase JS SDK parameterized methods
- No raw SQL in application code

### 1.4 AI Prompt Injection Mitigation

- `generateObject()` constrains structured LLM output to an exact Zod schema shape (web ingestion's `MetricSchema`)
- Web ingestion: same pattern via `MetricSchema` Zod validation

### 1.5 Row Level Security (RLS)

- Enabled on all 12+ tables
- Group isolation via `x-group-id` PostgREST header
- Policies use `nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid`
- Admin operations use `service_role` key to bypass RLS intentionally

### 1.6 Webhook Instance Verification

- WhatsApp: incoming `instanceData.idInstance` compared against `GREEN_API_INSTANCE_ID` via `safeCompare()` (source: [webhooks/whatsapp/route.ts L87-91](../app/api/webhooks/whatsapp/route.ts#L87-L91))

### 1.7 Server Action Session Verification

- Every server action independently validates the session cookie
- Pattern: decode JWT → compare `session.userId` with request `userId` parameter
- Prevents session hijacking and parameter tampering

### 1.8 PIN Login Rate Limiting & Security Headers

- PIN login brute-force defense: `lib/rateLimit.ts` tracks failed attempts per `(group_id, ip)` in the `login_attempts` table, locking out after 5 failures in a 15-minute window for 15 minutes, in addition to the existing 1000ms per-attempt delay (source: [rateLimit.ts](../lib/rateLimit.ts), migration `0028_login_attempts.sql`). Supersedes the earlier "1s `setTimeout` is the entire defense" gap.
- Baseline security headers configured in `next.config.ts`'s `headers()`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`, `Permissions-Policy` (source: [next.config.ts](../next.config.ts)). No Content-Security-Policy yet — left open, see §2.11.

---

## 2. Confirmed Gaps

### 2.1 ✅ FIXED — Auth Guard Split Between Proxy And Layout (Historically Flagged As CRITICAL)

- **Finding**: The project uses `proxy.ts` at repo root as the primary matcher-based auth guard — the Next.js 16 replacement for the deprecated `middleware.ts` convention (source: [proxy.ts](../proxy.ts) L44 matcher). `DashboardLayout` re-decodes the cookie as a fallback.
- **Current state**: `config.matcher` is now `['/dashboard/:path*', '/settings/:path*']` (source: [proxy.ts](../proxy.ts) L44-46) — `/settings/metrics` is covered by the proxy guard, not just by Server Action-level checks. No residual risk remains here.

### 2.2 ✅ FIXED — Dev Secret Fallback in Production Risk

- **Finding**: `SESSION_SECRET` falls back to `'default-dev-secret-do-not-use-in-prod-12345'` if unset AND `NODE_ENV !== 'production'`
- **Fix (SEC-03)**: The fallback condition now requires `NODE_ENV === 'development'` exactly (source: [session.ts L29-37](../lib/session.ts#L29-L37)). Any other value — unset, `'test'`, `'staging'`, `'preview'`, empty string — fails closed (`getSecret()` returns `null`, so `decodeSession` returns null and `encodeSession` throws) instead of silently signing JWTs with a well-known key.

### 2.3 🟡 HIGH — Wildcard Image Domains

- **Finding**: `next.config.ts` allows images from `**` (all hostnames, both HTTP and HTTPS)
- **Impact**: Enables SSRF via Next.js image optimization proxy; malicious users could inject internal URLs
- **Code**: [next.config.ts L4-15](../next.config.ts#L4-L15)
- **Recommendation**: Restrict to known domains (Supabase storage URL, specific CDNs)

### 2.4 ✅ FIXED — Admin Client Fallback to Anon Key

- **Finding**: `createAdminClient()` silently fell back to the anon key if `SUPABASE_SERVICE_ROLE_KEY` was unset
- **Fix (SEC-05)**: Now throws (`'SUPABASE_SERVICE_ROLE_KEY is not configured...'`) instead of silently degrading to an RLS-restricted anon client (source: [server.ts L48-63](../lib/supabase/server.ts#L48-L63)).

### 2.5 ✅ FIXED (was understated as HIGH/"UI-only") — Missing Server-Side Admin Role Check

- **Finding**: God Mode unlock state persisted in `sessionStorage` key `god_mode_unlocked`, trivially settable from the browser console (source: [SettingsClient.tsx L93](../components/SettingsClient.tsx#L93)). The original note assumed this was purely cosmetic because "admin mutations still require service role key server-side" — that assumption was wrong: the service role key only bypasses RLS, it does not perform authorization. `requireAdminSession()` in [app/actions/admin.ts](../app/actions/admin.ts) only checked session validity and group match, never the caller's `group_members.role`. Any authenticated member (not just admins) could invoke `adminResetPin`, `adminUpdateMemberRole`, `adminRemoveMember`, `adminHardDeleteUser`, `adminEditLog`/`adminVerifyLog`/`adminDeleteLog`, and 13 other admin Server Actions directly — a real, exploitable broken access control / privilege escalation gap, not just a UI inconvenience.
- **Fix (SEC-01)**: `requireAdminSession()` now queries `group_members.role` for the session's `(userId, groupId)` and requires `role === 'admin'`, mirroring the pattern already used correctly in `requireGroupAdminSession()` ([groups.ts L27-49](../app/actions/groups.ts#L27-L49)). `adminToggleBotMute`/`getBotMuteStatus`, which previously had no auth check of any kind, now call `requireAdminSession()` too.
- **Residual note**: The client-side `sessionStorage` gate itself is still only a UI convenience (now correctly backed by a real server-side check) — no further change needed there.

### 2.6 🟡 HIGH — WhatsApp Webhook Always Returns 200

- **Finding**: WhatsApp webhook returns 200 even on errors ("Always 200 to halt retries")
- **Impact**: Legitimate errors (missing env vars, crashes) are silently swallowed; Green API will not retry
- **Code**: [webhooks/whatsapp/route.ts L76, L431](../app/api/webhooks/whatsapp/route.ts#L76)
- **Note**: This is a deliberate design choice to prevent webhook retry storms

### 2.7 🟡 MEDIUM — Hardcoded Group Resolution

- **Finding**: WhatsApp handlers hardcode lookup for "Texas Buds" group or `invite_code = 'TEXASBUDS'`
- **Impact**: Multi-tenant deployments with different groups will fail to route messages correctly
- **Code**: [webhooks/whatsapp/route.ts L153](../app/api/webhooks/whatsapp/route.ts#L153), [whatsapp-digest/route.ts L80](../app/api/cron/whatsapp-digest/route.ts#L80)

### 2.8 ✅ FIXED — PIN Storage

- **Finding**: User PINs used to be stored as plaintext `varchar(4)` in `profiles.pin`.
- **Fix (SEC-04)**: PINs are now hashed with `bcryptjs` before being persisted (`hashPin()` in [lib/security.ts](../lib/security.ts), used by `signUpAction` and `adminResetPin`). `loginWithPersonalPinAction` verifies via `verifyPin()`, which uses `bcrypt.compare()` against the hash. Any pre-existing plaintext PIN is matched once via the legacy `safeCompare()` path and transparently re-hashed on that successful login (no bulk migration or forced logout needed). New dependency: `bcryptjs` (+ `@types/bcryptjs` dev dependency).

### 2.9 🟢 LOW — Chat History Unbounded Growth

- **Finding**: `chat_history` table has no TTL or auto-cleanup mechanism
- **Impact**: Storage costs grow linearly with WhatsApp message volume
- **Mitigation**: `/clear` command exists for manual wipe; 30-min inactivity window limits context loading

### 2.10 🟢 LOW — Wearable Token Storage

- **Finding**: OAuth2 `access_token` and `refresh_token` stored as plaintext in `wearable_connections`
- **Impact**: Database breach exposes third-party API credentials
- **Note**: Supabase encrypts data at rest; in-transit is TLS-protected

### 2.11 🟡 MEDIUM — No Content-Security-Policy Header (Open)

- **Finding**: `next.config.ts`'s `headers()` now sets `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, and `Permissions-Policy` (SEC-06), but no `Content-Security-Policy`.
- **Why left open**: A correct CSP requires enumerating every legitimate script/style/font/image/connect source (Tailwind, `echarts`, Supabase Storage, Google Fonts if any, Next.js's own inline hydration scripts) and testing the whole app against it — getting it wrong silently breaks pages rather than failing safely. That's a larger, dedicated pass, not a minimal diff.
- **Recommendation**: Build and test a CSP in a follow-up pass (start in `Content-Security-Policy-Report-Only` mode to observe violations before enforcing).

### 2.12 🟡 MEDIUM — Dependency CVE: PostCSS XSS (Nested in Next.js Toolchain)

- **Finding**: `npm audit` reports a moderate-severity XSS advisory in `postcss` (<8.5.10, [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)), pulled in transitively by `next`'s own bundled build tooling (`node_modules/next/node_modules/postcss`), not a direct project dependency.
- **Why left open**: The only `npm audit fix --force` path downgrades `next` to `9.3.4-canary.0`, an unrelated multi-major-version regression — clearly unsafe to apply. The vulnerable code path (unescaped `</style>` in PostCSS's CSS stringifier) is exercised by Next's internal build pipeline against this repo's own trusted CSS, not attacker-controlled input, so there is no known exploit path in this app's context.
- **Status**: **Requires human action** — monitor for an upstream Next.js patch release that bumps its bundled `postcss`; re-run `npm audit` after upgrading `next` in a future release cycle. Not fixable via a source change in this repo.

---

## 3. RLS Policy Matrix

| Table | Policy Name | Scope | Mechanism |
|---|---|---|---|
| `groups` | `groups: anon can read` | Global read | `USING (true)` — needed for landing page dropdown |
| `profiles` | `profiles_group_isolation` | Group-scoped | `x-group-id` header → `group_members` subquery |
| `group_members` | `group_members_group_isolation` | Group-scoped | `x-group-id` header direct match |
| `metric_logs` | `metric_logs_group_isolation` | Group-scoped | `x-group-id` header direct match |
| `log_votes` | `log_votes_group_isolation` | Group-scoped | Subquery against `metric_logs.group_id` |
| `memories` | `memories_group_isolation` | Group-scoped | `x-group-id` header direct match |
| `memory_comments` | `memory_comments_group_isolation` | Group-scoped | Subquery against `memories.group_id` |
| `metric_definitions` | `metric_definitions_group_isolation` | Group-scoped | `x-group-id` header direct match |
| `metrics_config` | `metrics_config: anon can read` | Global read | `USING (true)` — shared slug catalog |
| `chat_history` | `Allow service role full access on chat_history` | Service role only | No `anon`/`authenticated` policy — anon queries return zero rows even with RLS enabled |
| `system_settings` | `Allow service role full access` + `Allow select on system_settings to anonymous` + `Allow read/write for authenticated users` | Split | service_role FOR ALL; anon SELECT only; authenticated FOR ALL `USING (true)` (source: migration 0012_system_settings_fix.sql L27-38) |
| `bot_persistent_state` | `bot_persistent_state_group_isolation` + `Allow service role full access` | Group-scoped + service-role bypass | `x-group-id` header direct match (source: migration 0017_bot_persistent_state.sql) |
| `member_lore` | `Allow read/write for group members` | 🟡 **OPEN** — `FOR ALL USING (true)` | No group isolation applied (source: migration 0013_lore_and_vocab.sql L20-21). Anon/authenticated roles can read/write any row. Isolation relies on service-role usage from Server Actions. |
| `vocab_banks` | `Allow read/write for authenticated users` | 🟡 **OPEN** — `FOR ALL USING (true)` | No `target_gender`/`tone` scoping; any authenticated call can rewrite any row (source: migration 0013_lore_and_vocab.sql L34-35). |
| `wearable_connections`, `wearable_steps`, `wearable_sleep`, `wearable_resting_hr` | RLS enabled, no policies present in migrations | **Locked down to service_role only** | Migrations 0003 + 0020 enable RLS but declare no `FOR SELECT`/`FOR ALL` policy for `anon`/`authenticated`; only `service_role` (which bypasses RLS) can access rows. [VERIFY — confirm no policies were added out-of-band in the live Supabase project.] |
| `push_subscriptions` | `push_subscriptions_group_isolation` | Group-scoped | `x-group-id` header direct match, `USING`+`WITH CHECK` (source: migration `0039_add_streak_to_profiles.sql`) |

---

## 4. Secret Inventory

| Variable | Sensitivity | Documented Purpose |
|---|---|---|
| `SESSION_SECRET` | 🔴 Critical | JWT signing (min 32 chars enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔴 Critical | Full DB bypass |
| `GEMINI_API_KEYS` | 🟡 High | Comma-separated multi-key pool (preferred) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | 🟡 High | AI single-key fallback |
| `GEMINI_API_KEY` | 🟡 High | AI single-key fallback (secondary) |
| `GREEN_API_INSTANCE_ID` | 🟡 High | WhatsApp gateway instance |
| `GREEN_API_TOKEN` | 🟡 High | WhatsApp gateway token |
| `WHATSAPP_GROUP_ID` | 🟢 Low | Target chat JID for outbound broadcasts + inbound webhook scope |
| `CRON_SECRET` | 🟡 High | Bearer token for all cron routes |
| `GOOGLE_CLIENT_ID` | 🟡 High | OAuth2 (Google Health/Fit connect) |
| `GOOGLE_CLIENT_SECRET` | 🔴 Critical | OAuth2 secret |
| `WHOOP_CLIENT_ID` | 🟡 High | OAuth2 (WHOOP connect) |
| `WHOOP_CLIENT_SECRET` | 🔴 Critical | OAuth2 secret |
| `WEARABLE_KEY_<PROVIDER>_<NICKNAME>` | 🔴 Critical (per-user) | Dynamically-named, one per member who opts into the manual refresh-token fallback instead of the self-service OAuth Connect flow (see `docs/09_Cron_Services_and_Sync_Pipelines.md` §1.4). Holds that member's WHOOP/Fitbit refresh token — never an access token. No fixed count; created ad hoc as members request it. |
| `NEXT_PUBLIC_SUPABASE_URL` | 🟢 Low | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 🟢 Low | Public anon key (RLS-restricted) |
| `NODE_ENV` | (env, not secret) | Controls dev-secret fallback and cookie `secure` flag |
| `VAPID_PUBLIC_KEY` | 🟡 High | Web push (PWA) VAPID key pair — public half also duplicated as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` for client-side subscribe calls |
| `VAPID_PRIVATE_KEY` | 🔴 Critical | Web push (PWA) VAPID private key |
| `NEXT_PUBLIC_APP_URL` | 🟢 Low | Public app URL, appended to the `daily-whistle` broadcast footer when set (source: `app/api/cron/daily-whistle/route.ts`) — omitted from the message entirely if unset, no hardcoded fallback. |

---

## 5. Undocumented API Routes & Undocumented Env-var References

### 5.1 API route \u2194 doc coverage

| Route file | Documented in | Doc entry has header comment? |
|---|---|---|
| `app/api/webhooks/whatsapp/route.ts` | 05_Whatsapp_Agent.md, 06_API_Routes_and_Server_Actions.md | Yes (in-file `[webhook/whatsapp]` log tags but no JSDoc block) |

| `app/api/cron/daily-whistle/route.ts` | 09_Cron_Services_and_Sync_Pipelines.md, 01\u00a78 | No JSDoc; comment-only sections |
| `app/api/cron/ai-bookie/route.ts` | 09_Cron_Services_and_Sync_Pipelines.md, 01\u00a78 | No JSDoc; comment-only sections |
| `app/api/cron/sync-wearables/route.ts` | 09_Cron_Services_and_Sync_Pipelines.md, 01\u00a78 | No JSDoc; comment-only sections |
| `app/api/cron/whatsapp-digest/route.ts` | 09_Cron_Services_and_Sync_Pipelines.md, 01\u00a78 | No JSDoc; comment-only sections |
| `app/api/wearables/connect/google/route.ts` | 09_Cron_Services_and_Sync_Pipelines.md \u00a71 (indirect), 01\u00a74.1 | No JSDoc |
| `app/api/wearables/callback/google/route.ts` | 09_Cron_Services_and_Sync_Pipelines.md \u00a71 (indirect), 01\u00a74.1 | No JSDoc |

### 5.2 `process.env.*` references

Cross-checked via `grep 'process\\.env\\.'` \u2192 all identifiers are covered by the \u00a74 secret inventory, including `NEXT_PUBLIC_APP_URL` (now wired up \u2014 see \u00a74).

### 5.3 Under-commented complex logic (functions >~40 lines OR 3+ nested branches, no docstring)

| File \u00b7 Function | Approx LoC | Nested branch depth | Docstring? |\n|---|---|---|---|\n| `app/api/cron/sync-wearables/route.ts` \u00b7 `syncGoogleHealthV4` | ~280 | 5+ (chunk loop \u2192 dataType switch \u2192 payload parse) | No |\n| `app/api/cron/sync-wearables/route.ts` \u00b7 `refreshGoogleAccessToken` | ~80 | 3 | Yes (top comment) |\n| `app/api/cron/daily-whistle/route.ts` \u00b7 `handleRequest` streak loop | ~60 | 4 (member loop \u2192 date loop \u2192 walk-back loop \u2192 walk-back loop) | No |\n| `app/api/webhooks/whatsapp/route.ts` \u00b7 `POST` (root + `after()` closure) | ~380 | 4 | No (inline `//` comments only) |\n| `app/actions/admin.ts` \u00b7 `adminTriggerPoke` | ~180 | 3 | No |\n| `app/actions/memories.ts` \u00b7 `uploadAndCreateMemoryAction` | ~180 | 4 (WA broadcast branch \u2192 AI caption try/catch \u2192 fetch dispatch \u2192 error) | No |\n| `app/actions/auth.ts` \u00b7 `loginWithPersonalPinAction` | ~110 | 3 | Yes (JSDoc header) |\n| `app/actions/auth.ts` \u00b7 `signUpAction` | ~150 | 3 | Yes (JSDoc header) |\n| `app/actions/ingest.ts` \u00b7 `ingestActivity` | ~140 | 3 | Yes (JSDoc header) |\n| `lib/queries.ts` \u00b7 `getChartData` | ~120 | 4 (bucket switch \u2192 map build \u2192 series build \u2192 cumulative branch) | Yes (JSDoc header) |\n\n---\n\n## 6. Architectural Blind Spots & Missing Requirements\n\nOne verdict per bullet, tied to concrete code sites.\n\n### 6.1 Missing infrastructure / logging / alerting / CI-CD\n\n- **No error-tracking sink.** All handlers use `console.error(...)` (grep: 60+ hits across `app/**` and `lib/**`). No Sentry, no Vercel log drain configured in `vercel.json`. Verdict: **operational blind spot.** In production, `[webhook/whatsapp] Background processing crashed:` will only appear in Vercel Function logs, which are ephemeral (24h on Hobby plan) and un-alertable.\n- **No CI configuration files.** `.github/workflows/`, `.gitlab-ci.yml`, `.circleci/`, `azure-pipelines.yml` \u2014 none present. Verdict: **untested-on-push.** `npm run lint` and `npm run build` exist in `package.json` scripts but are not enforced pre-merge.\n- **No migration runner.** `supabase/migrations/*.sql` and `sql/consolidated_schema.sql` coexist without a documented apply order or CLI wrapper (no `supabase db push` invocation in scripts). Verdict: **schema drift risk.** The `[dashboard] auto-migration error:` block in `app/dashboard/page.tsx` L143-176 is a runtime hack that renames `long_run` \u2192 `top_golf` on every page render; this is a symptom, not a solution.\n- **No health-check endpoint.** No `/api/health` or `/api/status`. Verdict: **uptime monitoring must scrape the landing page HTML**, which is a client component that always renders 200 even when Supabase is down.\n\n### 6.2 Missing enterprise security controls\n\n- **No rate limiting.** `loginWithPersonalPinAction` uses a 1000 ms artificial delay on wrong PIN (auth.ts L146) as the only brute-force defense. Verdict: **inadequate.** A 4-digit PIN space is 10 000 values; at 1 request/sec via parallel connections a full sweep is <3 hours. No IP/user throttling, no Vercel WAF rule documented.\n- **No CSRF token.** Server Actions are POSTed as `multipart/form-data` from same-origin browsers; Next.js supplies a same-site sameSite `strict` cookie which mitigates but does not eliminate cross-site abuse via image-tag GETs of route handlers. Verdict: **relies on browser policy alone.**\n- **No input sanitization for user text inserted verbatim into Gemini prompts.** `webhooks/whatsapp/route.ts` L367 constructs `promptText = \\`Message from ${senderName}: ${incomingMessage}\\`` with no escaping. Verdict: **prompt-injection exposure** on inbound WhatsApp path; mitigated only by `CUSTOM_SYSTEM_RULES` prose (which the model can be talked out of). Web ingestion is safer since it uses `generateObject()` with a Zod schema, constraining output shape.\n- **JWT has no `jti` / no server-side revocation list.** Logout only clears the client cookie (auth.ts L419). If a JWT is stolen it remains valid for up to 24h with no way to invalidate.\n- **`SUPABASE_SERVICE_ROLE_KEY` used for the majority of dashboard reads.** `app/dashboard/page.tsx` L110 uses `createAdminClient()`, so RLS is bypassed even for logged-in group reads. Verdict: **defense-in-depth is not in effect** \u2014 a bug in Server Action parameter validation becomes a full cross-tenant read.\n\n### 6.3 Missing data validation / edge-case handling\n\n- **`ingestActivity` `MetricSchema.transform` swallows type errors silently.** `value: z.any().transform(v => isNaN(Number(v)) ? 0 : Number(v))` will insert a `0`-value log rather than reject; combined with `car_top_speed`/`most_beers` \u2192 `pending`, the user can create empty pending logs. Verdict: **data corruption risk.**\n- **`logActivityManual` retries INSERT on any error whose message contains the substring `'column'`** (logDirect.ts L106). Verdict: **overbroad catch** \u2014 any DB error with the word \"column\" in it (e.g. `check constraint \"..._column_check\"`) triggers a silent fallback that drops the caption/duration values.\n- **`processVerificationVote` recomputes vote count client-side then updates status** (vote.ts L104-116). The DB trigger `trg_auto_verify` also does this. Verdict: **duplicate write path** \u2014 both paths race in the >=3 vote boundary; not idempotent-safe.\n- **`getChartData` bucketing uses `Math.floor(d.getTime() / (1000*60*60*24))` for epoch-day arithmetic** (queries.ts L133-153). This uses the local process timezone via `.toLocaleDateString(...)` for bucket labels but UTC epoch for bucket keys. Verdict: **timezone drift** \u2014 buckets can straddle midnight for users in negative UTC offsets.\n- **`app/dashboard/page.tsx` auto-migration** (L143-176) runs `INSERT`/`UPDATE`/`DELETE` on every page render without a lock. Verdict: **race hazard** \u2014 concurrent first renders can race on the `metrics_config` insert.\n\n### 6.4 Missing admin tools / user stories / data-recovery mechanisms\n\n- **No database backup schedule documented.** Supabase's automated backup cadence is plan-dependent and is not mirrored to app-side snapshots.\n- **No audit log.** Admin operations (`adminEditLog`, `adminDeleteLog`, `adminHardDeleteUser`, `adminUpdateMemberRole`) fire and forget \u2014 no `admin_audit` table records who did what when.\n- **Soft-delete UI only for memories and profiles.** `metric_logs` deletion is hard-only (vote.ts L138). Verdict: **no undo** for a rejected activity log; historical rejects vanish from the record.\n- **God Mode PIN is not stored anywhere in the reviewed code.** `SettingsClient.tsx` L729 compares against a value not shown in the snippet range read (line count of file is >800). [VERIFY] the PIN storage medium; if it is a hardcoded constant in `SettingsClient.tsx`, it is bundled to the browser and is not a secret.\n- **No admin \"impersonate user\" mode.** Debugging a specific user's dashboard requires knowing their PIN or manually issuing them a session cookie.\n- **No `/clear` audit trail.** The WhatsApp `/clear` command hard-deletes `chat_history` for the group (route.ts L112-118) with no log of who invoked it.\n
