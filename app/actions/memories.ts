'use server';

import { createClient as createBaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession } from '@/lib/session';
import { executeWithKeyRotation } from '@/utils/geminiPool';
import { buildMemoryCaptionPrompt } from '@/lib/ai/prompts';

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

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session || String(session.userId) !== String(userId) || String(session.groupId) !== String(groupId)) {
    return { success: false, error: 'Unauthorized: Session credentials mismatch.' };
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
    const { error: uploadErr } = await supabase.storage
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

    // 6. Outbound Group-Scoped WhatsApp AI Broadcasting (Phase 3)
    try {
      // Retrieve Group specific WhatsApp API credentials
      const { data: group } = await supabase
        .from('groups')
        .select('whatsapp_instance_id, whatsapp_token, whatsapp_group_id')
        .eq('id', groupId)
        .single();

      const instanceId = group?.whatsapp_instance_id || process.env.GREEN_API_INSTANCE_ID;
      const token = group?.whatsapp_token || process.env.GREEN_API_TOKEN;
      const waChatId = group?.whatsapp_group_id || process.env.WHATSAPP_GROUP_ID;

      if (!instanceId || !token || !waChatId) {
        console.log(`[WhatsApp Broadcast] Group ${groupId} lacks a configured WhatsApp integration. Skipping broadcast.`);
      } else {
        // Fetch the uploader's profile to resolve their name
        const { data: profile } = await supabase
          .from('profiles')
          .select('nickname, full_name')
          .eq('id', userId)
          .single();

        const uploaderName = profile?.nickname || profile?.full_name || 'Someone';

        // Eagerly generate AI Caption based on image + user provided context
        let aiCaption = `"${uploaderName} shared a memory!"`;
        try {
          const promptText = buildMemoryCaptionPrompt({ uploaderName, caption });

          const { generateText } = await import('ai');
          const result = await executeWithKeyRotation(async (modelInstance) => {
            return generateText({
              model: modelInstance,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: promptText },
                    { type: 'image', image: base64Image, mediaType: 'image/jpeg' }
                  ]
                }
              ]
            });
          });
          const text = result.text;
          if (text && text.trim()) {
            aiCaption = text.trim();
          }
        } catch (aiErr) {
          console.error('[WhatsApp AI Caption] Failed to generate AI caption, using fallback:', aiErr);
        }

        const displayCaption = caption?.trim() || aiCaption || 'No caption provided';
        const formattedCaption = `📸 *${uploaderName} just added a new Memory!*\n\n💬 "${displayCaption}"`;

        const mirrorUrl = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
        
        // Non-blocking fire-and-forget fetch call
        fetch(mirrorUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId: waChatId,
            urlFile: publicUrl,
            fileName: fileName,
            caption: formattedCaption,
          }),
        }).then(res => {
          if (!res.ok) {
            console.error('[WhatsApp Broadcast] Green API error status:', res.status);
          } else {
            console.log('[WhatsApp Broadcast] successfully sent.');
          }
        }).catch(err => {
          console.error('[WhatsApp Broadcast] connection error:', err);
        });
      }
    } catch (broadcastErr) {
      console.error('[WhatsApp Broadcast] Unexpected exception:', broadcastErr);
    }

    // PERF-06: memories only render on the memories page, not the whole layout.
    revalidatePath('/', 'layout');
    return { success: true, memory: dbData };
  } catch (err) {
    const error = err as Error;
    console.error('[uploadAndCreateMemoryAction] Crash details:', error);
    return { success: false, error: error.message || 'An unexpected server error occurred.' };
  }
}

/**
 * Server Action: insert a new comment for a memory under service-role bypass.
 */
export async function addMemoryComment(memoryId: string, content: string, userId: string) {
  if (!memoryId || !content || !userId) {
    return { success: false, error: 'Missing required parameters.' };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session || String(session.userId) !== String(userId)) {
    return { success: false, error: 'Unauthorized: Session credentials mismatch.' };
  }

  try {
    const supabase = await getAdminClient();

    // Enforce tenant isolation check: verify that the memory belongs to the caller's group
    const { data: memoryRow, error: memoryError } = await supabase
      .from('memories')
      .select('group_id')
      .eq('id', memoryId)
      .single();

    if (memoryError || !memoryRow || String(memoryRow.group_id) !== String(session.groupId)) {
      return { success: false, error: 'Unauthorized: Memory is not in your group.' };
    }

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
  } catch (err) {
    const error = err as Error;
    console.error('[addMemoryComment] Crash details:', error);
    return { success: false, error: error.message || 'Unexpected server error.' };
  }
}

/**
 * Server Action: Soft-deletes a memory record by setting deleted_at to current timestamp.
 */
export async function deleteMemoryAction(memoryId: string, userId: string) {
  if (!memoryId || !userId) {
    return { success: false, error: 'Missing required parameters.' };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session || String(session.userId) !== String(userId)) {
    return { success: false, error: 'Unauthorized: Session credentials mismatch.' };
  }

  try {
    const supabase = await getAdminClient();

    const { data, error } = await supabase
      .from('memories')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', memoryId)
      .eq('user_id', userId)
      .eq('group_id', session.groupId)
      .select()
      .single();

    if (error) {
      console.error('[deleteMemoryAction] DB error:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/', 'layout');
    return { success: true, memory: data };
  } catch (err) {
    const error = err as Error;
    console.error('[deleteMemoryAction] Crash details:', error);
    return { success: false, error: error.message || 'Unexpected server error.' };
  }
}
