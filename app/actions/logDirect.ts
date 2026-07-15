'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession } from '@/lib/session';
 
export type DirectLogResult =
  | { success: true; metric_slug: string; value: number; unit: string }
  | { success: false; error: string };
 
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
 
  const { error: insertErr } = await supabase.from('metric_logs').insert({
    user_id:     userId,
    group_id:    groupId,
    metric_slug: metricSlug,
    value,
    unit,
    status:      (metricSlug === 'car_top_speed' || metricSlug === 'most_beers') ? 'pending' : 'verified',
  });
 
  if (insertErr) {
    console.error('[logDirectActivity] Insert error:', insertErr);
    return { success: false, error: 'Failed to save activity. Please try again.' };
  }
 
  revalidatePath('/', 'layout');
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

  // Try inserting with caption and durationSeconds
  const { error: insertErr } = await supabase.from('metric_logs').insert({
    user_id:     userId,
    group_id:    groupId,
    metric_slug: metricSlug,
    value,
    unit,
    status:      (metricSlug === 'car_top_speed' || metricSlug === 'most_beers') ? 'pending' : 'verified',
    caption:     caption || null,
    duration_seconds: durationSeconds || null,
  });

  if (insertErr) {
    // If error is due to missing columns (e.g. caption or duration_seconds), retry without them
    if (insertErr.message.includes('column')) {
      console.warn('[logActivityManual] column missing, falling back to insert without caption/duration.');
      const { error: retryErr } = await supabase.from('metric_logs').insert({
        user_id:     userId,
        group_id:    groupId,
        metric_slug: metricSlug,
        value,
        unit,
        status:      (metricSlug === 'car_top_speed' || metricSlug === 'most_beers') ? 'pending' : 'verified',
      });

      if (retryErr) {
        console.error('[logActivityManual] Retry insert error:', retryErr);
        return { success: false, error: 'Failed to save activity. Please try again.' };
      }
      revalidatePath('/', 'layout');
      return { success: true, metric_slug: metricSlug, value, unit };
    }

    console.error('[logActivityManual] Insert error:', insertErr);
    return { success: false, error: 'Failed to save activity. Please try again.' };
  }

  revalidatePath('/', 'layout');
  return { success: true, metric_slug: metricSlug, value, unit };
}
