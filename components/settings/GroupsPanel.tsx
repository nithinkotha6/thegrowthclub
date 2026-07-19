'use client';

import React, { useState, useTransition } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import {
  adminUpdateGroup,
  adminUpdateGroupWhatsApp,
  adminCreateGroup,
  adminDeleteGroup,
  type GroupDetails,
} from '@/app/actions/groups';

interface GroupsPanelProps {
  session: { groupId: string; groupName: string };
  initialGroup: GroupDetails | null;
}

export default function GroupsPanel({ session, initialGroup }: GroupsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null);

  const [groupName, setGroupName] = useState(initialGroup?.name || session.groupName || '');
  const [inviteCode, setInviteCode] = useState(initialGroup?.invite_code || '');
  const [waInstanceId, setWaInstanceId] = useState(initialGroup?.whatsapp_instance_id || '');
  const [waToken, setWaToken] = useState(initialGroup?.whatsapp_token || '');
  const [waGroupId, setWaGroupId] = useState(initialGroup?.whatsapp_group_id || '');

  const [newGroupName, setNewGroupName] = useState('');
  const [newInviteCode, setNewInviteCode] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState('');

  function handleUpdateDetails(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const res = await adminUpdateGroup(session.groupId, { name: groupName, inviteCode });
      setStatus(
        res.success
          ? { success: true, message: 'Group details updated.' }
          : { success: false, message: res.error || 'Failed to update group.' }
      );
    });
  }

  function handleUpdateWhatsApp(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const res = await adminUpdateGroupWhatsApp(session.groupId, {
        whatsappInstanceId: waInstanceId,
        whatsappToken: waToken,
        whatsappGroupId: waGroupId,
      });
      setStatus(
        res.success
          ? { success: true, message: 'WhatsApp dispatch config updated.' }
          : { success: false, message: res.error || 'Failed to update WhatsApp config.' }
      );
    });
  }

  function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const res = await adminCreateGroup(newGroupName, newInviteCode);
      if (res.success) {
        setStatus({ success: true, message: `New group "${newGroupName}" created. Log in with its invite code to switch into it.` });
        setNewGroupName('');
        setNewInviteCode('');
      } else {
        setStatus({ success: false, message: res.error || 'Failed to create group.' });
      }
    });
  }

  function handleDeleteGroup(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const res = await adminDeleteGroup(session.groupId, deleteConfirm);
      setStatus(
        res.success
          ? { success: true, message: 'Group deactivated.' }
          : { success: false, message: res.error || 'Failed to delete group.' }
      );
      if (res.success) setDeleteConfirm('');
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {status && (
        <div
          className={[
            'flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm border',
            status.success
              ? 'bg-god-green/10 border-god-green/30 text-god-green'
              : 'bg-god-red/10 border-god-red/30 text-god-red',
          ].join(' ')}
        >
          {status.success ? (
            <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          )}
          <span>{status.message}</span>
        </div>
      )}

      {/* Current Group Details */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 hover:border-slate-300 transition-all duration-200 shadow-sm text-slate-900">
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
          🏘️ This Group&apos;s Details
        </h3>
        <form onSubmit={handleUpdateDetails} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Group Name</label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#CEFF00] focus:border-[#CEFF00]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Invite Code</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#CEFF00] focus:border-[#CEFF00]"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-[#CEFF00] hover:bg-[#CEFF00]/90 text-black text-xs font-bold py-2.5 rounded-xl transition cursor-pointer disabled:opacity-40"
          >
            Save Group Details
          </button>
        </form>
      </div>

      {/* WhatsApp Dispatch Config */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 hover:border-slate-300 transition-all duration-200 shadow-sm text-slate-900">
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
          📟 WhatsApp Dispatch Config
        </h3>
        <p className="text-xs text-slate-500">
          Per-group Green API credentials. Leave blank to fall back to the shared environment defaults.
        </p>
        <form onSubmit={handleUpdateWhatsApp} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Green API Instance ID</label>
            <input
              type="text"
              value={waInstanceId}
              onChange={(e) => setWaInstanceId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#CEFF00] focus:border-[#CEFF00]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Green API Token</label>
            <input
              type="password"
              value={waToken}
              onChange={(e) => setWaToken(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#CEFF00] focus:border-[#CEFF00]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">WhatsApp Group JID</label>
            <input
              type="text"
              value={waGroupId}
              onChange={(e) => setWaGroupId(e.target.value)}
              placeholder="xxxx@g.us"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#CEFF00] focus:border-[#CEFF00] placeholder-slate-400"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-[#CEFF00] hover:bg-[#CEFF00]/90 text-black text-xs font-bold py-2.5 rounded-xl transition cursor-pointer disabled:opacity-40"
          >
            Save WhatsApp Config
          </button>
        </form>
      </div>

      {/* Create New Group */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 hover:border-slate-300 transition-all duration-200 shadow-sm text-slate-900">
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
          ➕ Create New Group
        </h3>
        <p className="text-xs text-slate-500">
          Spins up a brand-new isolated group. You become its first admin — sign in with its invite code to switch into it.
        </p>
        <form onSubmit={handleCreateGroup} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">New Group Name</label>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#CEFF00] focus:border-[#CEFF00]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">New Invite Code</label>
            <input
              type="text"
              value={newInviteCode}
              onChange={(e) => setNewInviteCode(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#CEFF00] focus:border-[#CEFF00]"
            />
          </div>
          <button
            type="submit"
            disabled={isPending || !newGroupName.trim() || !newInviteCode.trim()}
            className="w-full bg-[#CEFF00] hover:bg-[#CEFF00]/90 text-black text-xs font-bold py-2.5 rounded-xl transition cursor-pointer disabled:opacity-40"
          >
            Create Group
          </button>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="bg-god-red/5 border border-god-red/20 rounded-2xl p-5 flex flex-col gap-4 shadow-sm text-slate-900">
        <h3 className="text-sm font-black text-god-red uppercase tracking-wider">
          ⚠️ Danger Zone — Deactivate This Group
        </h3>
        <p className="text-xs text-slate-500">
          Soft-deletes this group. Historical data is preserved but the group stops receiving bot dispatches. Type the exact group name to confirm.
        </p>
        <form onSubmit={handleDeleteGroup} className="flex flex-col gap-3">
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={groupName}
            required
            className="w-full rounded-xl border border-god-red/30 px-3.5 py-2.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-god-red focus:border-god-red placeholder-slate-400"
          />
          <button
            type="submit"
            disabled={isPending || deleteConfirm !== groupName}
            className="w-full bg-god-red hover:bg-god-red/90 text-white text-xs font-bold py-2.5 rounded-xl transition cursor-pointer disabled:opacity-40"
          >
            Deactivate Group
          </button>
        </form>
      </div>
    </div>
  );
}
