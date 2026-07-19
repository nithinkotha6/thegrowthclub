import { redirect } from 'next/navigation';

/**
 * Redirect onboarding route directly to the main landing page sign-up tab.
 * This aligns the standalone page with the unified Kiosk-auth model.
 * Server-side redirect — ships no client JS bundle.
 */
export default function SignupPage() {
  redirect('/?tab=signup');
}
