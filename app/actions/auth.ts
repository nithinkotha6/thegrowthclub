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

/* ── loginWithPersonalPinAction ───────────────────────────────────────────── */

export type LoginResult =
  | { success: true; userName: string; userId: string; groupId: string; groupName: string }
  | { success: false; error: string };

/**
 * Verify a 4-digit personal PIN for a member of a specific group.
 * Sets the HTTP-only app_session cookie if the credentials match.
 */
export async function loginWithPersonalPinAction(
  groupId: string,
  pin: string,
): Promise<LoginResult> {
  if (!groupId || !pin) {
    return { success: false, error: 'Group and PIN are required.' };
  }

  // Sanitize: strip whitespace, keep only digits
  const sanitizedPin = pin.replace(/\s/g, '').trim();

  try {
    const supabase = await createClient();

    // Query profiles in this group with the exact personal PIN
    const { data: member, error } = await supabase
      .from('group_members')
      .select(`
        group_id,
        groups!inner ( name ),
        profiles!inner ( id, full_name, pin )
      `)
      .eq('group_id', groupId)
      .eq('profiles.pin', sanitizedPin)
      .single();

    if (error || !member) {
      console.error('[loginWithPersonalPinAction] Query failed or no match:', error);
      return { success: false, error: 'Invalid PIN. Please try again.' };
    }

    const typedMember = member as unknown as {
      group_id: string;
      groups: { name: string };
      profiles: { id: string; full_name: string; pin: string };
    };

    const token = await encodeSession({
      userId: typedMember.profiles.id,
      groupId: typedMember.group_id,
      groupName: typedMember.groups.name,
      userName: typedMember.profiles.full_name,
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, COOKIE_OPTIONS);

    return {
      success: true,
      userName: typedMember.profiles.full_name,
      userId: typedMember.profiles.id,
      groupId: typedMember.group_id,
      groupName: typedMember.groups.name,
    };
  } catch (err: any) {
    console.error('[loginWithPersonalPinAction] Caught exception:', err);
    return { success: false, error: 'An error occurred during authentication.' };
  }
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
