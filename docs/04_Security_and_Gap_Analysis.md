# 04 — Security & Gap Analysis

> **Scope**: Threat surface audit, verified security controls, and confirmed gaps.
> **Method**: Static analysis of source files. No production access or penetration testing performed.

---

## 1. Verified Security Controls

### 1.1 Timing-Safe Comparisons

- `safeCompare()` in [lib/security.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/security.ts) — XOR-based constant-time string comparison
- Used for: webhook secret verification, cron token verification, instance ID matching
- Applied in: WhatsApp webhook, Telegram webhook, all 4 cron handlers

### 1.2 JWT Session Security

- HS256 signing via `jose` (source: [session.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/session.ts))
- HTTP-only, Secure (production), SameSite=Lax cookie
- 30-day expiration enforced at signing time

### 1.3 SQL Injection Prevention

- All database operations use Supabase JS SDK parameterized methods
- No raw SQL in application code
- Telegram handler explicitly documents this: "SQL injection is architecturally impossible via this path" (source: [telegram/route.ts L12](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/telegram/route.ts#L12))

### 1.4 AI Prompt Injection Mitigation

- Telegram extraction: strict Zod schema + anti-injection system prompt (source: [telegram/route.ts L43-71](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/telegram/route.ts#L43-L71))
- `generateObject()` constrains output to exact schema shape
- Web ingestion: same pattern via `MetricSchema` Zod validation

### 1.5 Row Level Security (RLS)

- Enabled on all 12+ tables
- Group isolation via `x-group-id` PostgREST header
- Policies use `nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid`
- Admin operations use `service_role` key to bypass RLS intentionally

### 1.6 Webhook Instance Verification

- WhatsApp: incoming `instanceData.idInstance` compared against `GREEN_API_INSTANCE_ID` via `safeCompare()` (source: [webhooks/whatsapp/route.ts L87-91](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/webhooks/whatsapp/route.ts#L87-L91))
- Telegram: `X-Telegram-Bot-Api-Secret-Token` header verified (source: [telegram/route.ts L86-89](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/telegram/route.ts#L86-L89))

### 1.7 Server Action Session Verification

- Every server action independently validates the session cookie
- Pattern: decode JWT → compare `session.userId` with request `userId` parameter
- Prevents session hijacking and parameter tampering

---

## 2. Confirmed Gaps

### 2.1 🔴 CRITICAL — No Middleware Auth Guard

- **Finding**: No `middleware.ts` file exists in the project
- **Impact**: Authentication is enforced only at the layout level (`dashboard/layout.tsx`) and within individual server actions
- **Risk**: A direct API call or new route added without auth checks would be unprotected
- **Recommendation**: Add Next.js middleware that intercepts all `/dashboard/*` routes and validates the session cookie before the page renders

### 2.2 🔴 CRITICAL — Dev Secret Fallback in Production Risk

- **Finding**: `SESSION_SECRET` falls back to `'dev-secret-key-do-not-use-in-production'` if unset AND `NODE_ENV !== 'production'`
- **Impact**: If `SESSION_SECRET` is accidentally unset in a staging environment that doesn't set `NODE_ENV=production`, all JWTs are signed with a known key
- **Code**: [session.ts L28-37](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/session.ts#L28-L37)
- **Recommendation**: Throw at startup if `SESSION_SECRET` is unset, regardless of environment

### 2.3 🟡 HIGH — Wildcard Image Domains

- **Finding**: `next.config.ts` allows images from `**` (all hostnames, both HTTP and HTTPS)
- **Impact**: Enables SSRF via Next.js image optimization proxy; malicious users could inject internal URLs
- **Code**: [next.config.ts L4-15](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/next.config.ts#L4-L15)
- **Recommendation**: Restrict to known domains (Supabase storage URL, specific CDNs)

### 2.4 🟡 HIGH — Admin Client Fallback to Anon Key

- **Finding**: `createAdminClient()` silently falls back to anon key if `SUPABASE_SERVICE_ROLE_KEY` is unset
- **Impact**: Admin operations (user management, PIN reset, log editing) would operate under RLS restrictions, potentially failing silently or leaking data across groups
- **Code**: [server.ts L54-68](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/supabase/server.ts#L54-L68)
- **Recommendation**: Throw if service role key is missing when admin client is requested

### 2.5 🟡 HIGH — God Mode PIN Stored Client-Side

- **Finding**: God Mode unlock state persisted in `sessionStorage` key `god_mode_unlocked`
- **Impact**: Client-side bypass — JavaScript console can set `sessionStorage.setItem('god_mode_unlocked', 'true')` to gain UI access to admin features
- **Mitigation**: Admin mutations still require service role key server-side; UI-only bypass
- **Code**: [SettingsClient.tsx L93](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/components/SettingsClient.tsx#L93)
- **Recommendation**: Validate admin role server-side on every admin action

### 2.6 🟡 HIGH — WhatsApp Webhook Always Returns 200

- **Finding**: WhatsApp webhook returns 200 even on errors ("Always 200 to halt retries")
- **Impact**: Legitimate errors (missing env vars, crashes) are silently swallowed; Green API will not retry
- **Code**: [webhooks/whatsapp/route.ts L76, L431](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/webhooks/whatsapp/route.ts#L76)
- **Note**: This is a deliberate design choice to prevent webhook retry storms

### 2.7 🟡 MEDIUM — Hardcoded Group Resolution

- **Finding**: WhatsApp handlers hardcode lookup for "Texas Buds" group or `invite_code = 'TEXASBUDS'`
- **Impact**: Multi-tenant deployments with different groups will fail to route messages correctly
- **Code**: [webhooks/whatsapp/route.ts L153](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/webhooks/whatsapp/route.ts#L153), [whatsapp-digest/route.ts L80](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/cron/whatsapp-digest/route.ts#L80)

### 2.8 🟡 MEDIUM — PIN Stored as Plaintext

- **Finding**: User PINs stored as `varchar(4)` plaintext in `profiles.pin`
- **Impact**: Any database leak exposes all user credentials
- **Code**: [consolidated_schema.sql L50](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/sql/consolidated_schema.sql#L50)
- **Recommendation**: Hash PINs with bcrypt (low entropy mitigated by rate limiting at app layer)

### 2.9 🟢 LOW — Chat History Unbounded Growth

- **Finding**: `chat_history` table has no TTL or auto-cleanup mechanism
- **Impact**: Storage costs grow linearly with WhatsApp message volume
- **Mitigation**: `/clear` command exists for manual wipe; 30-min inactivity window limits context loading

### 2.10 🟢 LOW — Wearable Token Storage

- **Finding**: OAuth2 `access_token` and `refresh_token` stored as plaintext in `wearable_connections`
- **Impact**: Database breach exposes third-party API credentials
- **Note**: Supabase encrypts data at rest; in-transit is TLS-protected

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
| `chat_history` | `Allow service role full access` | Service role only | No anon/authenticated access |
| `system_settings` | Multiple | Service role + anon read | Service role full; anon/authenticated select only |

---

## 4. Secret Inventory

| Variable | Sensitivity | Documented Purpose |
|---|---|---|
| `SESSION_SECRET` | 🔴 Critical | JWT signing |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔴 Critical | Full DB bypass |
| `GEMINI_API_KEYS` | 🟡 High | AI quota/billing |
| `GOOGLE_GENERATIVE_AI_API_KEY` | 🟡 High | AI quota/billing |
| `GEMINI_API_KEY` | 🟡 High | AI quota/billing |
| `GREEN_API_INSTANCE_ID` | 🟡 High | WhatsApp integration |
| `GREEN_API_TOKEN` | 🟡 High | WhatsApp integration |
| `WHATSAPP_GROUP_ID` | 🟢 Low | Target chat ID |
| `TELEGRAM_WEBHOOK_SECRET` | 🟡 High | Webhook auth |
| `CRON_SECRET` | 🟡 High | Cron auth |
| `GOOGLE_CLIENT_ID` | 🟡 High | OAuth2 (wearables) |
| `GOOGLE_CLIENT_SECRET` | 🔴 Critical | OAuth2 (wearables) |
| `NEXT_PUBLIC_SUPABASE_URL` | 🟢 Low | Public project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 🟢 Low | Public anon key (RLS-restricted) |
