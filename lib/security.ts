/**
 * lib/security.ts — Common security utility helpers.
 *
 * Implements a pure Javascript, Edge-runtime-compatible, timing-safe string comparison
 * function to defend against timing side-channel attacks on API tokens and PINs.
 */

import bcrypt from 'bcryptjs';

/**
 * Perform a timing-safe comparison of two strings.
 * Returns true if they are exactly equal, false otherwise.
 */
export function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/* ── PIN hashing (SEC-04) ─────────────────────────────────────────────────
 * PINs used to be stored as plaintext in `profiles.pin`. New PINs (signup,
 * admin reset) are now hashed with bcrypt before being persisted. Existing
 * plaintext PINs are still readable and are transparently upgraded to a
 * bcrypt hash the next time their owner logs in successfully (see
 * `verifyPin`'s `needsRehash` flag), so no bulk data migration or forced
 * logout is required. */

const BCRYPT_HASH_RE = /^\$2[aby]\$/;

/** True if `value` already looks like a bcrypt hash rather than a raw PIN. */
export function isBcryptHash(value: string): boolean {
  return BCRYPT_HASH_RE.test(value);
}

/** Hash a plaintext PIN for storage. */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

/**
 * Verify a plaintext PIN against a stored `profiles.pin` value, which may be
 * either a bcrypt hash (current format) or a legacy plaintext 4-digit PIN
 * (pre-SEC-04 accounts that haven't logged in since the fix shipped).
 * `needsRehash` is true when the match came from the legacy plaintext path,
 * signaling the caller should re-hash and persist the new value.
 */
export async function verifyPin(pin: string, stored: string): Promise<{ match: boolean; needsRehash: boolean }> {
  if (isBcryptHash(stored)) {
    const match = await bcrypt.compare(pin, stored);
    return { match, needsRehash: false };
  }
  const match = safeCompare(stored, pin);
  return { match, needsRehash: match };
}

/**
 * QA-01: Since PINs are now bcrypt-hashed (SEC-04), the database's
 * `profiles_group_pin_key UNIQUE (group_id, pin)` constraint no longer
 * prevents two members of the same group from picking the same 4-digit
 * PIN — every hash includes a random salt, so the stored values always
 * differ even when the underlying PIN is identical. This checks PIN
 * uniqueness within a group at the application layer instead, mirroring
 * what the (now-defeated) DB constraint used to guarantee.
 */
export async function isPinTakenInGroup(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  groupId: string,
  pin: string,
  excludeUserId?: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('group_members')
    .select('profiles!inner ( id, pin )')
    .eq('group_id', groupId);

  type Row = { profiles: { id: string; pin: string | null } | { id: string; pin: string | null }[] | null };
  const rows = (data as unknown as Row[]) ?? [];

  for (const row of rows) {
    const profiles = Array.isArray(row.profiles) ? row.profiles : [row.profiles];
    for (const p of profiles) {
      if (!p || !p.pin) continue;
      if (excludeUserId && p.id === excludeUserId) continue;
      const { match } = await verifyPin(pin, p.pin);
      if (match) return true;
    }
  }
  return false;
}
