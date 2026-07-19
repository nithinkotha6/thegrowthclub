import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';

/**
 * POST /api/push/subscribe
 * Persists a browser PushSubscription for the logged-in member. Any
 * authenticated group member may register their own device — no admin
 * check needed, this only ever touches the caller's own row (upsert keyed
 * on the subscription's unique endpoint).
 */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const session = token ? await decodeSession(token) : null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 });
    }

    const supabase = createAdminClient(session.groupId);
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          group_id: session.groupId,
          user_id: session.userId,
          endpoint,
          p256dh,
          auth,
        },
        { onConflict: 'endpoint' }
      );

    if (error) {
      console.error('[push/subscribe] Upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[push/subscribe] Fatal error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** DELETE /api/push/subscribe — removes a subscription (e.g. on unsubscribe). */
export async function DELETE(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const session = token ? await decodeSession(token) : null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const endpoint = body?.endpoint;
    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    const supabase = createAdminClient(session.groupId);
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', session.userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
