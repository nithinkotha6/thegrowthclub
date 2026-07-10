'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { signUpWithInvite } from '@/app/actions/signup';

/**
 * Onboarding / signup page.
 * Standalone — no dashboard sidebar.
 * Spec: architecture.md §2 (invite-code group assignment at profile creation)
 */
export default function SignupPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signUpWithInvite(formData);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Brand */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black uppercase tracking-tight text-white leading-none">
            The Growth Club
          </h1>
          <p className="mt-2 text-[11px] font-bold tracking-[0.18em] text-[#6B7280] uppercase">
            Train Together. Compete Together. Grow Together.
          </p>
        </div>

        {success ? (
          /* ── Success state ─────────────────────────────────────── */
          <div className="bg-[#1A1A1A] rounded-[24px] p-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle size={40} className="text-[#CEFF00]" />
            <div>
              <p className="text-white font-bold text-lg">You&apos;re in!</p>
              <p className="text-[#6B7280] text-sm mt-1">
                Check your email to confirm your account, then head to the dashboard.
              </p>
            </div>
            <a
              href="/dashboard"
              className="mt-2 inline-flex items-center gap-2 bg-[#CEFF00] text-[#0A0A0A] font-bold rounded-xl px-6 py-2.5 text-sm hover:opacity-90 transition-opacity"
            >
              Go to Dashboard
            </a>
          </div>
        ) : (
          /* ── Signup form ───────────────────────────────────────── */
          <form
            onSubmit={handleSubmit}
            className="bg-[#1A1A1A] rounded-[24px] p-8 flex flex-col gap-4"
          >
            <h2 className="text-white font-black text-xl tracking-tight mb-1">
              Join your group
            </h2>

            <Field name="full_name"    label="Full Name"     type="text"     placeholder="Nithin Kumar"         disabled={isPending} />
            <Field name="phone_number" label="Phone Number"  type="tel"      placeholder="+1 555 000 0000"      disabled={isPending} />
            <Field name="email"        label="Email"         type="email"    placeholder="you@example.com"      disabled={isPending} />
            <Field name="password"     label="Password"      type="password" placeholder="Min. 8 characters"   disabled={isPending} />

            {/* Invite code — visually highlighted */}
            <div>
              <label className="block text-[11px] font-bold tracking-wider text-[#6B7280] uppercase mb-1.5">
                Invite Code
              </label>
              <input
                name="invite_code"
                type="text"
                placeholder="e.g. BUDBIKE2025"
                required
                disabled={isPending}
                className="w-full rounded-xl border border-[#CEFF00]/30 bg-[#CEFF00]/5 px-4 py-3 text-sm text-[#CEFF00] placeholder:text-[#6B7280] font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-[#CEFF00]/50 disabled:opacity-50 transition"
              />
            </div>

            {/* Error feedback */}
            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-[#FFE5E5]/10 border border-[#FF3B30]/20 px-4 py-3 text-sm text-[#FF3B30]" role="alert">
                <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="mt-1 flex items-center justify-center gap-2 bg-[#CEFF00] text-[#0A0A0A] font-black rounded-xl px-4 py-3 text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {isPending ? <><Loader2 size={15} className="animate-spin" /> Joining…</> : 'Join the Club'}
            </button>

            <p className="text-center text-[#6B7280] text-xs">
              Already a member?{' '}
              <a href="/dashboard" className="text-white hover:underline">Sign in</a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  name, label, type, placeholder, disabled,
}: {
  name: string; label: string; type: string; placeholder: string; disabled: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold tracking-wider text-[#6B7280] uppercase mb-1.5">
        {label}
      </label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required
        disabled={disabled}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50 transition"
      />
    </div>
  );
}
