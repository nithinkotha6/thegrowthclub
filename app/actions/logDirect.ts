'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

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

  const supabase = await createClient();

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
): Promise<DirectLogResult> {
  if (!userId || !groupId) {
    return { success: false, error: 'Session expired. Please return to the home screen.' };
  }
  if (!metricSlug) {
    return { success: false, error: 'No metric selected.' };
  }

  const supabase = await createClient();

  // Try inserting with caption
  const { error: insertErr } = await supabase.from('metric_logs').insert({
    user_id:     userId,
    group_id:    groupId,
    metric_slug: metricSlug,
    value,
    unit,
    status:      (metricSlug === 'car_top_speed' || metricSlug === 'most_beers') ? 'pending' : 'verified',
    caption:     caption || null,
  });

  if (insertErr) {
    // If error is due to missing caption column, retry without caption
    if (insertErr.message.includes('column') && insertErr.message.includes('caption')) {
      console.warn('[logActivityManual] caption column missing, falling back to insert without caption.');
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
      revalidatePath('/dashboard');
      return { success: true, metric_slug: metricSlug, value, unit };
    }

    console.error('[logActivityManual] Insert error:', insertErr);
    return { success: false, error: 'Failed to save activity. Please try again.' };
  }

  revalidatePath('/dashboard');
  return { success: true, metric_slug: metricSlug, value, unit };
}
