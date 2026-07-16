'use client';

import React, { useState, useTransition } from 'react';
import { createMetricDefinition } from '@/app/actions/metrics';
import { 
  adminResetPin, 
  adminToggleBotMute,
  adminTriggerPoke,
  adminEditLog,
  adminVerifyLog,
  adminDeleteLog
} from '@/app/actions/admin';
import { Sliders, Plus, Loader2, CheckCircle, AlertCircle, Search, Edit3, Trash2, Check, X } from 'lucide-react';


export interface ProfileDetails {
  id: string;
  nickname: string | null;
  full_name: string | null;
  avatar_url: string | null;
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

  const [members] = useState<GroupMemberRow[]>(initialMembers);
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

  // Filter logs based on search query
  const filteredLogs = logs.filter((log) => {
    const query = logsSearch.toLowerCase();
    const name = (log.profiles?.nickname || log.profiles?.full_name || '').toLowerCase();
    const metric = (log.metric_slug || '').toLowerCase();
    const val = String(log.value);
    return name.includes(query) || metric.includes(query) || val.includes(query);
  });

  return (
    <div className="flex flex-col gap-6 px-4 md:px-8 pt-6 pb-24">
      {/* Page Header */}
      <header>
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-[#111827] leading-none flex items-center gap-3">
          <Sliders className="text-[#CEFF00] w-10 h-10 stroke-[2.5]" />
          Metric Settings
        </h1>
        <p className="mt-2 text-[11px] font-bold tracking-[0.18em] text-[#6B7280] uppercase">
          Dynamic Trackers · Customize Target KPI Metrics
        </p>
        <svg width="250" height="14" viewBox="0 0 250 14" fill="none" aria-hidden="true" className="mt-1">
          <path d="M2 10 C35 3, 80 13, 120 7 S180 2, 248 6" stroke="#CEFF00" strokeWidth="2.8" strokeLinecap="round" fill="none" />
        </svg>
      </header>

      <div className="max-w-2xl mx-auto w-full">
        {/* Creation Form */}
        <section className="bg-white rounded-[24px] border border-slate-200/60 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6 md:p-8 flex flex-col gap-4">
          <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
            Create Custom Metric
          </h2>
          <p className="text-slate-500 text-xs">
            Add a new metric like &quot;Pushups&quot; or &quot;Book Pages&quot;. New metrics immediately integrate with the dynamic dashboard selectors and leaderboard scores.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="metric-name" className="text-xs font-bold text-[#6B7280] uppercase tracking-wider block">
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
                className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-base text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#111827] disabled:opacity-50 min-h-[44px]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="metric-unit" className="text-xs font-bold text-[#6B7280] uppercase tracking-wider block">
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
                className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-base text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#111827] disabled:opacity-50 min-h-[44px]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="metric-sort" className="text-xs font-bold text-[#6B7280] uppercase tracking-wider block">
                Leaderboard Sort Order
              </label>
              <select
                id="metric-sort"
                value={sortDirection}
                onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}
                disabled={isPending}
                className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-base text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#111827] disabled:opacity-50 min-h-[44px] appearance-none"
              >
                <option value="desc">Higher is Better (Descending - e.g. reps, speed)</option>
                <option value="asc">Lower is Better (Ascending - e.g. time, weight loss)</option>
              </select>
            </div>

            {status && (
              <div
                className={[
                  'flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm mt-1',
                  status.success
                    ? 'bg-[#EAFCDB] text-[#166534]'
                    : 'bg-[#FFE5E5] text-[#991B1B]',
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
              className="w-full bg-[#111827] hover:bg-black text-white text-xs font-bold py-3.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 transition"
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
      <hr className="border-slate-200 my-4" />

      <section className="bg-amber-950/10 border border-amber-500/30 rounded-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.02)] p-6 md:p-8 flex flex-col gap-5 hover:border-amber-500/40 transition-all duration-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2 uppercase">
              👑 God Mode Administration
            </h2>
            <p className="text-slate-500 text-xs">
              Emergency room overrides, kiosk credential resets, and AI webhook control.
            </p>
          </div>
          {unlocked && (
            <button
              onClick={() => {
                sessionStorage.removeItem('god_mode_unlocked');
                setUnlocked(false);
              }}
              className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition"
            >
              Lock Console
            </button>
          )}
        </div>

        {adminStatus && (
          <div
            className={[
              'flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm',
              adminStatus.success
                ? 'bg-[#EAFCDB] text-[#166534] border border-[#166534]/10'
                : 'bg-[#FFE5E5] text-[#991B1B] border border-[#991B1B]/10',
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
              <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider block">
                Enter Master Password
              </label>
              <input
                type="password"
                required
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••••"
                className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-base text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#111827] min-h-[44px]"
              />
            </div>
            <button
              type="submit"
              className="bg-black hover:bg-zinc-900 text-white font-bold text-sm px-6 py-3 rounded-xl transition min-h-[44px] cursor-pointer w-full sm:w-auto"
            >
              Unlock Console
            </button>
            {pinUnlockError && (
              <p className="text-xs text-red-600 font-bold mt-1 block w-full">{pinUnlockError}</p>
            )}
          </form>
        ) : (
          // Unlocked Administration Modules
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
            
            {/* Module A: PIN Reset & Module C: AI Kill Switch */}
            <div className="flex flex-col gap-6">
              
              {/* Module C: AI Webhook Kill Switch */}
              <div className="bg-emerald-950/10 border border-emerald-500/20 rounded-2xl p-5 flex flex-col gap-3 hover:border-emerald-500/40 transition-all duration-200">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                  Module C: AI Bot Control Switch
                </h3>
                <p className="text-xs text-slate-500">
                  Toggle to mute or unmute @fisky from responding to WhatsApp messages in this group.
                </p>
                <div className="flex items-center justify-between bg-white border border-slate-200/60 rounded-xl p-3.5 mt-1">
                  <span className="text-xs font-bold text-slate-700">Mute @fisky WhatsApp Webhook</span>
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
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                  </label>
                </div>
              </div>

              {/* Module A: 4-Digit Kiosk PIN Reset Tool */}
              <div className="bg-blue-950/10 border border-blue-500/20 rounded-2xl p-5 flex flex-col gap-4 hover:border-blue-500/40 transition-all duration-200">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                  Module A: Kiosk Credentials Reset
                </h3>
                <p className="text-xs text-slate-500">
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
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Select Member
                    </label>
                    <select
                      value={resetSelectedUser}
                      onChange={(e) => setResetSelectedUser(e.target.value)}
                      required
                      className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2.5 text-xs text-[#111827] bg-white focus:outline-none"
                    >
                      <option value="">-- Choose User --</option>
                      {members.map((m) => (
                        <option key={m.user_id} value={m.profiles?.id}>
                          {m.profiles?.nickname || m.profiles?.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      New 4-Digit PIN
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="e.g. 1234"
                      value={newKioskPin}
                      onChange={(e) => setNewKioskPin(e.target.value.replace(/\D/g, ''))}
                      required
                      className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2.5 text-xs text-[#111827] bg-white focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingAdmin || !resetSelectedUser || newKioskPin.length !== 4}
                    className="w-full bg-[#111827] hover:bg-black text-white text-xs font-bold py-2.5 rounded-xl transition cursor-pointer disabled:opacity-40"
                  >
                    Reset PIN
                  </button>
                </form>
              </div>
            </div>

            {/* Module B: AI Tone Dispatcher */}
            <div className="bg-purple-950/10 border border-purple-500/20 rounded-2xl p-5 flex flex-col gap-4 hover:border-purple-500/30 transition-all duration-200">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                Module B: AI Tone Dispatcher
              </h3>
              <p className="text-xs text-slate-500">
                Select a conversational vibe, pick a gang member, and fire an AI broadcast to WhatsApp.
              </p>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!toneSelectedUser) return;
                  setToneFeedback(null);
                  setIsSubmittingAdmin(true);
                  const res = await adminTriggerPoke(toneSelectedUser, session.groupId, selectedTone, selectedGenderStyle);
                  setIsSubmittingAdmin(false);
                  if (res.success) {
                    setToneFeedback({ success: true, message: `Vibe dispatch sent successfully! Message: "${res.message}"` });
                    setToneSelectedUser('');
                  } else {
                    setToneFeedback({ success: false, message: formatAdminError(res.error) || 'Failed to dispatch vibe.' });
                  }
                }}
                className="flex flex-col gap-4"
              >
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
                          className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all duration-200 cursor-pointer ${
                            isActive
                              ? 'bg-purple-600 border-purple-600 text-white shadow-sm'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-purple-300'
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
                    ].map((g) => {
                      const isActive = selectedGenderStyle === g.key;
                      return (
                        <button
                          key={g.key}
                          type="button"
                          onClick={() => setSelectedGenderStyle(g.key)}
                          className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all duration-200 cursor-pointer ${
                            isActive
                              ? 'bg-purple-600 border-purple-600 text-white shadow-sm'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-purple-300'
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
                    className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2.5 text-xs text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                  >
                    <option value="">-- Choose User --</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.profiles?.id}>
                        {m.profiles?.nickname || m.profiles?.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAdmin || !toneSelectedUser}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-2.5 rounded-xl transition cursor-pointer disabled:opacity-40 hover:scale-[1.01] active:scale-[0.99] duration-200"
                >
                  Dispatch Vibe to WhatsApp 🚀
                </button>

                {toneFeedback && (
                  <div className={`mt-2 p-3 text-xs flex items-start gap-2 rounded-xl border ${
                    toneFeedback.success
                      ? 'bg-emerald-50/80 border-emerald-200/50 text-emerald-800'
                      : 'bg-red-50/80 border-red-200/50 text-red-800'
                  }`}>
                    {toneFeedback.success ? <CheckCircle size={14} className="mt-0.5" /> : <AlertCircle size={14} className="mt-0.5" />}
                    <span>{toneFeedback.message}</span>
                  </div>
                )}
              </form>
            </div>

            {/* Module E: God Mode Log Editor */}
            <div className="bg-slate-900/40 border border-slate-700 rounded-2xl p-5 flex flex-col gap-4 col-span-1 lg:col-span-2 hover:border-slate-600 transition-all duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                    Module E: God Mode Log Editor
                  </h3>
                  <p className="text-xs text-slate-500">
                    Correct values, verify status, or delete logs directly in the database.
                  </p>
                </div>

                {/* Search Log Input */}
                <div className="relative max-w-xs w-full">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                    <Search size={14} />
                  </span>
                  <input
                    type="text"
                    placeholder="Search member, metric, or value..."
                    value={logsSearch}
                    onChange={(e) => setLogsSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-black bg-white"
                  />
                </div>
              </div>

              <div className="max-h-[450px] overflow-y-auto overflow-x-auto border border-slate-200/60 rounded-xl bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
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
                          <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            <td className="px-4 py-3.5 font-semibold text-slate-800">
                              {log.profiles?.nickname || log.profiles?.full_name || 'Unknown'}
                            </td>
                            <td className="px-4 py-3.5 text-slate-600 font-medium">
                              <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide">
                                {log.metric_slug}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-slate-900 font-medium">
                              {editingLogId === log.id ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    step="any"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="w-16 px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-black bg-white"
                                  />
                                  <button
                                    onClick={() => handleEditLog(log.id)}
                                    className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition cursor-pointer"
                                    title="Save"
                                  >
                                    <Check size={12} />
                                  </button>
                                  <button
                                    onClick={() => setEditingLogId(null)}
                                    className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition cursor-pointer"
                                    title="Cancel"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <span className="font-bold">{log.value}</span>
                                  <span className="text-slate-400 font-medium">{log.unit}</span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-slate-500 tabular-nums">
                              {formattedDate}
                            </td>
                            <td className="px-4 py-3.5">
                              <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-wider ${
                                log.status === 'verified'
                                  ? 'bg-[#EAFCDB] text-[#166534]'
                                  : 'bg-[#FEF3C7] text-[#92400E]'
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
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                  title="Edit log value"
                                >
                                  <Edit3 size={14} />
                                </button>
                                {log.status !== 'verified' && (
                                  <button
                                    onClick={() => handleVerifyLog(log.id)}
                                    className="px-2 py-1 rounded bg-[#EAFCDB] text-[#166534] hover:bg-[#d9f7c3] text-[10px] font-bold transition cursor-pointer"
                                    title="Manually Verify Log"
                                  >
                                    Verify
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteLog(log.id)}
                                  className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer animate-in fade-in duration-150"
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

          </div>
        )}
      </section>
    </div>
  );
}
