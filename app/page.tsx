'use client';

/**
 * Landing page — Kiosk Auth (Strict Room model with Personal User PINs).
 *
 * 1-Step Login UX:
 *  - User selects a Group.
 *  - User enters their 4-digit personal PIN.
 *  - On submit → calls loginWithPersonalPinAction(groupId, pin).
 *  - If PIN matches a profile in that group, server sets the session cookie.
 *  - Success state triggers Confetti animation and a welcome greeting.
 *  - After 2.5 seconds, client transitions to /dashboard using useRouter.
 *
 * Spec: architecture.md §7
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, ChevronDown, KeyRound } from 'lucide-react';
import {
  getGroupsAction,
  loginWithPersonalPinAction,
  type Group,
} from '@/app/actions/auth';
import Confetti from '@/components/Confetti';

export default function LandingPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Step 1 state
  const [groups, setGroups]           = useState<Group[]>([]);
  const [isLoadingGroups, setLoading] = useState(true);
  const [loadError, setLoadError]     = useState<string | null>(null);
  const [selectedGroup, setGroup]     = useState<Group | null>(null);
  const [pin, setPin]                 = useState('');
  const [pinError, setPinError]       = useState<string | null>(null);

  // Success/Animation state
  const [loggedInUser, setLoggedInUser] = useState<string | null>(null);

  // Fetch group list on mount — strict error handling
  useEffect(() => {
    let cancelled = false;

    async function loadGroups() {
      try {
        const { groups, error } = await getGroupsAction();
        if (cancelled) return;

        if (error) {
          console.error("CRITICAL SUPABASE ERROR:", error);
          setLoadError('Failed to load groups. Check database connection.');
          setLoading(false);
          return;
        }

        if (groups.length === 0) {
          console.warn('[LandingPage] getGroupsAction returned empty group list');
          setLoadError('Failed to load groups. Check database connection.');
        } else {
          setGroups(groups);
        }
      } catch (err: any) {
        if (cancelled) return;
        console.error("CRITICAL SUPABASE ERROR:", err);
        setLoadError('Failed to load groups. Check database connection.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadGroups();
    return () => { cancelled = true; };
  }, []);

  /* ── 1-Step Login Submit ────────────────────────────────────────────── */
  function handleLoginSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedGroup) return;
    setPinError(null);

    startTransition(async () => {
      const result = await loginWithPersonalPinAction(selectedGroup.id, pin);
      if (result.success) {
        // Trigger welcome animation state
        setLoggedInUser(result.userName);

        // Client-side router redirect after 2.5s welcome delay
        setTimeout(() => {
          router.push('/dashboard');
        }, 2500);
      } else {
        setPinError(result.error);
      }
    });
  }

  /* ── Success/Welcome Render ─────────────────────────────────────────── */
  if (loggedInUser) {
    const firstName = loggedInUser.split(' ')[0] ?? loggedInUser;
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-4">
        {/* Falling Confetti */}
        <Confetti />
        
        <div className="text-center flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-500">
          <div 
            className="w-20 h-20 rounded-full bg-[#CEFF00]/10 border border-[#CEFF00]/30 flex items-center justify-center text-4xl animate-bounce"
            role="img"
            aria-label="Party popper"
          >
            🎉
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tight">
            Welcome back, {firstName}!
          </h1>
          <p className="text-[#CEFF00] text-[11px] font-bold tracking-[0.2em] uppercase animate-pulse">
            Entering your club dashboard...
          </p>
        </div>
      </div>
    );
  }

  /* ── Standard 1-Step Login Form Render ──────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Brand header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black uppercase tracking-tight text-white leading-none">
            The Growth Club
          </h1>
          <p className="mt-2 text-[11px] font-bold tracking-[0.18em] text-[#6B7280] uppercase">
            Train Together. Compete Together. Grow Together.
          </p>
          {/* Neon lime underline accent */}
          <svg
            width="260" height="10" viewBox="0 0 260 10"
            fill="none" aria-hidden="true" className="mx-auto mt-1"
          >
            <path
              d="M2 7 C30 2, 70 9, 110 5 S165 1, 210 6 S238 8, 258 4"
              stroke="#CEFF00" strokeWidth="2.2" strokeLinecap="round" fill="none"
            />
          </svg>
        </div>

        <div className="bg-[#111111] rounded-[28px] p-7 flex flex-col gap-5 border border-white/5 shadow-[0_8px_40px_rgba(0,0,0,0.6)] animate-in fade-in duration-300">

          <div className="flex items-center gap-2 mb-1">
            <KeyRound size={16} className="text-[#CEFF00]" />
            <h2 className="text-white font-black text-lg tracking-tight">
              Enter your room
            </h2>
          </div>

          <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">

            {/* DB load error — shown when getGroupsAction fails or returns empty */}
            {loadError && (
              <div className="flex items-start gap-2 rounded-xl bg-[#FF3B30]/10 border border-[#FF3B30]/20 px-4 py-3 text-xs text-[#FF3B30]" role="alert">
                <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                <span>{loadError}</span>
              </div>
            )}

            {/* Group selector */}
            <div>
              <label className="block text-[11px] font-bold tracking-wider text-[#6B7280] uppercase mb-1.5">
                Your Group
              </label>
              <div className="relative">
                <select
                  id="group-select"
                  value={selectedGroup?.id ?? ''}
                  onChange={e => {
                    const g = groups.find(g => g.id === e.target.value) ?? null;
                    setGroup(g);
                    setPinError(null);
                  }}
                  required
                  disabled={isPending || isLoadingGroups || !!loadError}
                  className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#CEFF00]/40 disabled:opacity-50 transition pr-10"
                >
                  <option value="" disabled className="bg-[#1A1A1A] text-[#6B7280]">
                    {isLoadingGroups ? 'Loading groups…' : loadError ? 'Error — see above' : 'Select your group'}
                  </option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id} className="bg-[#1A1A1A] text-white">
                      {g.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] pointer-events-none"
                />
              </div>
            </div>

            {/* Personal PIN input */}
            <div>
              <label className="block text-[11px] font-bold tracking-wider text-[#6B7280] uppercase mb-1.5">
                Personal PIN
              </label>
              <input
                id="pin-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="• • • •"
                value={pin}
                onChange={e => {
                  setPin(e.target.value.replace(/\D/g, ''));
                  setPinError(null);
                }}
                required
                disabled={isPending}
                className="w-full rounded-xl border border-[#CEFF00]/30 bg-[#CEFF00]/5 px-4 py-3 text-center text-2xl text-[#CEFF00] font-black tracking-[0.5em] placeholder:text-[#6B7280] placeholder:text-base placeholder:font-normal placeholder:tracking-widest focus:outline-none focus:ring-2 focus:ring-[#CEFF00]/50 disabled:opacity-50 transition"
              />
            </div>

            {/* Error */}
            {pinError && (
              <div className="flex items-start gap-2 rounded-xl bg-[#FF3B30]/10 border border-[#FF3B30]/20 px-4 py-3 text-sm text-[#FF3B30]" role="alert">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                {pinError}
              </div>
            )}

            <button
              id="verify-pin-btn"
              type="submit"
              disabled={isPending || !selectedGroup || pin.length < 4}
              className="mt-1 flex items-center justify-center gap-2 bg-[#CEFF00] text-[#0A0A0A] font-black rounded-xl px-4 py-3 text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {isPending
                ? <><Loader2 size={14} className="animate-spin" /> Authenticating…</>
                : 'Enter Room'
              }
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-[#6B7280] text-[10px] mt-6 tracking-widest uppercase">
          Kiosk Mode · Sessions expire in 24 hours
        </p>
      </div>
    </div>
  );
}
