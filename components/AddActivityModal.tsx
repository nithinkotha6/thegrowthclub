'use client';

import { useState, useTransition } from 'react';
import { Plus, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { METRIC_PILLS, type MetricSlug } from '@/lib/metrics';
import { ingestActivity, type IngestResult } from '@/app/actions/ingest';
import { logDirectActivity, type DirectLogResult } from '@/app/actions/logDirect';

/**
 * "Add Activity" button + modal.
 * userId and groupId come from the HTTP-only session cookie (via dashboard page).
 * Spec: Features.md §6, architecture.md §7
 */
interface AddActivityModalProps {
  userId:  string;
  groupId: string;
}

type CombinedResult = IngestResult | DirectLogResult;

export default function AddActivityModal({ userId, groupId }: AddActivityModalProps) {
  const [open, setOpen]             = useState(false);
  const [text, setText]             = useState('');
  const [selectedMetric, setSelectedMetric] = useState<MetricSlug | ''>('');
  const [result, setResult]         = useState<CombinedResult | null>(null);
  const [isPending, startTransition] = useTransition();

  // Derived
  const activePill = METRIC_PILLS.find((p) => p.id === selectedMetric);

  function handleOpen() {
    setOpen(true);
    setText('');
    setSelectedMetric('');
    setResult(null);
  }

  function handleClose() {
    if (isPending) return;
    setOpen(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    // ── Natural language AI path ────────────────────────────────────────
    if (!text.trim()) return;
    startTransition(async () => {
      const res = await ingestActivity(text, userId, groupId);
      setResult(res);
      if (res.success) setTimeout(() => setOpen(false), 2000);
    });
  }

  const canSubmit = text.trim().length > 0;

  // Build a friendly placeholder based on selected metric
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

  const placeholder = (selectedMetric && placeholderHints[selectedMetric])
    ? `e.g. ${placeholderHints[selectedMetric]}`
    : 'e.g. "I ran 5 miles" or "Deadlifted 120kg today"';

  return (
    <>
      {/* ── Trigger button ── */}
      <button
        id="add-activity-btn"
        onClick={handleOpen}
        className="flex items-center gap-1.5 bg-[#111827] text-white rounded-xl px-3 md:px-4 py-2.5 text-xs md:text-sm font-semibold hover:bg-black transition-colors min-h-[44px]"
      >
        <Plus size={14} strokeWidth={2.5} />
        <span className="hidden sm:inline">Add Activity</span>
        <span className="sm:hidden">Add</span>
      </button>

      {/* ── Dialog ── */}
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md rounded-[24px] p-7">
          <DialogHeader>
            <DialogTitle className="text-xl font-black tracking-tight text-[#111827]">
              Log an Activity
            </DialogTitle>
            <DialogDescription className="text-[#6B7280] text-sm mt-1">
              Select a metric then describe it in plain English — our AI will handle the rest.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">

            {/* ── Metric selector ── */}
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
                  setResult(null);
                }}
                disabled={isPending}
                className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-base text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#111827] disabled:opacity-50 min-h-[44px] appearance-none"
              >
                <option value="">— Choose a metric —</option>
                {METRIC_PILLS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* ── Input area: natural language textarea ── */}
            <div>
              <label htmlFor="activity-input" className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1.5 block">
                Describe your activity
              </label>
              <textarea
                id="activity-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={placeholder}
                rows={3}
                disabled={isPending}
                className="w-full resize-none rounded-xl border border-[#E5E7EB] px-4 py-3 text-base md:text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#111827] disabled:opacity-50 transition"
              />
            </div>

            {/* ── Result feedback ── */}
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

            {/* ── Submit ── */}
            <button
              type="submit"
              disabled={isPending || !canSubmit}
              className="flex items-center justify-center gap-2 bg-[#111827] text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            >
              {isPending ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Parsing with AI…
                </>
              ) : (
                'Save Activity'
              )}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
