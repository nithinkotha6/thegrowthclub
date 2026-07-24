'use client';

import { useState, useTransition, useMemo } from 'react';
import {
  type ChallengeProgression,
  type ChallengeHistoryEntry,
  logProgressionActivity,
  toggleTierCompletionAction,
  deleteProgressionActivity,
} from '@/app/actions/progression';
import MetricPillSelector from './MetricPillSelector';
import CurrentHighestCard from './CurrentHighestCard';
import ChallengeTierList from './ChallengeTierList';
import LogValueInput from './LogValueInput';
import ChallengeHistory from './ChallengeHistory';
import { normalizeMetricSlug, METRIC_PROGRESSION_CATALOG, type ChallengeTierDef } from '@/lib/config/challenge-tiers';

interface ProgressionChallengePanelProps {
  progression: ChallengeProgression[];
  history: (ChallengeHistoryEntry & { user_id: string; profiles?: { nickname: string | null; full_name: string | null } | null })[];
  userId: string;
  challengeTypes?: string[];
}

export default function ProgressionChallengePanel({
  progression,
  history,
  userId,
}: ProgressionChallengePanelProps) {
  const [selectedMetric, setSelectedMetric] = useState<string>('push_ups');
  const [isPending, startTransition] = useTransition();

  // Find personal best value for current selected metric
  const currentHighest = useMemo(() => {
    const normSlug = normalizeMetricSlug(selectedMetric);
    const match = progression.find((p) => normalizeMetricSlug(p.challenge_type) === normSlug);
    if (match && typeof match.current_tier === 'number') {
      return match.current_tier;
    }

    let highest = 0;
    for (const h of history) {
      if (h.user_id === userId && normalizeMetricSlug(h.challenge_type) === normSlug) {
        highest = Math.max(highest, h.tier_after ?? 0);
      }
    }
    return highest;
  }, [progression, history, userId, selectedMetric]);

  // Compute set of completed tier numbers for active metric
  const completedTierNumbers = useMemo(() => {
    const normSlug = normalizeMetricSlug(selectedMetric);
    const set = new Set<number>();
    const config = METRIC_PROGRESSION_CATALOG[normSlug] || METRIC_PROGRESSION_CATALOG['push_ups'];

    // Mark completed tiers based on history logs or target values <= currentHighest
    for (const h of history) {
      if (h.user_id === userId && normalizeMetricSlug(h.challenge_type) === normSlug) {
        const matchedTier = config.tiers.find((t) => t.targetValue === h.tier_after);
        if (matchedTier) {
          set.add(matchedTier.tierNumber);
        }
      }
    }

    // Also mark tiers completed if targetValue <= currentHighest
    for (const t of config.tiers) {
      if (currentHighest >= t.targetValue) {
        set.add(t.tierNumber);
      }
    }

    return set;
  }, [selectedMetric, history, userId, currentHighest]);

  // Filter history for current metric and user
  const metricHistory = useMemo(() => {
    const normSlug = normalizeMetricSlug(selectedMetric);
    return history.filter(
      (h) => h.user_id === userId && normalizeMetricSlug(h.challenge_type) === normSlug
    );
  }, [history, userId, selectedMetric]);

  const handleLogValue = async (value: number) => {
    const config = METRIC_PROGRESSION_CATALOG[normalizeMetricSlug(selectedMetric)];
    const metricTypeLabel = config?.label || selectedMetric;

    return logProgressionActivity(metricTypeLabel, value);
  };

  const handleToggleTier = (tier: ChallengeTierDef) => {
    startTransition(async () => {
      await toggleTierCompletionAction(selectedMetric, tier.tierNumber, tier.targetValue);
    });
  };

  const handleDeleteEntry = async (historyId: string) => {
    return deleteProgressionActivity(historyId);
  };

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto py-2">
      {/* ── 1. Metric Pill Selector (Invisible Horizontal Scroller) ── */}
      <MetricPillSelector
        selectedMetric={selectedMetric}
        onMetricChange={setSelectedMetric}
      />

      {/* ── 2. Current Highest Card (Flame icon + Value + Label) ───── */}
      <CurrentHighestCard
        metric={selectedMetric}
        value={currentHighest}
      />

      {/* ── 3. Challenge Tier List (1-14 Progressive Tiers) ───────── */}
      <ChallengeTierList
        metric={selectedMetric}
        completedTierNumbers={completedTierNumbers}
        onToggleTier={handleToggleTier}
      />

      {/* ── 4. Log New Value Input Field & LOG Button ──────────────── */}
      <LogValueInput
        metric={selectedMetric}
        onLogValue={handleLogValue}
      />

      {/* ── 5. Challenge History Section ───────────────────────────── */}
      <ChallengeHistory
        metric={selectedMetric}
        history={metricHistory}
        userId={userId}
        onDeleteEntry={handleDeleteEntry}
      />
    </div>
  );
}
