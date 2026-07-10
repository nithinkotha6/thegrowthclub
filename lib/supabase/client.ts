import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for Client Components.
 * Instantiated once per render; safe to call inside 'use client' files.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
