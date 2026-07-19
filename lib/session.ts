/**
 * lib/session.ts — HTTP-only cookie session utility.
 *
 * Encodes and decodes the `app_session` cookie, which is a signed JWT
 * (HS256 via `jose`) containing { userId, groupId }.
 *
 * The SESSION_SECRET env var must be at least 32 characters.
 * Missing secret → all decode calls return null (safe fail).
 *
 * Spec: architecture.md §7 (Kiosk Auth)
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

export const SESSION_COOKIE = 'app_session';

// 24-hour session lifetime
const SESSION_TTL_SECONDS = 60 * 60 * 24;

export type AppSession = {
  userId:    string;
  groupId:   string;
  groupName: string;
  userName:  string;
};

export function getSecret(): Uint8Array | null {
  let raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    // SEC-03 fix: only fall back to the known dev secret in explicit local
    // development. Any other NODE_ENV (unset, 'test', 'staging', 'preview',
    // etc.) now fails closed instead of silently signing JWTs with a
    // publicly-known key.
    if (process.env.NODE_ENV === 'development') {
      console.warn('[session] Warning: SESSION_SECRET is missing or too short. Falling back to development-only secret.');
      raw = 'default-dev-secret-do-not-use-in-prod-12345';
    } else {
      console.error('[session] SESSION_SECRET is missing or too short (min 32 chars)');
      return null;
    }
  }
  return new TextEncoder().encode(raw);
}

/** Sign a session payload and return the JWT string. */
export async function encodeSession(payload: AppSession): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error('SESSION_SECRET not configured');

  return new SignJWT({ ...payload } as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);
}

/** Verify and decode a JWT cookie value. Returns null on any failure. */
export async function decodeSession(token: string): Promise<AppSession | null> {
  const secret = getSecret();
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    const { userId, groupId, groupName, userName } = payload as Record<string, unknown>;

    if (
      typeof userId    !== 'string' ||
      typeof groupId   !== 'string' ||
      typeof groupName !== 'string' ||
      typeof userName  !== 'string'
    ) return null;

    return { userId, groupId, groupName, userName };
  } catch {
    return null;
  }
}

/** Cookie options shared between set and delete operations. */
export const COOKIE_OPTIONS = {
  httpOnly:  true,
  secure:    process.env.NODE_ENV === 'production',
  sameSite:  'strict' as const,
  path:      '/',
  maxAge:    SESSION_TTL_SECONDS,
};
