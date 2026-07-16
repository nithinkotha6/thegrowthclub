import { createServerClient } from '@supabase/ssr';
import { createClient as createBaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession } from '@/lib/session';

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 * Uses @supabase/ssr to read/write cookies on the Next.js request context.
 * Automatically appends the x-group-id header to isolate PostgREST requests at the RLS database boundary.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  const groupId = session?.groupId;

  const headersObj: Record<string, string> = {};
  if (groupId) {
    headersObj['x-group-id'] = groupId;
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: headersObj,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );
}

/**
 * Centrally configured service role client to securely bypass RLS
 * on server-side queries (Server Actions, API Routes, Server Components).
 * Safely falls back to the anon client if SUPABASE_SERVICE_ROLE_KEY is not defined.
 */
export function createAdminClient(groupId?: string) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  
  const headersObj: Record<string, string> = {};
  if (groupId) {
    headersObj['x-group-id'] = groupId;
  }

  if (!serviceKey || serviceKey.trim() === '') {
    console.warn('[Supabase Server] WARNING: SUPABASE_SERVICE_ROLE_KEY is not defined. Falling back to anon client.');
    return createBaseClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: {
        headers: headersObj,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return createBaseClient(url, serviceKey, {
    global: {
      headers: headersObj,
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
