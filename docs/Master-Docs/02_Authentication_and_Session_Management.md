# 02 — Authentication & Session Management

> **Model**: Kiosk Auth (no Supabase Auth, no auth.users)
> **Token Format**: Signed JWT (HS256 via jose)
> **Transport**: HTTP-only cookie `app_session`
> **Source of Truth**: [lib/session.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/session.ts), [app/actions/auth.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/auth.ts)

---

## 1. Session Token Structure

### JWT Payload

```typescript
export type AppSession = {
  userId:    string; // maps to profiles.id (UUID)
  groupId:   string; // maps to groups.id (UUID)
  groupName: string; // maps to groups.name
  userName:  string; // maps to profiles.nickname ?? profiles.full_name
};
```

(source: [session.ts L20-25](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/session.ts#L20-L25))

### Signing Details

- **Algorithm**: HS256
- **Secret Retrieval**:
  - Checks `SESSION_SECRET` env var.
  - If `SESSION_SECRET` is missing or less than 32 characters:
    - If `process.env.NODE_ENV !== 'production'`, issues console warning and falls back to `'default-dev-secret-do-not-use-in-prod-12345'`.
    - If `process.env.NODE_ENV === 'production'`, returns `null`, causing decode operations to fail safely.
- **Expiration**: 24 hours from issuance (`60 * 60 * 24` seconds)
- **Issued At**: Enforced via `SignJWT.setIssuedAt()`

(source: [session.ts L27-50](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/session.ts#L27-L50))

### Cookie Configuration

| Property | Value | Source |
|---|---|---|
| `name` | `app_session` | `SESSION_COOKIE` constant |
| `httpOnly` | `true` | Standard cookie option |
| `secure` | `true` if `NODE_ENV === 'production'` | Boolean flag |
| `sameSite` | `'strict'` | Direct parameter |
| `maxAge` | `86400` seconds (24 hours) | Variable `SESSION_TTL_SECONDS` |
| `path` | `'/'` | Scope string |

(source: [session.ts L75-82](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/session.ts#L75-L82))

---

## 2. Authentication Workflows

### 2.1 PIN Login (`loginWithPersonalPinAction`)

Authenticates an athlete by verifying their 4-digit personal PIN within their group context.

```
Client Dashboard (page.tsx)
  │
  ├── User enters 4-digit PIN
  ├── UI invokes loginWithPersonalPinAction(groupId, pin)
  │
  └── Server Action (auth.ts)
        │
        ├── Strip whitespace & validate inputs
        ├── createAdminClient() -> Service Role bypasses RLS
        ├── Query profiles via group_members inner join:
        │     SELECT profiles(id, full_name, nickname, pin, avatar_url)
        │     FROM group_members
        │     WHERE group_id = groupId
        │     AND profiles.pin = pin
        ├── If no matching profile:
        │     Wait 1000ms (mitigate brute force)
        │     Return { success: false, error: 'Invalid PIN. Please try again.' }
        ├── If match found:
        │     Verify with timing-safe safeCompare(dbPin, inputPin)
        │     Resolve group.name from groups
        │     encodeSession({ userId, groupId, groupName, userName })
        │     Set HTTP-only cookie 'app_session' with JWT
        │     Return success payload & token
```

(source: [auth.ts L93-201](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/auth.ts#L93-L201))

### 2.2 Sign-Up (`signUpAction`)

Creates a new user profile, links them to a group using an invite code, and initializes a session.

```
Client Sign-Up View (signup/page.tsx)
  │
  ├── Submits: inviteCode, fullName, nickname, email, pin, gender, phoneNumber
  ├── Validates schema via Zod SignUpSchema
  │
  └── Server Action (auth.ts)
        │
        ├── createAdminClient() -> Service Role bypasses RLS
        ├── Look up group by invite_code -> resolve group.id
        │     (If not found, return 'Invalid Group Code')
        ├── Check duplicate profile details:
        │     Query profiles for matching email OR phone_number
        │     If exists, return error message
        ├── Check composite uniqueness:
        │     Query profiles where full_name = fullName AND nickname = nickname
        │     If exists, return login prompt error
        ├── Insert into profiles:
        │     full_name, nickname, email, pin, group_id, phone_number, gender
        ├── Insert into group_members:
        │     user_id, group_id
        ├── encodeSession() & Set HTTP-only cookie
        └── Return success payload & token
```

(source: [auth.ts L213-363](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/auth.ts#L213-L363))

### 2.3 Local Storage Token Persistence (`restoreSessionAction`)

- The landing page (`app/page.tsx`) stores a copy of the encoded session token in `localStorage` as `by_session_token`.
- On mount, the client reads this token.
- Calls `restoreSessionAction(token)`.
- The server validates the token via `decodeSession(token)`.
- If valid, the server resets the HTTP-only cookie `app_session`.
- The client navigates automatically to `/dashboard`.

(source: [auth.ts L371-384](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/auth.ts#L371-L384))

### 2.4 Profile Selection (`selectProfileAction`)

- For kiosks showing multiple profile options.
- Sets the session cookie using `selectProfileAction(userId, groupId, groupName, userName)`.
- Performs server-side redirect to `/dashboard`.

(source: [auth.ts L393-406](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/auth.ts#L393-L406))

### 2.5 Logout (`logoutAction`)

- Invokes `logoutAction()`.
- Overwrites the `app_session` cookie setting its `maxAge` to `0` to expire it immediately.
- Redirects the request context to `/`.

(source: [auth.ts L413-422](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/auth.ts#L413-L422))

---

## 3. Session Verification Patterns

### 3.1 Layout Guard
- Located in [app/dashboard/layout.tsx](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/dashboard/layout.tsx).
- Reads `app_session` cookie → calls `decodeSession()`.
- If decoding returns `null`, immediately triggers Next.js server-side `redirect('/')`.

### 3.2 Server Action Guards
Every Server Action that mutates or queries data enforces verification:
1. Accesses request cookies: `cookies()`.
2. Resolves token: `cookieStore.get('app_session')?.value`.
3. Decodes payload: `decodeSession(token)`.
4. Compares decoded `session.userId` against incoming action parameters to verify authorization.

---

## 4. Session-to-RLS Isolation Bridge

- **Factory**: `createClient()` in [server.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/supabase/server.ts).
- Reads the `app_session` cookie from Next.js headers.
- Extracts `groupId` from decoded session JWT.
- Injects `x-group-id` into global headers of the client.
- Database policies evaluate header via PostgREST:
  `nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid`
- Prevents horizontal privilege escalation without requiring standard Supabase Auth records.
