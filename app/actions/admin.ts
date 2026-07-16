'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { generateText } from 'ai';
import { executeWithKeyRotation } from '@/utils/geminiPool';

// A. Check Bot Mute Status
export async function getBotMuteStatus(): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'bot_muted')
      .maybeSingle();
    return data?.value === 'true';
  } catch (err) {
    console.error('Failed to get bot mute status:', err);
    return false;
  }
}

// B. Toggle Bot Mute Status
export async function adminToggleBotMute(isMuted: boolean) {
  try {
    const supabase = createAdminClient();
    const val = isMuted ? 'true' : 'false';
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'bot_muted', value: val });

    if (error) throw error;
    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Failed to toggle bot mute:', err);
    return { success: false, error: errMsg };
  }
}

// C. Reset User PIN
export async function adminResetPin(userId: string, newPin: string) {
  try {
    const sanitizedPin = newPin.replace(/\s/g, '').trim();
    if (sanitizedPin.length !== 4 || isNaN(Number(sanitizedPin))) {
      return { success: false, error: 'PIN must be exactly 4 digits.' };
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('profiles')
      .update({ pin: sanitizedPin })
      .eq('id', userId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Failed to reset PIN:', err);
    return { success: false, error: errMsg };
  }
}

// D. Promote/Demote Member Role
export async function adminUpdateMemberRole(userId: string, groupId: string, newRole: string) {
  try {
    if (newRole !== 'admin' && newRole !== 'co-admin' && newRole !== 'member') {
      return { success: false, error: 'Invalid role.' };
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('group_members')
      .update({ role: newRole })
      .eq('user_id', userId)
      .eq('group_id', groupId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Failed to update member role:', err);
    return { success: false, error: errMsg };
  }
}

// E. Remove Member from Group Room
export async function adminRemoveMember(userId: string, groupId: string) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('user_id', userId)
      .eq('group_id', groupId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Failed to remove member:', err);
    return { success: false, error: errMsg };
  }
}

// F. Trigger Poke/Roast Motivation
export async function adminTriggerPoke(userId: string, groupId: string) {
  try {
    const supabase = createAdminClient();

    // Resolve profile details
    const { data: profile, error: profError } = await supabase
      .from('profiles')
      .select('nickname, full_name')
      .eq('id', userId)
      .single();

    if (profError || !profile) {
      return { success: false, error: 'User profile not found.' };
    }

    const userName = profile.nickname || profile.full_name || 'Athlete';

    // Resolve group info for Green API details
    const { data: group } = await supabase
      .from('groups')
      .select('name, whatsapp_instance_id, whatsapp_token, whatsapp_group_id')
      .eq('id', groupId)
      .single();

    const instanceId = group?.whatsapp_instance_id || process.env.GREEN_API_INSTANCE_ID;
    const token = group?.whatsapp_token || process.env.GREEN_API_TOKEN;
    const waChatId = group?.whatsapp_group_id || process.env.WHATSAPP_GROUP_ID;

    if (!instanceId || !token || !waChatId) {
      return { success: false, error: 'WhatsApp is not configured for this group.' };
    }

    // Call Gemini
    const promptText = `Act as @fisky, the witty and trendy Gen-Z AI Referee for a fitness group.
Write a short, hilarious, and aggressive (yet playful) call-out/roast text message targeting "${userName}" who hasn't logged any workouts/activities in a week.
Tell them the group is waiting on them and roast them for slacking.
Keep it under 60 words. Use emojis. Do not use hashtags or markdown formatting (no bold/italics). Just return the plain text.`;

    const result = await executeWithKeyRotation(async (modelInstance) => {
      return generateText({
        model: modelInstance,
        prompt: promptText,
      });
    });
    const text = result.text;

    const reply = text.trim();
    if (!reply) {
      return { success: false, error: 'Failed to generate motivational roast.' };
    }

    // Dispatch immediately via Green API
    const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: waChatId,
        message: reply,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[adminTriggerPoke] WhatsApp dispatch failed:', response.status, errorText);
      return { success: false, error: `WhatsApp dispatch failed with status: ${response.status}` };
    }

    return { success: true, message: reply };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Failed to trigger poke:', err);
    return { success: false, error: errMsg };
  }
}

/* ── God Mode Log Editor Actions ────────────────────────────────────────── */

export async function adminEditLog(logId: string, newValue: number) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('metric_logs')
      .update({ value: newValue })
      .eq('id', logId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[adminEditLog] Error editing log:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function adminVerifyLog(logId: string) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('metric_logs')
      .update({ status: 'verified' })
      .eq('id', logId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[adminVerifyLog] Error verifying log:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function adminDeleteLog(logId: string) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('metric_logs')
      .delete()
      .eq('id', logId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[adminDeleteLog] Error deleting log:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
