'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession, type AppSession } from '@/lib/session';

/**
 * Server Actions for the Progression Challenges module (Clash-of-Clans-style
 * tiers). Dashboard & Challenges spec DASH-19/20. See
 * Findings_and_Recommendations.md.
 *
 * Transaction-integrity design: these actions NEVER write directly to
 * `challenge_progression`. They only INSERT into `challenge_history` (log)
 * or soft-delete a history row (delete) — the DB trigger installed in
 * migration 0037 (`recompute_challenge_progression`) is the only thing that
 * ever writes `current_tier`/`previous_tier`, always derived from the latest
 * remaining non-deleted history row. This is what guarantees the tier can
 * never drift from its history, including across repeated deletes.
 */

type SessionResult =
  | { session: AppSession; error: null }
  | { session: null; error: string };

async function requireSession(): Promise<SessionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session) {
    return { session: null, error: 'Unauthorized: Session credentials mismatch.' };
  }
  return { session, error: null };
}

export type ChallengeProgression = {
  challenge_type: string;
  current_tier: number;
  previous_tier: number | null;
  updated_at: string;
};

export type ChallengeHistoryEntry = {
  id: string;
  challenge_type: string;
  tier_before: number;
  tier_after: number;
  entry_date: string;
};

/** Fetch every progression row (current + previous tier per challenge type)
 * for the caller's own profile. */
export async function getMyChallengeProgression(): Promise<
  { success: true; progression: ChallengeProgression[] } | { success: false; error: string }
> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data, error: dbErr } = await supabase
    .from('challenge_progression')
    .select('challenge_type, current_tier, previous_tier, updated_at')
    .eq('user_id', session.userId)
    .eq('group_id', session.groupId);

  if (dbErr) return { success: false, error: dbErr.message };
  return { success: true, progression: data ?? [] };
}

/** Fetch recent (non-deleted) progression history entries for the caller's
 * group — powers the module's "Recent Activities" list. */
export async function getChallengeHistory(
  limit = 30,
): Promise<{ success: true; history: (ChallengeHistoryEntry & { user_id: string; profiles?: { nickname: string | null; full_name: string | null } | null })[] } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data, error: dbErr } = await supabase
    .from('challenge_history')
    .select('id, user_id, challenge_type, tier_before, tier_after, entry_date, profiles ( nickname, full_name )')
    .eq('group_id', session.groupId)
    .is('deleted_at', null)
    .order('entry_date', { ascending: false })
    .limit(limit);

  if (dbErr) return { success: false, error: dbErr.message };
  return { success: true, history: (data ?? []) as unknown as (ChallengeHistoryEntry & { user_id: string; profiles?: { nickname: string | null; full_name: string | null } | null })[] };
}

/**
 * Log a progression activity (DASH-19). Reads the caller's current tier for
 * this challenge type (0 if none yet), writes ONE history row recording the
 * before/after tier, and lets the DB trigger recompute
 * `challenge_progression`. `tier_before`/`tier_after` are written in the same
 * insert so there is no window where they could be read as inconsistent.
 */
export async function logProgressionActivity(
  challengeType: string,
  newTierValue: number,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!challengeType.trim()) return { success: false, error: 'Challenge type is required.' };
  if (!Number.isFinite(newTierValue) || newTierValue < 0) {
    return { success: false, error: 'Enter a valid, non-negative value.' };
  }

  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);

  const { data: current } = await supabase
    .from('challenge_progression')
    .select('current_tier')
    .eq('user_id', session.userId)
    .eq('challenge_type', challengeType)
    .maybeSingle();

  const tierBefore = current?.current_tier ?? 0;

  const { error: dbErr } = await supabase.from('challenge_history').insert({
    group_id: session.groupId,
    user_id: session.userId,
    challenge_type: challengeType,
    tier_before: tierBefore,
    tier_after: newTierValue,
  });

  if (dbErr) return { success: false, error: dbErr.message };

  revalidatePath('/dashboard');
  return { success: true };
}

/**
 * Delete a progression history entry (DASH-20). Soft-deletes the row; the DB
 * trigger recomputes `challenge_progression` from whatever the new latest
 * remaining history row says — correctly cascading back multiple steps if
 * called repeatedly, since each call re-derives from DB state rather than
 * decrementing a locally-held value.
 */
export async function deleteProgressionActivity(
  historyId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data: existing, error: fetchErr } = await supabase
    .from('challenge_history')
    .select('user_id')
    .eq('id', historyId)
    .eq('group_id', session.groupId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { success: false, error: 'History entry not found.' };
  }
  if (existing.user_id !== session.userId) {
    return { success: false, error: 'Unauthorized: you can only delete your own entry.' };
  }

  const { error: dbErr } = await supabase
    .from('challenge_history')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', historyId);

  if (dbErr) return { success: false, error: dbErr.message };

  revalidatePath('/dashboard');
  return { success: true };
}
