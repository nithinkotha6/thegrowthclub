'use client';

import { useState } from 'react';
import { X, Clock } from 'lucide-react';

interface TimerConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (seconds: number) => void;
  initialSeconds?: number;
}

export function TimerConfigModal({
  isOpen,
  onClose,
  onConfirm,
  initialSeconds = 600, // default 10 mins
}: TimerConfigModalProps) {
  const initH = Math.floor(initialSeconds / 3600);
  const initM = Math.floor((initialSeconds % 3600) / 60);
  const initS = initialSeconds % 60;

  const [hours, setHours] = useState<string>(initH ? String(initH) : '0');
  const [minutes, setMinutes] = useState<string>(initM ? String(initM) : '10');
  const [seconds, setSeconds] = useState<string>(initS ? String(initS) : '0');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApplyPreset = (mins: number) => {
    setHours('0');
    setMinutes(String(mins));
    setSeconds('0');
    setError(null);
  };

  const handleConfirm = () => {
    const h = Number(hours) || 0;
    const m = Number(minutes) || 0;
    const s = Number(seconds) || 0;

    if (h < 0 || m < 0 || s < 0 || m >= 60 || s >= 60) {
      setError('Please enter valid time values (MM and SS must be 0-59).');
      return;
    }

    const totalSec = h * 3600 + m * 60 + s;
    if (totalSec <= 0) {
      setError('Please set a duration greater than 0 seconds.');
      return;
    }

    onConfirm(totalSec);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-[#0A1628] border-2 border-[#CEFF00] rounded-3xl p-6 md:p-8 max-w-md w-full text-white shadow-2xl flex flex-col gap-6 relative animate-in fade-in zoom-in-95">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <div className="p-2.5 rounded-2xl bg-[#CEFF00]/15 text-[#CEFF00]">
            <Clock size={22} />
          </div>
          <div>
            <h3 className="text-base font-black uppercase tracking-wider text-white">
              Set Match Duration
            </h3>
            <p className="text-xs text-slate-400 font-bold">Configure countdown timer for match</p>
          </div>
        </div>

        {/* Quick Preset Buttons */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            Quick Presets
          </span>
          <div className="grid grid-cols-4 gap-2">
            {[5, 10, 15, 30].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => handleApplyPreset(mins)}
                className="px-3 py-2 rounded-xl bg-[#0F1F3C] border border-white/10 hover:border-[#CEFF00] text-xs font-black text-[#CEFF00] transition cursor-pointer hover:bg-white/5"
              >
                {mins} min
              </button>
            ))}
          </div>
        </div>

        {/* HH : MM : SS Inputs */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            Custom Time (HH : MM : SS)
          </span>
          <div className="grid grid-cols-3 gap-3 text-center">
            {/* Hours */}
            <div className="flex flex-col gap-1">
              <input
                type="number"
                min={0}
                max={99}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="bg-[#0F1F3C] border-2 border-white/20 focus:border-[#CEFF00] rounded-2xl p-3 text-center text-xl font-black text-white focus:outline-none"
              />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Hours</span>
            </div>

            {/* Minutes */}
            <div className="flex flex-col gap-1">
              <input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="bg-[#0F1F3C] border-2 border-white/20 focus:border-[#CEFF00] rounded-2xl p-3 text-center text-xl font-black text-white focus:outline-none"
              />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Minutes</span>
            </div>

            {/* Seconds */}
            <div className="flex flex-col gap-1">
              <input
                type="number"
                min={0}
                max={59}
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
                className="bg-[#0F1F3C] border-2 border-white/20 focus:border-[#CEFF00] rounded-2xl p-3 text-center text-xl font-black text-white focus:outline-none"
              />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Seconds</span>
            </div>
          </div>
        </div>

        {error && <p className="text-xs font-bold text-red-400">{error}</p>}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 rounded-xl border border-white/20 text-slate-300 font-extrabold text-xs uppercase tracking-wider hover:bg-white/5 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 py-3.5 rounded-xl bg-[#CEFF00] hover:bg-[#b8e600] text-black font-black text-xs uppercase tracking-wider transition cursor-pointer shadow-lg"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default TimerConfigModal;
