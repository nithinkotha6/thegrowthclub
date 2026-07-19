import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/server';
import { decodeSession, SESSION_COOKIE, type AppSession } from '@/lib/session';

type AdminSessionResult =
  | { session: AppSession; error: null }
  | { session: null; error: string };

/** Local admin-session guard, matching this repo's per-file convention
 * (each Server Action / route defines its own, rather than importing a
 * shared helper). Mirrors `requireAdminSession()` in app/actions/admin.ts. */
async function requireAdminSession(): Promise<AdminSessionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session) {
    return { session: null, error: 'Unauthorized: Session credentials mismatch.' };
  }

  const supabase = createAdminClient(session.groupId);
  const { data: membership } = await supabase
    .from('group_members')
    .select('role')
    .eq('user_id', session.userId)
    .eq('group_id', session.groupId)
    .maybeSingle();

  if (!membership || membership.role !== 'admin') {
    return { session: null, error: 'Unauthorized: admin role required for this group.' };
  }
  return { session, error: null };
}

/**
 * POST /api/push/send
 * Test/utility route: sends a push notification to a target member's
 * registered subscriptions. Admin-only (this is a skeleton for manual
 * testing / future automated triggers, not a public endpoint). Body:
 * { userId: string, title?: string, body?: string }
 *
 * Note: iOS Safari PWA push support is limited (requires iOS 16.4+, the
 * app installed to the home screen, and user-granted permission) — this
 * skeleton focuses on standard Web Push (Chrome/Android/desktop); iOS
 * install-to-home-screen UX is the primary supported PWA experience there.
 */
export async function POST(req: Request) {
  try {
    const { session, error: sessionError } = await requireAdminSession();
    if (!session) {
      return NextResponse.json({ error: sessionError }, { status: 401 });
    }

    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublic || !vapidPrivate) {
      return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 });
    }
    webpush.setVapidDetails('mailto:admin@thegrowthclub.app', vapidPublic, vapidPrivate);

    const body = await req.json();
    const targetUserId = body?.userId;
    const title = body?.title || 'The Growth Club';
    const message = body?.body || 'You have a new update!';

    if (!targetUserId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const supabase = createAdminClient(session.groupId);
    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('group_id', session.groupId)
      .eq('user_id', targetUserId);

    if (subsErr) {
      return NextResponse.json({ error: subsErr.message }, { status: 500 });
    }
    if (!subs || subs.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, note: 'No subscriptions registered for this user.' });
    }

    const payload = JSON.stringify({ title, body: message });
    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent += 1;
      } catch (pushErr) {
        console.error('[push/send] Delivery failed for one subscription:', pushErr);
        // Stale/expired subscription — remove it so future sends don't retry it.
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error('[push/send] Fatal error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
