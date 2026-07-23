'use client';

import { useState, useTransition } from 'react';
import { Database, RefreshCw, RotateCcw, CheckCircle2, XCircle, Clock, Server, Layers, AlertTriangle } from 'lucide-react';
import {
  type BackupMetadataRecord,
  type BackupTableSummary,
  triggerSchemaBackupAction,
  restoreFromBackupAction,
} from '@/app/actions/backup';

interface BackupStatusClientProps {
  initialMetadata: BackupMetadataRecord | null;
  initialHistory: BackupMetadataRecord[];
  initialTables: BackupTableSummary[];
}

export default function BackupStatusClient({
  initialMetadata,
  initialHistory,
  initialTables,
}: BackupStatusClientProps) {
  const [metadata, setMetadata] = useState<BackupMetadataRecord | null>(initialMetadata);
  const [history, setHistory] = useState<BackupMetadataRecord[]>(initialHistory);
  const [tables, setTables] = useState<BackupTableSummary[]>(initialTables);

  const [isPending, startTransition] = useTransition();
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [selectedTableToRestore, setSelectedTableToRestore] = useState<string>('');

  const handleManualBackup = () => {
    setStatusMsg(null);
    startTransition(async () => {
      const res = await triggerSchemaBackupAction();
      if (res.success) {
        setStatusMsg({
          type: 'success',
          text: `Backup completed successfully! Copied ${res.summary.length} tables (${res.totalRows} total rows).`,
        });
        setTables(res.summary);
        setMetadata({
          id: 'manual-' + Date.now(),
          backed_up_at: new Date().toISOString(),
          status: 'completed',
          error_message: null,
          total_tables_copied: res.summary.length,
          total_rows_copied: res.totalRows,
          created_at: new Date().toISOString(),
        });
      } else {
        setStatusMsg({ type: 'error', text: `Backup failed: ${res.error}` });
      }
    });
  };

  const handleRestore = (tableName?: string) => {
    setStatusMsg(null);
    setRestoreModalOpen(false);
    startTransition(async () => {
      const res = await restoreFromBackupAction(tableName);
      if (res.success) {
        const total = res.restored.reduce((sum, r) => sum + r.restored_rows, 0);
        setStatusMsg({
          type: 'success',
          text: `Restore completed successfully! Restored ${res.restored.length} tables (${total} total rows).`,
        });
      } else {
        setStatusMsg({ type: 'error', text: `Restore failed: ${res.error}` });
      }
    });
  };

  const formattedDate = metadata?.backed_up_at
    ? new Date(metadata.backed_up_at).toLocaleString()
    : 'Never executed';

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto py-6 px-4 md:px-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-[#CEFF00]/15 text-[#CEFF00]">
            <Database size={28} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              Database Schema Backup & Live Recovery
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Nightly 3 AM UTC replication of Master/public schema into isolated <code className="text-[#CEFF00]">backup</code> schema
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleManualBackup}
            disabled={isPending}
            className="px-4 py-2.5 bg-[#CEFF00] hover:bg-[#b8e600] text-black font-black text-xs uppercase tracking-wider rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center gap-2 shadow-md active:scale-95"
          >
            <RefreshCw size={16} className={isPending ? 'animate-spin' : ''} />
            {isPending ? 'Replicating...' : 'Trigger Backup Now'}
          </button>
          <button
            type="button"
            onClick={() => setRestoreModalOpen(true)}
            disabled={isPending}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-white/10 font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center gap-2 shadow-sm"
          >
            <RotateCcw size={16} />
            Restore from Backup
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-sm font-bold shadow-sm ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {statusMsg.type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Clock size={14} /> Last Backup Date
          </span>
          <span className="text-sm font-extrabold text-slate-900 truncate">{formattedDate}</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 size={14} /> Replication Status
          </span>
          <span className="text-base font-black uppercase text-slate-900 flex items-center gap-1.5">
            {metadata?.status === 'completed' ? (
              <span className="text-emerald-600 flex items-center gap-1">
                <CheckCircle2 size={18} /> Completed
              </span>
            ) : metadata?.status === 'failed' ? (
              <span className="text-red-600 flex items-center gap-1">
                <XCircle size={18} /> Failed
              </span>
            ) : (
              <span className="text-slate-400">Not Run Yet</span>
            )}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers size={14} /> Tables Replicated
          </span>
          <span className="text-2xl font-black text-slate-900">
            {metadata?.total_tables_copied ?? tables.length} <span className="text-xs font-bold text-slate-400">tables</span>
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Server size={14} /> Total Rows in Backup
          </span>
          <span className="text-2xl font-black text-slate-900">
            {tables.reduce((sum, t) => sum + (t.row_count || 0), 0).toLocaleString()} <span className="text-xs font-bold text-slate-400">rows</span>
          </span>
        </div>
      </div>

      {/* Table Breakdown Matrix */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col gap-4">
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
          <Layers size={18} className="text-[#658000]" /> Backup Schema Tables Inventory (1:1 Mirror)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {tables.map((t) => (
            <div
              key={t.table_name}
              className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between"
            >
              <span className="text-xs font-extrabold text-slate-800 truncate font-mono">
                backup.{t.table_name}
              </span>
              <span className="text-xs font-bold text-slate-500 mt-1">
                {t.row_count.toLocaleString()} rows
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Backup Audit History Log */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col gap-4">
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
          <Clock size={18} className="text-[#658000]" /> Backup Metadata Audit Log (`backup.backup_metadata`)
        </h3>

        {history.length === 0 ? (
          <p className="text-xs text-slate-400 font-bold py-4">No audit log entries found.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  {h.status === 'completed' ? (
                    <CheckCircle2 size={16} className="text-emerald-600" />
                  ) : (
                    <XCircle size={16} className="text-red-600" />
                  )}
                  <span className="font-extrabold text-slate-900">
                    {new Date(h.backed_up_at).toLocaleString()}
                  </span>
                  <span className="font-mono text-slate-500">
                    {h.total_tables_copied ?? 0} tables, {(h.total_rows_copied ?? 0).toLocaleString()} rows
                  </span>
                </div>
                <span
                  className={`font-black uppercase text-[10px] px-2.5 py-1 rounded-full ${
                    h.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {h.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Restore Confirmation Modal */}
      {restoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#111111] border border-white/10 text-white rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-5">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-wider text-white">
                  Live Recovery: Restore Data
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  Copy rows from backup schema into primary database
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Select Scope to Restore
              </label>
              <select
                value={selectedTableToRestore}
                onChange={(e) => setSelectedTableToRestore(e.target.value)}
                className="bg-slate-900 text-white border border-white/20 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#CEFF00]"
              >
                <option value="">ALL TABLES (Full Schema Recovery)</option>
                {tables.map((t) => (
                  <option key={t.table_name} value={t.table_name}>
                    Only "{t.table_name}" ({t.row_count} rows in backup)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestoreModalOpen(false)}
                className="flex-1 py-3 bg-white/10 hover:bg-white/15 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRestore(selectedTableToRestore || undefined)}
                disabled={isPending}
                className="flex-1 py-3 bg-[#CEFF00] hover:bg-[#b8e600] text-black font-black text-xs uppercase tracking-wider rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Confirm Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
