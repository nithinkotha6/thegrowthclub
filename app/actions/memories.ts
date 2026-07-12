'use server';

import { createClient as createBaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * Helper to build an admin/service-role client bypassing RLS, or fallback to anon client.
 */
async function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (serviceKey) {
    return createBaseClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });
  }
  return createServerClient();
}

/**
 * Server Action: Uploads a Base64 encoded image directly to the 'memories' Supabase storage bucket,
 * retrieves its public URL, and inserts a row into the 'memories' database table under service-role bypass.
 */
export async function uploadAndCreateMemoryAction(
  base64Image: string,
  fileName: string,
  groupId: string,
  userId: string,
  caption?: string
) {
  if (!base64Image || !fileName || !groupId || !userId) {
    return { success: false, error: 'Missing required parameters for upload.' };
  }

  try {
    const supabase = await getAdminClient();

    // 1. Decode base64 to binary Buffer
    const buffer = Buffer.from(base64Image, 'base64');

    // 2. Generate group-scoped file path
    const fileExt = fileName.split('.').pop() || 'jpg';
    const cleanFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
    const filePath = `${groupId}/${cleanFileName}`;

    // 3. Upload buffer directly to Supabase Storage memories bucket
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('memories')
      .upload(filePath, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadErr) {
      console.error('[uploadAndCreateMemoryAction] Storage upload error:', uploadErr);
      return { success: false, error: `Storage upload failed: ${uploadErr.message}` };
    }

    // 4. Retrieve Public URL (Ensure memories bucket is configured as public in Supabase)
    const { data: publicUrlData } = supabase.storage
      .from('memories')
      .getPublicUrl(filePath);

    if (!publicUrlData || !publicUrlData.publicUrl) {
      return { success: false, error: 'Failed to retrieve public URL from Storage.' };
    }

    const publicUrl = publicUrlData.publicUrl;

    // 5. Link memory to group database using explicit columns
    const { data: dbData, error: dbErr } = await supabase
      .from('memories')
      .insert({
        group_id: groupId,
        user_id: userId,
        image_url: publicUrl,
        caption: caption || null,
      })
      .select('id, group_id, user_id, image_url, caption, created_at')
      .single();

    if (dbErr) {
      console.error('[uploadAndCreateMemoryAction] Database insert error:', dbErr);
      return { success: false, error: `Database insert failed: ${dbErr.message}` };
    }

    revalidatePath('/', 'layout');
    return { success: true, memory: dbData };
  } catch (err: any) {
    console.error('[uploadAndCreateMemoryAction] Crash details:', err);
    return { success: false, error: err.message || 'An unexpected server error occurred.' };
  }
}

/**
 * Server Action: insert a new comment for a memory under service-role bypass.
 */
export async function addMemoryComment(memoryId: string, content: string, userId: string) {
  if (!memoryId || !content || !userId) {
    return { success: false, error: 'Missing required parameters.' };
  }

  try {
    const supabase = await getAdminClient();

    const { data, error } = await supabase
      .from('memory_comments')
      .insert({
        memory_id: memoryId,
        user_id: userId,
        content: content,
      })
      .select('id, memory_id, user_id, content, created_at')
      .single();

    if (error) {
      console.error('[addMemoryComment] DB error:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/', 'layout');
    return { success: true, comment: data };
  } catch (err: any) {
    console.error('[addMemoryComment] Crash details:', err);
    return { success: false, error: err.message || 'Unexpected server error.' };
  }
}
