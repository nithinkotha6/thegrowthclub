'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redirect onboarding route directly to the main landing page sign-up tab.
 * This aligns the standalone page with the unified Kiosk-auth model.
 */
export default function SignupPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/?tab=signup');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <div className="text-white/60 font-bold text-sm tracking-widest uppercase animate-pulse">
        Redirecting to The Growth Club...
      </div>
    </div>
  );
}
