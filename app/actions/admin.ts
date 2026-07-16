'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { generateText } from 'ai';
import { executeWithKeyRotation } from '@/utils/geminiPool';
import { getSlangFor } from '@/utils/slangRouter';
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
export async function adminTriggerPoke(userId: string, groupId: string, tone: string, genderStyle: string = 'auto', customContext?: string) {
  try {
    const supabase = createAdminClient(groupId);

    // Resolve profile details defensively to handle cases where the database is missing the gender column
    let profile: any = null;
    let profError: any = null;

    const { data: dataWithGender, error: errWithGender } = await supabase
      .from('profiles')
      .select('nickname, full_name, gender')
      .eq('id', userId)
      .single();

    if (errWithGender && errWithGender.message.toLowerCase().includes('gender')) {
      console.warn('[adminTriggerPoke] Target database is missing the profiles.gender column. Falling back to select without gender.');
      const { data: dataNoGender, error: errNoGender } = await supabase
        .from('profiles')
        .select('nickname, full_name')
        .eq('id', userId)
        .single();
      profile = dataNoGender;
      profError = errNoGender;
    } else {
      profile = dataWithGender;
      profError = errWithGender;
    }

    if (profError || !profile) {
      console.error('[adminTriggerPoke] Profile lookup failed:', profError);
      return { success: false, error: 'User profile not found.' };
    }

    const userName = profile.nickname || profile.full_name || 'Athlete';

    let resolvedGender = 'Neutral';
    if (genderStyle === 'male') {
      resolvedGender = 'Male';
    } else if (genderStyle === 'female') {
      resolvedGender = 'Female';
    } else if (genderStyle === 'gay') {
      resolvedGender = 'Gay';
    } else {
      resolvedGender = profile.gender || 'Neutral';
    }

    // Resolve member lore defensively to handle cases where the database is missing the table
    let lore: any = null;
    let nemesisName = '';
    try {
      const { data: loreData } = await supabase
        .from('member_lore')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (loreData) {
        lore = loreData;
        if (loreData.nemesis_id) {
          const { data: nemesisProfile } = await supabase
            .from('profiles')
            .select('nickname, full_name')
            .eq('id', loreData.nemesis_id)
            .maybeSingle();
          if (nemesisProfile) {
            nemesisName = nemesisProfile.nickname || nemesisProfile.full_name || '';
          }
        }
      }
    } catch (err) {
      console.warn('[adminTriggerPoke] Failed to fetch member lore defensively:', err);
    }

    // Fetch routed slang words
    const slangWords = getSlangFor(tone, resolvedGender);

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

    // Build prompt dynamic parts
    let loreInstruction = '';
    if (lore) {
      const stuntsStr = (lore.stunts && lore.stunts.length > 0) ? `Inside joke stunts/events: ${lore.stunts.join(', ')}` : '';
      const goodHabitsStr = (lore.good_habits && lore.good_habits.length > 0) ? `Good habits: ${lore.good_habits.join(', ')}` : '';
      const badHabitsStr = (lore.bad_habits && lore.bad_habits.length > 0) ? `Bad habits: ${lore.bad_habits.join(', ')}` : '';
      const egoTriggerStr = lore.ego_trigger ? `Ego trigger (what makes them tick): "${lore.ego_trigger}"` : '';
      const catchphraseStr = lore.catchphrase ? `Their catchphrase: "${lore.catchphrase}"` : '';
      const nemesisStr = nemesisName ? `Their gang nemesis: "${nemesisName}"` : '';

      const loreParts = [stuntsStr, goodHabitsStr, badHabitsStr, egoTriggerStr, catchphraseStr, nemesisStr].filter(Boolean);
      if (loreParts.length > 0) {
        loreInstruction = `\nIntegrate the following user-specific inside joke lore/traits dynamically:\n${loreParts.join('\n')}`;
      }
    }

    const slangInstruction = (slangWords.length > 0)
      ? `\nYou MUST naturally incorporate one or more of these routed friendly-insult/banter expressions: ${slangWords.map(s => `"${s}"`).join(', ')}`
      : '';

    const contextInstruction = customContext && customContext.trim() !== ''
      ? `\nADDITIONAL SITUATIONAL CONTEXT (MUST address this in your message): "${customContext.trim()}"`
      : '';

    // Call Gemini
    const promptText = `Act as @fisky, the witty and trendy Gen-Z AI Referee for a Telugu fitness group.
Write a short, punchy WhatsApp message to "${userName}" in a strictly "${tone}" vibe/tone.
The target user's gender-style is "${resolvedGender}".

Rules:
1. The message MUST be written in conversational Romanized Telugu (Telugu words spelled out using English alphabet / Latin characters, e.g., "enti bro", "em chestunnav", "workout ekkada?"), mixed with fun Telugu slang and Gen-Z humor.
2. Under appropriate tones, unleash Tollywood pop culture humor, movie dialogues, or star actor style references. You are STRICTLY FORBIDDEN from using repetitive "Baahubali", "RRR", "Pushpa", or "Thaggedhele" references. Instead, dynamically rotate or reference new-age Hyderabadi cinema (DJ Tillu, Tharun Bhascker vibes, "Atluntadi manatho", "Radhika level deception"), classic comedy expressions (Brahmanandam, Sunil style, "Antha scene ledu", "Evadra nuvvu..."), or movie punch dialogue parodies (Balayya, Trivikram style parodies). ${loreInstruction}${slangInstruction}${contextInstruction}
3. If a gang nemesis is listed above, mention them or compare target to them in a funny way.
4. Keep the message under 60 words. Use emojis. Do not use hashtags or markdown formatting (no bold/italics). Just return the plain text.`;

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

/* ── Module G: User Management (Soft Delete) ────────────────────────────── */

export async function adminToggleUserActive(targetUserId: string, isActive: boolean, groupId?: string) {
  try {
    const supabase = createAdminClient(groupId);
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', targetUserId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[adminToggleUserActive] Error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function adminHardDeleteUser(targetUserId: string, groupId?: string) {
  try {
    const supabase = createAdminClient(groupId);
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', targetUserId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[adminHardDeleteUser] Error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

/* ── Module F: AI Brain Lore & Vocab Editor Actions ────────────────────── */

export async function adminFetchAllLore(groupId?: string) {
  try {
    const supabase = createAdminClient(groupId);
    const { data, error } = await supabase
      .from('member_lore')
      .select('*');

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err) {
    console.error('[adminFetchAllLore] Error:', err);
    return { success: false, error: getErrorMessage(err), data: [] };
  }
}

export async function adminUpsertMemberLore(
  userId: string,
  data: {
    stunts: string[];
    good_habits: string[];
    bad_habits: string[];
    ego_trigger: string | null;
    catchphrase: string | null;
    nemesis_id: string | null;
  },
  groupId?: string
) {
  try {
    const supabase = createAdminClient(groupId);
    const { error } = await supabase
      .from('member_lore')
      .upsert({
        user_id: userId,
        stunts: data.stunts || [],
        good_habits: data.good_habits || [],
        bad_habits: data.bad_habits || [],
        ego_trigger: data.ego_trigger || null,
        catchphrase: data.catchphrase || null,
        nemesis_id: data.nemesis_id || null,
      });

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[adminUpsertMemberLore] Error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function adminFetchVocabBanks(groupId?: string) {
  try {
    const supabase = createAdminClient(groupId);
    const { data, error } = await supabase
      .from('vocab_banks')
      .select('*');

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err) {
    console.error('[adminFetchVocabBanks] Error:', err);
    return { success: false, error: getErrorMessage(err), data: [] };
  }
}

export async function adminUpsertVocabBank(
  id: string | null,
  tone: string,
  gender: string,
  words: string[],
  groupId?: string
) {
  try {
    const supabase = createAdminClient(groupId);
    const payload: any = {
      tone,
      target_gender: gender,
      words,
    };
    if (id) {
      payload.id = id;
    }
    const { error } = await supabase
      .from('vocab_banks')
      .upsert(payload);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[adminUpsertVocabBank] Error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function adminDeleteVocabBank(id: string, groupId?: string) {
  try {
    const supabase = createAdminClient(groupId);
    const { error } = await supabase
      .from('vocab_banks')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[adminDeleteVocabBank] Error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}
