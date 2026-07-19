'use server';
 
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { hashPin, verifyPin, isPinTakenInGroup } from '@/lib/security';
import { checkLoginLockout, recordFailedLoginAttempt, clearLoginAttempts } from '@/lib/rateLimit';
import { z } from 'zod';

const SignUpSchema = z.object({
  inviteCode: z.string().trim().min(1, 'Invite code is required'),
  firstName: z.string()
    .trim()
    .min(1, "First name is required")
    .refine(val => !val.includes(" "), { message: "First name cannot contain spaces" }),
  nickname: z.string().trim().min(1, 'Nickname is required'),
  email: z.string().trim().email('Invalid email address'),
  pin: z.string().trim().length(4, 'PIN must be exactly 4 digits'),
  gender: z.enum(['Male', 'Female']),
  phoneNumber: z.string().trim().min(1, 'Phone number is required'),
});
import {
  encodeSession,
  decodeSession,
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
  | { success: true; userName: string; userId: string; groupId: string; groupName: string; avatarUrl?: string | null; token?: string }
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

  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0].trim() || hdrs.get('x-real-ip') || 'unknown';

  try {
    const supabase = createAdminClient();

    // Brute-force defense: reject immediately if this ip is locked out from a
    // prior burst of wrong PINs, before touching the profiles table at all.
    const lockout = await checkLoginLockout(supabase, groupId, ip);
    if (lockout.locked) {
      return { success: false, error: `Too many attempts. Please wait ${lockout.retryAfterMinutes} minute(s) and try again.` };
    }

    // Step 1: Find the profiles belonging to this group. PINs are now
    // bcrypt-hashed (SEC-04), so we can no longer filter by exact value in
    // the query itself — fetch the group's roster (bounded to one small
    // friend group) and verify each candidate in application code instead.
    const { data: members, error: membersError } = await supabase
      .from('group_members')
      .select(`
        group_id,
        profiles!inner ( id, full_name, nickname, pin, avatar_url )
      `)
      .eq('group_id', groupId);

    if (membersError) {
      console.error('[loginWithPersonalPinAction] members query error:', membersError);
      return { success: false, error: 'Login failed. Please try again.' };
    }

    type ProfileRow = {
      id: string;
      full_name: string | null;
      nickname: string | null;
      pin: string | null;
      avatar_url: string | null;
    };
    type MemberRow = {
      group_id: string;
      profiles: ProfileRow | ProfileRow[] | null;
    };

    // Verify the PIN (bcrypt hash, or legacy plaintext pending upgrade)
    // against every member's profile in this group with a timing-safe check.
    const membersTyped = (members as unknown as MemberRow[]) ?? [];
    let match: MemberRow | null = null;
    let profile: ProfileRow | null = null;
    let needsRehash = false;

    outer: for (const m of membersTyped) {
      const profiles = Array.isArray(m.profiles) ? m.profiles : [m.profiles];
      for (const p of profiles) {
        if (!p || !p.pin) continue;
        const result = await verifyPin(sanitizedPin, p.pin);
        if (result.match) {
          match = m;
          profile = p;
          needsRehash = result.needsRehash;
          break outer;
        }
      }
    }

    if (!match || !profile) {
      // Delay to mitigate brute force PIN cracking attempts, plus record the
      // failed attempt so repeated bursts get locked out (OTHER-04).
      await recordFailedLoginAttempt(supabase, groupId, ip);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { success: false, error: 'Invalid PIN. Please try again.' };
    }

    // SEC-04 lazy migration: transparently upgrade a legacy plaintext PIN to
    // a bcrypt hash now that we've confirmed it matches — no bulk migration
    // or forced logout required.
    if (needsRehash) {
      const newHash = await hashPin(sanitizedPin);
      await supabase.from('profiles').update({ pin: newHash }).eq('id', profile.id);
    }

    // Successful PIN match — clear any tracked failed attempts for this ip.
    await clearLoginAttempts(supabase, groupId, ip);

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
      token,
    };
  } catch (err) {
    console.error("LOGIN CRASH:", err);
    const msg = err instanceof Error ? err.message : 'Login failed';
    return { success: false, error: msg };
  }
}

/* ── signUpAction ─────────────────────────────────────────────────────────── */

