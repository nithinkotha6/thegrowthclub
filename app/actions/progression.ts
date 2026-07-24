'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession, type AppSession } from '@/lib/session';
import { METRIC_PROGRESSION_CATALOG, normalizeMetricSlug } from '@/lib/config/challenge-tiers';

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
  highest_tier_unlocked?: number | null;
  updated_at: string;
};

export type ChallengeHistoryEntry = {
  id: string;
  challenge_type: string;
  tier_before: number;
  tier_after: number;
  entry_date: string;
};

export type TierCompletionEntry = {
  id: string;
  user_id: string;
  group_id: string;
  metric_slug: string;
  tier_number: number;
  tier_value: number;
  completed_at: string;
};

/** Fetch every progression row for the caller's profile. */
export async function getMyChallengeProgression(): Promise<
  { success: true; progression: ChallengeProgression[] } | { success: false; error: string }
> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data, error: dbErr } = await supabase
    .from('challenge_progression')
    .select('challenge_type, current_tier, previous_tier, highest_tier_unlocked, updated_at')
    .eq('user_id', session.userId)
    .eq('group_id', session.groupId);

  if (dbErr) return { success: false, error: dbErr.message };
  return { success: true, progression: data ?? [] };
}

/** Fetch recent progression history entries for the caller's group. */
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

/** Fetch completed tier entries for caller in specified metric. */
export async function getTierCompletionsAction(
  metricSlug: string
): Promise<{ success: true; completions: TierCompletionEntry[] } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const normSlug = normalizeMetricSlug(metricSlug);
  const supabase = createAdminClient(session.groupId);

  const { data, error: dbErr } = await supabase
    .from('tier_completions')
    .select('id, user_id, group_id, metric_slug, tier_number, tier_value, completed_at')
    .eq('user_id', session.userId)
    .eq('group_id', session.groupId)
    .eq('metric_slug', normSlug)
    .is('deleted_at', null)
    .order('completed_at', { ascending: false });

  if (dbErr) return { success: false, error: dbErr.message };
  return { success: true, completions: data ?? [] };
}

/** Complete or toggle a specific tier (Task 2). */
export async function toggleTierCompletionAction(
  metricSlug: string,
  tierNumber: number,
  tierValue: number
): Promise<{ success: true } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const normSlug = normalizeMetricSlug(metricSlug);
  const supabase = createAdminClient(session.groupId);

  // Check existing active completion
  const { data: existing } = await supabase
    .from('tier_completions')
    .select('id, deleted_at')
    .eq('user_id', session.userId)
    .eq('group_id', session.groupId)
    .eq('metric_slug', normSlug)
    .eq('tier_number', tierNumber)
    .maybeSingle();

  if (existing && existing.deleted_at === null) {
    // Uncomplete (soft delete)
    await supabase
      .from('tier_completions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else if (existing) {
    // Re-activate
    await supabase
      .from('tier_completions')
      .update({ deleted_at: null, completed_at: new Date().toISOString(), tier_value: tierValue })
      .eq('id', existing.id);
  } else {
    // Insert new tier completion
    await supabase.from('tier_completions').insert({
      user_id: session.userId,
      group_id: session.groupId,
      metric_slug: normSlug,
      tier_number: tierNumber,
      tier_value: tierValue,
      completed_at: new Date().toISOString(),
    });
  }

  // Also log into challenge_history for milestone log feed
  await supabase.from('challenge_history').insert({
    group_id: session.groupId,
    user_id: session.userId,
    challenge_type: normSlug,
    tier_before: 0,
    tier_after: tierValue,
  });

  // Recompute highest value & highest tier
  await syncProgressionState(supabase, session.userId, session.groupId, normSlug);

  revalidatePath('/', 'layout');
  return { success: true };
}

