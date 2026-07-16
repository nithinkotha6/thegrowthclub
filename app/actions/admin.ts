'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { generateText } from 'ai';
import { executeWithKeyRotation } from '@/utils/geminiPool';
function getErrorMessage(err: unknown): string {
  if (!err) return 'An unknown error occurred';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    if ('message' in err && typeof (err as { message: unknown }).message === 'string') {
      return (err as { message: string }).message;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

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
    const errMsg = getErrorMessage(err);
    console.error('Failed to toggle bot mute:', err);
    return { success: false, error: errMsg };
  }
}

// C. Reset User PIN
export async function adminResetPin(userId: string, newPin: string, groupId?: string) {
  try {
    const sanitizedPin = newPin.replace(/\s/g, '').trim();
    if (sanitizedPin.length !== 4 || isNaN(Number(sanitizedPin))) {
      return { success: false, error: 'PIN must be exactly 4 digits.' };
    }

    const supabase = createAdminClient(groupId);
    const { error } = await supabase
      .from('profiles')
      .update({ pin: sanitizedPin })
      .eq('id', userId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    const errMsg = getErrorMessage(err);
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
    const errMsg = getErrorMessage(err);
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
    const errMsg = getErrorMessage(err);
    console.error('Failed to remove member:', err);
    return { success: false, error: errMsg };
  }
}

// F. Trigger Poke/Roast Motivation
export async function adminTriggerPoke(userId: string, groupId: string, tone: string, genderStyle: string = 'auto') {
  try {
    const supabase = createAdminClient(groupId);

    // Resolve profile details
    const { data: profile, error: profError } = await supabase
      .from('profiles')
      .select('nickname, full_name, gender')
      .eq('id', userId)
      .single();

    if (profError || !profile) {
      return { success: false, error: 'User profile not found.' };
    }

    const userName = profile.nickname || profile.full_name || 'Athlete';

    let resolvedGender = 'Neutral';
    if (genderStyle === 'male') {
      resolvedGender = 'Male';
    } else if (genderStyle === 'female') {
      resolvedGender = 'Female';
    } else {
      resolvedGender = profile.gender || 'Neutral';
    }

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
    const promptText = `Act as @fisky, the witty and trendy Gen-Z AI Referee for a Telugu fitness group.
Write a short, punchy WhatsApp message to "${userName}" in a strictly "${tone}" vibe/tone.
The target user's gender-style is "${resolvedGender}".
The message MUST be written in conversational Romanized Telugu (Telugu words spelled out using English alphabet / Latin characters, e.g., "enti bro", "em chestunnav", "workout ekkada?"), mixed with fun Telugu slang and Gen-Z humor.

When the selected tone calls for it, you can naturally use colloquial friendly Telugu slang/banter expressions. The supported vocabulary includes:
- "bang@m-sulii" (used for general or male/female style)
- "pichi-l@mja" (strictly for female style/context)
- "kothi-badcow" (for general or male style/context)
- "ment@l-mund" (strictly for female style/context)
- "adavi manishi" (general style/context)

Ensure you use these words naturally and in the correct style/gender context (e.g. do not use female-targeted words like "pichi-l@mja" or "ment@l-mund" if resolvedGender is Male). Treat these expressions as valid conversational friendly-roast language.
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
    const errMsg = getErrorMessage(err);
    console.error('Failed to trigger poke:', err);
    return { success: false, error: errMsg };
  }
}

/* ── God Mode Log Editor Actions ────────────────────────────────────────── */

export async function adminEditLog(logId: string, newValue: number, groupId?: string) {
  try {
    const supabase = createAdminClient(groupId);
    const { error } = await supabase
      .from('metric_logs')
      .update({ value: newValue })
      .eq('id', logId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[adminEditLog] Error editing log:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function adminVerifyLog(logId: string, groupId?: string) {
  try {
    const supabase = createAdminClient(groupId);
    const { error } = await supabase
      .from('metric_logs')
      .update({ status: 'verified' })
      .eq('id', logId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[adminVerifyLog] Error verifying log:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function adminDeleteLog(logId: string, groupId?: string) {
  try {
    const supabase = createAdminClient(groupId);
    const { error } = await supabase
      .from('metric_logs')
      .delete()
      .eq('id', logId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[adminDeleteLog] Error deleting log:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}