export type SignUpResult =
  | { success: true; userName: string; userId: string; groupId: string; groupName: string; avatarUrl?: string | null; token?: string }
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
  phoneNumber: string,
): Promise<SignUpResult> {
  const validation = SignUpSchema.safeParse({
    inviteCode,
    firstName: fullName,
    nickname,
    email,
    pin,
    gender,
    phoneNumber,
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

    // 2. Prevent duplicate accounts by email or phone number
    const cleanFirstName = sanitizedName.trim();
    const cleanNickname = nickname.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    const { data: duplicateUser, error: checkError } = await supabase
      .from('profiles')
      .select('id, email, phone_number')
      .or(`email.eq.${cleanEmail},phone_number.eq.${phoneNumber.trim()}`)
      .maybeSingle();

    if (duplicateUser) {
      if (duplicateUser.email === cleanEmail) {
        return { success: false, error: "An account with this email already exists." };
      }
      if (duplicateUser.phone_number === phoneNumber.trim()) {
        return { success: false, error: "An account with this phone number already exists." };
      }
    }

    // Prevent duplicate accounts by composite Name + Nickname
    const { data: existingUser, error: queryError } = await supabase
      .from('profiles')
      .select('id, full_name, nickname')
      .eq('full_name', cleanFirstName)
      .eq('nickname', nickname.trim())
      .maybeSingle();

    if (queryError) {
      console.error("Database query failed during composite uniqueness check:", queryError);
      return { success: false, error: "Database connection error. Please try again." };
    }

    if (existingUser) {
      return { 
        success: false,
        error: "An account with this Name and Nickname combination already exists. Please log in with your 4-digit PIN instead." 
      };
    }

    // 3. Generate a new profile with sanitized payload matching the active database schema
    const validGender = (gender === 'Male' || gender === 'Female') ? gender : 'Male';
    const activeGroupId = group.id;

    // QA-01: bcrypt hashing (SEC-04) defeated the DB's UNIQUE(group_id, pin)
    // constraint (every hash is salted differently even for the same PIN),
    // so PIN collisions within a group must be checked in application code.
    if (await isPinTakenInGroup(supabase, activeGroupId, sanitizedPin)) {
      return { success: false, error: 'That PIN is already in use in this group. Please choose a different 4-digit PIN.' };
    }

    // SEC-04: PINs are hashed with bcrypt before being persisted, never stored as plaintext.
    const cleanPin = await hashPin(sanitizedPin);

    const { data: newProfile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        full_name: cleanFirstName,
        nickname: nickname.trim(),
        email: email.trim(),
        gender: validGender,
        pin: cleanPin,
        group_id: activeGroupId,
        role: 'member',
        avatar_url: null,
        phone_number: phoneNumber.trim(),
      })
      .select('id, full_name, nickname, avatar_url')
      .single();

    if (profileError || !newProfile) {
      if (profileError) {
        console.error("SIGNUP CRASH:", profileError.message, profileError.details, profileError.code);
        // QA-03: don't leak raw Postgres error text (constraint names, column
        // names) to the client. A unique-violation (23505) here means a
        // concurrent signup won the race on email/phone/PIN after our
        // earlier application-level checks passed — surface a clean,
        // actionable message instead of the DB internals.
        if (profileError.code === '23505') {
          return { success: false, error: 'An account with these details already exists. Please try logging in instead.' };
        }
        return { success: false, error: 'Failed to create user profile. Please try again.' };
      }
      return { success: false, error: 'Failed to create user profile.' };
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
      token,
    };
  } catch (err) {
    console.error("FINAL SIGNUP CRASH:", err);
    const msg = err instanceof Error ? err.message : 'An unexpected error occurred during signup.';
    return { success: false, error: msg };
  }
}

/* ── restoreSessionAction ────────────────────────────────────────────────── */

/**
 * Restores a session from local storage by verifying the cached JWT token
 * and resetting the httpOnly cookie.
 */
export async function restoreSessionAction(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await decodeSession(token);
    if (!session) {
      return { success: false, error: 'Invalid or expired session' };
    }
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
    return { success: true };
  } catch (err) {
    console.error('[restoreSessionAction] error:', err);
    return { success: false, error: 'Failed to restore session' };
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
