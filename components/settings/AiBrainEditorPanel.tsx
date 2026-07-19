'use client';

import React, { useState, useEffect } from 'react';
import {
  adminFetchAllLore,
  adminUpsertMemberLore,
  adminFetchVocabBanks,
  adminUpsertVocabBank,
  adminDeleteVocabBank,
} from '@/app/actions/admin';
import { CheckCircle, AlertCircle } from 'lucide-react';
import type { GroupMemberRow } from '@/components/SettingsClient';

interface AiBrainEditorPanelProps {
  groupId: string;
  members: GroupMemberRow[];
}

export default function AiBrainEditorPanel({ groupId, members }: AiBrainEditorPanelProps) {
  const [activeBrainTab, setActiveBrainTab] = useState<'lore' | 'vocab'>('lore');
  const [loreList, setLoreList] = useState<any[]>([]);
  const [vocabBanks, setVocabBanks] = useState<any[]>([]);

  const [loreEditorUser, setLoreEditorUser] = useState('');
  const [loreStunts, setLoreStunts] = useState('');
  const [loreGoodHabits, setLoreGoodHabits] = useState('');
  const [loreBadHabits, setLoreBadHabits] = useState('');
  const [loreEgoTrigger, setLoreEgoTrigger] = useState('');
  const [loreCatchphrase, setLoreCatchphrase] = useState('');
  const [loreNemesisId, setLoreNemesisId] = useState('');
  const [loreFeedback, setLoreFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const [vocabEditorId, setVocabEditorId] = useState<string | null>(null);
  const [vocabTone, setVocabTone] = useState('ragebait');
  const [vocabGender, setVocabGender] = useState('Male');
  const [vocabWords, setVocabWords] = useState('');
  const [vocabFeedback, setVocabFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchBrainData = async () => {
      try {
        const lRes = await adminFetchAllLore(groupId);
        if (lRes.success) setLoreList(lRes.data);
        const vRes = await adminFetchVocabBanks(groupId);
        if (vRes.success) setVocabBanks(vRes.data);
      } catch (err) {
        console.error('Failed to load brain data:', err);
      }
    };
    fetchBrainData();
  }, [groupId]);

  const handleLoreUserChange = (uId: string) => {
    setLoreEditorUser(uId);
    setLoreFeedback(null);
    const existing = loreList.find((l) => l.user_id === uId);
    if (existing) {
      setLoreStunts(existing.stunts?.join(', ') || '');
      setLoreGoodHabits(existing.good_habits?.join(', ') || '');
      setLoreBadHabits(existing.bad_habits?.join(', ') || '');
      setLoreEgoTrigger(existing.ego_trigger || '');
      setLoreCatchphrase(existing.catchphrase || '');
      setLoreNemesisId(existing.nemesis_id || '');
    } else {
      setLoreStunts('');
      setLoreGoodHabits('');
      setLoreBadHabits('');
      setLoreEgoTrigger('');
      setLoreCatchphrase('');
      setLoreNemesisId('');
    }
  };

  const handleSaveLore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loreEditorUser) return;
    setIsSubmitting(true);
    setLoreFeedback(null);

    const data = {
      stunts: loreStunts.split(',').map((s) => s.trim()).filter(Boolean),
      good_habits: loreGoodHabits.split(',').map((h) => h.trim()).filter(Boolean),
      bad_habits: loreBadHabits.split(',').map((h) => h.trim()).filter(Boolean),
      ego_trigger: loreEgoTrigger.trim() || null,
      catchphrase: loreCatchphrase.trim() || null,
      nemesis_id: loreNemesisId || null,
    };

    const res = await adminUpsertMemberLore(loreEditorUser, data, groupId);
    setIsSubmitting(false);

    if (res.success) {
      setLoreList((prev) => {
        const idx = prev.findIndex((l) => l.user_id === loreEditorUser);
        const updatedRow = { user_id: loreEditorUser, ...data };
        if (idx > -1) {
          const updated = [...prev];
          updated[idx] = updatedRow;
          return updated;
        }
        return [...prev, updatedRow];
      });
      setLoreFeedback({ success: true, message: 'Member lore upserted successfully!' });
    } else {
      setLoreFeedback({ success: false, message: res.error || 'Failed to save lore.' });
    }
  };

  const handleSaveVocab = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setVocabFeedback(null);

    const wordsArr = vocabWords.split(',').map((w) => w.trim()).filter(Boolean);
    const res = await adminUpsertVocabBank(vocabEditorId, vocabTone, vocabGender, wordsArr, groupId);
    setIsSubmitting(false);

    if (res.success) {
      const updatedList = await adminFetchVocabBanks(groupId);
      if (updatedList.success) setVocabBanks(updatedList.data);

      setVocabEditorId(null);
      setVocabWords('');
      setVocabFeedback({ success: true, message: 'Vocabulary bank entry saved successfully!' });
    } else {
      setVocabFeedback({ success: false, message: res.error || 'Failed to save vocab bank.' });
    }
  };

  const handleEditVocabBankClick = (bank: any) => {
    setVocabEditorId(bank.id);
    setVocabTone(bank.tone);
    setVocabGender(bank.target_gender);
    setVocabWords(bank.words?.join(', ') || '');
    setVocabFeedback(null);
  };

  const handleDeleteVocabBank = async (bankId: string) => {
    if (!window.confirm('Are you sure you want to delete this vocabulary bank entry?')) return;
    setIsSubmitting(true);
    setVocabFeedback(null);
    const res = await adminDeleteVocabBank(bankId, groupId);
    setIsSubmitting(false);

    if (res.success) {
      setVocabBanks((prev) => prev.filter((v) => v.id !== bankId));
      if (vocabEditorId === bankId) {
        setVocabEditorId(null);
        setVocabWords('');
      }
      setVocabFeedback({ success: true, message: 'Vocabulary bank entry deleted successfully!' });
    } else {
      setVocabFeedback({ success: false, message: res.error || 'Failed to delete vocab bank entry.' });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4 col-span-1 lg:col-span-2 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
            🧠 AI Brain Data Editor
          </h3>
          <p className="text-xs text-slate-500">
            Upsert traits, habits, and catchphrases for members, or adjust routed tone slang.
          </p>
        </div>

        <div className="flex bg-slate-100 rounded-xl p-1 gap-1 border border-slate-200/50">
          <button
            type="button"
            onClick={() => setActiveBrainTab('lore')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
              activeBrainTab === 'lore' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Member Lore
          </button>
          <button
            type="button"
            onClick={() => setActiveBrainTab('vocab')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
              activeBrainTab === 'vocab' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Vocabulary Banks
          </button>
        </div>
      </div>

      {activeBrainTab === 'lore' ? (
        <form onSubmit={handleSaveLore} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Select Member
              </label>
              <select
                value={loreEditorUser}
                onChange={(e) => handleLoreUserChange(e.target.value)}
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-xs appearance-none"
              >
                <option value="" className="bg-white text-slate-900">-- Choose User to Edit --</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.profiles?.id} className="bg-white text-slate-900">
                    {m.profiles?.nickname || m.profiles?.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Select Nemesis (Opponent)
              </label>
              <select
                value={loreNemesisId}
                onChange={(e) => setLoreNemesisId(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-xs appearance-none"
              >
                <option value="" className="bg-white text-slate-900">-- Choose Nemesis (Optional) --</option>
                {members.filter(m => m.profiles?.id !== loreEditorUser).map((m) => (
                  <option key={m.user_id} value={m.profiles?.id} className="bg-white text-slate-900">
                    {m.profiles?.nickname || m.profiles?.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Lore Stunts / Incidents (comma-separated)
              </label>
              <input
                type="text"
                placeholder="e.g. forgot running shoes, slept during session"
                value={loreStunts}
                onChange={(e) => setLoreStunts(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Good Habits (comma-separated)
              </label>
              <input
                type="text"
                placeholder="e.g. always early, drinks 4L water"
                value={loreGoodHabits}
                onChange={(e) => setLoreGoodHabits(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Bad Habits (comma-separated)
              </label>
              <input
                type="text"
                placeholder="e.g. skips leg day, late logger"
                value={loreBadHabits}
                onChange={(e) => setLoreBadHabits(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Ego Trigger (what annoys/ticks them)
              </label>
              <input
                type="text"
                placeholder="e.g. call them slow, talk about workouts missed"
                value={loreEgoTrigger}
                onChange={(e) => setLoreEgoTrigger(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Catchphrase
              </label>
              <input
                type="text"
                placeholder="e.g. 'I will do it tomorrow'"
                value={loreCatchphrase}
                onChange={(e) => setLoreCatchphrase(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-xs"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !loreEditorUser}
            className="w-full py-2.5 bg-[#CEFF00] text-black font-bold rounded-lg hover:brightness-95 transition cursor-pointer text-xs disabled:opacity-40"
          >
            Upsert Member Lore 🧠💾
          </button>

          {loreFeedback && (
            <div className={`p-3 text-xs flex items-start gap-2 rounded-xl border ${
              loreFeedback.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                : 'bg-red-50 border-red-200 text-red-600'
            }`}>
              {loreFeedback.success ? <CheckCircle size={14} className="mt-0.5" /> : <AlertCircle size={14} className="mt-0.5" />}
              <span>{loreFeedback.message}</span>
            </div>
          )}
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <form onSubmit={handleSaveVocab} className="flex flex-col gap-4 border-b border-slate-200 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Tone
                </label>
                <select
                  value={vocabTone}
                  onChange={(e) => setVocabTone(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-xs appearance-none"
                >
                  <option value="ragebait" className="bg-white text-slate-900">ragebait</option>
                  <option value="flirt_tease" className="bg-white text-slate-900">flirt_tease</option>
                  <option value="motivate" className="bg-white text-slate-900">motivate</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Target Gender
                </label>
                <select
                  value={vocabGender}
                  onChange={(e) => setVocabGender(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-xs appearance-none"
                >
                  <option value="Male" className="bg-white text-slate-900">Male</option>
                  <option value="Female" className="bg-white text-slate-900">Female</option>
                  <option value="Neutral" className="bg-white text-slate-900">Neutral</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Words List (comma-separated)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Comma-separated words"
                  value={vocabWords}
                  onChange={(e) => setVocabWords(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-xs"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 bg-[#CEFF00] text-black font-bold rounded-lg hover:brightness-95 transition cursor-pointer text-xs disabled:opacity-40"
              >
                {vocabEditorId ? 'Save Vocab Bank Changes 💾' : 'Create Vocab Bank Entry ➕'}
              </button>
              {vocabEditorId && (
                <button
                  type="button"
                  onClick={() => {
                    setVocabEditorId(null);
                    setVocabWords('');
                  }}
                  className="px-4 bg-slate-100 text-slate-500 hover:bg-slate-200 text-xs font-bold py-2.5 rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>

            {vocabFeedback && (
              <div className={`p-3 text-xs flex items-start gap-2 rounded-xl border ${
                vocabFeedback.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                  : 'bg-red-50 border-red-200 text-red-600'
              }`}>
                {vocabFeedback.success ? <CheckCircle size={14} className="mt-0.5" /> : <AlertCircle size={14} className="mt-0.5" />}
                <span>{vocabFeedback.message}</span>
              </div>
            )}
          </form>

          <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-xl bg-white text-slate-900">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="px-4 py-3">Tone</th>
                  <th className="px-4 py-3">Gender</th>
                  <th className="px-4 py-3">Words</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vocabBanks.length > 0 ? (
                  vocabBanks.map((v) => (
                    <tr key={v.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 text-slate-900 bg-white">
                      <td className="px-4 py-3 font-semibold uppercase">{v.tone}</td>
                      <td className="px-4 py-3">{v.target_gender}</td>
                      <td className="px-4 py-3 font-mono text-[10px] break-all">{v.words?.join(', ')}</td>
                      <td className="px-4 py-3 text-right flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEditVocabBankClick(v)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition cursor-pointer"
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteVocabBank(v.id)}
                          className="px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 text-[10px] font-bold rounded-lg transition cursor-pointer"
                          title="Delete"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400 font-bold">
                      No vocab banks seeded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
