import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * OTHER-05: Lightweight health check. No auth — the response reveals
 * nothing sensitive, just liveness + a DB round-trip check with a timeout
 * so this endpoint can't hang indefinitely if the database is unreachable.
 */
export async function GET() {
  let db: 'ok' | 'error' = 'error';

  try {
    const supabase = createAdminClient();
    const query = supabase.from('groups').select('id').limit(1);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('db timeout')), 2000)
    );

    const { error } = await Promise.race([query, timeout]);
    db = error ? 'error' : 'ok';
  } catch {
    db = 'error';
  }

  return NextResponse.json({ ok: true, ts: Date.now(), db });
}
