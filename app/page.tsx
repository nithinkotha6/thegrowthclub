'use client';

/**
 * Landing page — Kiosk Auth (Strict Room model with Personal User PINs & Unified Sign Up / Log In).
 *
 * Spec: architecture.md §7
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, ChevronDown, KeyRound, UserPlus } from 'lucide-react';
import {
  getGroupsAction,
  loginWithPersonalPinAction,
  signUpAction,
  type Group,
} from '@/app/actions/auth';
import Confetti from '@/components/Confetti';
import { playAudio, preloadAllSounds } from '@/lib/audio';

type Tab = 'login' | 'signup';

export default function LandingPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Tab State
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('tab') === 'signup' ? 'signup' : 'login';
    }
    return 'login';
  });

  // Shared Group List State
  const [groups, setGroups]           = useState<Group[]>([]);
  const [isLoadingGroups, setLoading] = useState(true);
  const [loadError, setLoadError]     = useState<string | null>(null);

  // Log In Form State
  const [selectedGroup, setGroup]     = useState<Group | null>(null);
  const [loginPin, setLoginPin]       = useState('');
  const [loginError, setLoginError]   = useState<string | null>(null);

  // Sign Up Form State
  const [signUpInvite, setSignUpInvite] = useState('');
  const [signUpName, setSignUpName]     = useState('');
  const [signUpNickname, setSignUpNickname] = useState('');
  const [signUpEmail, setSignUpEmail]   = useState('');
  const [signUpPin, setSignUpPin]       = useState('');
  const [signUpError, setSignUpError]   = useState<string | null>(null);
  const [hasPlayedNameAudio, setHasPlayedNameAudio] = useState(false);

  // Success welcome animation state
  const [loggedInUser, setLoggedInUser] = useState<string | null>(null);

  // Fetch groups and preload sounds on mount
  useEffect(() => {
    let cancelled = false;

    // Eagerly preload all audio assets to resolve latency issues
    preloadAllSounds();

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

        setGroups(groups);
      } catch (err) {
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

  /* ── Submit Handlers ────────────────────────────────────────────────── */

  function handleLoginSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedGroup) return;
    setLoginError(null);

    startTransition(async () => {
      const result = await loginWithPersonalPinAction(selectedGroup.id, loginPin);
      if (result.success) {
        playAudio('login.mp3');
        setLoggedInUser(result.userName);
        setTimeout(() => {
          router.push('/dashboard');
        }, 2500);
      } else {
        playAudio('error.mp3');
        setLoginError(result.error);
      }
    });
  }

  function handleSignUpSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSignUpError(null);

    if (signUpPin.length !== 4) {
      playAudio('who-are-you.mp3');
      setSignUpError('PIN must be exactly 4 digits.');
      return;
    }

    startTransition(async () => {
      const result = await signUpAction(
        signUpInvite,
        signUpName,
        signUpNickname,
        signUpEmail,
        signUpPin
      );

      if (result.success) {
        playAudio('thanks-a-lot.mp3');
        setLoggedInUser(result.userName);
        setTimeout(() => {
          router.push('/dashboard');
        }, 2500);
      } else {
        playAudio('who-are-you.mp3');
        setSignUpError(result.error);
      }
    });
  }

  /* ── Success Render ─────────────────────────────────────────────────── */
  if (loggedInUser) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-4">
        <Confetti />
        
        <div className="text-center flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-500">
          <div 
            className="w-20 h-20 rounded-full bg-[#CEFF00]/10 border border-[#CEFF00]/30 flex items-center justify-center text-4xl animate-bounce"
            role="img"
            aria-label="Welcome party"
          >
            🎉
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tight">
            Welcome, {loggedInUser}!
          </h1>
          <p className="text-[#CEFF00] text-[11px] font-bold tracking-[0.2em] uppercase animate-pulse">
            Loading your dashboard...
          </p>
        </div>
      </div>
    );
  }

  /* ── Standard Render ────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Brand Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black uppercase tracking-tight text-white leading-none">
            The Growth Club
          </h1>
          <p className="mt-2 text-[11px] font-bold tracking-[0.18em] text-[#6B7280] uppercase">
            Train Together. Compete Together. Grow Together.
          </p>
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

        {/* Card Body */}
        <div className="bg-[#111111] rounded-[28px] p-7 flex flex-col gap-5 border border-white/5 shadow-[0_8px_40px_rgba(0,0,0,0.6)] animate-in fade-in duration-300">
          
          {/* Tabs Navigation */}
          <div className="flex border border-white/10 rounded-xl overflow-hidden p-1 bg-white/5">
            <button
              onClick={() => { setActiveTab('login'); setSignUpError(null); }}
              disabled={isPending}
              className={`flex-1 py-2 text-xs font-black tracking-wider uppercase rounded-lg transition-[transform,background-color] duration-150 ease-out min-h-[44px] cursor-pointer ${
                activeTab === 'login'
                  ? 'bg-[#CEFF00] text-black shadow-md'
                  : 'text-[#6B7280] hover:text-white bg-transparent'
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => {
                if (activeTab !== 'signup') {
                  playAudio('signup-process.mp3');
                }
                setActiveTab('signup');
                setLoginError(null);
              }}
              disabled={isPending}
              className={`flex-1 py-2 text-xs font-black tracking-wider uppercase rounded-lg transition-[transform,background-color] duration-150 ease-out min-h-[44px] cursor-pointer ${
                activeTab === 'signup'
                  ? 'bg-[#CEFF00] text-black shadow-md'
                  : 'text-[#6B7280] hover:text-white bg-transparent'
              }`}
            >
              Sign Up
            </button>
          </div>

          {activeTab === 'login' ? (
            /* ── LOG IN TAB ──────────────────────────────────────────────── */
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <KeyRound size={16} className="text-[#CEFF00]" />
                <h2 className="text-white font-black text-lg tracking-tight">
                  Enter your room
                </h2>
              </div>

              <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
                {loadError && (
                  <div className="flex items-start gap-2 rounded-xl bg-[#FF3B30]/10 border border-[#FF3B30]/20 px-4 py-3 text-xs text-[#FF3B30]" role="alert">
                    <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                    <span>{loadError}</span>
                  </div>
                )}

                {/* Group Dropdown */}
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
                        setLoginError(null);
                      }}
                      required
                      disabled={isPending || isLoadingGroups || !!loadError}
                      className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base md:text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#CEFF00]/40 disabled:opacity-50 transition pr-10 min-h-[44px]"
                    >
                      <option value="" disabled className="bg-[#1A1A1A] text-[#6B7280]">
                        {isLoadingGroups ? 'Loading groups…' : 'Select your group'}
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

                {/* 4-Digit PIN */}
                <div>
                  <label className="block text-[11px] font-bold tracking-wider text-[#6B7280] uppercase mb-1.5">
                    Personal PIN
                  </label>
                  <input
                    id="login-pin-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    placeholder="• • • •"
                    value={loginPin}
                    onChange={e => {
                      setLoginPin(e.target.value.replace(/\D/g, ''));
                      setLoginError(null);
                    }}
                    required
                    disabled={isPending}
                    className="w-full rounded-xl border border-[#CEFF00]/30 bg-[#CEFF00]/5 px-4 py-3 text-center text-2xl text-[#CEFF00] font-black tracking-[0.5em] placeholder:text-[#6B7280] placeholder:text-base placeholder:font-normal placeholder:tracking-widest focus:outline-none focus:ring-2 focus:ring-[#CEFF00]/50 disabled:opacity-50 transition"
                  />
                </div>

                {loginError && (
                  <div className="flex items-start gap-2 rounded-xl bg-[#FF3B30]/10 border border-[#FF3B30]/20 px-4 py-3 text-sm text-[#FF3B30]" role="alert">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <button
                  id="login-btn"
                  type="submit"
                  disabled={isPending || !selectedGroup || loginPin.length < 4}
                  className="mt-1 flex items-center justify-center gap-2 bg-[#CEFF00] text-[#0A0A0A] font-black rounded-xl px-4 py-3 text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity min-h-[44px] cursor-pointer"
                >
                  {isPending ? (
                    <><Loader2 size={14} className="animate-spin" /> Entering Room…</>
                  ) : (
                    'Enter Room'
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* ── SIGN UP TAB ─────────────────────────────────────────────── */
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <UserPlus size={16} className="text-[#CEFF00]" />
                <h2 className="text-white font-black text-lg tracking-tight">
                  Join the club
                </h2>
              </div>

              <form onSubmit={handleSignUpSubmit} className="flex flex-col gap-4.5">
                {/* Group Invite Code */}
                <div>
                  <label className="block text-[11px] font-bold tracking-wider text-[#6B7280] uppercase mb-1.5">
                    Group Invite Code
                  </label>
                  <input
                    type="text"
                    value={signUpInvite}
                    onChange={e => { setSignUpInvite(e.target.value); setSignUpError(null); }}
                    required
                    placeholder="e.g. TEXAS2025"
                    disabled={isPending}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base md:text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#CEFF00]/40 disabled:opacity-50 transition-colors duration-150 ease-out"
                  />
                </div>

                {/* Full Name */}
                <div>
                  <label className="block text-[11px] font-bold tracking-wider text-[#6B7280] uppercase mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={signUpName}
                    onChange={e => { setSignUpName(e.target.value); setSignUpError(null); }}
                    onFocus={() => {
                      if (!hasPlayedNameAudio) {
                        playAudio('name.mp3');
                        setHasPlayedNameAudio(true);
                      }
                    }}
                    required
                    placeholder="First and Last name"
                    disabled={isPending}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base md:text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#CEFF00]/40 disabled:opacity-50 transition-colors duration-150 ease-out"
                  />
                </div>

                {/* Nickname */}
                <div>
                  <label className="block text-[11px] font-bold tracking-wider text-[#6B7280] uppercase mb-1.5">
                    Nickname (Optional)
                  </label>
                  <input
                    type="text"
                    value={signUpNickname}
                    onChange={e => { setSignUpNickname(e.target.value); setSignUpError(null); }}
                    placeholder="Display name on charts"
                    disabled={isPending}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base md:text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#CEFF00]/40 disabled:opacity-50 transition-colors duration-150 ease-out"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-[11px] font-bold tracking-wider text-[#6B7280] uppercase mb-1.5">
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={signUpEmail}
                    onChange={e => { setSignUpEmail(e.target.value); setSignUpError(null); }}
                    placeholder="your@email.com"
                    disabled={isPending}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base md:text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#CEFF00]/40 disabled:opacity-50 transition-colors duration-150 ease-out"
                  />
                </div>

                {/* Create 4-Digit PIN */}
                <div>
                  <label className="block text-[11px] font-bold tracking-wider text-[#6B7280] uppercase mb-1.5">
                    Create 4-Digit PIN
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    placeholder="• • • •"
                    value={signUpPin}
                    onChange={e => {
                      setSignUpPin(e.target.value.replace(/\D/g, ''));
                      setSignUpError(null);
                    }}
                    required
                    disabled={isPending}
                    className="w-full rounded-xl border border-[#CEFF00]/30 bg-[#CEFF00]/5 px-4 py-3 text-center text-2xl text-[#CEFF00] font-black tracking-[0.5em] placeholder:text-[#6B7280] placeholder:text-base placeholder:font-normal placeholder:tracking-widest focus:outline-none focus:ring-2 focus:ring-[#CEFF00]/50 disabled:opacity-50 transition"
                  />
                </div>

                {signUpError && (
                  <div className="flex items-start gap-2 rounded-xl bg-[#FF3B30]/10 border border-[#FF3B30]/20 px-4 py-3 text-sm text-[#FF3B30]" role="alert">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>{signUpError}</span>
                  </div>
                )}

                <button
                  id="signup-btn"
                  type="submit"
                  disabled={isPending || !signUpInvite || !signUpName || signUpPin.length < 4}
                  className="mt-2 flex items-center justify-center gap-2 bg-[#CEFF00] text-[#0A0A0A] font-black rounded-xl px-4 py-3 text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  {isPending ? (
                    <><Loader2 size={14} className="animate-spin" /> Creating Account…</>
                  ) : (
                    'Create Account'
                  )}
                </button>
              </form>
            </div>
          )}

        </div>

        {/* Footer */}
        <p className="text-center text-[#6B7280] text-[10px] mt-6 tracking-widest uppercase">
          Kiosk Mode · Sessions expire in 24 hours
        </p>
      </div>
    </div>
  );
}
