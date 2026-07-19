'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession, type AppSession } from '@/lib/session';

type SessionResult =
  | { session: AppSession; error: null }
  | { session: null; error: string };

/** Confirms the caller has a valid session cookie. No group-role check — used
 * only by `adminCreateGroup`, which by definition operates before the caller
 * has any role in the group being created. */
async function requireSession(): Promise<SessionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session) {
    return { session: null, error: 'Unauthorized: Session credentials mismatch.' };
  }
  return { session, error: null };
}

/** Confirms the caller's session matches `groupId` AND the caller holds the
 * `admin` role in that group's `group_members` row. Required for every
 * mutation against an existing group. */
async function requireGroupAdminSession(groupId: string): Promise<SessionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;

  if (!session) {
    return { session: null, error: 'Unauthorized: Session credentials mismatch.' };
  }
  if (session.groupId !== groupId) {
    return { session: null, error: 'Unauthorized: group mismatch.' };
  }

  const supabase = createAdminClient(session.groupId);
  const { data: membership } = await supabase
    .from('group_members')
    .select('role')
    .eq('user_id', session.userId)
    .eq('group_id', groupId)
    .maybeSingle();

  if (!membership || membership.role !== 'admin') {
    return { session: null, error: 'Unauthorized: admin role required for this group.' };
  }
  return { session, error: null };
}

function getErrorMessage(err: unknown): string {
  if (!err) return 'An unknown error occurred';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export interface GroupDetails {
  id: string;
  name: string;
  invite_code: string | null;
  whatsapp_instance_id: string | null;
  whatsapp_token: string | null;
  whatsapp_group_id: string | null;
}

/** Fetches the caller's own group row (never another group's). */
export async function adminFetchGroupDetails(groupId: string): Promise<
  { success: true; group: GroupDetails | null } | { success: false; error: string }
> {
  const { session, error: sessionError } = await requireGroupAdminSession(groupId);
  if (!session) return { success: false, error: sessionError };

  const supabase = createAdminClient(session.groupId);
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, invite_code, whatsapp_instance_id, whatsapp_token, whatsapp_group_id')
    .eq('id', session.groupId)
    .maybeSingle();

  if (error) return { success: false, error: getErrorMessage(error) };
  return { success: true, group: (data as GroupDetails) || null };
}

/** Creates a brand-new group and makes the caller its first admin member. */
export async function adminCreateGroup(name: string, inviteCode: string) {
  try {
    const { session, error: sessionError } = await requireSession();
    if (!session) return { success: false, error: sessionError };

    const trimmedName = name.trim();
    const trimmedInvite = inviteCode.trim();
    if (!trimmedName) return { success: false, error: 'Group name is required.' };
    if (!trimmedInvite) return { success: false, error: 'Invite code is required.' };

    const supabase = createAdminClient();
    const { data: newGroup, error: insertErr } = await supabase
      .from('groups')
      .insert({ name: trimmedName, invite_code: trimmedInvite })
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    const { error: memberErr } = await supabase
      .from('group_members')
      .insert({ user_id: session.userId, group_id: newGroup.id, role: 'admin' });

    if (memberErr) throw memberErr;

    return { success: true, groupId: newGroup.id as string };
  } catch (err) {
    console.error('[adminCreateGroup] Failed:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

/** Renames a group / changes its invite code. Admin-role gated. */
export async function adminUpdateGroup(groupId: string, patch: { name?: string; inviteCode?: string }) {
  try {
    const { session, error: sessionError } = await requireGroupAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    const update: Record<string, string> = {};
    if (patch.name?.trim()) update.name = patch.name.trim();
    if (patch.inviteCode?.trim()) update.invite_code = patch.inviteCode.trim();
    if (Object.keys(update).length === 0) {
      return { success: false, error: 'Nothing to update.' };
    }

    const supabase = createAdminClient(session.groupId);
    const { error } = await supabase.from('groups').update(update).eq('id', session.groupId);
    if (error) throw error;

    return { success: true };
  } catch (err) {
    console.error('[adminUpdateGroup] Failed:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

/** Updates a group's per-tenant WhatsApp/Green API dispatch config. Admin-role gated. */
export async function adminUpdateGroupWhatsApp(
  groupId: string,
  config: { whatsappInstanceId?: string; whatsappToken?: string; whatsappGroupId?: string }
) {
  try {
    const { session, error: sessionError } = await requireGroupAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    const update: Record<string, string | null> = {
      whatsapp_instance_id: config.whatsappInstanceId?.trim() || null,
      whatsapp_token: config.whatsappToken?.trim() || null,
      whatsapp_group_id: config.whatsappGroupId?.trim() || null,
    };

    const supabase = createAdminClient(session.groupId);
    const { error } = await supabase.from('groups').update(update).eq('id', session.groupId);
    if (error) throw error;

    return { success: true };
  } catch (err) {
    console.error('[adminUpdateGroupWhatsApp] Failed:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

/** Soft-deletes a group. Requires the caller to type the exact group name to confirm. */
export async function adminDeleteGroup(groupId: string, confirmName: string) {
  try {
    const { session, error: sessionError } = await requireGroupAdminSession(groupId);
    if (!session) return { success: false, error: sessionError };

    const supabase = createAdminClient(session.groupId);
    const { data: group, error: fetchErr } = await supabase
      .from('groups')
      .select('name')
      .eq('id', session.groupId)
      .single();
    if (fetchErr) throw fetchErr;

    if (confirmName.trim() !== group.name) {
      return { success: false, error: 'Confirmation text does not match the group name.' };
    }

    const { error } = await supabase
      .from('groups')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', session.groupId);
    if (error) throw error;

    return { success: true };
  } catch (err) {
    console.error('[adminDeleteGroup] Failed:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}
