'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession, type AppSession } from '@/lib/session';
import { DAILY_GOAL_METRICS } from '@/lib/config/daily-goals';

/**
 * Server Actions for the Daily Goals module (Dashboard & Challenges spec,
 * DASH-01/02/15/16/17). See Findings_and_Recommendations.md.
 */

type SessionResult =
  | { session: AppSession; error: null }
  | { session: null; error: string };

/** Confirms the caller has a valid session. */
async function requireSession(): Promise<SessionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session) {
    return { session: null, error: 'Unauthorized: Session credentials mismatch.' };
  }
  return { session, error: null };
}

/** Confirms the caller holds the `admin` role in their own session group.
 * Required for creating daily goals (static/admin-defined per spec). */
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

export type DailyGoal = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
};

export type DailyGoalCompletion = {
  id: string;
  daily_goal_id: string;
  user_id: string;
  completed_at: string;
  profiles?: { nickname: string | null; full_name: string | null } | null;
};

/** Fetch every daily goal defined for the caller's group (auto-seeds predefined defaults if empty). */
export async function getDailyGoals(): Promise<{ success: true; goals: DailyGoal[] } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data, error: dbErr } = await supabase
    .from('daily_goals')
    .select('id, title, description, created_at')
    .eq('group_id', session.groupId)
    .order('created_at', { ascending: true });

  if (dbErr) return { success: false, error: dbErr.message };

  let goals = data ?? [];

  // Auto-seed predefined daily goals if group has no goals configured yet
  if (goals.length === 0) {
    const defaultInserts = DAILY_GOAL_METRICS.map((m) => ({
      group_id: session.groupId,
      title: m.name,
      description: m.description ?? `${m.name} daily target`,
    }));

    const { data: seeded, error: seedErr } = await supabase
      .from('daily_goals')
      .insert(defaultInserts)
      .select('id, title, description, created_at');

    if (!seedErr && seeded && seeded.length > 0) {
      goals = seeded;
    }
  }

  return { success: true, goals };
}

/** Fetch today's (and recent) completions for the caller's group, for the
 * checkbox state. Excludes soft-deleted rows — the single shared filter
 * every read of this table must apply. */
export async function getDailyGoalCompletions(
  limit = 200,
): Promise<{ success: true; completions: DailyGoalCompletion[] } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data, error: dbErr } = await supabase
    .from('daily_goal_completions')
    .select('id, daily_goal_id, user_id, completed_at, profiles ( nickname, full_name )')
    .eq('group_id', session.groupId)
    .is('deleted_at', null)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (dbErr) return { success: false, error: dbErr.message };
  return { success: true, completions: (data ?? []) as unknown as DailyGoalCompletion[] };
}

/** Admin-only: create a new static daily goal. */
export async function adminCreateDailyGoal(
  title: string,
  description?: string,
): Promise<{ success: true; goal: DailyGoal } | { success: false; error: string }> {
  if (!title.trim()) return { success: false, error: 'Title is required.' };

  const { session, error } = await requireAdminSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data, error: dbErr } = await supabase
    .from('daily_goals')
    .insert({ group_id: session.groupId, title: title.trim(), description: description?.trim() || null })
    .select('id, title, description, created_at')
    .single();

  if (dbErr) return { success: false, error: dbErr.message };
  revalidatePath('/', 'layout');
  return { success: true, goal: data };
}

/**
 * Checkbox click → log completion (DASH-15). One completion per user per
 * goal per calendar day, enforced at the DB level (see migration 0036's
 * partial unique index) — a duplicate click surfaces a clean error instead
 * of a raw constraint message. Supports custom target date (completedAtISO).
 */
export async function logDailyGoalCompletion(
  dailyGoalId: string,
  completedAtISO?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const completed_at = completedAtISO || new Date().toISOString();

  const { error: dbErr } = await supabase.from('daily_goal_completions').insert({
    group_id: session.groupId,
    user_id: session.userId,
    daily_goal_id: dailyGoalId,
    completed_at,
  });

  if (dbErr) {
    if (dbErr.code === '23505') {
      return { success: false, error: 'You already completed this goal today.' };
    }
    return { success: false, error: dbErr.message };
  }

  revalidatePath('/', 'layout');
  return { success: true };
}

/**
 * Delete button → soft-delete (DASH-16). Never hard-deletes — the daily
 * broadcast bot (DASH-17) and the Recent Activities list both rely on the
 * same `deleted_at IS NULL` filter to stay in sync; a caller may only delete
 * their own completion.
 */
export async function deleteDailyGoalCompletion(
  completionId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const supabase = createAdminClient(session.groupId);
  const { data: existing, error: fetchErr } = await supabase
    .from('daily_goal_completions')
    .select('user_id')
    .eq('id', completionId)
    .eq('group_id', session.groupId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { success: false, error: 'Completion not found.' };
  }
  if (existing.user_id !== session.userId) {
    return { success: false, error: 'Unauthorized: you can only delete your own completion.' };
  }

  const { error: dbErr } = await supabase
    .from('daily_goal_completions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', completionId);

  revalidatePath('/', 'layout');
  return { success: true };
}

import { calculateStreak, calculateCompletionRate } from '@/lib/utils/heatmapColors';

/**
 * Fetch 30-day habit consistency data for the user.
 */
export async function getConsistencyData(
  targetUserId?: string,
  targetGroupId?: string,
  metric: string = 'all'
): Promise<
  | {
      success: true;
      byDateMap: Record<string, string[]>;
      streak: number;
      completionRate: number;
    }
  | { success: false; error: string }
> {
  const { session, error } = await requireSession();
  if (!session) return { success: false, error: error! };

  const userId = targetUserId || session.userId;
  const groupId = targetGroupId || session.groupId;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const supabase = createAdminClient(groupId);
  const { data, error: dbErr } = await supabase
    .from('daily_goal_completions')
    .select('daily_goal_id, completed_at, daily_goals ( title )')
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .gte('completed_at', thirtyDaysAgo.toISOString());

  if (dbErr) return { success: false, error: dbErr.message };

  // Map completions by YYYY-MM-DD -> list of metric slugs/identifiers
  const setByDate: Record<string, Set<string>> = {};
  const arrayByDate: Record<string, string[]> = {};

  for (const c of data || []) {
    const dateStr = new Date(c.completed_at).toISOString().split('T')[0];
    if (!setByDate[dateStr]) {
      setByDate[dateStr] = new Set();
    }

    const title = (c as any).daily_goals?.title?.toLowerCase() || '';
    let slug = c.daily_goal_id;

    for (const preset of DAILY_GOAL_METRICS) {
      if (
        title.includes(preset.slug.replace(/_/g, ' ')) ||
        title.includes(preset.name.toLowerCase()) ||
        preset.name.toLowerCase().includes(title)
      ) {
        slug = preset.slug;
        break;
      }
    }

    setByDate[dateStr].add(slug);
  }

  for (const [d, set] of Object.entries(setByDate)) {
    arrayByDate[d] = Array.from(set);
  }

  const streak = calculateStreak(setByDate, metric, DAILY_GOAL_METRICS.length);
  const completionRate = calculateCompletionRate(setByDate, metric, DAILY_GOAL_METRICS.length);

  return {
    success: true,
    byDateMap: arrayByDate,
    streak,
    completionRate,
  };
}

