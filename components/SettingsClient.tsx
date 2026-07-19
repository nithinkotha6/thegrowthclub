'use client';

import React, { useState } from 'react';
import { adminFetchMetricDefinitions, adminFetchMetricsConfig } from '@/app/actions/metrics';
import { Sliders, CheckCircle, AlertCircle } from 'lucide-react';

import GroupsPanel from '@/components/settings/GroupsPanel';
import CreateMetricPanel from '@/components/settings/CreateMetricPanel';
import BotKillSwitchPanel from '@/components/settings/BotKillSwitchPanel';
import PersistentMoodPanel from '@/components/settings/PersistentMoodPanel';
import PinResetPanel from '@/components/settings/PinResetPanel';
import AiToneDispatcherPanel from '@/components/settings/AiToneDispatcherPanel';
import LogEditorPanel from '@/components/settings/LogEditorPanel';
import AiBrainEditorPanel from '@/components/settings/AiBrainEditorPanel';
import ManageUsersPanel from '@/components/settings/ManageUsersPanel';
import ChallengesAdminPanel from '@/components/settings/ChallengesAdminPanel';
import MetricDefinitionsManagerPanel from '@/components/settings/MetricDefinitionsManagerPanel';
import type { GroupDetails } from '@/app/actions/groups';

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
  initialPersistentMood = 'Normal',
  initialPersistentTarget = '',
  initialGroupDetails = null,
}: {
  session: SessionData;
  initialMembers: GroupMemberRow[];
  initialBotMuted: boolean;
  initialLogs?: AdminLogItem[];
  initialPersistentMood?: string;
  initialPersistentTarget?: string;
  initialGroupDetails?: GroupDetails | null;
}) {
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
  const [adminStatus, setAdminStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Metric definitions management state (shared between Create Metric form and Metric Definitions Manager)
  const [metricDefinitions, setMetricDefinitions] = useState<any[]>([]);
  // Built-in metrics_config rows (Top Golf, Weight, etc.) — same manager panel
  const [metricsConfig, setMetricsConfig] = useState<any[]>([]);

  // Load Metric Definitions on Unlock
  React.useEffect(() => {
    if (unlocked) {
      const fetchMetricDefinitions = async () => {
        try {
          const mRes = await adminFetchMetricDefinitions(session.groupId);
          if (mRes.success) setMetricDefinitions(mRes.data);
          const cRes = await adminFetchMetricsConfig();
          if (cRes.success) setMetricsConfig(cRes.data);
        } catch (err) {
          console.error('Failed to load metric definitions:', err);
        }
      };
      fetchMetricDefinitions();
    }
  }, [unlocked, session.groupId]);

  return (
    <div className="flex flex-col gap-6 px-4 md:px-8 pt-4 pb-24 min-h-screen bg-[#F7F8FA] min-w-0">
      {/* Page Header */}
      <header>
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-[#111827] leading-none flex items-center gap-3">
          <Sliders className="text-[#CEFF00] w-10 h-10 stroke-[2.5]" />
          Metric Settings
        </h1>
        <p className="mt-2 text-[11px] font-bold tracking-[0.18em] text-[#6B7280] uppercase">
          Dynamic Trackers · Customize Target KPI Metrics
        </p>
        <svg width="220" height="14" viewBox="0 0 220 14" fill="none" aria-hidden="true" className="mt-1">
          <path d="M2 10 C30 3, 70 13, 110 7 S165 2, 218 6" stroke="#CEFF00" strokeWidth="2.8" strokeLinecap="round" fill="none" />
        </svg>
      </header>

      <CreateMetricPanel
        onCreated={(definition) => {
          setMetricDefinitions((prev) => [...prev, definition].sort((a, b) => a.name.localeCompare(b.name)));
        }}
      />

      {/* God Mode Administration Console */}
      <hr className="border-slate-200 my-4" />

      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-slate-300 transition-all duration-200 text-slate-900 overflow-hidden">
        {/* Command Center header — always visible, no collapse/toggle */}
        <div className="w-full flex items-center justify-between p-6 md:p-8 text-left">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 uppercase">
              👑 Command Center
            </h2>
            <p className="text-slate-500 text-xs mt-1">
              Emergency room overrides, password resets, and AI webhook control.
            </p>
          </div>
        </div>

        <div className="p-6 md:p-8 pt-0 border-t border-slate-100 flex flex-col gap-5">
            <div className="flex flex-col md:flex-row md:items-center justify-end gap-4 mt-2">
              {unlocked && (
                <button
                  type="button"
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
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Enter Master Password
              </label>
              <input
                type="password"
                required
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••••"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#CEFF00] focus:border-[#CEFF00] placeholder-slate-400 min-h-[44px]"
              />
            </div>
            <button
              type="submit"
              className="bg-[#CEFF00] hover:bg-[#CEFF00]/90 text-black font-bold text-sm px-6 py-3 rounded-xl transition min-h-[44px] cursor-pointer w-full sm:w-auto"
            >
              Unlock
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
              <BotKillSwitchPanel initialBotMuted={initialBotMuted} onStatus={setAdminStatus} />
              <PersistentMoodPanel
                groupId={session.groupId}
                members={members}
                initialMood={initialPersistentMood}
                initialTargetUser={initialPersistentTarget}
                onStatus={setAdminStatus}
              />
              <PinResetPanel groupId={session.groupId} members={members} onStatus={setAdminStatus} />
            </div>

            <AiToneDispatcherPanel groupId={session.groupId} members={members} />

            <div className="col-span-1 lg:col-span-2">
              <GroupsPanel
                session={{ groupId: session.groupId, groupName: session.groupName }}
                initialGroup={initialGroupDetails}
              />
            </div>

            <LogEditorPanel
              groupId={session.groupId}
              members={members}
              initialLogs={initialLogs}
              onStatus={setAdminStatus}
            />

            <AiBrainEditorPanel groupId={session.groupId} members={members} />

            <ManageUsersPanel
              groupId={session.groupId}
              members={members}
              setMembers={setMembers}
              onStatus={setAdminStatus}
            />

            <ChallengesAdminPanel members={members} />

            <MetricDefinitionsManagerPanel
              metricDefinitions={metricDefinitions}
              setMetricDefinitions={setMetricDefinitions}
              metricsConfig={metricsConfig}
              setMetricsConfig={setMetricsConfig}
            />
          </div>
        )}
        </div>
      </section>
    </div>
  );
}
