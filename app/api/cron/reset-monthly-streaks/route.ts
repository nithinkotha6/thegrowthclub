import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { safeCompare } from '@/lib/security';

/**
 * Monthly streak reset cron. Runs 1st of every month — for every profile in
 * every group, if `last_reset_month` isn't the current YYYY-MM, reset
 * `streak_count` to 0 and stamp `last_reset_month`. Idempotent: a repeat run
 * on the same day is a no-op for any profile already reset this month
 * (`last_reset_month` already matches, so the `.neq()` filter excludes it).
 *
 * Design Note:
 * Monthly reset clears streak_count to 0 so users compete on a monthly slate.
 * When a user logs an activity in the new month, `incrementStreakIfContinuous`
 * in `lib/actions/updateStreak.ts` will start their streak count at 1 and re-accumulate
 * it daily on consecutive activity days.
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    const secret = process.env.CRON_SECRET;

    if (!secret || !authHeader || !safeCompare(authHeader, `Bearer ${secret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();
    const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    const { data: groups, error: groupsErr } = await supabaseAdmin
      .from('groups')
      .select('id, name')
      .order('created_at', { ascending: true });

    if (groupsErr) {
      console.error('[reset-monthly-streaks] Query groups error:', groupsErr);
      return NextResponse.json({ error: groupsErr.message }, { status: 500 });
    }

    let totalReset = 0;
    const results: { group: string; reset: number }[] = [];

    for (const group of groups || []) {
      const { data: members, error: membersErr } = await supabaseAdmin
        .from('group_members')
        .select('user_id, profiles!inner ( id, last_reset_month )')
        .eq('group_id', group.id);

      if (membersErr) {
        console.error(`[reset-monthly-streaks] Query members error for group "${group.name}":`, membersErr);
        continue;
      }

      const idsToReset: string[] = [];
      for (const m of (members || []) as unknown as { profiles: { id: string; last_reset_month: string | null } | null }[]) {
        const profile = m.profiles;
        if (profile && profile.last_reset_month !== currentMonth) {
          idsToReset.push(profile.id);
        }
      }

      if (idsToReset.length === 0) {
        results.push({ group: group.name, reset: 0 });
        continue;
      }

      const { error: updateErr } = await supabaseAdmin
        .from('profiles')
        .update({ streak_count: 0, last_reset_month: currentMonth })
        .in('id', idsToReset);

      if (updateErr) {
        console.error(`[reset-monthly-streaks] Update error for group "${group.name}":`, updateErr);
        continue;
      }

      totalReset += idsToReset.length;
      results.push({ group: group.name, reset: idsToReset.length });
      console.log(`[reset-monthly-streaks] Reset ${idsToReset.length} profile(s) in group "${group.name}".`);
    }

    return NextResponse.json({ ok: true, month: currentMonth, totalReset, results });
  } catch (err) {
    console.error('[reset-monthly-streaks] Fatal error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
