'use server';
 
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { safeCompare } from '@/lib/security';
import { z } from 'zod';

const SignUpSchema = z.object({
  inviteCode: z.string().trim().min(1, 'Invite code is required'),
  firstName: z.string()
    .trim()
    .min(1, "First name is required")
    .refine(val => !val.includes(" "), { message: "First name cannot contain spaces" }),
  nickname: z.string().trim().optional(),
  email: z.string().trim().email('Invalid email address').or(z.literal('')),
  pin: z.string().trim().length(4, 'PIN must be exactly 4 digits'),
  gender: z.enum(['Male', 'Female']),
});
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
  nickname?: string | null;
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
      .not('invite_code', 'is', null)
      .order('name', { ascending: true });

    if (error) {
      console.error('[getGroupsAction]', error.message);
      return { groups: [], error: error.message };
    }

    return { groups: (data ?? []) as Group[] };
  } catch (err) {
    console.error('[getGroupsAction] catch block error:', err);
    const errorMsg = err instanceof Error ? err.message : 'Failed to connect to database';
    return { groups: [], error: errorMsg };
  }
}

/* ── loginWithPersonalPinAction ───────────────────────────────────────────── */

export type LoginResult =
  | { success: true; userName: string; userId: string; groupId: string; groupName: string; avatarUrl?: string | null }
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
    console.log("LOGIN ATTEMPT:", { groupId, pin });
    const supabase = createAdminClient();

    // Step 1: Find a profile with this PIN that belongs to the given group.
    // Filter directly on profiles.pin in the query to avoid downloading other users' PINs
    const { data: members, error: membersError } = await supabase
      .from('group_members')
      .select(`
        group_id,
        profiles!inner ( id, full_name, nickname, pin, avatar_url )
      `)
      .eq('group_id', groupId)
      .eq('profiles.pin', sanitizedPin);

    if (membersError) {
      console.error('[loginWithPersonalPinAction] members query error:', membersError);
      return { success: false, error: 'Login failed. Please try again.' };
    }

    type MemberRow = {
      group_id: string;
      profiles: {
        id: string;
        full_name: string | null;
        nickname: string | null;
        pin: string | null;
        avatar_url: string | null;
      } | {
        id: string;
        full_name: string | null;
        nickname: string | null;
        pin: string | null;
        avatar_url: string | null;
      }[] | null;
    };

    // Filter in application code with timing-safe comparison
    const membersTyped = (members as unknown as MemberRow[]) ?? [];
    const match = membersTyped.find((m) => {
      const profiles = Array.isArray(m.profiles) ? m.profiles : [m.profiles];
      return profiles.some((p) => p && p.pin && safeCompare(p.pin, sanitizedPin));
    });

    if (!match) {
      // Delay to mitigate brute force PIN cracking attempts
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { success: false, error: 'Invalid PIN. Please try again.' };
    }

    // Extract the matched profile (handle both array and object shapes)
    const profilesArr = Array.isArray(match.profiles) ? match.profiles : [match.profiles];
    const profile = profilesArr.find((p) => p && p.pin && safeCompare(p.pin, sanitizedPin));

    if (!profile) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { success: false, error: 'Invalid PIN. Please try again.' };
    }

    // Step 2: Get the group name
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('name')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      console.error('[loginWithPersonalPinAction] group fetch error:', groupError);
      return { success: false, error: 'Failed to load group info.' };
    }

    const displayName = profile.nickname || profile.full_name || 'Athlete';

    const token = await encodeSession({
      userId:    profile.id,
      groupId:   match.group_id,
      groupName: group.name,
      userName:  displayName,
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, COOKIE_OPTIONS);

    return {
      success:   true,
      userName:  displayName,
      userId:    profile.id,
      groupId:   match.group_id,
      groupName: group.name,
      avatarUrl: profile.avatar_url,
    };
  } catch (err) {
    console.error("LOGIN CRASH:", err);
    const msg = err instanceof Error ? err.message : 'Login failed';
    return { success: false, error: msg };
  }
}

/* ── signUpAction ─────────────────────────────────────────────────────────── */

export type SignUpResult =
  | { success: true; userName: string; userId: string; groupId: string; groupName: string; avatarUrl?: string | null }
  | { success: false; error: string };

/**
 * Signs up a new user using a group invite code, full name, nickname, email, and PIN.
 * Automatically links the user to the group and logs them in.
 */
