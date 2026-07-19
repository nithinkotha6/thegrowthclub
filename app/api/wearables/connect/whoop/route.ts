import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';

/**
 * WHOOP OAuth 2.0 connect route.
 * Docs: https://developer.whoop.com/docs/developing/oauth
 * - Authorization URL: https://api.prod.whoop.com/oauth/oauth2/auth
 * - Scopes requested: read:recovery (resting heart rate, HRV), read:sleep
 *   (sleep stage durations), offline (required to receive a refresh token).
 *
 * Note: WHOOP's API is identical across every hardware generation (3.0, 4.0,
 * 5.0, MG) — there is no per-model API variant, so no device-model selector
 * is needed here. WHOOP also does not track step count at all (it has no
 * accelerometer-based step metric), so this connection only ever populates
 * sleep and resting-heart-rate data, never `wearable_steps` — see
 * app/api/cron/sync-wearables/route.ts `syncWhoop`.
 */
export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const session = token ? await decodeSession(token) : null;

    if (!session || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized user session.' }, { status: 401 });
    }

    const clientId = process.env.WHOOP_CLIENT_ID;
    if (!clientId) {
      console.error('[Whoop Connect] WHOOP_CLIENT_ID is missing from environment.');
      return NextResponse.json({ error: 'OAuth credentials not configured.' }, { status: 500 });
    }

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/api/wearables/callback/whoop`;

    const whoopAuthUrl = new URL('https://api.prod.whoop.com/oauth/oauth2/auth');
    whoopAuthUrl.searchParams.set('client_id', clientId);
    whoopAuthUrl.searchParams.set('redirect_uri', redirectUri);
    whoopAuthUrl.searchParams.set('response_type', 'code');
    // State carries userId:groupId (mirrors the Google/Fitbit connect route)
    // so the callback can tag the new wearable_connections row correctly.
    whoopAuthUrl.searchParams.set('state', `${session.userId}:${session.groupId}`);
    whoopAuthUrl.searchParams.set('scope', 'read:recovery read:sleep offline');

    return NextResponse.redirect(whoopAuthUrl.toString());
  } catch (err: any) {
    console.error('[Whoop Connect] Direct handler crash:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
