'use client';

import React, { useState } from 'react';
import { adminToggleBotMute } from '@/app/actions/admin';
import { formatAdminError } from '@/lib/utils';

interface BotKillSwitchPanelProps {
  initialBotMuted: boolean;
  onStatus: (status: { success: boolean; message: string }) => void;
}

export default function BotKillSwitchPanel({ initialBotMuted, onStatus }: BotKillSwitchPanelProps) {
  const [botMuted, setBotMuted] = useState(initialBotMuted);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetVal = e.target.checked;
    setIsSubmitting(true);
    try {
      const res = await adminToggleBotMute(targetVal);
      setIsSubmitting(false);
      if (res.success) {
        setBotMuted(targetVal);
        onStatus({ success: true, message: `Webhook successfully ${targetVal ? 'muted' : 'unmuted'}.` });
      } else {
        onStatus({ success: false, message: formatAdminError(res.error) || 'Failed to toggle mute status.' });
      }
    } catch (err) {
      setIsSubmitting(false);
      onStatus({ success: false, message: formatAdminError(err) });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3 hover:border-slate-300 transition-all duration-200 shadow-sm">
      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
        AI Bot Control Switch
      </h3>
      <p className="text-xs text-slate-500">
        Toggle to mute or unmute @fisky from responding to WhatsApp messages in this group.
      </p>
      <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3.5 mt-1">
        <span className="text-xs font-bold text-slate-900">Mute @fisky WhatsApp Webhook</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={botMuted}
            disabled={isSubmitting}
            onChange={handleToggle}
          />
          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-god-red"></div>
        </label>
      </div>
    </div>
  );
}
