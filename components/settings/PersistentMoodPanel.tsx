'use client';

import React, { useState, useEffect } from 'react';
import { adminUpdatePersistentMood, adminFetchBotMoods } from '@/app/actions/admin';
import type { GroupMemberRow } from '@/components/SettingsClient';

interface PersistentMoodPanelProps {
  groupId: string;
  members: GroupMemberRow[];
  initialMood?: string;
  initialTargetUser?: string;
  onStatus: (status: { success: boolean; message: string }) => void;
}

export default function PersistentMoodPanel({
  groupId,
  members,
  initialMood = 'Normal',
  initialTargetUser = '',
  onStatus,
}: PersistentMoodPanelProps) {
  const [persistentMood, setPersistentMood] = useState<string>(initialMood || 'Normal');
  const [persistentTargetUser, setPersistentTargetUser] = useState<string>(initialTargetUser || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [moods, setMoods] = useState<{ slug: string; label: string }[]>([]);

  useEffect(() => {
    adminFetchBotMoods(groupId).then((res) => {
      if (res.success) setMoods(res.data);
    });
  }, [groupId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const res = await adminUpdatePersistentMood(groupId, persistentMood, persistentTargetUser || null);
    setIsSubmitting(false);
    if (res.success) {
      onStatus({ success: true, message: 'Persistent AI mood updated successfully!' });
    } else {
      onStatus({ success: false, message: res.error || 'Failed to update persistent mood.' });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 hover:border-slate-300 transition-all duration-200 shadow-sm text-slate-900">
      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
        🧠 Persistent AI Mood Controller
      </h3>
      <p className="text-xs text-slate-500">
        Configure a persistent emotional state for @fisky.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Row 1: Mood Selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Select Bot Mood
          </label>
          <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
            {moods.map((m) => {
              const isActive = persistentMood === m.slug;
              return (
                <button
                  key={m.slug}
                  type="button"
                  onClick={() => setPersistentMood(m.slug)}
                  className={`px-3 py-2 text-xs rounded-xl border font-bold transition-all duration-200 cursor-pointer flex-shrink-0 ${
                    isActive
                      ? 'bg-[#CEFF00] text-black border-[#CEFF00]'
                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Target Member */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Target Member (Context-Driven)
          </label>
          <select
            value={persistentTargetUser}
            onChange={(e) => setPersistentTargetUser(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#CEFF00] focus:border-[#CEFF00] appearance-none"
          >
            <option value="" className="bg-white text-slate-900">All Members (Global)</option>
            {members.filter(m => m.profiles?.is_active !== false).map((m) => (
              <option key={m.user_id} value={m.profiles?.id} className="bg-white text-slate-900">
                {m.profiles?.nickname || m.profiles?.full_name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-[#CEFF00] hover:bg-[#CEFF00]/90 text-black text-xs font-bold py-2.5 rounded-xl transition cursor-pointer disabled:opacity-40"
        >
          Save Persistent Mood State
        </button>
      </form>
    </div>
  );
}
