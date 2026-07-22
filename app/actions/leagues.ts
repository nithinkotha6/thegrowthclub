'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession, type AppSession } from '@/lib/session';

/**
 * Server Actions for the Leagues module (TITANS vs REBELS). Dashboard &
 * Challenges spec DASH-22/23/24/25/26. See Findings_and_Recommendations.md.
 */

type SessionResult =
  | { session: AppSession; error: null }
  | { session: null; error: string };

async function requireSession(): Promise<SessionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session) {
    return { session: null, error: 'Unauthorized: Session credentials mismatch.' };
  }
  return { session, error: null };
}

/** Admin-role check, matching the pattern already used in app/actions/admin.ts. */
async function requireAdminSession(): Promise<SessionResult> {
  const { session, error } = await requireSession();
  if (!session) return { session: null, error };

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

export type TeamName = 'TITANS' | 'REBELS';

export type LeagueAssignment = {
  user_id: string;
  team_name: TeamName;
  profiles?: { nickname: string | null; full_name: string | null; avatar_url: string | null } | null;
};

export type LeagueChallenge = { id: string; name: string; description: string | null };

export type LeagueMatch = {
  id: string;
  league_challenge_id: string;
  titans_score: number;
  rebels_score: number;
  winner_team: TeamName | 'TIE' | null;
  completed_at: string | null;
  created_at: string;
};

/* ── Team assignment (DASH-22) ────────────────────────────────────────────── */

export async function getLeagueAssignments(): Promise<
  { success: true; assignments: LeagueAssignment[] } | { success: false; error: string }
> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data, error: dbErr } = await supabase
    .from('league_assignments')
    .select('user_id, team_name, profiles ( nickname, full_name, avatar_url )')
    .eq('group_id', session.groupId);

  if (dbErr) return { success: false, error: dbErr.message };
  return { success: true, assignments: (data ?? []) as unknown as LeagueAssignment[] };
}

export type GroupMemberProfile = {
  user_id: string;
  nickname: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

/** Fetch group members for the caller's group for player roster assignment. */
export async function getGroupMembers(): Promise<
  { success: true; members: GroupMemberProfile[] } | { success: false; error: string }
> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data: members, error: dbErr } = await supabase
    .from('group_members')
    .select('user_id, profiles ( nickname, full_name, avatar_url )')
    .eq('group_id', session.groupId);

  if (dbErr) return { success: false, error: dbErr.message };

  const formatted: GroupMemberProfile[] = (members ?? []).map((m: any) => ({
    user_id: m.user_id,
    nickname: m.profiles?.nickname ?? null,
    full_name: m.profiles?.full_name ?? null,
    avatar_url: m.profiles?.avatar_url ?? null,
  }));

  return { success: true, members: formatted };
}

/** Democratized: Assign (or reassign) a group member to a team (TITANS or REBELS). Accessible to all group members. */
export async function assignLeagueTeam(
  userId: string,
  teamName: TeamName,
): Promise<{ success: true } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data: inGroup } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('user_id', userId)
    .eq('group_id', session.groupId)
    .maybeSingle();
  if (!inGroup) return { success: false, error: 'Unauthorized: user not in your group.' };

  const { error: dbErr } = await supabase
    .from('league_assignments')
    .upsert(
      { group_id: session.groupId, user_id: userId, team_name: teamName, assigned_at: new Date().toISOString() },
      { onConflict: 'user_id,group_id' },
    );

  if (dbErr) return { success: false, error: dbErr.message };
  revalidatePath('/', 'layout');
  return { success: true };
}

/** Backward compatibility alias */
export const adminAssignLeagueTeam = assignLeagueTeam;

/* ── Challenge types (DASH-23) ────────────────────────────────────────────── */

export async function getLeagueChallenges(): Promise<
  { success: true; challenges: LeagueChallenge[] } | { success: false; error: string }
> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data, error: dbErr } = await supabase
    .from('league_challenges')
    .select('id, name, description')
    .eq('group_id', session.groupId)
    .order('created_at', { ascending: true });

  if (dbErr) return { success: false, error: dbErr.message };
  return { success: true, challenges: data ?? [] };
}

/** Democratized: Create a new league challenge type. Accessible to all group members. */
export async function createLeagueChallenge(
  name: string,
  description?: string,
): Promise<{ success: true; challenge: LeagueChallenge } | { success: false; error: string }> {
  if (!name.trim()) return { success: false, error: 'Name is required.' };

  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data, error: dbErr } = await supabase
    .from('league_challenges')
    .insert({ group_id: session.groupId, name: name.trim(), description: description?.trim() || null })
    .select('id, name, description')
    .single();

  if (dbErr) return { success: false, error: dbErr.message };
  revalidatePath('/', 'layout');
  return { success: true, challenge: data };
}

/** Backward compatibility alias */
export const adminCreateLeagueChallenge = createLeagueChallenge;

/* ── Matches (DASH-24/25/26) ──────────────────────────────────────────────── */

