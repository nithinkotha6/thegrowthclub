'use client';

import React, { useState } from 'react';
import { adminResetPin } from '@/app/actions/admin';
import type { GroupMemberRow } from '@/components/SettingsClient';

interface PinResetPanelProps {
  groupId: string;
  members: GroupMemberRow[];
  onStatus: (status: { success: boolean; message: string }) => void;
}

export default function PinResetPanel({ groupId, members, onStatus }: PinResetPanelProps) {
  const [resetSelectedUser, setResetSelectedUser] = useState('');
  const [newKioskPin, setNewKioskPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetSelectedUser) return;
    setIsSubmitting(true);
    const res = await adminResetPin(resetSelectedUser, newKioskPin, groupId);
    setIsSubmitting(false);
    if (res.success) {
      setNewKioskPin('');
      onStatus({ success: true, message: 'Kiosk PIN successfully reset!' });
    } else {
      onStatus({ success: false, message: res.error || 'Failed to reset PIN.' });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 hover:border-slate-300 transition-all duration-200 shadow-sm text-slate-900">
      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
        Password Reset
      </h3>
      <p className="text-xs text-slate-500">
        Instantly overwrite a user&apos;s Kiosk PIN to allow them login access.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Select Member
          </label>
          <select
            value={resetSelectedUser}
            onChange={(e) => setResetSelectedUser(e.target.value)}
            required
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#CEFF00] focus:border-[#CEFF00]"
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
            New 4-Digit PIN
          </label>
          <input
            type="text"
            maxLength={4}
            placeholder="e.g. 1234"
            value={newKioskPin}
            onChange={(e) => setNewKioskPin(e.target.value.replace(/\D/g, ''))}
            required
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#CEFF00] focus:border-[#CEFF00] placeholder-slate-400"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !resetSelectedUser || newKioskPin.length !== 4}
          className="w-full bg-[#CEFF00] hover:bg-[#CEFF00]/90 text-black text-xs font-bold py-2.5 rounded-xl transition cursor-pointer disabled:opacity-40"
        >
          Reset PIN
        </button>
      </form>
    </div>
  );
}
