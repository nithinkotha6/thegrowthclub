'use server';
 
import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
 
/**
 * Server Action: Creates a mock wearable connection for testing.
 */
export async function connectWearableAction(userId: string) {
  if (!userId) {
    return { success: false, error: 'User session invalid.' };
  }
 
  const supabase = createAdminClient();
  
  // Clean up any existing connections first
  await supabase
    .from('wearable_connections')
    .delete()
    .eq('user_id', userId);
 
  const { error } = await supabase
    .from('wearable_connections')
    .insert({
      user_id: userId,
      provider: 'Whoop',
      access_token: 'mock_whoop_token',
      refresh_token: 'mock_whoop_refresh',
      last_synced_at: new Date().toISOString(),
    })
    .select();
 
  if (error) {
    console.error('[connectWearableAction] failed:', error);
    return { success: false, error: error.message };
  }
 
  revalidatePath('/dashboard/wearables');
  return { success: true };
}
 
/**
 * Server Action: Disconnects the wearable device.
 */
export async function disconnectWearableAction(userId: string) {
  if (!userId) return { success: false };
 
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('wearable_connections')
    .delete()
    .eq('user_id', userId);
 
  if (error) {
    console.error('[disconnectWearableAction] failed:', error);
    return { success: false, error: error.message };
  }
 
  revalidatePath('/dashboard/wearables');
  return { success: true };
}
