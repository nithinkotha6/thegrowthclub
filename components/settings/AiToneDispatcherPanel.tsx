'use client';

import React, { useState } from 'react';
import { adminTriggerPoke } from '@/app/actions/admin';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { formatAdminError } from '@/lib/utils';
import type { GroupMemberRow } from '@/components/SettingsClient';

interface AiToneDispatcherPanelProps {
  groupId: string;
  members: GroupMemberRow[];
}

export default function AiToneDispatcherPanel({ groupId, members }: AiToneDispatcherPanelProps) {
  const [selectedTone, setSelectedTone] = useState('fun-roast');
  const [toneSelectedUser, setToneSelectedUser] = useState('');
  const [toneFeedback, setToneFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedGenderStyle, setSelectedGenderStyle] = useState('auto');
  const [customContext, setCustomContext] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toneSelectedUser) return;
    setToneFeedback(null);
    setIsSubmitting(true);
    const res = await adminTriggerPoke(toneSelectedUser, groupId, selectedTone, selectedGenderStyle, customContext);
    setIsSubmitting(false);
    if (res.success) {
      setToneFeedback({ success: true, message: `Vibe dispatch sent successfully! Message: "${res.message}"` });
      setToneSelectedUser('');
      setCustomContext('');
    } else {
      setToneFeedback({ success: false, message: formatAdminError(res.error) || 'Failed to dispatch vibe.' });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4 shadow-sm">
      <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight">
        AI Tone Dispatcher
      </h3>
      <p className="text-xs text-slate-500">
        Select a conversational vibe, pick a gang member, and fire an AI broadcast to WhatsApp.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Select Vibe
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: 'ragebait', emoji: '😡', label: 'Ragebait' },
              { key: 'fun-roast', emoji: '🔥', label: 'Fun-Roast' },
              { key: 'sarcastic', emoji: '😏', label: 'Sarcastic' },
              { key: 'praise', emoji: '🏆', label: 'Praise' },
              { key: 'flirt', emoji: '😘', label: 'Flirt' },
              { key: 'motivate', emoji: '💪', label: 'Motivate' },
            ].map((t) => {
              const isActive = selectedTone === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSelectedTone(t.key)}
                  className={`px-3 py-1.5 text-xs rounded-xl border transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'bg-[#CEFF00] text-black border-[#CEFF00] font-bold'
                      : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {t.emoji} {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Gender Style Vibe
          </label>
          <div className="flex gap-1.5">
            {[
              { key: 'auto', label: 'Auto (Profile) 🤖' },
              { key: 'male', label: 'Male Style 👨' },
              { key: 'female', label: 'Female Style 👩' },
              { key: 'gay', label: 'Gay Style 🏳️‍🌈' },
            ].map((g) => {
              const isActive = selectedGenderStyle === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setSelectedGenderStyle(g.key)}
                  className={`flex-1 py-2 text-xs rounded-xl border transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'bg-[#CEFF00] text-black border-[#CEFF00] font-bold'
                      : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Select Member
          </label>
          <select
            value={toneSelectedUser}
            onChange={(e) => setToneSelectedUser(e.target.value)}
            required
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-xs appearance-none"
          >
            <option value="" className="bg-white text-slate-900">-- Choose User --</option>
            {members.filter(m => m.profiles?.is_active !== false).map((m) => (
              <option key={m.user_id} value={m.profiles?.id} className="bg-white text-slate-900">
                {m.profiles?.nickname || m.profiles?.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Custom Situational Context (Optional)
          </label>
          <textarea
            value={customContext}
            onChange={(e) => setCustomContext(e.target.value)}
            placeholder="e.g. The user just skipped their run and ate a box of donuts, roast them."
            rows={2}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-xs resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !toneSelectedUser}
          className="w-full bg-[#CEFF00] text-black font-bold py-2.5 rounded-lg transition hover:brightness-95 cursor-pointer text-xs disabled:opacity-40"
        >
          Dispatch Vibe to WhatsApp 🚀
        </button>

        {toneFeedback && (
          <div className={`mt-2 p-3 text-xs flex items-start gap-2 rounded-xl border ${
            toneFeedback.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
              : 'bg-red-50 border-red-200 text-red-600'
          }`}>
            {toneFeedback.success ? <CheckCircle size={14} className="mt-0.5" /> : <AlertCircle size={14} className="mt-0.5" />}
            <span>{toneFeedback.message}</span>
          </div>
        )}
      </form>
    </div>
  );
}
