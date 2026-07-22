'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { hashPin, isPinTakenInGroup } from '@/lib/security';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { generateText } from 'ai';
import { executeWithKeyRotation } from '@/utils/geminiPool';
import { buildGodModePokePrompt } from '@/lib/ai/prompts';
import { getSlangFor } from '@/utils/slangRouter';
import { SESSION_COOKIE, decodeSession, type AppSession } from '@/lib/session';
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

type AdminSessionResult =
  | { session: AppSession; error: null }
  | { session: null; error: string };

/**
 * Verifies the caller's session cookie, ensures a supplied groupId matches
 * the session's own groupId (the session is the only trusted source of
 * tenant scope, never the parameter), AND confirms the caller holds the
 * `admin` role in that group's `group_members` row. Every admin Server
 * Action must call this before touching the database.
 *
 * SEC-01 fix: previously this only checked session validity + group match,
 * never the caller's role — any authenticated member could invoke these
 * Server Actions directly (privilege escalation). Mirrors the role check
 * already used by `requireGroupAdminSession()` in app/actions/groups.ts.
 */
async function requireAdminSession(passedGroupId?: string): Promise<AdminSessionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;

  if (!session) {
    return { session: null, error: 'Unauthorized: Session credentials mismatch.' };
  }
  if (passedGroupId && passedGroupId !== session.groupId) {
    return { session: null, error: 'Unauthorized: group mismatch.' };
  }

  const supabase = createAdminClient(session.groupId);
  const { data: membership } = await supabase
    .from('group_members')
    .select('role')
    .eq('user_id', session.userId)
    .eq('group_id', session.groupId)
    .maybeSingle();

  if (!membership || membership.role !== 'admin') {
    return { session: null, error: 'Unauthorized: admin role required for this group.' };
  }
  return { session, error: null };
}

/** Confirms a target user is a member of the given group before an admin action mutates them. */
async function verifyUserInGroup(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  groupId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .maybeSingle();
  return !!data;
}

