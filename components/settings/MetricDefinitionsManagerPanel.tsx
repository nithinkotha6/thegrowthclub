'use client';

import React, { useState } from 'react';
import {
  adminUpdateMetricDefinition,
  adminDeleteMetricDefinition,
  adminToggleMetricHidden,
  adminToggleMetricRequiresVerification,
} from '@/app/actions/metrics';
import { Edit3, Trash2, Check, X, CheckCircle, AlertCircle } from 'lucide-react';

interface MetricDefinitionsManagerPanelProps {
  metricDefinitions: any[];
  setMetricDefinitions: React.Dispatch<React.SetStateAction<any[]>>;
}

export default function MetricDefinitionsManagerPanel({
  metricDefinitions,
  setMetricDefinitions,
}: MetricDefinitionsManagerPanelProps) {
  const [editingMetricId, setEditingMetricId] = useState<string | null>(null);
  const [editMetricName, setEditMetricName] = useState('');
  const [editMetricUnit, setEditMetricUnit] = useState('');
  const [editMetricSort, setEditMetricSort] = useState<'asc' | 'desc'>('desc');
  const [metricFeedback, setMetricFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEditMetricClick = (m: any) => {
    setEditingMetricId(m.id);
    setEditMetricName(m.name);
    setEditMetricUnit(m.unit);
    setEditMetricSort(m.sort_direction);
    setMetricFeedback(null);
  };

  const handleUpdateMetric = async (id: string) => {
    if (!editMetricName.trim() || !editMetricUnit.trim()) return;
    setIsSubmitting(true);
    setMetricFeedback(null);
    const res = await adminUpdateMetricDefinition(id, editMetricName, editMetricUnit, editMetricSort);
    setIsSubmitting(false);
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
    setIsSubmitting(true);
    setMetricFeedback(null);
    const res = await adminDeleteMetricDefinition(id);
    setIsSubmitting(false);
    if (res.success) {
      setMetricDefinitions((prev) => prev.filter((m) => m.id !== id));
      setMetricFeedback({ success: true, message: 'Metric definition deleted successfully!' });
    } else {
      setMetricFeedback({ success: false, message: res.error || 'Failed to delete metric definition.' });
    }
  };

  const handleToggleMetricHidden = async (id: string, currentHidden: boolean) => {
    setIsSubmitting(true);
    setMetricFeedback(null);
    const targetHidden = !currentHidden;
    const res = await adminToggleMetricHidden(id, targetHidden);
    setIsSubmitting(false);
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

  const handleToggleRequiresVerification = async (id: string, currentValue: boolean) => {
    setIsSubmitting(true);
    setMetricFeedback(null);
    const target = !currentValue;
    const res = await adminToggleMetricRequiresVerification(id, target);
    setIsSubmitting(false);
    if (res.success) {
      setMetricDefinitions((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, requires_verification: target } : m
        )
      );
      setMetricFeedback({
        success: true,
        message: `Peer verification requirement ${target ? 'enabled' : 'disabled'}.`,
      });
    } else {
      setMetricFeedback({ success: false, message: res.error || 'Failed to toggle verification requirement.' });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4 col-span-1 lg:col-span-2 shadow-sm">
      <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
        📊 Metric Definitions Manager
      </h3>
      <p className="text-xs text-slate-500">
        View, edit, or hide/delete existing KPI metrics. Modifying values updates dashboard calculations in real-time.
      </p>

      <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-xl bg-white text-slate-900">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <th className="px-4 py-3">Metric Name</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Leaderboard Sort</th>
              <th className="px-4 py-3">Verification</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {metricDefinitions.length > 0 ? (
              metricDefinitions.map((m) => (
                <tr key={m.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 text-slate-900 bg-white">
                  <td className="px-4 py-3.5 font-semibold text-slate-900">
                    {editingMetricId === m.id ? (
                      <input
                        type="text"
                        value={editMetricName}
                        onChange={(e) => setEditMetricName(e.target.value)}
                        className="w-full p-1 border border-slate-200 rounded text-xs bg-slate-50 text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                      />
                    ) : (
                      m.name
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-slate-700 font-medium">
                    {editingMetricId === m.id ? (
                      <input
                        type="text"
                        value={editMetricUnit}
                        onChange={(e) => setEditMetricUnit(e.target.value)}
                        className="w-24 p-1 border border-slate-200 rounded text-xs bg-slate-50 text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                      />
                    ) : (
                      m.unit
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-slate-500 font-medium">
                    {editingMetricId === m.id ? (
                      <select
                        value={editMetricSort}
                        onChange={(e) => setEditMetricSort(e.target.value as 'asc' | 'desc')}
                        className="p-1 border border-slate-200 rounded text-xs bg-slate-50 text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                      >
                        <option value="desc" className="bg-white text-slate-900">Higher is Better (Desc)</option>
                        <option value="asc" className="bg-white text-slate-900">Lower is Better (Asc)</option>
                      </select>
                    ) : (
                      m.sort_direction === 'desc' ? 'Higher is Better' : 'Lower is Better'
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => handleToggleRequiresVerification(m.id, m.requires_verification)}
                      disabled={isSubmitting}
                      className={`px-2 py-1 rounded text-[10px] font-bold border transition cursor-pointer ${
                        m.requires_verification
                          ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-600 hover:text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                      title={m.requires_verification ? "Disable peer verification requirement" : "Require 3 peer approvals before counting"}
                    >
                      {m.requires_verification ? "Required" : "Instant"}
                    </button>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {editingMetricId === m.id ? (
                        <>
                          <button
                            onClick={() => handleUpdateMetric(m.id)}
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border border-emerald-200 transition cursor-pointer animate-in fade-in duration-150"
                            title="Save changes"
                            disabled={isSubmitting}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setEditingMetricId(null)}
                            className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition cursor-pointer"
                            title="Cancel"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEditMetricClick(m)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                            title="Edit metric"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleToggleMetricHidden(m.id, m.is_hidden)}
                            className={`px-2 py-1 rounded text-[10px] font-bold border transition cursor-pointer ${
                              m.is_hidden
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-600 hover:text-white'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                            title={m.is_hidden ? "Show on dashboard" : "Hide from dashboard"}
                          >
                            {m.is_hidden ? "Unhide" : "Hide"}
                          </button>
                          <button
                            onClick={() => handleDeleteMetric(m.id)}
                            className="p-1.5 rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-100 transition cursor-pointer"
                            title="Delete metric"
                            disabled={isSubmitting}
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
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400 font-bold">
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
            ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
            : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          {metricFeedback.success ? <CheckCircle size={14} className="mt-0.5" /> : <AlertCircle size={14} className="mt-0.5" />}
          <span>{metricFeedback.message}</span>
        </div>
      )}
    </div>
  );
}
