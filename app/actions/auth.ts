'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  encodeSession,
  SESSION_COOKIE,
  COOKIE_OPTIONS,
} from '@/lib/session';

/**
 * Server Actions for Kiosk Auth flow.
 * Spec: architecture.md §7
 */

/* ── Types ────────────────────────────────────────────────────────────────── */

export type Group = {
  id:          string;
  name:        string;
};

export type GroupProfile = {
  id:        string;
  full_name: string;
  avatar_url: string | null;
};

export type GetGroupsResult = { groups: Group[]; error?: string };

export type VerifyPinResult =
  | { success: true;  profiles: GroupProfile[] }
  | { success: false; error: string };

/* ── getGroupsAction ──────────────────────────────────────────────────────── */

/**
 * Fetch all groups for the landing page dropdown.
 * Uses the service-role-less anon client — groups table is readable by all
 * (the landing page is public, there is no Supabase Auth session yet).
 */
export async function getGroupsAction(): Promise<GetGroupsResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('groups')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) {
      console.error('[getGroupsAction]', error.message);
      return { groups: [], error: error.message };
    }

    return { groups: (data ?? []) as Group[] };
  } catch (err: any) {
    console.error('[getGroupsAction] catch block error:', err);
    return { groups: [], error: err?.message || 'Failed to connect to database' };
  }
}

/* ── verifyPinAction ──────────────────────────────────────────────────────── */

/**
 * Verify the 4-digit PIN (= invite_code) for a given group_id.
 * On success, return all profile members of that group.
 */
export async function verifyPinAction(
  groupId: string,
  pin: string,
): Promise<VerifyPinResult> {
  if (!groupId || !pin) {
    return { success: false, error: 'Group and PIN are required.' };
  }

  // Sanitize: strip whitespace, keep only digits
  const sanitizedPin = pin.replace(/\s/g, '').trim();

  const supabase = await createClient();

  // 1. Verify PIN matches the invite_code for this group
  const { data: group, error: groupErr } = await supabase
    .from('groups')
    .select('id, name')
    .eq('id', groupId)
    .eq('invite_code', sanitizedPin)
    .single();

  if (groupErr || !group) {
    return { success: false, error: 'Invalid PIN. Please try again.' };
  }

  // 2. Fetch all profiles who are members of this group
  const { data: members, error: membersErr } = await supabase
    .from('group_members')
    .select(`
      profiles!inner ( id, full_name, avatar_url )
    `)
    .eq('group_id', groupId);

  if (membersErr) {
    console.error('[verifyPinAction] members error:', membersErr.message);
    return { success: false, error: 'Could not load group members.' };
  }

  // Flatten the nested join result.
  // Supabase !inner join returns profiles as an array on each row.
  const profiles: GroupProfile[] = (members ?? [])
    .map((m) => (m as { profiles: GroupProfile | GroupProfile[] }).profiles)
    .flatMap((p) => (Array.isArray(p) ? p : [p]))
    .filter(Boolean) as GroupProfile[];

  return { success: true, profiles };
}

/* ── selectProfileAction ─────────────────────────────────────────────────── */

/**
 * Called when a user taps their profile card.
 * Sets the HTTP-only `app_session` cookie and redirects to /dashboard.
 */
export async function selectProfileAction(
  userId:    string,
  groupId:   string,
  groupName: string,
  userName:  string,
): Promise<void> {
  const token = await encodeSession({ userId, groupId, groupName, userName });
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, token, COOKIE_OPTIONS);

  redirect('/dashboard');
}

/* ── logoutAction ────────────────────────────────────────────────────────── */

/**
 * Deletes the `app_session` cookie and redirects to /.
 * Mounted in the Sidebar as "Switch Group".
 */
export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, '', {
    ...COOKIE_OPTIONS,
    maxAge: 0, // expire immediately
  });

  redirect('/');
}
