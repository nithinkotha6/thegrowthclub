/**
 * lib/rateLimit.ts — PIN login attempt throttling (OTHER-04).
 *
 * Plain Postgres-table-backed brute-force defense for
 * loginWithPersonalPinAction: tracks failed attempts per (group, ip) and
 * locks out an ip for a cooldown window after too many wrong PINs in a
 * short period. Used alongside (not instead of) the existing per-request
 * artificial delay.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;   // attempts older than this reset the counter
const LOCKOUT_MS = 15 * 60 * 1000;  // how long an ip is locked out once the threshold is hit

export type LockoutStatus = { locked: boolean; retryAfterMinutes?: number };

/**
 * Check whether (groupId, ip) is currently locked out from a prior burst of
 * failed PIN attempts. Call this before touching the profiles table.
 */
export async function checkLoginLockout(
  supabase: SupabaseClient,
  groupId: string,
  ip: string,
): Promise<LockoutStatus> {
  const { data } = await supabase
    .from('login_attempts')
    .select('locked_until')
    .eq('group_id', groupId)
    .eq('ip', ip)
    .maybeSingle();

  if (data?.locked_until) {
    const lockedUntilMs = new Date(data.locked_until).getTime();
    if (lockedUntilMs > Date.now()) {
      return { locked: true, retryAfterMinutes: Math.ceil((lockedUntilMs - Date.now()) / 60000) };
    }
  }
  return { locked: false };
}

/**
 * Record a failed PIN attempt for (groupId, ip). Resets the counter if the
 * previous burst has aged out of the window, otherwise increments it and
 * sets a lockout once MAX_ATTEMPTS is reached.
 */
export async function recordFailedLoginAttempt(
  supabase: SupabaseClient,
  groupId: string,
  ip: string,
): Promise<void> {
  const now = new Date();

  const { data: existing } = await supabase
    .from('login_attempts')
    .select('attempt_count, first_attempt_at')
    .eq('group_id', groupId)
    .eq('ip', ip)
    .maybeSingle();

  const windowExpired = !!existing && now.getTime() - new Date(existing.first_attempt_at).getTime() > WINDOW_MS;
  const nextCount = !existing || windowExpired ? 1 : existing.attempt_count + 1;
  const lockedUntil = nextCount >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS).toISOString() : null;

  await supabase.from('login_attempts').upsert(
    {
      group_id: groupId,
      ip,
      attempt_count: nextCount,
      first_attempt_at: !existing || windowExpired ? now.toISOString() : existing.first_attempt_at,
      last_attempt_at: now.toISOString(),
      locked_until: lockedUntil,
    },
    { onConflict: 'group_id,ip' },
  );
}

/** Clear any tracked failed attempts for (groupId, ip) after a successful login. */
export async function clearLoginAttempts(
  supabase: SupabaseClient,
  groupId: string,
  ip: string,
): Promise<void> {
  await supabase.from('login_attempts').delete().eq('group_id', groupId).eq('ip', ip);
}
