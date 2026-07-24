'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession, type AppSession } from '@/lib/session';

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
  timer_duration_seconds?: number | null;
  timer_started_at?: string | null;
};

export type PlayerScoreRow = {
  id: string;
  match_id: string;
  user_id: string;
  team_name: TeamName;
  score: number;
  profiles?: { nickname: string | null; full_name: string | null; avatar_url: string | null } | null;
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
    .select('id, league_challenge_id, titans_score, rebels_score, winner_team, completed_at, created_at, timer_duration_seconds, timer_started_at')
    .eq('group_id', session.groupId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (dbErr) return { success: false, error: dbErr.message };
  return { success: true, matches: data ?? [] };
}

export async function createLeagueMatch(
  leagueChallengeId: string,
  timerSeconds?: number
): Promise<{ success: true; match: LeagueMatch } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data: match, error: dbErr } = await supabase
    .from('league_matches')
    .insert({
      group_id: session.groupId,
      league_challenge_id: leagueChallengeId,
      timer_duration_seconds: timerSeconds ?? null,
      timer_started_at: timerSeconds ? new Date().toISOString() : null,
    })
    .select('id, league_challenge_id, titans_score, rebels_score, winner_team, completed_at, created_at, timer_duration_seconds, timer_started_at')
    .single();

  if (dbErr || !match) return { success: false, error: dbErr?.message ?? 'Failed to create match.' };

  await supabase.from('league_match_logs').insert({
    group_id: session.groupId,
    match_id: match.id,
    action: 'create',
    actor_id: session.userId,
  });

  revalidatePath('/', 'layout');
  return { success: true, match };
}

/* ── Individual Player Scores Server Actions ────────────────────────────────── */

export async function getLeagueMatchPlayerScores(
  matchId: string
): Promise<{ success: true; scores: PlayerScoreRow[] } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data, error: dbErr } = await supabase
    .from('league_match_player_scores')
    .select('id, match_id, user_id, team_name, score, profiles ( nickname, full_name, avatar_url )')
    .eq('match_id', matchId)
    .eq('group_id', session.groupId);

  if (dbErr) return { success: false, error: dbErr.message };
  return { success: true, scores: (data ?? []) as unknown as PlayerScoreRow[] };
}

export async function updatePlayerScoreAction(
  matchId: string,
  targetUserId: string,
  teamName: TeamName,
  score: number
): Promise<{ success: true; titansTotal: number; rebelsTotal: number } | { success: false; error: string }> {
  if (!Number.isFinite(score) || score < 0) {
    return { success: false, error: 'Score must be a non-negative number.' };
  }

  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);

  // Upsert individual player score
  const { error: upsertErr } = await supabase
    .from('league_match_player_scores')
    .upsert(
      {
        match_id: matchId,
        group_id: session.groupId,
        user_id: targetUserId,
        team_name: teamName,
        score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'match_id,user_id' }
    );

  if (upsertErr) return { success: false, error: upsertErr.message };

  // Recalculate team totals via SUM aggregation
  const { data: allScores } = await supabase
    .from('league_match_player_scores')
    .select('team_name, score')
    .eq('match_id', matchId)
    .eq('group_id', session.groupId);

  let titansTotal = 0;
  let rebelsTotal = 0;

  for (const s of allScores || []) {
    if (s.team_name === 'TITANS') titansTotal += Number(s.score) || 0;
    if (s.team_name === 'REBELS') rebelsTotal += Number(s.score) || 0;
  }

  // Update league_matches table with aggregated team totals
  await supabase
    .from('league_matches')
    .update({ titans_score: titansTotal, rebels_score: rebelsTotal })
    .eq('id', matchId)
    .eq('group_id', session.groupId);

  revalidatePath('/', 'layout');
  return { success: true, titansTotal, rebelsTotal };
}

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

  if (dbErr) return { success: false, error: dbErr.message };

  revalidatePath('/', 'layout');
  return { success: true };
}

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

  await supabase.from('league_match_logs').insert({
    group_id: session.groupId,
    match_id: matchId,
    action: 'complete',
    actor_id: session.userId,
  });

  revalidatePath('/', 'layout');
  return { success: true, winner };
}

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
  revalidatePath('/', 'layout');
  return { success: true };
}