/** Log a numeric value, matching exact tier if found (Task 3). */
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

  const normSlug = normalizeMetricSlug(challengeType);
  const supabase = createAdminClient(session.groupId);
  const config = METRIC_PROGRESSION_CATALOG[normSlug];

  // 1. Find exact matching tier if one exists
  const matchedTier = config?.tiers.find((t) => t.targetValue === newTierValue);

  if (matchedTier) {
    // Mark ONLY this specific tier as completed in tier_completions
    const { data: existing } = await supabase
      .from('tier_completions')
      .select('id')
      .eq('user_id', session.userId)
      .eq('group_id', session.groupId)
      .eq('metric_slug', normSlug)
      .eq('tier_number', matchedTier.tierNumber)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('tier_completions')
        .update({ deleted_at: null, completed_at: new Date().toISOString(), tier_value: newTierValue })
        .eq('id', existing.id);
    } else {
      await supabase.from('tier_completions').insert({
        user_id: session.userId,
        group_id: session.groupId,
        metric_slug: normSlug,
        tier_number: matchedTier.tierNumber,
        tier_value: newTierValue,
        completed_at: new Date().toISOString(),
      });
    }
  }

  // 2. Insert into challenge_history
  await supabase.from('challenge_history').insert({
    group_id: session.groupId,
    user_id: session.userId,
    challenge_type: normSlug,
    tier_before: 0,
    tier_after: newTierValue,
  });

  // 3. Sync progression state
  await syncProgressionState(supabase, session.userId, session.groupId, normSlug);

  revalidatePath('/', 'layout');
  return { success: true };
}

/** Delete a progression history entry (soft-delete). */
export async function deleteProgressionActivity(
  historyId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data: existing, error: fetchErr } = await supabase
    .from('challenge_history')
    .select('user_id, challenge_type, tier_after')
    .eq('id', historyId)
    .eq('group_id', session.groupId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { success: false, error: 'History entry not found.' };
  }
  if (existing.user_id !== session.userId) {
    return { success: false, error: 'Unauthorized: you can only delete your own entry.' };
  }

  const normSlug = normalizeMetricSlug(existing.challenge_type);

  // Soft-delete in challenge_history
  await supabase
    .from('challenge_history')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', historyId);

  // Find tier matching this value and soft-delete in tier_completions if present
  const config = METRIC_PROGRESSION_CATALOG[normSlug];
  const matchedTier = config?.tiers.find((t) => t.targetValue === existing.tier_after);
  if (matchedTier) {
    await supabase
      .from('tier_completions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', session.userId)
      .eq('group_id', session.groupId)
      .eq('metric_slug', normSlug)
      .eq('tier_number', matchedTier.tierNumber);
  }

  await syncProgressionState(supabase, session.userId, session.groupId, normSlug);

  revalidatePath('/', 'layout');
  return { success: true };
}

/** Helper: recalculates current_highest_value and highest_tier_unlocked from active records. */
async function syncProgressionState(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  groupId: string,
  normSlug: string
) {
  const { data: activeTierCompletions } = await supabase
    .from('tier_completions')
    .select('tier_number, tier_value')
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .eq('metric_slug', normSlug)
    .is('deleted_at', null);

  const { data: activeLogs } = await supabase
    .from('challenge_history')
    .select('tier_after')
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .eq('challenge_type', normSlug)
    .is('deleted_at', null);

  let highestVal = 0;
  let highestTier = 0;

  for (const tc of activeTierCompletions || []) {
    highestVal = Math.max(highestVal, Number(tc.tier_value) || 0);
    highestTier = Math.max(highestTier, Number(tc.tier_number) || 0);
  }

  for (const h of activeLogs || []) {
    highestVal = Math.max(highestVal, Number(h.tier_after) || 0);
  }

  await supabase.from('challenge_progression').upsert(
    {
      user_id: userId,
      group_id: groupId,
      challenge_type: normSlug,
      current_tier: highestVal,
      highest_tier_unlocked: highestTier,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,group_id,challenge_type' }
  );
}
