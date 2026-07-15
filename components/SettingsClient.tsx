'use client';

import React, { useState, useTransition } from 'react';
import { createMetricDefinition } from '@/app/actions/metrics';
import { 
  adminResetPin, 
  adminUpdateMemberRole, 
  adminRemoveMember, 
  adminToggleBotMute,
  adminTriggerPoke 
} from '@/app/actions/admin';
import { Sliders, Plus, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface MetricDefinition {
  id: string;
  name: string;
  unit: string;
  sort_direction: 'asc' | 'desc';
  created_at: string;
}

export interface ProfileDetails {
  id: string;
  nickname: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
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

export default function SettingsClient({
  session,
  initialDefinitions,
  initialMembers,
  initialBotMuted,
  activeUserIdsInLast7Days = [],
}: {
  session: SessionData;
  initialDefinitions: MetricDefinition[];
  initialMembers: GroupMemberRow[];
  initialBotMuted: boolean;
  activeUserIdsInLast7Days?: string[];
}) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [definitions, setDefinitions] = useState<MetricDefinition[]>(initialDefinitions);
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
  const [adminStatus, setAdminStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Module A: Kiosk PIN Reset Tool
  const [resetSelectedUser, setResetSelectedUser] = useState('');
  const [newKioskPin, setNewKioskPin] = useState('');

  // Module D: Manual Member Motivation Poke
  const [pokeSelectedUser, setPokeSelectedUser] = useState('');

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
        setDefinitions([res.definition, ...definitions]);
        setStatus({ success: true, message: `Metric "${res.definition.name}" successfully created!` });
      } else {
        setStatus({ success: false, message: res.error || 'Failed to create metric.' });
      }
    });
  };

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Creation Form */}
        <section className="bg-white rounded-[24px] border border-slate-200/60 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6 md:p-8 flex flex-col gap-4">
          <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
            Create Custom Tracker
          </h2>
          <p className="text-slate-500 text-xs">
            Add a new tracker like &quot;Pushups&quot; or &quot;Book Pages&quot;. New metrics immediately integrate with the dynamic dashboard selectors and leaderboard scores.
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
              className="flex items-center justify-center gap-2 bg-[#111827] text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px] cursor-pointer mt-2"
            >
              {isPending ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Creating Metric...
                </>
              ) : (
                <>
                  <Plus size={15} strokeWidth={2.5} />
                  Create Tracker
                </>
              )}
            </button>
          </form>
        </section>

        {/* Existing Trackers List */}
        <section className="bg-white rounded-[24px] border border-slate-200/60 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6 md:p-8 flex flex-col gap-4">
          <h2 className="text-lg font-black text-gray-900 tracking-tight">
            Active Custom Trackers
          </h2>
          <p className="text-slate-500 text-xs">
            Dynamic trackers currently registered in the database.
          </p>

          <div className="flex flex-col gap-2.5 mt-2">
            {definitions.length > 0 ? (
              definitions.map((def) => (
                <div
                  key={def.id}
                  className="rounded-2xl p-4 bg-slate-50 border border-slate-200/60 flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">{def.name}</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                      Unit: {def.unit} · Sort: {def.sort_direction === 'desc' ? 'Highest first' : 'Lowest first'}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 font-medium font-mono">
                    {def.id.substring(0, 8)}...
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl text-xs font-bold text-slate-400">
                No custom trackers defined yet. Use the form on the left to add one!
              </div>
            )}
          </div>
        </section>
      </div>

      {/* God Mode Administration Console */}
      <hr className="border-slate-200 my-4" />

      <section className="bg-white rounded-[24px] border border-slate-200/60 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6 md:p-8 flex flex-col gap-5">
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
              <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 flex flex-col gap-3">
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
                        const res = await adminToggleBotMute(targetVal);
                        setIsSubmittingAdmin(false);
                        if (res.success) {
                          setBotMuted(targetVal);
                          setAdminStatus({ success: true, message: `Webhook successfully ${targetVal ? 'muted' : 'unmuted'}.` });
                        } else {
                          setAdminStatus({ success: false, message: res.error || 'Failed to toggle mute status.' });
                        }
                      }}
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                  </label>
                </div>
              </div>

              {/* Module A: 4-Digit Kiosk PIN Reset Tool */}
              <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 flex flex-col gap-4">
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
                    const res = await adminResetPin(resetSelectedUser, newKioskPin);
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
                          {m.profiles?.nickname || m.profiles?.full_name} ({m.profiles?.phone_number || 'No phone'})
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

              {/* Module D: Manual Member Motivation Roast */}
              <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 flex flex-col gap-4">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                  Module D: Manual Member Motivation Poke
                </h3>
                <p className="text-xs text-slate-500">
                  Prompt @fisky to generate and dispatch a custom roast message to WhatsApp for members slacking in the last 7 days.
                </p>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!pokeSelectedUser) return;
                    setAdminStatus(null);
                    setIsSubmittingAdmin(true);
                    const res = await adminTriggerPoke(pokeSelectedUser, session.groupId);
                    setIsSubmittingAdmin(false);
                    if (res.success) {
                      setAdminStatus({ success: true, message: `Motivation dispatch sent successfully! Message: "${res.message}"` });
                      setPokeSelectedUser('');
                    } else {
                      setAdminStatus({ success: false, message: res.error || 'Failed to dispatch motivation poke.' });
                    }
                  }}
                  className="flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Select Member
                    </label>
                    <select
                      value={pokeSelectedUser}
                      onChange={(e) => setPokeSelectedUser(e.target.value)}
                      required
                      className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2.5 text-xs text-[#111827] bg-white focus:outline-none"
                    >
                      <option value="">-- Choose User --</option>
                      {members.map((m) => {
                        const isSlacking = !activeUserIdsInLast7Days.includes(m.profiles?.id || '');
                        return (
                          <option key={m.user_id} value={m.profiles?.id}>
                            {m.profiles?.nickname || m.profiles?.full_name} {isSlacking ? '⚠️ (0 Workouts last 7d)' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingAdmin || !pokeSelectedUser}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2.5 rounded-xl transition cursor-pointer disabled:opacity-40"
                  >
                    Trigger Motivation Poke 📣
                  </button>
                </form>
              </div>

            </div>

            {/* Module B: Gang & Role Management Table */}
            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 flex flex-col gap-4">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                Module B: Gang Room Roster Management
              </h3>
              <p className="text-xs text-slate-500">
                Promote, demote, or deactivate group member roles.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase">
                      <th className="py-2.5">Name</th>
                      <th className="py-2.5">Role</th>
                      <th className="py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.user_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-100/50">
                        <td className="py-3 font-semibold text-slate-800">
                          {m.profiles?.nickname || m.profiles?.full_name}
                          <div className="text-[10px] text-slate-400 font-normal">
                            {m.profiles?.phone_number || 'No phone'}
                          </div>
                        </td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-wider ${
                            m.role === 'admin' || m.role === 'co-admin'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-zinc-100 text-zinc-600'
                          }`}>
                            {m.role || 'member'}
                          </span>
                        </td>
                        <td className="py-3 text-right flex items-center justify-end gap-1.5 mt-1">
                          {m.role !== 'co-admin' && m.role !== 'admin' ? (
                            <button
                              disabled={isSubmittingAdmin}
                              onClick={async () => {
                                setAdminStatus(null);
                                setIsSubmittingAdmin(true);
                                const res = await adminUpdateMemberRole(m.profiles?.id || '', session.groupId, 'co-admin');
                                setIsSubmittingAdmin(false);
                                if (res.success) {
                                  setMembers(prev => prev.map(p => p.user_id === m.user_id ? { ...p, role: 'co-admin' } : p));
                                  setAdminStatus({ success: true, message: 'Member promoted to Co-Admin.' });
                                } else {
                                  setAdminStatus({ success: false, message: res.error || 'Failed to promote.' });
                                }
                              }}
                              className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-bold"
                            >
                              Promote
                            </button>
                          ) : (
                            <button
                              disabled={isSubmittingAdmin}
                              onClick={async () => {
                                setAdminStatus(null);
                                setIsSubmittingAdmin(true);
                                const res = await adminUpdateMemberRole(m.profiles?.id || '', session.groupId, 'member');
                                setIsSubmittingAdmin(false);
                                if (res.success) {
                                  setMembers(prev => prev.map(p => p.user_id === m.user_id ? { ...p, role: 'member' } : p));
                                  setAdminStatus({ success: true, message: 'Co-Admin demoted to Member.' });
                                } else {
                                  setAdminStatus({ success: false, message: res.error || 'Failed to demote.' });
                                }
                              }}
                              className="px-2 py-1 bg-slate-500 hover:bg-slate-600 text-white rounded text-[10px] font-bold"
                            >
                              Demote
                            </button>
                          )}
                          <button
                            disabled={isSubmittingAdmin}
                            onClick={async () => {
                              if (!confirm('Are you sure you want to remove this member from the group?')) return;
                              setAdminStatus(null);
                              setIsSubmittingAdmin(true);
                              const res = await adminRemoveMember(m.profiles?.id || '', session.groupId);
                              setIsSubmittingAdmin(false);
                              if (res.success) {
                                setMembers(prev => prev.filter(p => p.user_id !== m.user_id));
                                setAdminStatus({ success: true, message: 'Member successfully removed.' });
                              } else {
                                setAdminStatus({ success: false, message: res.error || 'Failed to remove member.' });
                              }
                            }}
                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold animate-in fade-in duration-150"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
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
