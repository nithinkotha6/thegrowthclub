import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';

export async function GET(req: Request) {
  try {
    // 1. Verify user authentication via Supabase cookie session
    const cookieStore = await cookies();
    const token       = cookieStore.get(SESSION_COOKIE)?.value;
    const session     = token ? await decodeSession(token) : null;
    
    if (!session || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized user session.' }, { status: 401 });
    }

    const userId = session.userId;

    // 2. Read Google Client Credentials
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error('[Google Connect] GOOGLE_CLIENT_ID is missing from environment.');
      return NextResponse.json({ error: 'OAuth credentials not configured.' }, { status: 500 });
    }

    // 3. Dynamically construct redirect URI
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/api/wearables/callback/google`;

    // 4. Construct URL
    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', clientId);
    googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('access_type', 'offline');
    googleAuthUrl.searchParams.set('prompt', 'consent');
    // State carries both userId and groupId (see ISO-06) so the callback can
    // tag the new wearable_connections row with the caller's own group.
    googleAuthUrl.searchParams.set('state', `${userId}:${session.groupId}`);
    const scopes = [
      'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
      'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
    ].join(' ');

    googleAuthUrl.searchParams.set('scope', scopes);

    return NextResponse.redirect(googleAuthUrl.toString());
  } catch (err: any) {
    console.error('[Google Connect] Direct handler crash:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
