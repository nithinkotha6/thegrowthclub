'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, CheckCircle, AlertCircle, Sparkles, ClipboardList } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { METRIC_PILLS, type MetricSlug } from '@/lib/metrics';
import { ingestActivity, type IngestResult } from '@/app/actions/ingest';
import { logActivityManual, type DirectLogResult } from '@/app/actions/logDirect';

interface AddActivityModalProps {
  userId:  string;
  groupId: string;
}

type CombinedResult = IngestResult | DirectLogResult;

export default function AddActivityModal({ userId, groupId }: AddActivityModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  const [isPending, startTransition] = useTransition();

  // Shared state
  const [selectedMetric, setSelectedMetric] = useState<MetricSlug | ''>('');
  const [result, setResult] = useState<CombinedResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // AI Assist State
  const [text, setText] = useState('');

  // Manual Form States
  const [manualValue, setManualValue] = useState('');
  const [manualDistance, setManualDistance] = useState('');
  const [manualHrs, setManualHrs] = useState('');
  const [manualMins, setManualMins] = useState('');
  const [manualSecs, setManualSecs] = useState('');
  const [manualCaption, setManualCaption] = useState('');

  const activePill = METRIC_PILLS.find((p) => p.id === selectedMetric);
  const isEnduranceMetric = selectedMetric === 'long_run' || selectedMetric === 'underwater_swim';

  function handleOpen() {
    setOpen(true);
    setMode('ai');
    setText('');
    setSelectedMetric('');
    setManualValue('');
    setManualDistance('');
    setManualHrs('');
    setManualMins('');
    setManualSecs('');
    setManualCaption('');
    setResult(null);
  }

  function handleClose() {
    if (isPending) return;
    setOpen(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (mode === 'ai') {
      if (!text.trim()) return;
      startTransition(async () => {
        const res = await ingestActivity(text, userId, groupId);
        setResult(res);
        if (res.success) {
          setOpen(false);
          setToast("Log submitted! Pending approval from your group members.");
          setTimeout(() => setToast(null), 4000);
          router.refresh();
        }
      });
    } else {
      if (!selectedMetric) return;

      const val = isEnduranceMetric ? Number(manualDistance) : Number(manualValue);
      if (isNaN(val) || val <= 0) return;

      const unit = activePill?.unit || '';

      startTransition(async () => {
        let finalCaption = manualCaption.trim();

        if (isEnduranceMetric) {
          const hh = Number(manualHrs) || 0;
          const mm = Number(manualMins) || 0;
          const ss = Number(manualSecs) || 0;
          const totalSeconds = (hh * 3600) + (mm * 60) + ss;

          if (totalSeconds > 0) {
            const formattedDuration = `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
            finalCaption = finalCaption
              ? `${finalCaption} (Duration: ${formattedDuration})`
              : `Duration: ${formattedDuration}`;
          }
        }

        const res = await logActivityManual(selectedMetric, val, unit, userId, groupId, finalCaption);
        setResult(res);
        if (res.success) {
          setOpen(false);
          setToast("Log submitted! Pending approval from your group members.");
          setTimeout(() => setToast(null), 4000);
          router.refresh();
        }
      });
    }
  }

  // Submit validation checks
  const canSubmit = mode === 'ai'
    ? text.trim().length > 0
    : !!selectedMetric && (isEnduranceMetric ? !!manualDistance.trim() : !!manualValue.trim());

  // Dynamic placeholders
  const placeholderHints: Partial<Record<MetricSlug, string>> = {
    long_run:       '"I just ran 6.2 miles at 8 min/mi"',
    top_speed:      '"Hit 24 mph on my bike today"',
    weight:         '"Weighed in at 185 lbs this morning"',
    highest_steps:  '"Walked 18,432 steps today"',
    marathon:       '"Finished the marathon in 4 hrs 12 mins"',
    car_top_speed:  '"Pushed the Hycross to 112 mph on the highway"',
    underwater_swim:'"Swam 45 meters underwater on one breath"',
    most_beers:     '"Drank 7 beers at the party last night"',
    catan_wins:     '"Won Catan tonight — 3rd win this month!"',
    national_parks: '"Visited Zion National Park today"',
  };

  const aiPlaceholder = (selectedMetric && placeholderHints[selectedMetric])
    ? `e.g. ${placeholderHints[selectedMetric]}`
    : 'e.g. "I ran 5 miles" or "Deadlifted 120kg today"';

  return (
    <>
      {/* ── Trigger button ── */}
      <button
        id="add-activity-btn"
        onClick={handleOpen}
        className="flex items-center gap-1.5 bg-[#111827] text-white rounded-xl px-3 md:px-4 py-2.5 text-xs md:text-sm font-semibold hover:bg-black transition-colors min-h-[44px] cursor-pointer"
      >
        <Plus size={14} strokeWidth={2.5} />
        <span className="hidden sm:inline">Add Activity</span>
        <span className="sm:hidden">Add</span>
      </button>

      {/* ── Dialog Overlay ── */}
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md rounded-[24px] p-7">
          <DialogHeader>
            <DialogTitle className="text-xl font-black tracking-tight text-[#111827]">
              Log an Activity
            </DialogTitle>
            <DialogDescription className="text-[#6B7280] text-sm mt-1">
              Share details of your latest performance milestone below.
            </DialogDescription>
          </DialogHeader>

          {/* Segmented Mode Selector Header Control */}
          <div className="flex bg-slate-100 rounded-xl p-1 mt-4 select-none">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setMode('ai');
                setResult(null);
              }}
              className={`flex-grow py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'ai'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-slate-500 hover:text-gray-800'
              }`}
            >
              <Sparkles size={12} />
              AI Assist
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setMode('manual');
                setResult(null);
              }}
              className={`flex-grow py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'manual'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-slate-500 hover:text-gray-800'
              }`}
            >
              <ClipboardList size={12} />
              Manual Log
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            
            {/* ── Shared Metric selector dropdown ── */}
            <div>
              <label htmlFor="metric-select" className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1.5 block">
                Metric
              </label>
              <select
                id="metric-select"
                value={selectedMetric}
                onChange={(e) => {
                  setSelectedMetric(e.target.value as MetricSlug | '');
                  setText('');
                  setManualValue('');
                  setManualDistance('');
                  setManualHrs('');
                  setManualMins('');
                  setManualSecs('');
                  setResult(null);
                }}
                disabled={isPending}
                className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-base text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#111827] disabled:opacity-50 min-h-[44px] appearance-none"
              >
                <option value="">— Choose a metric —</option>
                {METRIC_PILLS.filter(p => !p.id.startsWith('wearable_')).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* ── Switchable Mode Views ── */}
            {mode === 'ai' ? (
              // AI ASSIST VIEW
              <div>
                <label htmlFor="activity-input" className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1.5 block">
                  Describe your activity
                </label>
                <textarea
                  id="activity-input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={aiPlaceholder}
                  rows={3}
                  disabled={isPending}
                  className="w-full resize-none rounded-xl border border-[#E5E7EB] px-4 py-3 text-base md:text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#111827] disabled:opacity-50 transition"
                />
              </div>
            ) : (
              // STRUCTURED MANUAL FORM VIEW
              <div className="flex flex-col gap-4">
                {!selectedMetric ? (
                  <div className="text-center py-6 border border-dashed border-slate-200 rounded-2xl text-xs font-bold text-slate-400">
                    Choose a metric above to display forms.
                  </div>
                ) : isEnduranceMetric ? (
                  <>
                    {/* Endurance distance input */}
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="manual-distance" className="text-xs font-bold text-[#6B7280] uppercase tracking-wider block">
                        Distance ({activePill?.unit})
                      </label>
                      <input
                        id="manual-distance"
                        type="number"
                        step="any"
                        required
                        disabled={isPending}
                        value={manualDistance}
                        onChange={(e) => setManualDistance(e.target.value)}
                        placeholder={`Enter distance in ${activePill?.unit}`}
                        className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-base text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#111827] disabled:opacity-50 min-h-[44px]"
                      />
                    </div>

                    {/* Grouped Duration Picker */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider block">
                        Duration (HH : MM : SS)
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex items-center gap-1 bg-white rounded-xl border border-[#E5E7EB] px-3 py-1.5">
                          <input
                            type="number"
                            min="0"
                            max="99"
                            disabled={isPending}
                            value={manualHrs}
                            onChange={(e) => setManualHrs(e.target.value)}
                            placeholder="HH"
                            className="w-full text-center text-base font-semibold focus:outline-none bg-transparent tabular-nums"
                          />
                          <span className="text-[10px] font-black text-slate-400">H</span>
                        </div>
                        <div className="flex items-center gap-1 bg-white rounded-xl border border-[#E5E7EB] px-3 py-1.5">
                          <input
                            type="number"
                            min="0"
                            max="59"
                            disabled={isPending}
                            value={manualMins}
                            onChange={(e) => setManualMins(e.target.value)}
                            placeholder="MM"
                            className="w-full text-center text-base font-semibold focus:outline-none bg-transparent tabular-nums"
                          />
                          <span className="text-[10px] font-black text-slate-400">M</span>
                        </div>
                        <div className="flex items-center gap-1 bg-white rounded-xl border border-[#E5E7EB] px-3 py-1.5">
                          <input
                            type="number"
                            min="0"
                            max="59"
                            disabled={isPending}
                            value={manualSecs}
                            onChange={(e) => setManualSecs(e.target.value)}
                            placeholder="SS"
                            className="w-full text-center text-base font-semibold focus:outline-none bg-transparent tabular-nums"
                          />
                          <span className="text-[10px] font-black text-slate-400">S</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  // Standard numerical metrics
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="manual-value" className="text-xs font-bold text-[#6B7280] uppercase tracking-wider block">
                      Value ({activePill?.unit})
                    </label>
                    <input
                      id="manual-value"
                      type="number"
                      step="any"
                      required
                      disabled={isPending}
                      value={manualValue}
                      onChange={(e) => setManualValue(e.target.value)}
                      placeholder={`Enter value in ${activePill?.unit}`}
                      className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-base text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#111827] disabled:opacity-50 min-h-[44px]"
                    />
                  </div>
                )}

                {/* Optional Metadata Comment Block */}
                {selectedMetric && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="manual-caption" className="text-xs font-bold text-[#6B7280] uppercase tracking-wider block">
                      Comments / Story (Optional)
                    </label>
                    <input
                      id="manual-caption"
                      type="text"
                      disabled={isPending}
                      value={manualCaption}
                      onChange={(e) => setManualCaption(e.target.value)}
                      placeholder='e.g. "Leg day was brutal today"'
                      className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-base text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#111827] disabled:opacity-50 min-h-[44px]"
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── Result Feedback ── */}
            {result && (
              <div
                className={[
                  'flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm',
                  result.success
                    ? 'bg-[#EAFCDB] text-[#166534]'
                    : 'bg-[#FFE5E5] text-[#991B1B]',
                ].join(' ')}
                role="status"
              >
                {result.success ? (
                  <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                )}
                <span>
                  {result.success
                    ? `Logged! ${result.value} ${result.unit} of ${result.metric_slug.replace(/_/g, ' ')}.`
                    : result.error}
                </span>
              </div>
            )}

            {/* ── Submit button ── */}
            <button
              type="submit"
              disabled={isPending || !canSubmit}
              className="flex items-center justify-center gap-2 bg-[#111827] text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px] cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  {mode === 'ai' ? 'Parsing with AI…' : 'Submitting…'}
                </>
              ) : (
                'Save Activity'
              )}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Lightweight Floating Toast Notification Overlay ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999] bg-[#111827] text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 border border-white/10 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <CheckCircle size={16} className="text-[#CEFF00]" />
          <span className="text-xs font-bold">{toast}</span>
        </div>
      )}
    </>
  );
}
