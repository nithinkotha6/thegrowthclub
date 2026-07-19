import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing.');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * WHOOP OAuth 2.0 callback route.
 * Token URL: https://api.prod.whoop.com/oauth/oauth2/token (per
 * https://developer.whoop.com/docs/developing/oauth). Mirrors the
 * Fitbit/Google callback's state handling and connection upsert pattern.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const host = req.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirectBase = `${protocol}://${host}/dashboard/wearables`;

  if (error || !code || !state) {
    console.error('[Whoop Callback] Error or missing code/state:', { error, code, state });
    return NextResponse.redirect(`${redirectBase}?error=access_denied`);
  }

  const [userId, groupId] = state.split(':');
  if (!userId || !groupId) {
    console.error('[Whoop Callback] Malformed state parameter (expected userId:groupId):', state);
    return NextResponse.redirect(`${redirectBase}?error=access_denied`);
  }

  try {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const clientSecret = process.env.WHOOP_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('[Whoop Callback] Missing Whoop client credentials.');
      return NextResponse.redirect(`${redirectBase}?error=oauth_config_missing`);
    }

    const redirectUri = `${protocol}://${host}/api/wearables/callback/whoop`;

    const tokenResponse = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('[Whoop Callback] Token exchange failed:', errText);
      return NextResponse.redirect(`${redirectBase}?error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();

    const supabaseAdmin = getAdminClient();

    const { data: existing } = await supabaseAdmin
      .from('wearable_connections')
      .select('id, refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'whoop')
      .maybeSingle();

    const connData: any = {
      user_id: userId,
      group_id: groupId,
      provider: 'whoop',
      access_token: tokenData.access_token,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      status: 'active',
    };

    // WHOOP only issues a refresh_token when the `offline` scope was granted
    // (always requested here); preserve any existing one if this response
    // omits it (e.g. on a re-consent that doesn't re-issue it).
    if (tokenData.refresh_token) {
      connData.refresh_token = tokenData.refresh_token;
    } else if (existing?.refresh_token) {
      connData.refresh_token = existing.refresh_token;
    }

    if (!connData.refresh_token) {
      console.warn('[Whoop Callback] Warning: No refresh token received or found in database.');
    }

    let dbErr;
    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from('wearable_connections')
        .update(connData)
        .eq('id', existing.id);
      dbErr = error;
    } else {
      connData.last_synced_at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabaseAdmin
        .from('wearable_connections')
        .insert(connData);
      dbErr = error;
    }

    if (dbErr) {
      console.error('[Whoop Callback] Database connection write failed:', dbErr);
      return NextResponse.redirect(`${redirectBase}?error=database_write_failed`);
    }

    return NextResponse.redirect(`${redirectBase}?connected=true`);
  } catch (err: any) {
    console.error('[Whoop Callback] Fatal route handler exception:', err);
    return NextResponse.redirect(`${redirectBase}?error=server_error`);
  }
}
