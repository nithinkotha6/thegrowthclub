'use server';

import { createClient } from '@/lib/supabase/server';

export type SignUpResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Server Action: invite-code signup.
 * 1. Validate invite_code → resolve group_id.
 * 2. Create Supabase auth user.
 * 3. Insert profile row with group_id, full_name, phone_number.
 * Spec: architecture.md §2
 */
export async function signUpWithInvite(
  formData: FormData,
): Promise<SignUpResult> {
  const full_name    = (formData.get('full_name')    as string).trim();
  const phone_number = (formData.get('phone_number') as string).trim();
  const email        = (formData.get('email')        as string).trim();
  const password     = formData.get('password')      as string;
  const invite_code  = (formData.get('invite_code')  as string).trim().toUpperCase();

  if (!full_name || !phone_number || !email || !password || !invite_code) {
    return { success: false, error: 'All fields are required.' };
  }

  const supabase = await createClient();

  // 1. Resolve invite code → group_id
  const { data: group } = await supabase
    .from('groups')
    .select('id')
    .eq('invite_code', invite_code)
    .single();

  if (!group) {
    return { success: false, error: 'Invalid invite code. Please check with your group admin.' };
  }

  // 2. Create auth user
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authErr || !authData.user) {
    return { success: false, error: authErr?.message ?? 'Sign-up failed.' };
  }

  // 3. Insert profile (id mirrors auth.users)
  const { error: profileErr } = await supabase.from('profiles').insert({
    id:           authData.user.id,
    group_id:     group.id,
    full_name,
    phone_number,
  });

  if (profileErr) {
    return { success: false, error: profileErr.message };
  }

  return { success: true };
}
