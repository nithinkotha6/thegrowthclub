'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession } from '@/lib/session';

/**
 * Ensures the metric name contains exactly one emoji.
 * If the user has already included an emoji, we return it as is (deduplicated).
 * If no emoji is found, we prepend a default '📊 ' emoji.
 */
function ensureNameHasEmoji(name: string): string {
  // Regex pattern matching standard emoji character ranges
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
  const trimmed = name.trim();
  if (!emojiRegex.test(trimmed)) {
    return `📊 ${trimmed}`;
  }
  return trimmed;
}

export async function createMetricDefinition(name: string, unit: string, sortDirection: 'asc' | 'desc') {
  if (!name.trim() || !unit.trim() || !sortDirection) {
    return { success: false, error: 'All fields are required.' };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session) {
    return { success: false, error: 'Unauthorized: Session credentials mismatch.' };
  }

  const formattedName = ensureNameHasEmoji(name);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('metric_definitions')
    .insert({
      name: formattedName,
      unit: unit.trim(),
      sort_direction: sortDirection,
      group_id: session.groupId,
    })
    .select()
    .single();

  if (error) {
    console.error('[createMetricDefinition] error:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/settings/metrics');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/leaderboard');
  return { success: true, definition: data };
}

export async function adminFetchMetricDefinitions(groupId: string) {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('metric_definitions')
      .select('*')
      .eq('group_id', groupId)
      .order('name', { ascending: true });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err) {
    console.error('[adminFetchMetricDefinitions] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err), data: [] };
  }
}

export async function adminUpdateMetricDefinition(id: string, name: string, unit: string, sortDirection: 'asc' | 'desc') {
  try {
    if (!name.trim() || !unit.trim() || !sortDirection) {
      return { success: false, error: 'All fields are required.' };
    }

    const formattedName = ensureNameHasEmoji(name);
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('metric_definitions')
      .update({
        name: formattedName,
        unit: unit.trim(),
        sort_direction: sortDirection,
      })
      .eq('id', id);

    if (error) throw error;
    revalidatePath('/settings/metrics');
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/leaderboard');
    return { success: true };
  } catch (err) {
    console.error('[adminUpdateMetricDefinition] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function adminDeleteMetricDefinition(id: string) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('metric_definitions')
      .delete()
      .eq('id', id);

    if (error) throw error;
    revalidatePath('/settings/metrics');
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/leaderboard');
    return { success: true };
  } catch (err) {
    console.error('[adminDeleteMetricDefinition] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function adminToggleMetricHidden(id: string, isHidden: boolean) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('metric_definitions')
      .update({ is_hidden: isHidden })
      .eq('id', id);

    if (error) {
      if (error.message.toLowerCase().includes('is_hidden')) {
        return { success: false, error: 'Database column is_hidden is missing. Please run the SQL migration (0015_add_is_hidden_to_metrics.sql) first.' };
      }
      throw error;
    }
    revalidatePath('/settings/metrics');
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/leaderboard');
    return { success: true };
  } catch (err) {
    console.error('[adminToggleMetricHidden] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
