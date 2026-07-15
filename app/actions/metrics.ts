'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createMetricDefinition(name: string, unit: string, sortDirection: 'asc' | 'desc') {
  if (!name.trim() || !unit.trim() || !sortDirection) {
    return { success: false, error: 'All fields are required.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('metric_definitions')
    .insert({
      name: name.trim(),
      unit: unit.trim(),
      sort_direction: sortDirection,
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
