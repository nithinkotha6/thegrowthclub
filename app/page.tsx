'use client';

/**
 * Landing page — Kiosk Auth (Strict Room model).
 *
 * Step 1: User selects a group from a dropdown and enters the 4-digit PIN.
 *         → calls verifyPinAction(groupId, pin)
 * Step 2: On success, show a grid of profile cards for that group.
 * Step 3: User taps their profile card.
 *         → calls selectProfileAction(userId, groupId, groupName, userName)
 *         → server redirects to /dashboard with HTTP-only session cookie set.
 *
 * Spec: architecture.md §7
 */

import { useEffect, useState, useTransition } from 'react';
import { AlertCircle, Loader2, ChevronDown, KeyRound, Users } from 'lucide-react';
import {
  getGroupsAction,
  verifyPinAction,
  selectProfileAction,
  type Group,
  type GroupProfile,
} from '@/app/actions/auth';

type Step = 'pin' | 'profile';

export default function LandingPage() {
  const [isPending, startTransition] = useTransition();

  // Step 1 state
  const [groups, setGroups]           = useState<Group[]>([]);
  const [isLoadingGroups, setLoading] = useState(true);
  const [loadError, setLoadError]     = useState<string | null>(null);
  const [selectedGroup, setGroup]     = useState<Group | null>(null);
  const [pin, setPin]                 = useState('');
  const [pinError, setPinError]       = useState<string | null>(null);

  // Step 2 state
  const [step, setStep]               = useState<Step>('pin');
  const [profiles, setProfiles]       = useState<GroupProfile[]>([]);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  // Fetch group list on mount — strict error handling
  useEffect(() => {
    let cancelled = false;

    async function loadGroups() {
      try {
        const { groups, error } = await getGroupsAction();
        if (cancelled) return;

        if (error) {
          console.error('[LandingPage] getGroupsAction returned query error:', error);
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
        console.error('[LandingPage] Error in fetchGroups:', err);
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

  /* ── Step 1: Verify PIN ─────────────────────────────────────────────── */
  function handlePinSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedGroup) return;
    setPinError(null);

    startTransition(async () => {
      const result = await verifyPinAction(selectedGroup.id, pin);
      if (result.success) {
        setProfiles(result.profiles);
        setStep('profile');
      } else {
        setPinError(result.error);
      }
    });
  }

  /* ── Step 2: Select profile ─────────────────────────────────────────── */
  function handleProfileSelect(profile: GroupProfile) {
    if (!selectedGroup || isPending) return;
    setSelectingId(profile.id);

    startTransition(async () => {
      await selectProfileAction(
        profile.id,
        selectedGroup.id,
        selectedGroup.name,
        profile.full_name,
      );
    });
  }

  /* ── Shared layout ──────────────────────────────────────────────────── */
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

        {step === 'pin' ? (
          /* ── STEP 1: Group + PIN ──────────────────────────────────────── */
          <div className="bg-[#111111] rounded-[28px] p-7 flex flex-col gap-5 border border-white/5 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">

            <div className="flex items-center gap-2 mb-1">
              <KeyRound size={16} className="text-[#CEFF00]" />
              <h2 className="text-white font-black text-lg tracking-tight">
                Enter your room
              </h2>
            </div>

            <form onSubmit={handlePinSubmit} className="flex flex-col gap-4">

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

              {/* PIN input */}
              <div>
                <label className="block text-[11px] font-bold tracking-wider text-[#6B7280] uppercase mb-1.5">
                  Group PIN
                </label>
                <input
                  id="pin-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
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
                  ? <><Loader2 size={14} className="animate-spin" /> Verifying…</>
                  : 'Enter Room'
                }
              </button>
            </form>
          </div>

        ) : (
          /* ── STEP 2: Profile grid ─────────────────────────────────────── */
          <div className="bg-[#111111] rounded-[28px] p-7 flex flex-col gap-5 border border-white/5 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-[#CEFF00]" />
                <h2 className="text-white font-black text-lg tracking-tight">
                  Who are you?
                </h2>
              </div>
              <button
                onClick={() => { setStep('pin'); setPin(''); setPinError(null); }}
                className="text-[11px] font-semibold text-[#6B7280] hover:text-white transition-colors"
              >
                ← Back
              </button>
            </div>

            <p className="text-[#6B7280] text-xs -mt-2">
              Tap your name to enter <span className="text-white font-semibold">{selectedGroup?.name}</span>
            </p>

            {profiles.length === 0 ? (
              <div className="text-center py-8 text-[#6B7280] text-sm">
                No members found for this group.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {profiles.map(profile => {
                  const isLoading = selectingId === profile.id && isPending;
                  const isEmoji   = profile.avatar_url && !profile.avatar_url.startsWith('http') && [...profile.avatar_url].length <= 2;
                  const isImage   = profile.avatar_url?.startsWith('http');
                  const initials  = profile.full_name?.charAt(0)?.toUpperCase() ?? '?';

                  return (
                    <button
                      key={profile.id}
                      id={`profile-card-${profile.id}`}
                      onClick={() => handleProfileSelect(profile)}
                      disabled={isPending}
                      className="flex flex-col items-center gap-3 bg-[#1A1A1A] hover:bg-[#242424] border border-white/5 hover:border-[#CEFF00]/30 rounded-2xl p-5 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      {/* Avatar */}
                      <div className="w-14 h-14 rounded-full bg-[#0A0A0A] border border-white/10 group-hover:border-[#CEFF00]/40 flex items-center justify-center text-2xl overflow-hidden transition-colors flex-shrink-0">
                        {isLoading ? (
                          <Loader2 size={20} className="animate-spin text-[#CEFF00]" />
                        ) : isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={profile.avatar_url!} alt={profile.full_name} className="w-full h-full object-cover" />
                        ) : isEmoji ? (
                          profile.avatar_url
                        ) : (
                          <span className="text-[#CEFF00] text-lg font-black">{initials}</span>
                        )}
                      </div>

                      {/* Name */}
                      <span className="text-white text-sm font-semibold text-center leading-tight group-hover:text-[#CEFF00] transition-colors">
                        {profile.full_name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[#6B7280] text-[10px] mt-6 tracking-widest uppercase">
          Kiosk Mode · Sessions expire in 24 hours
        </p>
      </div>
    </div>
  );
}
