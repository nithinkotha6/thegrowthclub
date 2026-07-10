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
import { ingestActivity, type IngestResult } from '@/app/actions/ingest';

/**
 * "Add Activity" button + modal.
 * Clicking the black button opens a shadcn Dialog.
 * The user types natural language; a Server Action calls Gemini → Supabase.
 * Spec: Features.md §6 (The XP Engine / ingestion loop), architecture.md §2
 */
export default function AddActivityModal() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState<IngestResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setOpen(true);
    setText('');
    setResult(null);
  }

  function handleClose() {
    if (isPending) return; // prevent close during submission
    setOpen(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await ingestActivity(text);
      setResult(res);
      if (res.success) {
        // Auto-close after a brief success display
        setTimeout(() => setOpen(false), 2000);
      }
    });
  }

  return (
    <>
      {/* ── Trigger button — same styles as dashboard header ── */}
      <button
        id="add-activity-btn"
        onClick={handleOpen}
        className="flex items-center gap-1.5 bg-[#111827] text-white rounded-xl px-3 md:px-4 py-2.5 text-xs md:text-sm font-semibold hover:bg-black transition-colors"
      >
        <Plus size={14} strokeWidth={2.5} />
        <span className="hidden sm:inline">Add Activity</span>
        <span className="sm:hidden">Add</span>
      </button>

      {/* ── Dialog ─────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md rounded-[24px] p-7">
          <DialogHeader>
            <DialogTitle className="text-xl font-black tracking-tight text-[#111827]">
              Log an Activity
            </DialogTitle>
            <DialogDescription className="text-[#6B7280] text-sm mt-1">
              Describe your workout in plain English. Our AI will parse and save it.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            {/* Natural language input */}
            <textarea
              id="activity-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`e.g. "I just ran 5 miles" or "Deadlifted 120kg today"`}
              rows={3}
              disabled={isPending}
              className="w-full resize-none rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#111827] disabled:opacity-50 transition"
            />

            {/* Result feedback */}
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
                    ? `Logged! ${result.value} ${result.unit} of ${result.metric_slug.replace('_', ' ')}.`
                    : result.error}
                </span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isPending || !text.trim()}
              className="flex items-center justify-center gap-2 bg-[#111827] text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
