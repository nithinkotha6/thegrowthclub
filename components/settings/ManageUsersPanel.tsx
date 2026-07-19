'use client';

import React, { useState, useRef } from 'react';
import {
  adminToggleUserActive,
  adminHardDeleteUser,
  adminUploadAvatarAction,
} from '@/app/actions/admin';
import { Loader2 } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import type { GroupMemberRow } from '@/components/SettingsClient';

interface ManageUsersPanelProps {
  groupId: string;
  members: GroupMemberRow[];
  setMembers: React.Dispatch<React.SetStateAction<GroupMemberRow[]>>;
  onStatus: (status: { success: boolean; message: string }) => void;
}

export default function ManageUsersPanel({ groupId, members, setMembers, onStatus }: ManageUsersPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingUserId, setUploadingUserId] = useState<string | null>(null);
  const [targetUploadUserId, setTargetUploadUserId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerAvatarUpload = (userId: string) => {
    setTargetUploadUserId(userId);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetUploadUserId) return;

    if (file.size > 1024 * 1024) {
      alert("Avatar file size exceeds 1MB limit. Please upload a smaller image.");
      return;
    }

    setUploadingUserId(targetUploadUserId);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Str = (reader.result as string).split(',')[1];
        const res = await adminUploadAvatarAction(targetUploadUserId, base64Str, file.name, groupId);
        setUploadingUserId(null);

        if (res.success && res.avatarUrl) {
          setMembers((prev) =>
            prev.map((member) => {
              if (member.profiles?.id === targetUploadUserId) {
                return {
                  ...member,
                  profiles: {
                    ...member.profiles,
                    avatar_url: res.avatarUrl || null,
                  },
                };
              }
              return member;
            })
          );
        } else {
          alert(res.error || "Failed to upload avatar.");
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Avatar upload error:", err);
      setUploadingUserId(null);
      alert("An error occurred during avatar upload.");
    }
  };

  const handleToggleUserActive = async (targetUserId: string, currentActive: boolean) => {
    setIsSubmitting(true);
    const targetState = !currentActive;
    const res = await adminToggleUserActive(targetUserId, targetState, groupId);
    setIsSubmitting(false);
    if (res.success) {
      setMembers((prev) =>
        prev.map((m) =>
          m.profiles?.id === targetUserId
            ? { ...m, profiles: { ...m.profiles, is_active: targetState } }
            : m
        )
      );
      onStatus({
        success: true,
        message: `User profile status successfully updated to ${targetState ? 'Active' : 'Inactive'}.`,
      });
    } else {
      onStatus({ success: false, message: res.error || 'Failed to toggle user active status.' });
    }
  };

  const handleHardDeleteUser = async (targetUserId: string) => {
    if (!window.confirm('WARNING: Permanent SQL delete of this user will purge their entire profile and metrics history from the database! This action CANNOT be undone. Are you sure you want to proceed?')) return;
    setIsSubmitting(true);
    const res = await adminHardDeleteUser(targetUserId, groupId);
    setIsSubmitting(false);
    if (res.success) {
      setMembers((prev) => prev.filter((m) => m.profiles?.id !== targetUserId));
      onStatus({ success: true, message: 'User permanently deleted from database (Hard Drop).' });
    } else {
      onStatus({ success: false, message: res.error || 'Failed to hard delete user.' });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4 col-span-1 lg:col-span-2 shadow-sm">
      <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
        👤 Manage Users (Soft Delete Engine)
      </h3>
      <p className="text-xs text-slate-500">
        Deactivate or reactivate group members (Soft Hide) or permanently drop profiles from the database (Hard Drop).
      </p>

      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white text-slate-900 max-h-[300px]">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleAvatarFileChange}
          accept="image/*"
          className="hidden"
        />
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <th className="px-4 py-3">Avatar</th>
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
                <tr key={m.user_id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 text-slate-900 bg-white">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {m.profiles ? (
                        <UserAvatar user={m.profiles} size="sm" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-100" />
                      )}
                      <button
                        type="button"
                        disabled={uploadingUserId === m.profiles?.id}
                        onClick={() => triggerAvatarUpload(m.profiles?.id || '')}
                        className="px-2 py-1 text-[9px] font-bold rounded bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/50 cursor-pointer disabled:opacity-50 flex items-center gap-1 transition"
                      >
                        {uploadingUserId === m.profiles?.id ? (
                          <>
                            <Loader2 size={10} className="animate-spin" />
                            ...
                          </>
                        ) : (
                          <>📷 Upload</>
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-slate-900">
                    {m.profiles?.full_name}
                  </td>
                  <td className="px-4 py-3.5 text-slate-500">
                    {m.profiles?.nickname || '---'}
                  </td>
                  <td className="px-4 py-3.5 uppercase text-[9px] font-black text-slate-400">
                    {m.role || 'member'}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-wider border ${
                      isActive
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                        : 'bg-red-50 border-red-200 text-red-600'
                    }`}>
                      {isActive ? 'Active' : 'Ghosted / Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex justify-end items-center gap-2">
                      {isActive ? (
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleToggleUserActive(m.profiles?.id || '', true)}
                          className="px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded text-[10px] font-bold cursor-pointer transition-all duration-200"
                        >
                          Deactivate 👤❌
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleToggleUserActive(m.profiles?.id || '', false)}
                          className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded text-[10px] font-bold cursor-pointer transition-all duration-200"
                        >
                          Reactivate 👤✅
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleHardDeleteUser(m.profiles?.id || '')}
                        className="px-2.5 py-1 bg-red-50 border border-red-200 text-red-600 hover:bg-red-600 hover:text-white rounded text-[10px] font-bold cursor-pointer transition-all duration-200"
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
  );
}
