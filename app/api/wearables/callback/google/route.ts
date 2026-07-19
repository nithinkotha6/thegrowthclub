import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Get admin client helper
function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing.');
  }
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // State contains the userId
  const error = searchParams.get('error');

  // Determine redirection hosts
  const host = req.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirectBase = `${protocol}://${host}/dashboard/wearables`;

  // 1. Handle error params from Google consent callback screen
  if (error || !code || !state) {
    console.error('[Google Callback] Error or missing code/state:', { error, code, state });
    return NextResponse.redirect(`${redirectBase}?error=access_denied`);
  }

  // State carries `userId:groupId` (see ISO-06) so this callback can tag the
  // new wearable_connections row with the caller's own group.
  const [userId, groupId] = state.split(':');
  if (!userId || !groupId) {
    console.error('[Google Callback] Malformed state parameter (expected userId:groupId):', state);
    return NextResponse.redirect(`${redirectBase}?error=access_denied`);
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.error('[Google Callback] Missing Google client credentials.');
      return NextResponse.redirect(`${redirectBase}?error=oauth_config_missing`);
    }

    const redirectUri = `${protocol}://${host}/api/wearables/callback/google`;

    // 2. Server-side token exchange request
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
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
      console.error('[Google Callback] Token exchange failed:', errText);
      return NextResponse.redirect(`${redirectBase}?error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();

    // 3. Initialize Admin Client
    const supabaseAdmin = getAdminClient();

    // 4. Retrieve existing connection if it exists to preserve refresh_token
    const { data: existing } = await supabaseAdmin
      .from('wearable_connections')
      .select('id, refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'fitbit')
      .maybeSingle();

    const connData: any = {
      user_id: userId,
      group_id: groupId,
      provider: 'fitbit',
      access_token: tokenData.access_token,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      status: 'active',
    };

    // If Google Fit did not return a refresh_token, preserve the existing one
    if (tokenData.refresh_token) {
      connData.refresh_token = tokenData.refresh_token;
    } else if (existing?.refresh_token) {
      connData.refresh_token = existing.refresh_token;
    }

    if (!connData.refresh_token) {
      console.warn('[Google Callback] Warning: No refresh token received or found in database.');
    }

    let dbErr;
    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from('wearable_connections')
        .update(connData)
        .eq('id', existing.id);
      dbErr = error;
    } else {
      // Default sync start is 24 hours ago
      connData.last_synced_at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabaseAdmin
        .from('wearable_connections')
        .insert(connData);
      dbErr = error;
    }

    if (dbErr) {
      console.error('[Google Callback] Database connection write failed:', dbErr);
      return NextResponse.redirect(`${redirectBase}?error=database_write_failed`);
    }

    return NextResponse.redirect(`${redirectBase}?connected=true`);
  } catch (err: any) {
    console.error('[Google Callback] Fatal route handler exception:', err);
    return NextResponse.redirect(`${redirectBase}?error=server_error`);
  }
}
