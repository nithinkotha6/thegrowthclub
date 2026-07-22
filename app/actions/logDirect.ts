'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession } from '@/lib/session';
import { incrementStreakIfContinuous } from '@/lib/actions/updateStreak';

export type DirectLogResult =
  | { success: true; metric_slug: string; value: number; unit: string }
  | { success: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Looks up whether a metric requires peer verification before counting.
 * `metricSlug` may be either a built-in `metrics_config.slug` or a custom
 * `metric_definitions` UUID (see `resolveMetricDefinitionId`) — checks
 * whichever table actually owns that identifier.
 */
async function resolveRequiresVerification(
  supabase: ReturnType<typeof createAdminClient>,
  metricSlug: string
): Promise<boolean> {
  if (UUID_RE.test(metricSlug)) {
    const { data } = await supabase
      .from('metric_definitions')
      .select('requires_verification')
      .eq('id', metricSlug)
      .maybeSingle();
    return !!data?.requires_verification;
  }
  const { data } = await supabase
    .from('metrics_config')
    .select('requires_verification')
    .eq('slug', metricSlug)
    .maybeSingle();
  return !!data?.requires_verification;
}

/**
 * DATA-01: when metricSlug is actually a metric_definitions UUID (custom
 * metric), resolve it so it can also be recorded via the FK column instead
 * of relying solely on the overloaded metric_slug text column.
 */
async function resolveMetricDefinitionId(
  supabase: ReturnType<typeof createAdminClient>,
  metricSlug: string
): Promise<string | null> {
  if (!UUID_RE.test(metricSlug)) return null;
  const { data } = await supabase
    .from('metric_definitions')
    .select('id')
    .eq('id', metricSlug)
    .maybeSingle();
  return data?.id ?? null;
}
 
/**
 * Server Action: directly insert a pre-parsed metric log without AI parsing.
 * Used for direct logs and future quick-log metrics.
 * userId and groupId come from the HTTP-only session cookie (passed from dashboard).
 *
 * Spec: architecture.md §5 (Manual ingestion path)
 */
export async function logDirectActivity(
  metricSlug: string,
  value: number,
  unit: string,
  userId: string,
  groupId: string,
): Promise<DirectLogResult> {
  if (!userId || !groupId) {
    return { success: false, error: 'Session expired. Please return to the home screen.' };
  }
  if (!metricSlug) {
    return { success: false, error: 'No metric selected.' };
  }
 
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session || String(session.userId) !== String(userId) || String(session.groupId) !== String(groupId)) {
    return { success: false, error: 'Unauthorized: Session credentials mismatch.' };
  }

  const supabase = createAdminClient();
 
  const requiresVerification = await resolveRequiresVerification(supabase, metricSlug);
  const metricDefinitionId = await resolveMetricDefinitionId(supabase, metricSlug);
  const { error: insertErr } = await supabase.from('metric_logs').insert({
    user_id:              userId,
    group_id:             groupId,
    metric_slug:          metricSlug,
    metric_definition_id: metricDefinitionId,
    value,
    unit,
    status:               requiresVerification ? 'pending' : 'verified',
  });
 
  if (insertErr) {
    if (insertErr.code === '23505' || insertErr.message?.includes('unique') || insertErr.message?.includes('duplicate')) {
      return { success: false, error: 'Activity already logged today with this value.' };
    }
    console.error('[logDirectActivity] Insert error details:', {
      message: insertErr.message,
      code: insertErr.code,
      details: insertErr.details,
    });
    return { success: false, error: `Database error: ${insertErr.message} (Code: ${insertErr.code})` };
  }
 
  try {
    await incrementStreakIfContinuous(userId, groupId);
  } catch (streakErr) {
    console.error('[logDirectActivity] Error updating streak:', streakErr);
  }

  revalidatePath('/dashboard');
  return { success: true, metric_slug: metricSlug, value, unit };
}
 
/**
 * Server Action: insert a manual metric log with defensive column probing for caption.
 */
export async function logActivityManual(
  metricSlug: string,
  value: number,
  unit: string,
  userId: string,
  groupId: string,
  caption?: string,
  durationSeconds?: number,
  loggedAtDate?: string,
): Promise<DirectLogResult> {
  if (!userId || !groupId) {
    return { success: false, error: 'Session expired. Please return to the home screen.' };
  }
  if (!metricSlug) {
    return { success: false, error: 'No metric selected.' };
  }
 
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session || String(session.userId) !== String(userId) || String(session.groupId) !== String(groupId)) {
    return { success: false, error: 'Unauthorized: Session credentials mismatch.' };
  }

  const supabase = createAdminClient();

  const isValidDateStr = loggedAtDate && /^\d{4}-\d{2}-\d{2}$/.test(loggedAtDate);
  const loggedAt = isValidDateStr ? `${loggedAtDate}T12:00:00Z` : undefined;

  const requiresVerification = await resolveRequiresVerification(supabase, metricSlug);
  const metricDefinitionId = await resolveMetricDefinitionId(supabase, metricSlug);

  // Try inserting with caption, durationSeconds, and custom logged_at
  const { error: insertErr } = await supabase.from('metric_logs').insert({
    user_id:              userId,
    group_id:             groupId,
    metric_slug:          metricSlug,
    metric_definition_id: metricDefinitionId,
    value,
    unit,
    status:               requiresVerification ? 'pending' : 'verified',
    caption:              caption || null,
    duration_seconds:     durationSeconds || null,
    logged_at:            loggedAt,
  });

  if (insertErr) {
    // If error is due to missing columns (e.g. caption or duration_seconds), retry without them
    if (insertErr.message.includes('column')) {
      console.warn('[logActivityManual] column missing, falling back to insert without caption/duration.');
      const { error: retryErr } = await supabase.from('metric_logs').insert({
        user_id:              userId,
        group_id:             groupId,
        metric_slug:          metricSlug,
        metric_definition_id: metricDefinitionId,
        value,
        unit,
        status:               requiresVerification ? 'pending' : 'verified',
        logged_at:            loggedAt,
      });

      if (retryErr) {
        if (retryErr.code === '23505' || retryErr.message?.includes('unique') || retryErr.message?.includes('duplicate')) {
          return { success: false, error: 'Activity already logged today with this value.' };
        }
        console.error('[logActivityManual] Retry insert error details:', {
          message: retryErr.message,
          code: retryErr.code,
          details: retryErr.details,
        });
        return { success: false, error: `Database error (retry): ${retryErr.message} (Code: ${retryErr.code})` };
      }

      try {
        await incrementStreakIfContinuous(userId, groupId);
      } catch (streakErr) {
        console.error('[logActivityManual] Error updating streak:', streakErr);
      }

      revalidatePath('/dashboard');
      return { success: true, metric_slug: metricSlug, value, unit };
    }
 
    if (insertErr.code === '23505' || insertErr.message?.includes('unique') || insertErr.message?.includes('duplicate')) {
      return { success: false, error: 'Activity already logged today with this value.' };
    }

    console.error('[logActivityManual] Insert error details:', {
      message: insertErr.message,
      code: insertErr.code,
      details: insertErr.details,
    });
    return { success: false, error: `Database error: ${insertErr.message} (Code: ${insertErr.code})` };
  }

  try {
    await incrementStreakIfContinuous(userId, groupId);
  } catch (streakErr) {
    console.error('[logActivityManual] Error updating streak:', streakErr);
  }

  revalidatePath('/dashboard');
  return { success: true, metric_slug: metricSlug, value, unit };
}
