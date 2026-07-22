import { createAdminClient } from '@/lib/supabase/server';

/**
 * Format a Date or ISO string into a local YYYY-MM-DD string for a given timezone.
 */
export function getLocalDateString(dateInput: Date | string, timezone: string = 'UTC'): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    // Fallback to UTC if timezone string is invalid
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }
}

/**
 * Pure helper function to calculate the updated streak count.
 * @param currentStreak User's current profiles.streak_count
 * @param previousLogs Array of logged_at objects from metric_logs ordered DESC (including the new log at index 0)
 * @param todayDateStr YYYY-MM-DD string of the date being logged in local timezone
 * @param timezone Timezone identifier (defaults to UTC)
 */
export function calculateStreakUpdate(
  currentStreak: number,
  previousLogs: Array<{ logged_at: string }>,
  todayDateStr: string,
  timezone: string = 'UTC'
): number {
  if (previousLogs.length <= 1) {
    // First activity ever logged by this user
    return 1;
  }

  // Date of the log immediately preceding the current log
  const prevLogDateStr = getLocalDateString(previousLogs[1].logged_at, timezone);

  // If the previous log was also on todayDateStr, user already logged today -> no streak increment change
  if (prevLogDateStr === todayDateStr) {
    return currentStreak;
  }

  // Calculate yesterday's date string in the local timezone reference
  const todayMidDay = new Date(`${todayDateStr}T12:00:00Z`);
  const yesterday = new Date(todayMidDay);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayDateStr = getLocalDateString(yesterday, 'UTC');

  if (prevLogDateStr === yesterdayDateStr) {
    // Continuous streak! Logged yesterday.
    return Math.max(1, currentStreak + 1);
  } else {
    // Missed a day or more -> reset streak to 1
    return 1;
  }
}

/**
 * Server Action: Increments profiles.streak_count if the activity logged is continuous.
 * Called immediately after a successful metric log insertion.
 *
 * Timezone note:
 * Database schema currently does not store profiles.timezone or groups.timezone (see docs/Findings_and_Recommendations.md §DASH-01b).
 * Checks profile.timezone if dynamically present, falling back to process.env.APP_TIMEZONE or 'UTC'.
 */
export async function incrementStreakIfContinuous(
  userId: string,
  groupId: string,
  targetDate?: Date
): Promise<number> {
  if (!userId || !groupId) return 0;

  const supabase = createAdminClient();

  // 1. Fetch current profile streak_count (and timezone if present on table)
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('streak_count')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) {
    console.error('[incrementStreakIfContinuous] Profile fetch error:', profileErr.message);
    return 0;
  }

  const currentStreak = profile?.streak_count ?? 0;
  const timezone = (profile as { timezone?: string } | null)?.timezone || process.env.APP_TIMEZONE || 'UTC';

  // 2. Fetch user's recent metric logs ordered by logged_at DESC
  const { data: recentLogs, error: logsErr } = await supabase
    .from('metric_logs')
    .select('logged_at')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(10);

  if (logsErr) {
    console.error('[incrementStreakIfContinuous] Logs fetch error:', logsErr.message);
    return currentStreak;
  }

  const logs = recentLogs || [];
  const logDate = targetDate || (logs.length > 0 ? new Date(logs[0].logged_at) : new Date());
  const todayDateStr = getLocalDateString(logDate, timezone);

  // 3. Compute new streak count using pure logic
  const newStreak = calculateStreakUpdate(currentStreak, logs, todayDateStr, timezone);

  // 4. Update profiles.streak_count if changed
  if (newStreak !== currentStreak) {
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ streak_count: newStreak })
      .eq('id', userId);

    if (updateErr) {
      console.error('[incrementStreakIfContinuous] Profile streak update error:', updateErr.message);
      return currentStreak;
    }
  }

  return newStreak;
}
