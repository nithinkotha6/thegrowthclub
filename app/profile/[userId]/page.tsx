import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';
import UserAvatar from '@/components/UserAvatar';
import StreakBadge from '@/components/StreakBadge';
import { Trophy } from 'lucide-react';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session) redirect('/');

  const supabase = createAdminClient(session.groupId);

  // Group-scoped lookup: the target profile must be a member of the
  // caller's own group — never trust the raw userId param alone.
  const { data: membership } = await supabase
    .from('group_members')
    .select('user_id, profiles!inner ( id, full_name, nickname, avatar_url, total_xp, current_level, streak_count )')
    .eq('user_id', userId)
    .eq('group_id', session.groupId)
    .maybeSingle();

  const profile = (membership as unknown as {
    profiles: {
      id: string; full_name: string | null; nickname: string | null; avatar_url: string | null;
      total_xp: number; current_level: number; streak_count: number;
    } | null;
  } | null)?.profiles ?? null;

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F7F8FA] px-4 text-center gap-2">
        <p className="text-sm font-bold text-slate-900">Profile not found.</p>
        <p className="text-xs text-slate-500">This member isn&apos;t in your group.</p>
      </div>
    );
  }

  // Personal-best per metric: MAX(value) across this user's verified logs,
  // computed in application code (same pattern already used by the
  // dashboard/leaderboard's own aggregation — no DB-side GROUP BY needed).
  const [{ data: logsRaw }, { data: configs }, { data: customDefs }] = await Promise.all([
    supabase
      .from('metric_logs')
      .select('metric_slug, value, unit')
      .eq('group_id', session.groupId)
      .eq('user_id', userId)
      .eq('status', 'verified'),
    supabase.from('metrics_config').select('slug, display_name'),
    supabase.from('metric_definitions').select('id, name').eq('group_id', session.groupId),
  ]);

  const displayNameBySlug = new Map<string, string>();
  for (const c of configs || []) displayNameBySlug.set(c.slug, c.display_name);
  for (const d of customDefs || []) displayNameBySlug.set(d.id, d.name);

  const bestByMetric = new Map<string, { value: number; unit: string }>();
  for (const log of (logsRaw || []) as { metric_slug: string; value: number; unit: string }[]) {
    const val = Number(log.value);
    const existing = bestByMetric.get(log.metric_slug);
    if (!existing || val > existing.value) {
      bestByMetric.set(log.metric_slug, { value: val, unit: log.unit });
    }
  }

  const records = Array.from(bestByMetric.entries())
    .map(([slug, best]) => ({
      label: displayNameBySlug.get(slug) || slug.replace(/_/g, ' '),
      value: best.value,
      unit: best.unit,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const displayName = profile.nickname || profile.full_name || 'Athlete';

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F8FA] px-4 pt-10 pb-24 items-center">
      {/* ── Centered photo + name ─────────────────────────────────── */}
      <div className="relative mb-3">
        <UserAvatar user={profile} size="3xl" priority />
        <div className="absolute -bottom-1.5 -left-1.5 bg-[#111827] border-2 border-white text-[10px] font-black text-[#CEFF00] rounded-full w-6 h-6 flex items-center justify-center shadow tabular-nums">
          {profile.current_level}
        </div>
        <StreakBadge count={profile.streak_count} />
      </div>
      <h1 className="text-2xl font-black text-slate-900 text-center">{displayName}</h1>
      {profile.nickname && profile.full_name && (
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-0.5">{profile.full_name}</p>
      )}
      <p className="text-xs font-bold text-slate-400 mt-1">{profile.total_xp.toLocaleString()} XP</p>

      {/* ── Personal-best metric table ───────────────────────────── */}
      <div className="w-full max-w-md mt-8">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-3">
          <Trophy size={14} className="text-[#CEFF00]" /> Personal Bests
        </h2>
        {records.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8 bg-white border border-slate-200 rounded-xl">
            No verified activities logged yet.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-slate-200 bg-white border border-slate-200 rounded-xl overflow-hidden">
            {records.map((r) => (
              <div key={r.label} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-bold text-slate-700 capitalize">{r.label}</span>
                <span className="text-sm font-black text-slate-900 tabular-nums">
                  {r.value} {r.unit}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
