'use client';

import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface PeerReviewModalProps {
  count: number;
  children: React.ReactNode;
}

export default function PeerReviewModal({ count, children }: PeerReviewModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(true)}
        aria-label="Toggle peer reviews queue"
        className="relative flex items-center justify-center p-2.5 bg-white border border-[#E5E7EB] rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:bg-slate-50 transition active:scale-95 cursor-pointer min-h-[44px] min-w-[44px]"
      >
        <Bell className="text-slate-700 w-5 h-5" />
        
        {/* Pulsing red badge counter */}
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white text-center select-none tabular-nums leading-none">
              {count}
            </span>
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-6 bg-white border border-slate-200 shadow-2xl rounded-3xl overflow-hidden focus:outline-none">
          <DialogHeader className="sr-only">
            <DialogTitle>Verify Activities</DialogTitle>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-y-auto pr-1">
            {children}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
