import UserAvatar from '@/components/UserAvatar';
import type { LeaderboardEntry } from '@/lib/queries';

/**
 * Olympic-style Podium (top 3). Moved from `app/dashboard/leaderboard/page.tsx`
 * verbatim — presentational only, no internal metric/range filtering. Receives
 * already-computed `leaderboard` entries plus the active metric's unit label;
 * `activeMetric`/`activeRange` are inherited from the dashboard page's
 * top-level state, not owned here.
 */
export default function Podium({
  leaderboard,
  unit,
}: {
  leaderboard: LeaderboardEntry[];
  unit: string;
}) {
  const podiumAthletes = leaderboard.slice(0, 3);
  const firstPlace = podiumAthletes[0] ?? null;
  const secondPlace = podiumAthletes[1] ?? null;
  const thirdPlace = podiumAthletes[2] ?? null;

  return (
    <div
      className="flex items-end justify-center gap-3 md:gap-6 bg-white rounded-card border border-white/5 shadow-raised p-6 max-w-full overflow-hidden"
      style={{ minHeight: '280px' }}
    >
      {/* 2nd Place (Left Pedestal) */}
      <div className="flex flex-col items-center order-1 w-1/3 max-w-[150px]">
        {secondPlace ? (
          <div className="flex flex-col items-center w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="relative flex flex-col items-center mb-3 select-none">
              <div className="absolute top-10 left-[25%] w-5 h-12 bg-slate-500 z-0 origin-top -rotate-12 shadow-sm" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)' }} />
              <div className="absolute top-10 right-[25%] w-5 h-12 bg-slate-500 z-0 origin-top rotate-12 shadow-sm" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)' }} />

              <div className="relative z-10 rounded-full border-[5px] border-slate-300 bg-zinc-900 shadow-xl overflow-hidden p-0.5">
                <UserAvatar user={secondPlace.profile} size="xl" className="hover:scale-105 transition-transform" priority={true} />
              </div>

              <div className="relative z-20 -mt-3 flex justify-center">
                <div className="px-4 py-1 bg-gradient-to-r from-slate-500 to-slate-600 text-white font-extrabold text-[9px] tracking-widest uppercase rounded-sm shadow-md border-b-2 border-slate-700">
                  2ND PLACE
                </div>
              </div>
            </div>
            <span className="text-[11px] font-bold text-[#111827] truncate max-w-full mb-2">
              {secondPlace.profile.nickname || secondPlace.profile.full_name}
            </span>
            <div
              className="relative w-full bg-gradient-to-b from-slate-300 to-slate-400 flex flex-col items-center justify-center shadow-md p-1 rounded-t-md border-x border-t border-slate-400"
              style={{ height: '72px', clipPath: 'polygon(10% 0%, 90% 0%, 90% 10px, 100% 10px, 100% 100%, 0% 100%, 0% 10px, 10% 10px)' }}
            >
              <div className="absolute top-0 left-[10%] right-[10%] h-1.5 bg-gradient-to-r from-slate-200 via-white to-slate-200" />
              <span className="text-xl md:text-2xl font-black text-slate-800 tabular-nums tracking-tight mt-2">{secondPlace.score}</span>
              <span className="text-[9px] font-bold text-slate-700 uppercase tracking-wider">{unit}</span>
            </div>
          </div>
        ) : (
          <div className="w-full h-14 bg-zinc-50 border border-zinc-100 rounded-t-xl flex items-center justify-center">
            <span className="text-xs font-bold text-[#9CA3AF]">—</span>
          </div>
        )}
      </div>

      {/* 1st Place (Center Pedestal) */}
      <div className="flex flex-col items-center order-2 w-1/3 max-w-[180px]">
        {firstPlace ? (
          <div className="flex flex-col items-center w-full animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="relative flex flex-col items-center mb-3 select-none">
              <div className="absolute top-12 left-[25%] w-6 h-14 bg-red-700 z-0 origin-top -rotate-12 shadow-sm" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)' }} />
              <div className="absolute top-12 right-[25%] w-6 h-14 bg-red-700 z-0 origin-top rotate-12 shadow-sm" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)' }} />

              <div className="relative z-10 rounded-full border-[5px] border-yellow-400 bg-zinc-900 shadow-xl overflow-hidden p-0.5">
                <UserAvatar user={firstPlace.profile} size="2xl" className="hover:scale-105 transition-transform" priority={true} />
              </div>

              <div className="relative z-20 -mt-2.5 flex justify-center w-full">
                <div className="px-5 py-1 bg-gradient-to-r from-red-600 via-red-500 to-red-700 text-white font-black text-xs tracking-widest uppercase rounded-sm shadow-md border-b-2 border-red-800 whitespace-nowrap">
                  WINNER
                </div>
              </div>
            </div>
            <span className="text-xs font-black text-[#111827] truncate max-w-full mb-2">
              {firstPlace.profile.nickname || firstPlace.profile.full_name}
            </span>
            <div
              className="relative w-full bg-gradient-to-b from-yellow-400 to-yellow-500 flex flex-col items-center justify-center p-1 shadow-lg rounded-t-lg border-x border-t border-yellow-500"
              style={{ height: '100px', clipPath: 'polygon(10% 0%, 90% 0%, 90% 10px, 100% 10px, 100% 100%, 0% 100%, 0% 10px, 10% 10px)' }}
            >
              <div className="absolute top-0 left-[10%] right-[10%] h-1.5 bg-gradient-to-r from-yellow-300 via-white to-yellow-300" />
              <span className="text-[9px] font-black text-yellow-900 uppercase tracking-widest mt-2 mb-0.5">Champion</span>
              <span className="text-2xl md:text-3xl font-black text-yellow-900 tabular-nums tracking-tight">{firstPlace.score}</span>
              <span className="text-[10px] font-black text-yellow-800 uppercase tracking-wider">{unit}</span>
            </div>
          </div>
        ) : (
          <div className="w-full h-20 bg-zinc-50 border border-zinc-100 rounded-t-2xl flex items-center justify-center">
            <span className="text-xs font-bold text-[#9CA3AF]">Empty</span>
          </div>
        )}
      </div>

      {/* 3rd Place (Right Pedestal) */}
      <div className="flex flex-col items-center order-3 w-1/3 max-w-[150px]">
        {thirdPlace ? (
          <div className="flex flex-col items-center w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="relative flex flex-col items-center mb-3 select-none">
              <div className="absolute top-10 left-[25%] w-5 h-12 bg-amber-800 z-0 origin-top -rotate-12 shadow-sm" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)' }} />
              <div className="absolute top-10 right-[25%] w-5 h-12 bg-amber-800 z-0 origin-top rotate-12 shadow-sm" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)' }} />

              <div className="relative z-10 rounded-full border-[5px] border-amber-600 bg-zinc-900 shadow-xl overflow-hidden p-0.5">
                <UserAvatar user={thirdPlace.profile} size="xl" className="hover:scale-105 transition-transform" priority={true} />
              </div>

              <div className="relative z-20 -mt-3 flex justify-center">
                <div className="px-4 py-1 bg-gradient-to-r from-amber-600 to-amber-700 text-white font-extrabold text-[9px] tracking-widest uppercase rounded-sm shadow-md border-b-2 border-amber-800">
                  3RD PLACE
                </div>
              </div>
            </div>
            <span className="text-[11px] font-bold text-[#111827] truncate max-w-full mb-2">
              {thirdPlace.profile.nickname || thirdPlace.profile.full_name}
            </span>
            <div
              className="relative w-full bg-gradient-to-b from-amber-500 to-amber-600 flex flex-col items-center justify-center p-1 shadow-md rounded-t-md border-x border-t border-amber-600"
              style={{ height: '56px', clipPath: 'polygon(10% 0%, 90% 0%, 90% 8px, 100% 8px, 100% 100%, 0% 100%, 0% 8px, 10% 8px)' }}
            >
              <div className="absolute top-0 left-[10%] right-[10%] h-1.5 bg-gradient-to-r from-amber-400 via-white to-amber-400" />
              <span className="text-lg md:text-xl font-black text-amber-950 tabular-nums tracking-tight mt-1.5">{thirdPlace.score}</span>
              <span className="text-[8px] font-black text-amber-900 uppercase tracking-wider">{unit}</span>
            </div>
          </div>
        ) : (
          <div className="w-full h-10 bg-zinc-50 border border-zinc-100 rounded-t-xl flex items-center justify-center">
            <span className="text-xs font-bold text-[#9CA3AF]">—</span>
          </div>
        )}
      </div>
    </div>
  );
}