export async function signUpAction(
  inviteCode: string,
  fullName: string,
  nickname: string,
  email: string,
  pin: string,
  gender: string,
): Promise<SignUpResult> {
  const validation = SignUpSchema.safeParse({
    inviteCode,
    firstName: fullName,
    nickname,
    email,
    pin,
    gender,
  });

  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  const { firstName: sanitizedName, pin: sanitizedPin, inviteCode: sanitizedInvite } = validation.data;

  try {
    const supabase = createAdminClient();

    // 1. Look up the group by invite_code
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('invite_code', sanitizedInvite)
      .single();

    if (groupError || !group) {
      console.error('[signUpAction] Group invite code lookup failed:', groupError);
      return { success: false, error: 'Invalid Group Code' };
    }

    // 2. Prevent duplicate accounts by composite Name + (Nickname OR Email)
    const cleanFirstName = sanitizedName.trim();
    const cleanNickname = nickname.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    let orCondition = 'id.eq.00000000-0000-0000-0000-000000000000'; // Default false condition
    const conditions: string[] = [];
    if (cleanNickname) {
      conditions.push(`nickname.ilike.${cleanNickname}`);
    }
    if (cleanEmail) {
      conditions.push(`email.ilike.${cleanEmail}`);
    }
    if (conditions.length > 0) {
      orCondition = conditions.join(',');
    }

    const { data: existingUser, error: queryError } = await supabase
      .from('profiles')
      .select('id, full_name, nickname, email')
      .eq('full_name', cleanFirstName)
      .or(orCondition)
      .maybeSingle();

    if (queryError) {
      console.error("Database query failed during composite uniqueness check:", queryError);
      return { success: false, error: "Database connection error. Please try again." };
    }

    if (existingUser) {
      return { 
        success: false,
        error: "An account with this Name, Nickname, and Email combination already exists. Please log in with your 4-digit PIN instead." 
      };
    }

    // 3. Generate a new profile with sanitized payload matching the active database schema
    const validGender = (gender === 'Male' || gender === 'Female') ? gender : 'Male';
    const cleanPin = sanitizedPin;
    const activeGroupId = group.id;

    let newProfile: any = null;
    let profileError: any = null;

    const { data: directProfile, error: directError } = await supabase
      .from('profiles')
      .insert({
        full_name: cleanFirstName,
        nickname: nickname.trim() || null,
        email: email.trim() || null,
        gender: validGender,
        pin: cleanPin,
        group_id: activeGroupId,
        role: 'member',
        avatar_url: null,
      })
      .select('id, full_name, nickname, avatar_url')
      .single();

    if (directError && directError.message.toLowerCase().includes('gender')) {
      console.warn('[signup] Target database is missing the profiles.gender column. Falling back to insert without gender.');
      const { data: fallbackProfile, error: fallbackError } = await supabase
        .from('profiles')
        .insert({
          full_name: cleanFirstName,
          nickname: nickname.trim() || null,
          email: email.trim() || null,
          pin: cleanPin,
          group_id: activeGroupId,
          role: 'member',
          avatar_url: null,
        })
        .select('id, full_name, nickname, avatar_url')
        .single();
      newProfile = fallbackProfile;
      profileError = fallbackError;
    } else {
      newProfile = directProfile;
      profileError = directError;
    }

    if (profileError || !newProfile) {
      if (profileError) {
        console.error("SIGNUP CRASH:", profileError.message, profileError.details, profileError.code);
        if (profileError.message.toLowerCase().includes('schema cache')) {
          console.error("CRITICAL: Run 'NOTIFY pgrst, reload schema;' in Supabase SQL editor.");
        }
      }
      return { success: false, error: 'Failed to create user profile. The PIN/email may already be registered.' };
    }

    // 4. Link them in the group_members table
    const { error: memberError } = await supabase
      .from('group_members')
      .insert({
        user_id: newProfile.id,
        group_id: group.id,
      });

    if (memberError) {
      console.error("SIGNUP CRASH:", memberError.message, memberError.details, memberError.code);
      // Clean up the created profile to prevent orphaned profiles
      await supabase.from('profiles').delete().eq('id', newProfile.id);
      return { success: false, error: 'Failed to link user to the group.' };
    }

    // 5. Encode session and set the HTTP-only cookie
    const displayName = newProfile.nickname || newProfile.full_name;
    const token = await encodeSession({
      userId: newProfile.id,
      groupId: group.id,
      groupName: group.name,
      userName: displayName,
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, COOKIE_OPTIONS);

    return {
      success: true,
      userName: displayName,
      userId: newProfile.id,
      groupId: group.id,
      groupName: group.name,
      avatarUrl: newProfile.avatar_url,
    };
  } catch (err) {
    console.error("FINAL SIGNUP CRASH:", err);
    const msg = err instanceof Error ? err.message : 'An unexpected error occurred during signup.';
    return { success: false, error: msg };
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

export async function getTopActiveMembersAction(groupId: string): Promise<GroupProfile[]> {
  try {
    const supabase = createAdminClient();
    
    // Fetch top 5 active members in this group based on total_xp
    const { data, error } = await supabase
      .from('group_members')
      .select(`
        profiles!inner ( id, full_name, nickname, avatar_url, total_xp )
      `)
      .eq('group_id', groupId)
      .order('profiles(total_xp)', { ascending: false })
      .limit(5);

    if (error) {
      console.error('[getTopActiveMembersAction] error:', error);
      return [];
    }

    type MemberRowRaw = {
      profiles: {
        id: string;
        full_name: string | null;
        nickname: string | null;
        avatar_url: string | null;
        total_xp: number;
      };
    };

    const profiles = ((data || []) as unknown as MemberRowRaw[]).map((m) => {
      const p = m.profiles;
      return {
        id: p.id,
        full_name: p.full_name,
        nickname: p.nickname,
        avatar_url: p.avatar_url,
      } as GroupProfile;
    });

    return profiles;
  } catch (err) {
    console.error('[getTopActiveMembersAction] catch:', err);
    return [];
  }
}
