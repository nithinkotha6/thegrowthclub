'use client';

import React, { useState, useTransition } from 'react';
import { 
  createMetricDefinition,
  adminFetchMetricDefinitions,
  adminUpdateMetricDefinition,
  adminDeleteMetricDefinition,
  adminToggleMetricHidden
} from '@/app/actions/metrics';
import { 
  adminResetPin, 
  adminToggleBotMute,
  adminTriggerPoke,
  adminEditLog,
  adminVerifyLog,
  adminDeleteLog,
  adminToggleUserActive,
  adminHardDeleteUser,
  adminFetchAllLore,
  adminUpsertMemberLore,
  adminFetchVocabBanks,
  adminUpsertVocabBank,
  adminDeleteVocabBank
} from '@/app/actions/admin';
import { Sliders, Plus, Loader2, CheckCircle, AlertCircle, Search, Edit3, Trash2, Check, X } from 'lucide-react';


export interface ProfileDetails {
  id: string;
  nickname: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_active?: boolean | null;
}

export interface GroupMemberRow {
  user_id: string;
  role: string | null;
  profiles: ProfileDetails | null;
}

export interface SessionData {
  userId: string;
  groupId: string;
  groupName: string;
  userName: string;
}

export interface AdminLogItem {
  id: string;
  value: number;
  unit: string;
  metric_slug: string;
  logged_at: string;
  status: 'pending' | 'verified' | 'rejected';
  user_id: string;
  profiles: {
    id: string;
    nickname: string | null;
    full_name: string | null;
  } | null;
}

