'use client';

import { useState, useTransition } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Trash2, TrendingUp, Award } from 'lucide-react';
import {
  type ChallengeProgression,
  type ChallengeHistoryEntry,
  logProgressionActivity,
  deleteProgressionActivity,
} from '@/app/actions/progression';

interface ProgressionChallengePanelProps {
  progression: ChallengeProgression[];
  history: (ChallengeHistoryEntry & { user_id: string; profiles?: { nickname: string | null; full_name: string | null } | null })[];
  userId: string;
  challengeTypes: string[]; // e.g. ['Push-ups', 'Pull-ups', ...] — logging targets
}

export default function ProgressionChallengePanel({ progression, history, userId, challengeTypes }: ProgressionChallengePanelProps) {
  const [activeType, setActiveType] = useState(challengeTypes[0] ?? 'Push-ups');
  const [inputValue, setInputValue] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const myProgression = progression.find((p) => p.challenge_type === activeType) ?? null;

  const handleLog = () => {
    const val = Number(inputValue);
    if (!Number.isFinite(val) || val < 0) {
      setError('Enter a valid number.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await logProgressionActivity(activeType, val);
      if (!res.success) setError(res.error);
      else setInputValue('');
    });
  };

  const handleDelete = (historyId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await deleteProgressionActivity(historyId);
      if (!res.success) setError(res.error);
    });
  };

  const myHistory = history.filter((h) => h.user_id === userId && h.challenge_type === activeType).slice(0, 10);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Challenge type selector ──────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {challengeTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setActiveType(type)}
            className={`px-4 py-2 rounded-full text-xs font-black whitespace-nowrap transition cursor-pointer ${
              activeType === type ? 'bg-[#111827] text-[#CEFF00]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* ── Tier display with AnimatePresence (DASH-21) ─────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col items-center gap-2">
        <TrendingUp size={22} className="text-[#CEFF00]" />
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeType}-${myProgression?.current_tier ?? 0}`}
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="text-4xl font-black text-slate-900 tabular-nums"
          >
            {myProgression?.current_tier ?? '—'}
          </motion.div>
        </AnimatePresence>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Tier · {activeType}</span>
        {myProgression?.previous_tier != null && (
          <span className="mt-1 inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full">
            <Award size={11} /> Previous Record: {myProgression.previous_tier}
          </span>
        )}
      </div>

      {/* ── Log new activity ─────────────────────────────────────────── */}
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={`Log a new ${activeType} value...`}
          disabled={isPending}
          className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#CEFF00] focus:border-[#CEFF00] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleLog}
          disabled={isPending || !inputValue.trim()}
          className="px-5 py-3 rounded-xl bg-[#CEFF00] text-black text-xs font-black uppercase tracking-wider disabled:opacity-40 cursor-pointer"
        >
          Log
        </button>
      </div>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}

      {/* ── History log with delete (rollback) ──────────────────────── */}
      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">History</h4>
        {myHistory.length === 0 && <p className="text-xs text-slate-400">No entries yet.</p>}
        {myHistory.map((h) => (
          <div key={h.id} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-slate-700">
              {h.tier_before} → {h.tier_after}
              <span className="text-slate-400 font-normal ml-2">{new Date(h.entry_date).toLocaleDateString()}</span>
            </span>
            <button
              type="button"
              onClick={() => handleDelete(h.id)}
              disabled={isPending}
              className="p-1 rounded text-red-500 hover:bg-red-50 cursor-pointer disabled:opacity-50"
              title="Delete entry (reverts tier)"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