export async function getLeagueMatches(
  limit = 30,
): Promise<{ success: true; matches: LeagueMatch[] } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data, error: dbErr } = await supabase
    .from('league_matches')
    .select('id, league_challenge_id, titans_score, rebels_score, winner_team, completed_at, created_at')
    .eq('group_id', session.groupId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (dbErr) return { success: false, error: dbErr.message };
  return { success: true, matches: data ?? [] };
}

/** Create a new (not-yet-completed) match for a challenge type. Rosters are
 * NOT duplicated onto this row — they're read live from `league_assignments`
 * at render time. */
export async function createLeagueMatch(
  leagueChallengeId: string,
): Promise<{ success: true; match: LeagueMatch } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data: match, error: dbErr } = await supabase
    .from('league_matches')
    .insert({ group_id: session.groupId, league_challenge_id: leagueChallengeId })
    .select('id, league_challenge_id, titans_score, rebels_score, winner_team, completed_at, created_at')
    .single();

  if (dbErr || !match) return { success: false, error: dbErr?.message ?? 'Failed to create match.' };

  const { error: logErr } = await supabase.from('league_match_logs').insert({
    group_id: session.groupId,
    match_id: match.id,
    action: 'create',
    actor_id: session.userId,
  });

  if (logErr && (logErr.code === '23505' || logErr.message?.includes('unique') || logErr.message?.includes('duplicate'))) {
    console.warn('[createLeagueMatch] Duplicate match log skipped:', logErr.message);
  }

  revalidatePath('/', 'layout');
  return { success: true, match };
}

/** Update the manual score inputs while the match is still open (rejected by
 * the DB trigger once completed — see migration 0038). */
export async function updateLeagueMatchScore(
  matchId: string,
  titansScore: number,
  rebelsScore: number,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!Number.isFinite(titansScore) || !Number.isFinite(rebelsScore) || titansScore < 0 || rebelsScore < 0) {
    return { success: false, error: 'Scores must be valid, non-negative numbers.' };
  }

  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { error: dbErr } = await supabase
    .from('league_matches')
    .update({ titans_score: titansScore, rebels_score: rebelsScore })
    .eq('id', matchId)
    .eq('group_id', session.groupId);

  if (dbErr) {
    if (dbErr.message.toLowerCase().includes('already completed')) {
      return { success: false, error: 'This match is already completed and its score cannot be changed.' };
    }
    return { success: false, error: dbErr.message };
  }

  revalidatePath('/', 'layout');
  return { success: true };
}

/**
 * "Complete Challenge" button (DASH-25). Determines the winner from the
 * current scores and locks the match — the DB trigger from migration 0038
 * (`prevent_completed_match_edit`) is the real enforcement; this action just
 * performs the one legitimate transition from open → completed.
 */
export async function completeLeagueMatch(
  matchId: string,
): Promise<{ success: true; winner: TeamName | 'TIE' } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data: match, error: fetchErr } = await supabase
    .from('league_matches')
    .select('titans_score, rebels_score, completed_at')
    .eq('id', matchId)
    .eq('group_id', session.groupId)
    .maybeSingle();

  if (fetchErr || !match) return { success: false, error: 'Match not found.' };
  if (match.completed_at) return { success: false, error: 'This match is already completed.' };

  const winner: TeamName | 'TIE' =
    match.titans_score > match.rebels_score ? 'TITANS' : match.titans_score < match.rebels_score ? 'REBELS' : 'TIE';

  const { error: dbErr } = await supabase
    .from('league_matches')
    .update({ winner_team: winner, completed_at: new Date().toISOString() })
    .eq('id', matchId);

  if (dbErr) return { success: false, error: dbErr.message };

  const { error: logErr } = await supabase.from('league_match_logs').insert({
    group_id: session.groupId,
    match_id: matchId,
    action: 'complete',
    actor_id: session.userId,
  });

  if (logErr && (logErr.code === '23505' || logErr.message?.includes('unique') || logErr.message?.includes('duplicate'))) {
    console.warn('[completeLeagueMatch] Duplicate complete log skipped:', logErr.message);
  }

  revalidatePath('/', 'layout');
  return { success: true, winner };
}

/** Soft-delete a match (DASH-26). */
export async function deleteLeagueMatch(
  matchId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { error: dbErr } = await supabase
    .from('league_matches')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', matchId)
    .eq('group_id', session.groupId);

  if (dbErr) return { success: false, error: dbErr.message };

  const { error: logErr } = await supabase.from('league_match_logs').insert({
    group_id: session.groupId,
    match_id: matchId,
    action: 'delete',
    actor_id: session.userId,
  });

  if (logErr && (logErr.code === '23505' || logErr.message?.includes('unique') || logErr.message?.includes('duplicate'))) {
    console.warn('[deleteLeagueMatch] Duplicate delete log skipped:', logErr.message);
  }

  revalidatePath('/', 'layout');
  return { success: true };
}
