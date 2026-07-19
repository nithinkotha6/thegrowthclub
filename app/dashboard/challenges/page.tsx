import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';
import { PROGRESSION_CHALLENGE_TYPES } from '@/lib/metrics';
import ChallengesModule from '@/components/ChallengesModule';
import { getDailyGoals, getDailyGoalCompletions } from '@/app/actions/dailyGoals';
import { getMyChallengeProgression, getChallengeHistory } from '@/app/actions/progression';
import { getLeagueAssignments, getLeagueChallenges, getLeagueMatches } from '@/app/actions/leagues';

/**
 * /dashboard/challenges — repurposed from the old /dashboard/leaderboard
 * route. The Podium/Rankings that used to live here moved onto /dashboard
 * itself (below the Metric Graph); this route now hosts the three-tab
 * Challenges module (Daily Goals | Challenges | Leagues).
 */
export default async function ChallengesPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session) redirect('/');

  const { userId } = session;

  const [
    dailyGoalsRes,
    dailyGoalCompletionsRes,
    progressionRes,
    challengeHistoryRes,
    leagueAssignmentsRes,
    leagueChallengesRes,
    leagueMatchesRes,
  ] = await Promise.all([
    getDailyGoals(),
    getDailyGoalCompletions(),
    getMyChallengeProgression(),
    getChallengeHistory(),
    getLeagueAssignments(),
    getLeagueChallenges(),
    getLeagueMatches(),
  ]);

  return (
    <div className="flex flex-col gap-y-4 px-4 md:px-8 pt-4 pb-24 min-h-screen bg-[#F7F8FA] min-w-0">
      <header>
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-[#111827] leading-none flex items-center gap-3">
          <Trophy className="text-[#CEFF00] w-10 h-10 stroke-[2.5]" />
          Challenges
        </h1>
        <p className="mt-2 text-[11px] font-bold tracking-[0.18em] text-[#6B7280] uppercase">
          Daily Goals · Progression · Leagues
        </p>
      </header>

      <ChallengesModule
        userId={userId}
        dailyGoals={dailyGoalsRes.success ? dailyGoalsRes.goals : []}
        dailyGoalCompletions={dailyGoalCompletionsRes.success ? dailyGoalCompletionsRes.completions : []}
        progression={progressionRes.success ? progressionRes.progression : []}
        challengeHistory={challengeHistoryRes.success ? challengeHistoryRes.history : []}
        progressionChallengeTypes={PROGRESSION_CHALLENGE_TYPES}
        leagueAssignments={leagueAssignmentsRes.success ? leagueAssignmentsRes.assignments : []}
        leagueChallenges={leagueChallengesRes.success ? leagueChallengesRes.challenges : []}
        leagueMatches={leagueMatchesRes.success ? leagueMatchesRes.matches : []}
      />
    </div>
  );
}
