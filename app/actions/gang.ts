'use server';

import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';

export interface GangProfile {
  id: string;
  full_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  total_xp: number;
  current_level: number;
  streak_count: number;
}

export async function fetchGangRoster() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const session = token ? await decodeSession(token) : null;

    if (!session) {
      return {
        success: false,
        error: 'Unauthorized session.',
        groupName: 'Club Member',
        roster: [],
      };
    }

    const { groupId } = session;
    const supabase = createAdminClient();

    // 1. Fetch group details
    const { data: group } = await supabase
      .from('groups')
      .select('name')
      .eq('id', groupId)
      .single();

    // 2. Fetch all profiles linked to group members (active only)
    const { data: membersRaw } = await supabase
      .from('group_members')
      .select(`
        user_id,
        profiles!inner ( id, full_name, nickname, avatar_url, total_xp, current_level, streak_count, is_active )
      `)
      .eq('group_id', groupId)
      .neq('profiles.is_active', false);

    const roster = (membersRaw ?? [])
      .map((m) => m.profiles as unknown as GangProfile)
      .filter((p): p is GangProfile => !!p)
      .sort((a, b) => b.total_xp - a.total_xp);

    return {
      success: true,
      groupName: group?.name || 'Club Roster',
      roster,
    };
  } catch (err) {
    console.error('[fetchGangRoster] Error fetching roster:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      groupName: 'Club Roster',
      roster: [],
    };
  }
}