// A. Check Bot Mute Status
export async function getBotMuteStatus(): Promise<boolean> {
  try {
    const { session } = await requireAdminSession();
    if (!session) return false;

    const supabase = createAdminClient(session.groupId);
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
    const { session, error: sessionError } = await requireAdminSession();
    if (!session) return { success: false, error: sessionError };

    const supabase = createAdminClient(session.groupId);
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
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    const sanitizedPin = newPin.replace(/\s/g, '').trim();
    if (sanitizedPin.length !== 4 || isNaN(Number(sanitizedPin))) {
      return { success: false, error: 'PIN must be exactly 4 digits.' };
    }

    const supabase = createAdminClient(session.groupId);
    if (!(await verifyUserInGroup(supabase, userId, session.groupId))) {
      return { success: false, error: 'Unauthorized: user not in your group.' };
    }

    // QA-01: check PIN collision within the group before persisting (see
    // signUpAction's identical check for why this can't rely on the DB
    // constraint anymore now that PINs are bcrypt-hashed).
    if (await isPinTakenInGroup(supabase, session.groupId, sanitizedPin, userId)) {
      return { success: false, error: 'That PIN is already in use by another member of this group.' };
    }

    // SEC-04: hash the new PIN before persisting, never store it as plaintext.
    const { error } = await supabase
      .from('profiles')
      .update({ pin: await hashPin(sanitizedPin) })
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
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    if (newRole !== 'admin' && newRole !== 'co-admin' && newRole !== 'member') {
      return { success: false, error: 'Invalid role.' };
    }

    const supabase = createAdminClient(session.groupId);
    if (!(await verifyUserInGroup(supabase, userId, session.groupId))) {
      return { success: false, error: 'Unauthorized: user not in your group.' };
    }

    const { error } = await supabase
      .from('group_members')
      .update({ role: newRole })
      .eq('user_id', userId)
      .eq('group_id', session.groupId);

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
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    const supabase = createAdminClient(session.groupId);
    if (!(await verifyUserInGroup(supabase, userId, session.groupId))) {
      return { success: false, error: 'Unauthorized: user not in your group.' };
    }

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('user_id', userId)
      .eq('group_id', session.groupId);

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
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    const supabase = createAdminClient(session.groupId);
    if (!(await verifyUserInGroup(supabase, userId, session.groupId))) {
      return { success: false, error: 'Unauthorized: user not in your group.' };
    }

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
        .eq('group_id', session.groupId)
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

    // Fetch routed slang words (vocab_banks is per-group, see ISO-04)
    const slangWords = await getSlangFor(session.groupId, tone, resolvedGender);

    // Resolve group info for Green API details
    const { data: group } = await supabase
      .from('groups')
      .select('name, whatsapp_instance_id, whatsapp_token, whatsapp_group_id')
      .eq('id', session.groupId)
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
    const promptText = buildGodModePokePrompt({
      userName,
      tone,
      resolvedGender,
      loreInstruction,
      slangInstruction,
      contextInstruction,
    });

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

async function verifyLogInGroup(supabase: ReturnType<typeof createAdminClient>, logId: string, groupId: string): Promise<boolean> {
  const { data } = await supabase
    .from('metric_logs')
    .select('group_id')
    .eq('id', logId)
    .maybeSingle();
  return !!data && String(data.group_id) === String(groupId);
}

export async function adminEditLog(logId: string, newValue: number, groupId?: string) {
  try {
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    const supabase = createAdminClient(session.groupId);
    if (!(await verifyLogInGroup(supabase, logId, session.groupId))) {
      return { success: false, error: 'Unauthorized: activity not found in your group.' };
    }

    const { error } = await supabase
      .from('metric_logs')
      .update({ value: newValue })
      .eq('id', logId);

    if (error) throw error;
    // PERF-06: log edits only affect the dashboard chart/feed and rankings,
    // not the whole layout (sidebar/nav don't depend on log values). Rankings
    // moved onto /dashboard itself, so revalidating it alone is sufficient.
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('[adminEditLog] Error editing log:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function adminVerifyLog(logId: string, groupId?: string) {
  try {
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    const supabase = createAdminClient(session.groupId);
    if (!(await verifyLogInGroup(supabase, logId, session.groupId))) {
      return { success: false, error: 'Unauthorized: activity not found in your group.' };
    }

    const { error } = await supabase
      .from('metric_logs')
      .update({ status: 'verified' })
      .eq('id', logId);

    if (error) throw error;
    // PERF-06: scoped to the routes that actually render log status.
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('[adminVerifyLog] Error verifying log:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function adminDeleteLog(logId: string, groupId?: string) {
  try {
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    const supabase = createAdminClient(session.groupId);
    if (!(await verifyLogInGroup(supabase, logId, session.groupId))) {
      return { success: false, error: 'Unauthorized: activity not found in your group.' };
    }

    const { error } = await supabase
      .from('metric_logs')
      .delete()
      .eq('id', logId);

    if (error) throw error;
    // PERF-06: scoped to the routes that actually render log status.
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('[adminDeleteLog] Error deleting log:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

/* ── Module G: User Management (Soft Delete) ────────────────────────────── */

export async function adminToggleUserActive(targetUserId: string, isActive: boolean, groupId?: string) {
  try {
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    const supabase = createAdminClient(session.groupId);
    if (!(await verifyUserInGroup(supabase, targetUserId, session.groupId))) {
      return { success: false, error: 'Unauthorized: user not in your group.' };
    }

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
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    const supabase = createAdminClient(session.groupId);
    if (!(await verifyUserInGroup(supabase, targetUserId, session.groupId))) {
      return { success: false, error: 'Unauthorized: user not in your group.' };
    }

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
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError, data: [] };

    const supabase = createAdminClient(session.groupId);

    // member_lore now carries its own group_id column (see ISO-04) — filter
    // directly on it instead of joining through group_members (ISO-03).
    const { data, error } = await supabase
      .from('member_lore')
      .select('*')
      .eq('group_id', session.groupId);

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
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    const supabase = createAdminClient(session.groupId);
    if (!(await verifyUserInGroup(supabase, userId, session.groupId))) {
      return { success: false, error: 'Unauthorized: user not in your group.' };
    }

    const { error } = await supabase
      .from('member_lore')
      .upsert({
        user_id: userId,
        group_id: session.groupId,
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
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError, data: [] };

    const supabase = createAdminClient(session.groupId);
    const { data, error } = await supabase
      .from('vocab_banks')
      .select('*')
      .eq('group_id', session.groupId);

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
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    const supabase = createAdminClient(session.groupId);
    const payload: any = {
      group_id: session.groupId,
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
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    const supabase = createAdminClient(session.groupId);
    const { error } = await supabase
      .from('vocab_banks')
      .delete()
      .eq('id', id)
      .eq('group_id', session.groupId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[adminDeleteVocabBank] Error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function adminUploadAvatarAction(
  userId: string,
  base64Image: string,
  fileName: string,
  groupId?: string
) {
  if (!userId || !base64Image || !fileName) {
    return { success: false, error: 'Missing required parameters.' };
  }

  try {
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    const supabase = createAdminClient(session.groupId);
    if (!(await verifyUserInGroup(supabase, userId, session.groupId))) {
      return { success: false, error: 'Unauthorized: user not in your group.' };
    }

    // 1. Decode base64 to binary Buffer
    const buffer = Buffer.from(base64Image, 'base64');

    // 2. Deterministic filename per user — exactly one master picture per
    // person lives in Supabase Storage, no timestamped duplicates.
    const fileExt = fileName.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `${userId}.${fileExt}`;

    // 3. Ensure the 'profiles' bucket exists and is public
    try {
      await supabase.storage.createBucket('profiles', {
        public: true,
        fileSizeLimit: 1048576, // 1MB limit
      });
    } catch (bucketErr) {
      console.log('Bucket check/creation warning:', bucketErr);
    }

    // 4. Remove any stale file for this user under a different extension, so
    // exactly one master picture ever exists per person.
    const { data: existingFiles } = await supabase.storage.from('profiles').list('', { search: userId });
    const staleFiles = (existingFiles || [])
      .map((f) => f.name)
      .filter((name) => name.startsWith(`${userId}.`) && name !== filePath);
    if (staleFiles.length > 0) {
      await supabase.storage.from('profiles').remove(staleFiles);
    }

    // 5. Upload buffer to the profiles storage bucket (upsert = overwrite the master file)
    const { error: uploadErr } = await supabase.storage
      .from('profiles')
      .upload(filePath, buffer, {
        contentType: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`,
        upsert: true,
      });

    if (uploadErr) {
      console.error('[adminUploadAvatarAction] Storage upload error:', uploadErr);
      return { success: false, error: `Storage upload failed: ${uploadErr.message}` };
    }

    // 6. Get Public URL (cache-busted so overwriting the master file is reflected immediately)
    const { data: publicUrlData } = supabase.storage
      .from('profiles')
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData?.publicUrl ? `${publicUrlData.publicUrl}?v=${Date.now()}` : null;
    if (!publicUrl) {
      return { success: false, error: 'Failed to retrieve public URL for uploaded avatar.' };
    }

    // 7. Update user's profiles table record
    const { error: dbErr } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);

    if (dbErr) {
      console.error('[adminUploadAvatarAction] Database update error:', dbErr);
      return { success: false, error: `Profile update failed: ${dbErr.message}` };
    }

    // 8. Force Next.js cache revalidation
    revalidatePath('/', 'layout');

    return { success: true, avatarUrl: publicUrl };
  } catch (err) {
    console.error('[adminUploadAvatarAction] Crash:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

// G0. Fetch active bot moods (lookup table backing the mood picker)
export async function adminFetchBotMoods(groupId?: string) {
  try {
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError, data: [] };

    const supabase = createAdminClient(session.groupId);
    const { data, error } = await supabase
      .from('bot_moods')
      .select('slug, label')
      .eq('is_active', true)
      .order('label', { ascending: true });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err) {
    console.error('[adminFetchBotMoods] Error:', err);
    return { success: false, error: getErrorMessage(err), data: [] };
  }
}

// G. Update Bot Persistent Mood
export async function adminUpdatePersistentMood(
  groupId: string,
  mood: string,
  targetUserId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const { session, error: sessionError } = await requireAdminSession(groupId);
    if (!session) return { success: false, error: sessionError ?? undefined };

    const supabase = createAdminClient(session.groupId);
    if (targetUserId && !(await verifyUserInGroup(supabase, targetUserId, session.groupId))) {
      return { success: false, error: 'Unauthorized: user not in your group.' };
    }

    const { error } = await supabase
      .from('bot_persistent_state')
      .upsert(
        {
          group_id: session.groupId,
          persistent_mood: mood,
          target_user_id: targetUserId || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'group_id' }
      );

    if (error) throw error;

    // Revalidate layout to ensure graph, podium, rankings, and all sibling components
    // reflect the updated metric data simultaneously. Using 'layout' ensures all routes
    // sharing this data refresh together, maintaining consistency across the app.
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    const errMsg = getErrorMessage(err);
    console.error('Failed to update persistent mood:', err);
    return { success: false, error: errMsg };
  }
}