export default function SettingsClient({
  session,
  initialMembers,
  initialBotMuted,
  initialLogs = [],
}: {
  session: SessionData;
  initialMembers: GroupMemberRow[];
  initialBotMuted: boolean;
  initialLogs?: AdminLogItem[];
}) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null);

  // God Mode States
  const [unlocked, setUnlocked] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.sessionStorage.getItem('god_mode_unlocked') === 'true';
    }
    return false;
  });
  const [pinInput, setPinInput] = useState('');
  const [pinUnlockError, setPinUnlockError] = useState<string | null>(null);

  const [members, setMembers] = useState<GroupMemberRow[]>(initialMembers);
  const [botMuted, setBotMuted] = useState(initialBotMuted);
  const [isSubmittingAdmin, setIsSubmittingAdmin] = useState(false);

  // Admin Logs States
  const [logs, setLogs] = useState<AdminLogItem[]>(initialLogs);
  const [logsSearch, setLogsSearch] = useState('');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [adminStatus, setAdminStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Module A: Kiosk PIN Reset Tool
  const [resetSelectedUser, setResetSelectedUser] = useState('');
  const [newKioskPin, setNewKioskPin] = useState('');

  // Module B: AI Tone Dispatcher
  const [selectedTone, setSelectedTone] = useState('fun-roast');
  const [toneSelectedUser, setToneSelectedUser] = useState('');
  const [toneFeedback, setToneFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedGenderStyle, setSelectedGenderStyle] = useState('auto');
  const [customContext, setCustomContext] = useState('');

  // AI Brain Editor (Module F) & User Manager (Module G) States
  const [loreList, setLoreList] = useState<any[]>([]);
  const [vocabBanks, setVocabBanks] = useState<any[]>([]);
  const [activeBrainTab, setActiveBrainTab] = useState<'lore' | 'vocab'>('lore');

  // Log Editor Filtering states (Module E upgrades)
  const [memberFilter, setMemberFilter] = useState('');
  const [metricFilter, setMetricFilter] = useState('');

  // Metric definitions management states
  const [metricDefinitions, setMetricDefinitions] = useState<any[]>([]);
  const [editingMetricId, setEditingMetricId] = useState<string | null>(null);
  const [editMetricName, setEditMetricName] = useState('');
  const [editMetricUnit, setEditMetricUnit] = useState('');
  const [editMetricSort, setEditMetricSort] = useState<'asc' | 'desc'>('desc');
  const [metricFeedback, setMetricFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Lore Editor States
  const [loreEditorUser, setLoreEditorUser] = useState('');
  const [loreStunts, setLoreStunts] = useState('');
  const [loreGoodHabits, setLoreGoodHabits] = useState('');
  const [loreBadHabits, setLoreBadHabits] = useState('');
  const [loreEgoTrigger, setLoreEgoTrigger] = useState('');
  const [loreCatchphrase, setLoreCatchphrase] = useState('');
  const [loreNemesisId, setLoreNemesisId] = useState('');
  const [loreFeedback, setLoreFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Vocab Banks Editor States
  const [vocabEditorId, setVocabEditorId] = useState<string | null>(null);
  const [vocabTone, setVocabTone] = useState('ragebait');
  const [vocabGender, setVocabGender] = useState('Male');
  const [vocabWords, setVocabWords] = useState('');
  const [vocabFeedback, setVocabFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Load Brain Lore, Vocab, and Metric Definitions on Unlock
  React.useEffect(() => {
    if (unlocked) {
      const fetchBrainData = async () => {
        try {
          const lRes = await adminFetchAllLore(session.groupId);
          if (lRes.success) setLoreList(lRes.data);
          const vRes = await adminFetchVocabBanks(session.groupId);
          if (vRes.success) setVocabBanks(vRes.data);
          const mRes = await adminFetchMetricDefinitions(session.groupId);
          if (mRes.success) setMetricDefinitions(mRes.data);
        } catch (err) {
          console.error('Failed to load brain data:', err);
        }
      };
      fetchBrainData();
    }
  }, [unlocked, session.groupId]);

  const formatAdminError = (err: unknown): string => {
    if (!err) return 'An unknown error occurred';
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
      return (err as { message: string }).message;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (!name.trim() || !unit.trim()) return;

    startTransition(async () => {
      const res = await createMetricDefinition(name, unit, sortDirection);
      if (res.success && res.definition) {
        setName('');
        setUnit('');
        setSortDirection('desc');
        setMetricDefinitions((prev) => [...prev, res.definition].sort((a, b) => a.name.localeCompare(b.name)));
        setStatus({ success: true, message: `Metric "${res.definition.name}" successfully created!` });
      } else {
        setStatus({ success: false, message: res.error || 'Failed to create metric.' });
      }
    });
  };

  const handleEditLog = async (logId: string) => {
    const valNum = parseFloat(editValue);
    if (isNaN(valNum)) return;
    setIsSubmittingAdmin(true);
    setAdminStatus(null);
    const res = await adminEditLog(logId, valNum, session.groupId);
    setIsSubmittingAdmin(false);
    if (res.success) {
      setLogs((prev) => prev.map((l) => l.id === logId ? { ...l, value: valNum } : l));
      setEditingLogId(null);
      setAdminStatus({ success: true, message: 'Log value updated successfully!' });
    } else {
      setAdminStatus({ success: false, message: res.error || 'Failed to edit log.' });
    }
  };

  const handleVerifyLog = async (logId: string) => {
    setIsSubmittingAdmin(true);
    setAdminStatus(null);
    const res = await adminVerifyLog(logId, session.groupId);
    setIsSubmittingAdmin(false);
    if (res.success) {
      setLogs((prev) => prev.map((l) => l.id === logId ? { ...l, status: 'verified' } : l));
      setAdminStatus({ success: true, message: 'Log status set to Verified!' });
    } else {
      setAdminStatus({ success: false, message: res.error || 'Failed to verify log.' });
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this log?')) return;
    setIsSubmittingAdmin(true);
    setAdminStatus(null);
    const res = await adminDeleteLog(logId, session.groupId);
    setIsSubmittingAdmin(false);
    if (res.success) {
      setLogs((prev) => prev.filter((l) => l.id !== logId));
      setAdminStatus({ success: true, message: 'Log deleted successfully!' });
    } else {
      setAdminStatus({ success: false, message: res.error || 'Failed to delete log.' });
    }
  };

  const handleToggleUserActive = async (targetUserId: string, currentActive: boolean) => {
    setIsSubmittingAdmin(true);
    setAdminStatus(null);
    const targetState = !currentActive;
    const res = await adminToggleUserActive(targetUserId, targetState, session.groupId);
    setIsSubmittingAdmin(false);
    if (res.success) {
      setMembers((prev) =>
        prev.map((m) =>
          m.profiles?.id === targetUserId
            ? { ...m, profiles: { ...m.profiles, is_active: targetState } }
            : m
        )
      );
      setAdminStatus({
        success: true,
        message: `User profile status successfully updated to ${targetState ? 'Active' : 'Inactive'}.`,
      });
    } else {
      setAdminStatus({ success: false, message: res.error || 'Failed to toggle user active status.' });
    }
  };

  const handleHardDeleteUser = async (targetUserId: string) => {
    if (!window.confirm('WARNING: Permanent SQL delete of this user will purge their entire profile and metrics history from the database! This action CANNOT be undone. Are you sure you want to proceed?')) return;
    setIsSubmittingAdmin(true);
    setAdminStatus(null);
    const res = await adminHardDeleteUser(targetUserId, session.groupId);
    setIsSubmittingAdmin(false);
    if (res.success) {
      setMembers((prev) => prev.filter((m) => m.profiles?.id !== targetUserId));
      setAdminStatus({
        success: true,
        message: 'User permanently deleted from database (Hard Drop).',
      });
    } else {
      setAdminStatus({ success: false, message: res.error || 'Failed to hard delete user.' });
    }
  };

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
    setIsSubmittingAdmin(true);
    setLoreFeedback(null);

    const data = {
      stunts: loreStunts.split(',').map((s) => s.trim()).filter(Boolean),
      good_habits: loreGoodHabits.split(',').map((h) => h.trim()).filter(Boolean),
      bad_habits: loreBadHabits.split(',').map((h) => h.trim()).filter(Boolean),
      ego_trigger: loreEgoTrigger.trim() || null,
      catchphrase: loreCatchphrase.trim() || null,
      nemesis_id: loreNemesisId || null,
    };

    const res = await adminUpsertMemberLore(loreEditorUser, data, session.groupId);
    setIsSubmittingAdmin(false);

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
    setIsSubmittingAdmin(true);
    setVocabFeedback(null);

    const wordsArr = vocabWords.split(',').map((w) => w.trim()).filter(Boolean);
    const res = await adminUpsertVocabBank(vocabEditorId, vocabTone, vocabGender, wordsArr, session.groupId);
    setIsSubmittingAdmin(false);

    if (res.success) {
      const updatedList = await adminFetchVocabBanks(session.groupId);
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
    setIsSubmittingAdmin(true);
    setVocabFeedback(null);
    const res = await adminDeleteVocabBank(bankId, session.groupId);
    setIsSubmittingAdmin(false);

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

  const handleEditMetricClick = (m: any) => {
    setEditingMetricId(m.id);
    setEditMetricName(m.name);
    setEditMetricUnit(m.unit);
    setEditMetricSort(m.sort_direction);
    setMetricFeedback(null);
  };

  const handleUpdateMetric = async (id: string) => {
    if (!editMetricName.trim() || !editMetricUnit.trim()) return;
    setIsSubmittingAdmin(true);
    setMetricFeedback(null);
    const res = await adminUpdateMetricDefinition(id, editMetricName, editMetricUnit, editMetricSort);
    setIsSubmittingAdmin(false);
    if (res.success) {
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
      const formattedName = emojiRegex.test(editMetricName.trim()) ? editMetricName.trim() : `📊 ${editMetricName.trim()}`;

      setMetricDefinitions((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, name: formattedName, unit: editMetricUnit.trim(), sort_direction: editMetricSort }
            : m
        )
      );
      setEditingMetricId(null);
      setMetricFeedback({ success: true, message: 'Metric definition updated successfully!' });
    } else {
      setMetricFeedback({ success: false, message: res.error || 'Failed to update metric definition.' });
    }
  };

  const handleDeleteMetric = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this metric definition? All logged data for this metric slug will remain but the tracker will be removed.')) return;
    setIsSubmittingAdmin(true);
    setMetricFeedback(null);
    const res = await adminDeleteMetricDefinition(id);
    setIsSubmittingAdmin(false);
    if (res.success) {
      setMetricDefinitions((prev) => prev.filter((m) => m.id !== id));
      setMetricFeedback({ success: true, message: 'Metric definition deleted successfully!' });
    } else {
      setMetricFeedback({ success: false, message: res.error || 'Failed to delete metric definition.' });
    }
  };

  const handleToggleMetricHidden = async (id: string, currentHidden: boolean) => {
    setIsSubmittingAdmin(true);
    setMetricFeedback(null);
    const targetHidden = !currentHidden;
    const res = await adminToggleMetricHidden(id, targetHidden);
    setIsSubmittingAdmin(false);
    if (res.success) {
      setMetricDefinitions((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, is_hidden: targetHidden } : m
        )
      );
      setMetricFeedback({
        success: true,
        message: `Metric visibility updated successfully to ${targetHidden ? 'Hidden' : 'Visible'}.`,
      });
    } else {
      setMetricFeedback({ success: false, message: res.error || 'Failed to toggle metric visibility.' });
    }
  };

  // Filter logs based on search query
  const filteredLogs = logs.filter((log) => {
    // Text search
    const query = logsSearch.toLowerCase();
    const name = (log.profiles?.nickname || log.profiles?.full_name || '').toLowerCase();
    const metric = (log.metric_slug || '').toLowerCase();
    const val = String(log.value);
    const matchesText = name.includes(query) || metric.includes(query) || val.includes(query);

    // Member filter
    const matchesMember = !memberFilter || log.user_id === memberFilter;

    // Metric filter
    const matchesMetric = !metricFilter || log.metric_slug === metricFilter;

    return matchesText && matchesMember && matchesMetric;
  });

  return (
    <div className="flex flex-col gap-6 px-4 md:px-8 pt-6 pb-24 bg-god-black min-h-screen text-slate-100">
      {/* Page Header */}
      <header>
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-slate-100 leading-none flex items-center gap-3">
          <Sliders className="text-god-orange w-10 h-10 stroke-[2.5]" />
          Metric Settings
        </h1>
        <p className="mt-2 text-[11px] font-bold tracking-[0.18em] text-god-silver uppercase">
          Dynamic Trackers · Customize Target KPI Metrics
        </p>
        <svg width="250" height="14" viewBox="0 0 250 14" fill="none" aria-hidden="true" className="mt-1">
          <path d="M2 10 C35 3, 80 13, 120 7 S180 2, 248 6" stroke="#CE5100" strokeWidth="2.8" strokeLinecap="round" fill="none" />
        </svg>
      </header>

      <div className="max-w-2xl mx-auto w-full">
        {/* Creation Form */}
        <section className="bg-god-black/80 rounded-[24px] border border-god-blue shadow-[0_8px_30px_rgba(0,0,0,0.3)] p-6 md:p-8 flex flex-col gap-4">
          <h2 className="text-lg font-black text-slate-100 tracking-tight flex items-center gap-2">
            Create Custom Metric
          </h2>
          <p className="text-god-silver text-xs">
            Add a new metric like &quot;Pushups&quot; or &quot;Book Pages&quot;. New metrics immediately integrate with the dynamic dashboard selectors and leaderboard scores.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="metric-name" className="text-xs font-bold text-god-silver uppercase tracking-wider block">
                Metric Name
              </label>
              <input
                id="metric-name"
                type="text"
                required
                disabled={isPending}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Pushups, Book Pages, Water Intake"
                className="w-full rounded-xl border border-god-blue px-4 py-3 text-base text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange placeholder-slate-600 disabled:opacity-50 min-h-[44px]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="metric-unit" className="text-xs font-bold text-god-silver uppercase tracking-wider block">
                Measurement Unit
              </label>
              <input
                id="metric-unit"
                type="text"
                required
                disabled={isPending}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. Reps, Pages, Liters, Miles"
                className="w-full rounded-xl border border-god-blue px-4 py-3 text-base text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange placeholder-slate-600 disabled:opacity-50 min-h-[44px]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="metric-sort" className="text-xs font-bold text-god-silver uppercase tracking-wider block">
                Leaderboard Sort Order
              </label>
              <select
                id="metric-sort"
                value={sortDirection}
                onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}
                disabled={isPending}
                className="w-full rounded-xl border border-god-blue px-4 py-3 text-base text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange disabled:opacity-50 min-h-[44px] appearance-none"
              >
                <option value="desc" className="bg-god-black text-slate-100">Higher is Better (Descending - e.g. reps, speed)</option>
                <option value="asc" className="bg-god-black text-slate-100">Lower is Better (Ascending - e.g. time, weight loss)</option>
              </select>
            </div>

            {status && (
              <div
                className={[
                  'flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm mt-1 border',
                  status.success
                    ? 'bg-god-green/10 border-god-green/30 text-god-green'
                    : 'bg-god-red/10 border-god-red/30 text-god-red',
                ].join(' ')}
                role="status"
              >
                {status.success ? (
                  <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                )}
                <span>{status.message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isPending || !name.trim() || !unit.trim()}
              className="w-full bg-god-orange hover:bg-god-orange/90 text-white text-xs font-bold py-3.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 transition"
            >
              {isPending ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Creating Metric...
                </>
              ) : (
                <>
                  <Plus size={15} strokeWidth={2.5} />
                  Create Custom Metric
                </>
              )}
            </button>
          </form>
        </section>
      </div>

      {/* God Mode Administration Console */}
      <hr className="border-god-blue my-4" />

      <section className="bg-god-black/80 border border-god-blue rounded-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.3)] p-6 md:p-8 flex flex-col gap-5 hover:border-god-blue/80 transition-all duration-200 text-slate-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-100 tracking-tight flex items-center gap-2 uppercase">
              👑 God Mode Administration
            </h2>
            <p className="text-god-silver text-xs">
              Emergency room overrides, kiosk credential resets, and AI webhook control.
            </p>
          </div>
          {unlocked && (
            <button
              onClick={() => {
                sessionStorage.removeItem('god_mode_unlocked');
                setUnlocked(false);
              }}
              className="text-xs font-bold text-god-red hover:text-white bg-god-red/10 hover:bg-god-red border border-god-red/20 px-3 py-1.5 rounded-lg transition cursor-pointer"
            >
              Lock Console
            </button>
          )}
        </div>

        {adminStatus && (
          <div
            className={[
              'flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm border',
              adminStatus.success
                ? 'bg-god-green/10 border-god-green/30 text-god-green'
                : 'bg-god-red/10 border-god-red/30 text-god-red',
            ].join(' ')}
          >
            {adminStatus.success ? (
              <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            )}
            <span>{adminStatus.message}</span>
          </div>
        )}

        {!unlocked ? (
          // Locked State Form
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPinUnlockError(null);
              if (pinInput === '882440') {
                sessionStorage.setItem('god_mode_unlocked', 'true');
                setUnlocked(true);
                setPinInput('');
              } else {
                setPinUnlockError('Invalid Master Password PIN.');
              }
            }}
            className="flex flex-col sm:flex-row gap-3 items-end max-w-md mt-2"
          >
            <div className="flex-1 flex flex-col gap-1.5 w-full">
              <label className="text-xs font-bold text-god-silver uppercase tracking-wider block">
                Enter Master Password
              </label>
              <input
                type="password"
                required
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••••"
                className="w-full rounded-xl border border-god-blue px-4 py-3 text-base text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange placeholder-slate-600 min-h-[44px]"
              />
            </div>
            <button
              type="submit"
              className="bg-god-orange hover:bg-god-orange/90 text-white font-bold text-sm px-6 py-3 rounded-xl transition min-h-[44px] cursor-pointer w-full sm:w-auto"
            >
              Unlock Console
            </button>
            {pinUnlockError && (
              <p className="text-xs text-god-red font-bold mt-1 block w-full">{pinUnlockError}</p>
            )}
          </form>
        ) : (
          // Unlocked Administration Modules
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
            
            {/* Module A: PIN Reset & Module C: AI Kill Switch */}
            <div className="flex flex-col gap-6">
              
              {/* Module C: AI Webhook Kill Switch */}
              <div className="bg-god-black/80 border border-god-blue rounded-2xl p-5 flex flex-col gap-3 hover:border-god-blue/80 transition-all duration-200">
                <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">
                  AI Bot Control Switch
                </h3>
                <p className="text-xs text-god-silver">
                  Toggle to mute or unmute @fisky from responding to WhatsApp messages in this group.
                </p>
                <div className="flex items-center justify-between bg-god-black border border-god-blue rounded-xl p-3.5 mt-1">
                  <span className="text-xs font-bold text-slate-100">Mute @fisky WhatsApp Webhook</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={botMuted}
                      disabled={isSubmittingAdmin}
                      onChange={async (e) => {
                        const targetVal = e.target.checked;
                        setIsSubmittingAdmin(true);
                        setAdminStatus(null);
                        try {
                          const res = await adminToggleBotMute(targetVal);
                          setIsSubmittingAdmin(false);
                          if (res.success) {
                            setBotMuted(targetVal);
                            setAdminStatus({ success: true, message: `Webhook successfully ${targetVal ? 'muted' : 'unmuted'}.` });
                          } else {
                            setAdminStatus({ success: false, message: formatAdminError(res.error) || 'Failed to toggle mute status.' });
                          }
                        } catch (err) {
                          setIsSubmittingAdmin(false);
                          setAdminStatus({ success: false, message: formatAdminError(err) });
                        }
                      }}
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-god-red"></div>
                  </label>
                </div>
              </div>

              {/* Kiosk Credentials Reset Tool */}
              <div className="bg-god-black/80 border border-god-blue rounded-2xl p-5 flex flex-col gap-4 hover:border-god-blue/80 transition-all duration-200">
                <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">
                  Kiosk Credentials Reset
                </h3>
                <p className="text-xs text-god-silver">
                  Instantly overwrite a user&apos;s Kiosk PIN to allow them login access.
                </p>
                
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!resetSelectedUser) return;
                    setAdminStatus(null);
                    setIsSubmittingAdmin(true);
                    const res = await adminResetPin(resetSelectedUser, newKioskPin, session.groupId);
                    setIsSubmittingAdmin(false);
                    if (res.success) {
                      setNewKioskPin('');
                      setAdminStatus({ success: true, message: 'Kiosk PIN successfully reset!' });
                    } else {
                      setAdminStatus({ success: false, message: res.error || 'Failed to reset PIN.' });
                    }
                  }}
                  className="flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                      Select Member
                    </label>
                    <select
                      value={resetSelectedUser}
                      onChange={(e) => setResetSelectedUser(e.target.value)}
                      required
                      className="w-full rounded-xl border border-god-blue px-3.5 py-2.5 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange"
                    >
                      <option value="" className="bg-god-black text-slate-100">-- Choose User --</option>
                      {members.filter(m => m.profiles?.is_active !== false).map((m) => (
                        <option key={m.user_id} value={m.profiles?.id} className="bg-god-black text-slate-100">
                          {m.profiles?.nickname || m.profiles?.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                      New 4-Digit PIN
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="e.g. 1234"
                      value={newKioskPin}
                      onChange={(e) => setNewKioskPin(e.target.value.replace(/\D/g, ''))}
                      required
                      className="w-full rounded-xl border border-god-blue px-3.5 py-2.5 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange placeholder-slate-600"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingAdmin || !resetSelectedUser || newKioskPin.length !== 4}
                    className="w-full bg-god-orange hover:bg-god-orange/90 text-white text-xs font-bold py-2.5 rounded-xl transition cursor-pointer disabled:opacity-40"
                  >
                    Reset PIN
                  </button>
                </form>
              </div>
            </div>

            {/* AI Tone Dispatcher */}
            <div className="bg-god-black/80 border border-god-blue rounded-2xl p-5 flex flex-col gap-4 hover:border-god-blue/80 transition-all duration-200">
              <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">
                AI Tone Dispatcher
              </h3>
              <p className="text-xs text-god-silver">
                Select a conversational vibe, pick a gang member, and fire an AI broadcast to WhatsApp.
              </p>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!toneSelectedUser) return;
                  setToneFeedback(null);
                  setIsSubmittingAdmin(true);
                  const res = await adminTriggerPoke(toneSelectedUser, session.groupId, selectedTone, selectedGenderStyle, customContext);
                  setIsSubmittingAdmin(false);
                  if (res.success) {
                    setToneFeedback({ success: true, message: `Vibe dispatch sent successfully! Message: "${res.message}"` });
                    setToneSelectedUser('');
                    setCustomContext('');
                  } else {
                    setToneFeedback({ success: false, message: formatAdminError(res.error) || 'Failed to dispatch vibe.' });
                  }
                }}
                className="flex flex-col gap-4"
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
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
                          className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all duration-200 cursor-pointer ${
                            isActive
                              ? 'bg-god-orange border-god-orange text-white shadow-sm'
                              : 'bg-god-black border-god-blue text-slate-300 hover:border-god-orange/50'
                          }`}
                        >
                          {t.emoji} {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
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
                          className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all duration-200 cursor-pointer ${
                            isActive
                              ? 'bg-god-orange border-god-orange text-white shadow-sm'
                              : 'bg-god-black border-god-blue text-slate-300 hover:border-god-orange/50'
                          }`}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                    Select Member
                  </label>
                  <select
                    value={toneSelectedUser}
                    onChange={(e) => setToneSelectedUser(e.target.value)}
                    required
                    className="w-full rounded-xl border border-god-blue px-3.5 py-2.5 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange transition-all"
                  >
                    <option value="" className="bg-god-black text-slate-100">-- Choose User --</option>
                    {members.filter(m => m.profiles?.is_active !== false).map((m) => (
                      <option key={m.user_id} value={m.profiles?.id} className="bg-god-black text-slate-100">
                        {m.profiles?.nickname || m.profiles?.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                    Custom Situational Context (Optional)
                  </label>
                  <textarea
                    value={customContext}
                    onChange={(e) => setCustomContext(e.target.value)}
                    placeholder="e.g. The user just skipped their run and ate a box of donuts, roast them."
                    rows={2}
                    className="w-full rounded-xl border border-god-blue px-3.5 py-2.5 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange placeholder-slate-600 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAdmin || !toneSelectedUser}
                  className="w-full bg-god-orange hover:bg-god-orange/90 text-white text-xs font-bold py-2.5 rounded-xl transition cursor-pointer disabled:opacity-40 hover:scale-[1.01] active:scale-[0.99] duration-200"
                >
                  Dispatch Vibe to WhatsApp 🚀
                </button>

                {toneFeedback && (
                  <div className={`mt-2 p-3 text-xs flex items-start gap-2 rounded-xl border ${
                    toneFeedback.success
                      ? 'bg-god-green/10 border-god-green/30 text-god-green'
                      : 'bg-god-red/10 border-god-red/30 text-god-red'
                  }`}>
                    {toneFeedback.success ? <CheckCircle size={14} className="mt-0.5" /> : <AlertCircle size={14} className="mt-0.5" />}
                    <span>{toneFeedback.message}</span>
                  </div>
                )}
              </form>
            </div>

            <div className="bg-god-black/80 border border-god-blue rounded-2xl p-5 flex flex-col gap-4 col-span-1 lg:col-span-2 hover:border-god-blue/80 transition-all duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">
                    God Mode Log Editor
                  </h3>
                  <p className="text-xs text-god-silver">
                    Correct values, verify status, or delete logs directly in the database.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                {/* Filter by Member Dropdown */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                    Filter by Member
                  </label>
                  <select
                    value={memberFilter}
                    onChange={(e) => setMemberFilter(e.target.value)}
                    className="w-full rounded-xl border border-god-blue px-3 py-2 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange"
                  >
                    <option value="" className="bg-god-black text-slate-100">All Members</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.profiles?.id} className="bg-god-black text-slate-100">
                        {m.profiles?.nickname || m.profiles?.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter by Metric Dropdown */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                    Filter by Metric
                  </label>
                  <select
                    value={metricFilter}
                    onChange={(e) => setMetricFilter(e.target.value)}
                    className="w-full rounded-xl border border-god-blue px-3 py-2 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange"
                  >
                    <option value="" className="bg-god-black text-slate-100">All Metrics</option>
                    {Array.from(new Set(logs.map(l => l.metric_slug))).sort().map((slug) => (
                      <option key={slug} value={slug} className="bg-god-black text-slate-100">
                        {slug}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-god-blue/30 pt-3">
                <div></div>

                {/* Search Log Input */}
                <div className="relative max-w-xs w-full">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                    <Search size={14} />
                  </span>
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={logsSearch}
                    onChange={(e) => setLogsSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-god-blue focus:outline-none focus:ring-1 focus:ring-god-orange bg-god-black text-slate-100 placeholder-slate-600"
                  />
                </div>
              </div>

              <div className="max-h-[450px] overflow-y-auto overflow-x-auto border border-god-blue rounded-xl bg-god-black">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-god-black border-b border-god-blue text-god-silver font-bold uppercase tracking-wider text-[10px]">
                      <th className="px-4 py-3">Member</th>
                      <th className="px-4 py-3">Metric</th>
                      <th className="px-4 py-3">Value</th>
                      <th className="px-4 py-3">Logged Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.length > 0 ? (
                      filteredLogs.map((log) => {
                        const formattedDate = new Date(log.logged_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        return (
                            <tr key={log.id} className="border-b border-god-blue/30 last:border-0 hover:bg-slate-900/40 text-slate-100 bg-god-black">
                            <td className="px-4 py-3.5 font-semibold text-slate-100">
                              {log.profiles?.nickname || log.profiles?.full_name || 'Unknown'}
                            </td>
                            <td className="px-4 py-3.5 text-slate-300 font-medium">
                              <span className="bg-slate-800 border border-god-blue/30 text-god-silver px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide">
                                {log.metric_slug}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-slate-100 font-medium">
                              {editingLogId === log.id ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    step="any"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="w-16 px-2 py-1 border border-god-blue rounded text-xs focus:outline-none focus:ring-1 focus:ring-god-orange bg-god-black text-slate-100"
                                  />
                                  <button
                                    onClick={() => handleEditLog(log.id)}
                                    className="p-1.5 rounded-lg bg-god-green/10 text-god-green hover:bg-god-green hover:text-white border border-god-green/20 transition cursor-pointer"
                                    title="Save"
                                  >
                                    <Check size={12} />
                                  </button>
                                  <button
                                    onClick={() => setEditingLogId(null)}
                                    className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 transition cursor-pointer"
                                    title="Cancel"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <span className="font-bold">{log.value}</span>
                                  <span className="text-god-silver font-medium">{log.unit}</span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-god-silver tabular-nums">
                              {formattedDate}
                            </td>
                            <td className="px-4 py-3.5">
                              <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-wider border ${
                                log.status === 'verified'
                                  ? 'bg-god-green/10 border-god-green/30 text-god-green'
                                  : 'bg-god-orange/10 border-god-orange/30 text-god-orange'
                              }`}>
                                {log.status}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditingLogId(log.id);
                                    setEditValue(String(log.value));
                                  }}
                                  className="p-1.5 rounded-lg text-god-silver hover:text-white hover:bg-slate-800 transition cursor-pointer"
                                  title="Edit log value"
                                >
                                  <Edit3 size={14} />
                                </button>
                                {log.status !== 'verified' && (
                                  <button
                                    onClick={() => handleVerifyLog(log.id)}
                                    className="px-2 py-1 rounded bg-god-green/10 text-god-green hover:bg-god-green hover:text-white border border-god-green/20 text-[10px] font-bold transition cursor-pointer"
                                    title="Manually Verify Log"
                                  >
                                    Verify
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteLog(log.id)}
                                  className="p-1.5 rounded-lg text-god-red hover:text-white hover:bg-god-red/10 transition cursor-pointer animate-in fade-in duration-150"
                                  title="Delete log"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400 font-bold">
                          No matching recent logs found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI Brain Editor */}
            <div className="bg-god-black/80 border border-god-blue rounded-2xl p-5 flex flex-col gap-4 col-span-1 lg:col-span-2 hover:border-god-blue/80 transition-all duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-god-blue/30 pb-3">
                <div>
                  <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    🧠 AI Brain Data Editor
                  </h3>
                  <p className="text-xs text-god-silver">
                    Upsert traits, habits, and catchphrases for members, or adjust routed tone slang.
                  </p>
                </div>
                
                {/* Tabs */}
                <div className="flex bg-god-black border border-god-blue rounded-xl p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveBrainTab('lore')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                      activeBrainTab === 'lore' ? 'bg-god-orange text-white shadow-sm' : 'text-god-silver hover:bg-slate-800'
                    }`}
                  >
                    Member Lore
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveBrainTab('vocab')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                      activeBrainTab === 'vocab' ? 'bg-god-orange text-white shadow-sm' : 'text-god-silver hover:bg-slate-800'
                    }`}
                  >
                    Vocabulary Banks
                  </button>
                </div>
              </div>

              {activeBrainTab === 'lore' ? (
                /* Lore Tab Form */
                <form onSubmit={handleSaveLore} className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                        Select Member
                      </label>
                      <select
                        value={loreEditorUser}
                        onChange={(e) => handleLoreUserChange(e.target.value)}
                        required
                        className="w-full rounded-xl border border-god-blue px-3.5 py-2.5 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange transition-all"
                      >
                        <option value="" className="bg-god-black text-slate-100">-- Choose User to Edit --</option>
                        {members.map((m) => (
                          <option key={m.user_id} value={m.profiles?.id} className="bg-god-black text-slate-100">
                            {m.profiles?.nickname || m.profiles?.full_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                        Select Nemesis (Opponent)
                      </label>
                      <select
                        value={loreNemesisId}
                        onChange={(e) => setLoreNemesisId(e.target.value)}
                        className="w-full rounded-xl border border-god-blue px-3.5 py-2.5 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange transition-all"
                      >
                        <option value="" className="bg-god-black text-slate-100">-- Choose Nemesis (Optional) --</option>
                        {members.filter(m => m.profiles?.id !== loreEditorUser).map((m) => (
                          <option key={m.user_id} value={m.profiles?.id} className="bg-god-black text-slate-100">
                            {m.profiles?.nickname || m.profiles?.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                        Lore Stunts / Incidents (comma-separated)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. forgot running shoes, slept during session"
                        value={loreStunts}
                        onChange={(e) => setLoreStunts(e.target.value)}
                        className="w-full rounded-xl border border-god-blue px-3.5 py-2.5 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange placeholder-slate-600"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                        Good Habits (comma-separated)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. always early, drinks 4L water"
                        value={loreGoodHabits}
                        onChange={(e) => setLoreGoodHabits(e.target.value)}
                        className="w-full rounded-xl border border-god-blue px-3.5 py-2.5 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange placeholder-slate-600"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                        Bad Habits (comma-separated)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. skips leg day, late logger"
                        value={loreBadHabits}
                        onChange={(e) => setLoreBadHabits(e.target.value)}
                        className="w-full rounded-xl border border-god-blue px-3.5 py-2.5 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange placeholder-slate-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                        Ego Trigger (what annoys/ticks them)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. call them slow, talk about workouts missed"
                        value={loreEgoTrigger}
                        onChange={(e) => setLoreEgoTrigger(e.target.value)}
                        className="w-full rounded-xl border border-god-blue px-3.5 py-2.5 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange placeholder-slate-600"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                        Catchphrase
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 'I will do it tomorrow'"
                        value={loreCatchphrase}
                        onChange={(e) => setLoreCatchphrase(e.target.value)}
                        className="w-full rounded-xl border border-god-blue px-3.5 py-2.5 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange placeholder-slate-600"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingAdmin || !loreEditorUser}
                    className="w-full bg-god-orange hover:bg-god-orange/90 text-white text-xs font-bold py-2.5 rounded-xl transition cursor-pointer disabled:opacity-40"
                  >
                    Upsert Member Lore 🧠💾
                  </button>

                  {loreFeedback && (
                    <div className={`p-3 text-xs flex items-start gap-2 rounded-xl border ${
                      loreFeedback.success
                        ? 'bg-god-green/10 border-god-green/30 text-god-green'
                        : 'bg-god-red/10 border-god-red/30 text-god-red'
                    }`}>
                      {loreFeedback.success ? <CheckCircle size={14} className="mt-0.5" /> : <AlertCircle size={14} className="mt-0.5" />}
                      <span>{loreFeedback.message}</span>
                    </div>
                  )}
                </form>
              ) : (
                /* Vocab Banks Tab Form & List */
                <div className="flex flex-col gap-5">
                  <form onSubmit={handleSaveVocab} className="flex flex-col gap-4 border-b border-god-blue/30 pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                          Tone
                        </label>
                        <select
                          value={vocabTone}
                          onChange={(e) => setVocabTone(e.target.value)}
                          className="w-full rounded-xl border border-god-blue px-3.5 py-2.5 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange"
                        >
                          <option value="ragebait" className="bg-god-black text-slate-100">ragebait</option>
                          <option value="flirt_tease" className="bg-god-black text-slate-100">flirt_tease</option>
                          <option value="motivate" className="bg-god-black text-slate-100">motivate</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                          Target Gender
                        </label>
                        <select
                          value={vocabGender}
                          onChange={(e) => setVocabGender(e.target.value)}
                          className="w-full rounded-xl border border-god-blue px-3.5 py-2.5 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange"
                        >
                          <option value="Male" className="bg-god-black text-slate-100">Male</option>
                          <option value="Female" className="bg-god-black text-slate-100">Female</option>
                          <option value="Neutral" className="bg-god-black text-slate-100">Neutral</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-god-silver uppercase tracking-wider">
                          Words List (comma-separated)
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. kothi, adavi manishi"
                          value={vocabWords}
                          onChange={(e) => setVocabWords(e.target.value)}
                          className="w-full rounded-xl border border-god-blue px-3.5 py-2.5 text-xs text-slate-100 bg-god-black focus:outline-none focus:ring-1 focus:ring-god-orange placeholder-slate-600"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={isSubmittingAdmin}
                        className="flex-1 bg-god-orange hover:bg-god-orange/90 text-white text-xs font-bold py-2.5 rounded-xl transition cursor-pointer"
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
                          className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-god-blue/30 text-xs font-bold py-2.5 rounded-xl transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    {vocabFeedback && (
                      <div className={`p-3 text-xs flex items-start gap-2 rounded-xl border ${
                        vocabFeedback.success
                          ? 'bg-god-green/10 border-god-green/30 text-god-green'
                          : 'bg-god-red/10 border-god-red/30 text-god-red'
                      }`}>
                        {vocabFeedback.success ? <CheckCircle size={14} className="mt-0.5" /> : <AlertCircle size={14} className="mt-0.5" />}
                        <span>{vocabFeedback.message}</span>
                      </div>
                    )}
                  </form>

                  {/* Vocab Bank List Table */}
                  <div className="max-h-[300px] overflow-y-auto border border-god-blue rounded-xl bg-god-black text-slate-100">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-god-black border-b border-god-blue text-god-silver font-bold uppercase tracking-wider text-[10px]">
                          <th className="px-4 py-3">Tone</th>
                          <th className="px-4 py-3">Gender</th>
                          <th className="px-4 py-3">Words</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vocabBanks.length > 0 ? (
                          vocabBanks.map((v) => (
                            <tr key={v.id} className="border-b border-god-blue/30 last:border-0 hover:bg-slate-900/40 text-slate-100 bg-god-black">
                              <td className="px-4 py-3 font-semibold uppercase">{v.tone}</td>
                              <td className="px-4 py-3">{v.target_gender}</td>
                              <td className="px-4 py-3 font-mono text-[10px] break-all">{v.words?.join(', ')}</td>
                              <td className="px-4 py-3 text-right flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleEditVocabBankClick(v)}
                                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-god-blue/30 text-[10px] font-bold rounded cursor-pointer"
                                  title="Edit"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteVocabBank(v.id)}
                                  className="px-2 py-1 bg-god-red/10 border border-god-red/20 text-god-red hover:bg-god-red hover:text-white text-[10px] font-bold rounded cursor-pointer"
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

            {/* Manage Users (Soft Delete & Hard Drop Engine) */}
            <div className="bg-god-black/80 border border-god-blue rounded-2xl p-5 flex flex-col gap-4 col-span-1 lg:col-span-2 hover:border-god-blue/80 transition-all duration-200">
              <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                👤 Manage Users (Soft Delete Engine)
              </h3>
              <p className="text-xs text-god-silver">
                Deactivate or reactivate group members (Soft Hide) or permanently drop profiles from the database (Hard Drop).
              </p>

              <div className="overflow-x-auto border border-god-blue rounded-xl bg-god-black text-slate-100 max-h-[300px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-god-black border-b border-god-blue text-god-silver font-bold uppercase tracking-wider text-[10px]">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Nickname</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => {
                      const isActive = m.profiles?.is_active !== false;
                      return (
                        <tr key={m.user_id} className="border-b border-god-blue/30 last:border-0 hover:bg-slate-900/40 text-slate-100 bg-god-black">
                          <td className="px-4 py-3.5 font-semibold text-slate-100">
                            {m.profiles?.full_name}
                          </td>
                          <td className="px-4 py-3.5 text-god-silver">
                            {m.profiles?.nickname || '---'}
                          </td>
                          <td className="px-4 py-3.5 uppercase text-[9px] font-black text-slate-400">
                            {m.role || 'member'}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-wider border ${
                              isActive
                                ? 'bg-god-green/10 border-god-green/30 text-god-green'
                                : 'bg-god-red/10 border-god-red/30 text-god-red'
                            }`}>
                              {isActive ? 'Active' : 'Ghosted / Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex justify-end items-center gap-2">
                              {isActive ? (
                                <button
                                  type="button"
                                  disabled={isSubmittingAdmin}
                                  onClick={() => handleToggleUserActive(m.profiles?.id || '', true)}
                                  className="px-2.5 py-1 bg-god-orange/10 hover:bg-god-orange border border-god-orange/20 text-god-orange hover:text-white rounded text-[10px] font-bold cursor-pointer transition-all duration-200"
                                >
                                  Deactivate 👤❌
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isSubmittingAdmin}
                                  onClick={() => handleToggleUserActive(m.profiles?.id || '', false)}
                                  className="px-2.5 py-1 bg-god-green/10 hover:bg-god-green border border-god-green/20 text-god-green hover:text-white rounded text-[10px] font-bold cursor-pointer transition-all duration-200"
                                >
                                  Reactivate 👤✅
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={isSubmittingAdmin}
                                onClick={() => handleHardDeleteUser(m.profiles?.id || '')}
                                className="px-2.5 py-1 bg-god-red/10 hover:bg-god-red border border-god-red/20 text-god-red hover:text-white rounded text-[10px] font-bold cursor-pointer transition-all duration-200"
                              >
                                Hard Delete 🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Metric Definitions Manager */}
            <div className="bg-god-black/80 border border-god-blue rounded-2xl p-5 flex flex-col gap-4 col-span-1 lg:col-span-2 hover:border-god-blue/80 transition-all duration-200">
              <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                📊 Metric Definitions Manager
              </h3>
              <p className="text-xs text-god-silver">
                View, edit, or hide/delete existing KPI metrics. Modifying values updates dashboard calculations in real-time.
              </p>

              <div className="max-h-[300px] overflow-y-auto border border-god-blue rounded-xl bg-god-black text-slate-100">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-god-black border-b border-god-blue text-god-silver font-bold uppercase tracking-wider text-[10px]">
                      <th className="px-4 py-3">Metric Name</th>
                      <th className="px-4 py-3">Unit</th>
                      <th className="px-4 py-3">Leaderboard Sort</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricDefinitions.length > 0 ? (
                      metricDefinitions.map((m) => (
                        <tr key={m.id} className="border-b border-god-blue/30 last:border-0 hover:bg-slate-900/40 text-slate-100 bg-god-black">
                          <td className="px-4 py-3.5 font-semibold text-slate-100">
                            {editingMetricId === m.id ? (
                              <input
                                type="text"
                                value={editMetricName}
                                onChange={(e) => setEditMetricName(e.target.value)}
                                className="w-full px-2 py-1 border border-god-blue rounded text-xs focus:outline-none focus:ring-1 focus:ring-god-orange bg-god-black text-slate-100"
                              />
                            ) : (
                              m.name
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-slate-300 font-medium">
                            {editingMetricId === m.id ? (
                              <input
                                type="text"
                                value={editMetricUnit}
                                onChange={(e) => setEditMetricUnit(e.target.value)}
                                className="w-24 px-2 py-1 border border-god-blue rounded text-xs focus:outline-none focus:ring-1 focus:ring-god-orange bg-god-black text-slate-100"
                              />
                            ) : (
                              m.unit
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-god-silver font-medium">
                            {editingMetricId === m.id ? (
                              <select
                                value={editMetricSort}
                                onChange={(e) => setEditMetricSort(e.target.value as 'asc' | 'desc')}
                                className="px-2 py-1 border border-god-blue rounded text-xs focus:outline-none focus:ring-1 focus:ring-god-orange bg-god-black text-slate-100"
                              >
                                <option value="desc" className="bg-god-black text-slate-100">Higher is Better (Desc)</option>
                                <option value="asc" className="bg-god-black text-slate-100">Lower is Better (Asc)</option>
                              </select>
                            ) : (
                              m.sort_direction === 'desc' ? 'Higher is Better' : 'Lower is Better'
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {editingMetricId === m.id ? (
                                <>
                                  <button
                                    onClick={() => handleUpdateMetric(m.id)}
                                    className="p-1.5 rounded-lg bg-god-green/10 text-god-green hover:bg-god-green hover:text-white border border-god-green/20 transition cursor-pointer animate-in fade-in duration-150"
                                    title="Save changes"
                                    disabled={isSubmittingAdmin}
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    onClick={() => setEditingMetricId(null)}
                                    className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 transition cursor-pointer"
                                    title="Cancel"
                                  >
                                    <X size={14} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleEditMetricClick(m)}
                                    className="p-1.5 rounded-lg text-god-silver hover:text-white hover:bg-slate-805 transition cursor-pointer"
                                    title="Edit metric"
                                  >
                                    <Edit3 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleToggleMetricHidden(m.id, m.is_hidden)}
                                    className={`px-2 py-1 rounded text-[10px] font-bold border transition cursor-pointer ${
                                      m.is_hidden
                                        ? 'bg-god-green/10 border-god-green/25 text-god-green hover:bg-god-green hover:text-white'
                                        : 'bg-god-orange/10 border-god-orange/25 text-god-orange hover:bg-god-orange hover:text-white'
                                    }`}
                                    title={m.is_hidden ? "Show on dashboard" : "Hide from dashboard"}
                                  >
                                    {m.is_hidden ? "Unhide" : "Hide"}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteMetric(m.id)}
                                    className="p-1.5 rounded-lg text-god-red hover:text-white hover:bg-god-red/10 transition cursor-pointer"
                                    title="Delete metric"
                                    disabled={isSubmittingAdmin}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-400 font-bold">
                          No metric definitions found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {metricFeedback && (
                <div className={`p-3 text-xs flex items-start gap-2 rounded-xl border ${
                  metricFeedback.success
                    ? 'bg-god-green/10 border-god-green/30 text-god-green'
                    : 'bg-god-red/10 border-god-red/30 text-god-red'
                }`}>
                  {metricFeedback.success ? <CheckCircle size={14} className="mt-0.5" /> : <AlertCircle size={14} className="mt-0.5" />}
                  <span>{metricFeedback.message}</span>
                </div>
              )}
            </div>

          </div>
        )}
      </section>
    </div>
  );
}
