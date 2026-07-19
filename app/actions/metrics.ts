'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession } from '@/lib/session';

/**
 * Ensures the metric name is returned exactly as entered.
 */
function ensureNameHasEmoji(name: string): string {
  return name;
}

export async function createMetricDefinition(name: string, unit: string, sortDirection: 'asc' | 'desc', requiresVerification: boolean = false) {
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
      requires_verification: requiresVerification,
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

export async function adminToggleMetricRequiresVerification(id: string, requiresVerification: boolean) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('metric_definitions')
      .update({ requires_verification: requiresVerification })
      .eq('id', id);

    if (error) {
      if (error.message.toLowerCase().includes('requires_verification')) {
        return { success: false, error: 'Database column requires_verification is missing. Please run migration 0035_add_requires_verification_to_metric_definitions.sql first.' };
      }
      throw error;
    }
    revalidatePath('/settings/metrics');
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/leaderboard');
    return { success: true };
  } catch (err) {
    console.error('[adminToggleMetricRequiresVerification] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
