import UserAvatar from '@/components/UserAvatar';
import CheerButton from '@/components/CheerButton';
import type { LeaderboardEntry } from '@/lib/queries';

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="bg-[#FFFDF0] text-base rounded-full w-6 h-6 flex items-center justify-center shadow border border-yellow-400 select-none">
        🥇
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="bg-[#F8FAFC] text-base rounded-full w-6 h-6 flex items-center justify-center shadow border border-slate-300 select-none">
        🥈
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="bg-[#FFFBEB] text-base rounded-full w-6 h-6 flex items-center justify-center shadow border border-amber-600 select-none">
        🥉
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 select-none flex-shrink-0">
      <div
        className="w-8 h-8 flex items-center justify-center font-black text-xs text-white relative bg-slate-800 shadow-sm"
        style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
      >
        {rank}
      </div>
      <span className="text-base" role="img" aria-label="Medal">🏅</span>
    </div>
  );
}

/**
 * Rankings List (4th place and below). Moved from
 * `app/dashboard/leaderboard/page.tsx` verbatim — presentational only, no
 * internal metric/range filtering. `activeMetric`/`activeRange` are inherited
 * from the dashboard page's top-level state, not owned here.
 */
export default function RankingsList({
  leaderboard,
  unit,
  currentUserId,
  metricLabel,
}: {
  leaderboard: LeaderboardEntry[];
  unit: string;
  currentUserId: string;
  metricLabel: string;
}) {
  const tableAthletes = leaderboard.slice(3);

  return (
    <div className="bg-white rounded-card border border-white/5 shadow-raised p-6">
      <h2 className="text-base font-bold text-[#111827] mb-4">Rankings</h2>

      {tableAthletes.length > 0 ? (
        <div className="flex flex-col gap-2">
          {tableAthletes.map((athlete, index) => {
            const rank = index + 4;
            const isCurrentUser = athlete.profile.id === currentUserId;
            return (
              <div
                key={athlete.profile.id}
                className={`rounded-2xl p-3 flex items-center justify-between transition-all duration-200 hover:shadow-[0_4px_15px_rgba(0,0,0,0.03)] border ${
                  isCurrentUser ? 'bg-[#CEFF00]/10 border-[#CEFF00] shadow-sm' : 'bg-white border-[#E5E7EB]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <RankBadge rank={rank} />
                  <UserAvatar user={athlete.profile} size="lg2" />
                  <div>
                    <p className="font-bold text-[#111827]">
                      {athlete.profile.nickname || athlete.profile.full_name}
                    </p>
                    <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider tabular-nums">
                      Lv {athlete.profile.current_level} · {athlete.profile.total_xp.toLocaleString()} XP
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="font-bold text-base text-[#111827] tabular-nums tracking-tight">
                      {athlete.score}
                    </span>
                    <span className="text-[10px] font-bold text-[#6B7280] ml-1 uppercase">{unit}</span>
                  </div>
                  <CheerButton
                    targetUserId={athlete.profile.id}
                    targetName={athlete.profile.nickname || athlete.profile.full_name || 'Athlete'}
                    metricLabel={metricLabel}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-[#9CA3AF] font-bold">
          No further rankings. Invite more athletes to grow the competition! 🏃‍♀️
        </div>
      )}
    </div>
  );
}
