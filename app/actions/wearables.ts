'use server';
 
import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession } from '@/lib/session';
 
/**
 * Server Action: Disconnects the wearable device.
 */
export async function disconnectWearableAction(userId: string) {
  if (!userId) return { success: false };

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session || String(session.userId) !== String(userId)) {
    return { success: false, error: 'Unauthorized: Session credentials mismatch.' };
  }
 
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
