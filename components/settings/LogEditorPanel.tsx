'use client';

import React, { useState } from 'react';
import { adminEditLog, adminVerifyLog, adminDeleteLog } from '@/app/actions/admin';
import { Search, Edit3, Trash2, Check, X } from 'lucide-react';
import type { GroupMemberRow, AdminLogItem } from '@/components/SettingsClient';

interface LogEditorPanelProps {
  groupId: string;
  members: GroupMemberRow[];
  initialLogs: AdminLogItem[];
  onStatus: (status: { success: boolean; message: string }) => void;
}

export default function LogEditorPanel({ groupId, members, initialLogs, onStatus }: LogEditorPanelProps) {
  const [logs, setLogs] = useState<AdminLogItem[]>(initialLogs);
  const [logsSearch, setLogsSearch] = useState('');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [memberFilter, setMemberFilter] = useState('');
  const [metricFilter, setMetricFilter] = useState('');

  const handleEditLog = async (logId: string) => {
    const valNum = parseFloat(editValue);
    if (isNaN(valNum)) return;
    const res = await adminEditLog(logId, valNum, groupId);
    if (res.success) {
      setLogs((prev) => prev.map((l) => l.id === logId ? { ...l, value: valNum } : l));
      setEditingLogId(null);
      onStatus({ success: true, message: 'Log value updated successfully!' });
    } else {
      onStatus({ success: false, message: res.error || 'Failed to edit log.' });
    }
  };

  const handleVerifyLog = async (logId: string) => {
    const res = await adminVerifyLog(logId, groupId);
    if (res.success) {
      setLogs((prev) => prev.map((l) => l.id === logId ? { ...l, status: 'verified' } : l));
      onStatus({ success: true, message: 'Log status set to Verified!' });
    } else {
      onStatus({ success: false, message: res.error || 'Failed to verify log.' });
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this log?')) return;
    const res = await adminDeleteLog(logId, groupId);
    if (res.success) {
      setLogs((prev) => prev.filter((l) => l.id !== logId));
      onStatus({ success: true, message: 'Log deleted successfully!' });
    } else {
      onStatus({ success: false, message: res.error || 'Failed to delete log.' });
    }
  };

  const filteredLogs = logs.filter((log) => {
    const query = logsSearch.toLowerCase();
    const name = (log.profiles?.nickname || log.profiles?.full_name || '').toLowerCase();
    const metric = (log.metric_slug || '').toLowerCase();
    const val = String(log.value);
    const matchesText = name.includes(query) || metric.includes(query) || val.includes(query);
    const matchesMember = !memberFilter || log.user_id === memberFilter;
    const matchesMetric = !metricFilter || log.metric_slug === metricFilter;
    return matchesText && matchesMember && matchesMetric;
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4 col-span-1 lg:col-span-2 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight">
            God Mode Log Editor
          </h3>
          <p className="text-xs text-slate-500">
            Correct values, verify status, or delete logs directly in the database.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Filter by Member
          </label>
          <select
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-xs appearance-none"
          >
            <option value="" className="bg-white text-slate-900">All Members</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.profiles?.id} className="bg-white text-slate-900">
                {m.profiles?.nickname || m.profiles?.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Filter by Metric
          </label>
          <select
            value={metricFilter}
            onChange={(e) => setMetricFilter(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-xs appearance-none"
          >
            <option value="" className="bg-white text-slate-900">All Metrics</option>
            {Array.from(new Set(logs.map(l => l.metric_slug))).sort().map((slug) => (
              <option key={slug} value={slug} className="bg-white text-slate-900">
                {slug}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200 pt-3">
        <div></div>

        <div className="relative max-w-xs w-full">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Search logs..."
            value={logsSearch}
            onChange={(e) => setLogsSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
          />
        </div>
      </div>

      <div className="max-h-[450px] overflow-y-auto overflow-x-auto border border-slate-200 rounded-xl bg-white">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
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
                  <tr key={log.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 text-slate-900 bg-white">
                    <td className="px-4 py-3.5 font-semibold text-slate-900">
                      {log.profiles?.nickname || log.profiles?.full_name || 'Unknown'}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 font-medium">
                      <span className="bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide">
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
                            className="w-16 p-1 border border-slate-200 rounded text-xs bg-slate-50 text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                          />
                          <button
                            onClick={() => handleEditLog(log.id)}
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border border-emerald-200 transition cursor-pointer"
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
                          <span className="text-slate-500 font-medium">{log.unit}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 tabular-nums">
                      {formattedDate}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-wider border ${
                        log.status === 'verified'
                          ? 'bg-emerald-50 border border-emerald-200 text-emerald-600'
                          : 'bg-amber-50 border border-amber-200 text-amber-600'
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
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                          title="Edit log value"
                        >
                          <Edit3 size={14} />
                        </button>
                        {log.status !== 'verified' && (
                          <button
                            onClick={() => handleVerifyLog(log.id)}
                            className="px-2 py-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border border-emerald-200 text-[10px] font-bold transition cursor-pointer"
                            title="Manually Verify Log"
                          >
                            Verify
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          className="p-1.5 rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-100 transition cursor-pointer animate-in fade-in duration-150"
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
  );
}
