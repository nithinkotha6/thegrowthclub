'use client';

import { useState } from 'react';
import { ListChecks, TrendingUp, Swords } from 'lucide-react';
import DailyGoalsPanel from '@/components/challenges/DailyGoalsPanel';
import ProgressionChallengePanel from '@/components/challenges/ProgressionChallengePanel';
import LeagueMatchPanel from '@/components/challenges/LeagueMatchPanel';
import type { DailyGoal, DailyGoalCompletion } from '@/app/actions/dailyGoals';
import type { ChallengeProgression, ChallengeHistoryEntry } from '@/app/actions/progression';
import type { LeagueAssignment, LeagueChallenge, LeagueMatch } from '@/app/actions/leagues';

interface ChallengesModuleProps {
  userId: string;
  dailyGoals: DailyGoal[];
  dailyGoalCompletions: DailyGoalCompletion[];
  progression: ChallengeProgression[];
  challengeHistory: (ChallengeHistoryEntry & { user_id: string; profiles?: { nickname: string | null; full_name: string | null } | null })[];
  progressionChallengeTypes: string[];
  leagueAssignments: LeagueAssignment[];
  leagueChallenges: LeagueChallenge[];
  leagueMatches: LeagueMatch[];
}

type Tab = 'daily' | 'challenges' | 'leagues';

const TABS: { id: Tab; label: string; icon: typeof ListChecks }[] = [
  { id: 'daily', label: 'Daily Goals', icon: ListChecks },
  { id: 'challenges', label: 'Challenges', icon: TrendingUp },
  { id: 'leagues', label: 'Leagues', icon: Swords },
];

/** Tabbed container for the Dashboard & Challenges module (Daily Goals |
 * Challenges | Leagues) — DASH-13. */
export default function ChallengesModule(props: ChallengesModuleProps) {
  const [activeTab, setActiveTab] = useState<Tab>('daily');

  return (
    <div className="bg-white rounded-card border border-slate-200 shadow-raised overflow-hidden">
      <div className="flex border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs font-black uppercase tracking-wider transition cursor-pointer ${
              activeTab === id ? 'text-slate-900 border-b-2 border-[#CEFF00] bg-[#CEFF00]/5' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {activeTab === 'daily' && (
          <DailyGoalsPanel goals={props.dailyGoals} completions={props.dailyGoalCompletions} userId={props.userId} />
        )}
        {activeTab === 'challenges' && (
          <ProgressionChallengePanel
            progression={props.progression}
            history={props.challengeHistory}
            userId={props.userId}
            challengeTypes={props.progressionChallengeTypes}
          />
        )}
        {activeTab === 'leagues' && (
          <LeagueMatchPanel
            assignments={props.leagueAssignments}
            challenges={props.leagueChallenges}
            matches={props.leagueMatches}
          />
        )}
      </div>
    </div>
  );
}
