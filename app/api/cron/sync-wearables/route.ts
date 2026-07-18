import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { safeCompare } from '@/lib/security';

/**
 * Proactively refreshes the Google Fit/Health Access Token if expired or expiring within 5 minutes.
 */
async function refreshGoogleAccessToken(connection: any): Promise<string | null> {
  const expiresAt = new Date(connection.expires_at);
  const now = new Date();

  // Refresh if expired or expiring in less than 5 minutes (300,000ms)
  const isExpiring = expiresAt.getTime() - now.getTime() < 300000;

  if (!isExpiring) {
    return connection.access_token;
  }

  console.log(`[Wearables Sync] Refreshing Google OAuth access token for user ${connection.user_id}...`);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      `[Wearables Sync] ERROR refreshing token for user ${connection.user_id}: Google OAuth credentials not configured in process environment.`
    );
    return null;
  }

  if (!connection.refresh_token) {
    console.error(
      `[Wearables Sync] ERROR refreshing token for user ${connection.user_id}: No refresh token available in database.`
    );
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: connection.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(
        `[Wearables Sync] ERROR refreshing Google OAuth token for user ${connection.user_id}:`,
        errText
      );
      return null;
    }

    const data = await response.json();
    const newAccessToken = data.access_token;
    const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    // Save updated credentials
    const supabaseAdmin = createAdminClient();
    const { error: updateErr } = await supabaseAdmin
      .from('wearable_connections')
      .update({
        access_token: newAccessToken,
        expires_at: newExpiresAt,
      })
      .eq('id', connection.id);

    if (updateErr) {
      console.error(`[Wearables Sync] Failed to save refreshed credentials:`, updateErr);
      return null;
    }

    console.log(
      `[Wearables Sync] Successfully refreshed Google Fit/Health token for user ${connection.user_id}. New expiry: ${newExpiresAt}`
    );
    return newAccessToken;
  } catch (err: any) {
    console.error(
      `[Wearables Sync] ERROR refreshing Google Fit/Health token for user ${connection.user_id}:`,
      err?.message || err
    );
    return null;
  }
}

/**
 * Sync process for Google Health API v4 (daily rollup consolidation)
 */
async function syncGoogleHealthV4(connection: any): Promise<number> {
  const supabaseAdmin = createAdminClient();
  const userId = connection.user_id;

  const accessToken = await refreshGoogleAccessToken(connection);
  if (!accessToken) {
    console.warn(`[Wearables Sync] Skipping user ${userId} due to Google OAuth token refresh failure.`);
    return 0;
  }

  // Automated OAuth Scope Verification Check
  try {
    const tokenInfoRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`);
    const tokenInfo = await tokenInfoRes.json();

    if (tokenInfo.error_description) {
      console.error(`[Wearables OAuth Audit] Token invalid or expired for user ${userId}:`, tokenInfo.error_description);
    } else {
      const grantedScopes = tokenInfo.scope ? tokenInfo.scope.split(' ') : [];
      const hasHealthActivity = grantedScopes.some((s: string) => s.includes('googlehealth.activity_and_fitness.readonly'));
      const hasHealthHr = grantedScopes.some((s: string) => s.includes('googlehealth.health_metrics_and_measurements.readonly'));
      const hasLegacyActivity = grantedScopes.some((s: string) => s.includes('fitness.activity.read'));

      console.log(`[Wearables OAuth Audit] User ${userId} Scope Check: HealthActivity=${hasHealthActivity} | HealthMetrics=${hasHealthHr} | LegacyActivity=${hasLegacyActivity}`);
      
      if (!hasHealthActivity) {
        console.error(`[Wearables OAuth Audit] CRITICAL: Access token lacks 'googlehealth.activity_and_fitness.readonly'. Google Health API v4 queries will return 403 Forbidden until the user re-authenticates!`);
      }
    }
  } catch (err) {
    console.error(`[Wearables OAuth Audit] Failed to verify token scopes:`, err);
  }

  const isBackfill = connection.backfill_completed !== true;
  let startTimeMillis: number;
  let endTimeMillis: number;

  if (isBackfill) {
    console.log('[Wearables Tier 1] Initiating chunked 2026 Google Health v4 Historical Backfill for user:', userId);
    // Start of Jan 1, 2026
    const startOf2026 = new Date(2026, 0, 1, 0, 0, 0, 0);
    startTimeMillis = startOf2026.getTime();
    endTimeMillis = Date.now();
  } else {
    console.log('[Wearables Tier 2] Executing routine Google Health v4 daily cumulative sync for user:', userId);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startTimeMillis = startOfToday.getTime();
    endTimeMillis = now.getTime();
  }

  const stepsPayloads: any[] = [];
  const sleepPayloads: any[] = [];
  const hrPayloads: any[] = [];

  let hasApiError = false;

  // Helper function to query v4 dailyRollUp
  const fetchRollUp = async (dataType: string, chunkStart: Date, chunkEnd: Date) => {
    const url = `https://health.googleapis.com/v4/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`;
    
    // Google Health API v4 requires a top-level "range" object containing CivilDateTime structures
    const body = {
      range: {
        start: {
          date: {
            year: chunkStart.getUTCFullYear(),
            month: chunkStart.getUTCMonth() + 1,
            day: chunkStart.getUTCDate()
          },
          time: { hours: 0, minutes: 0, seconds: 0 }
        },
        end: {
          date: {
            year: chunkEnd.getUTCFullYear(),
            month: chunkEnd.getUTCMonth() + 1,
            day: chunkEnd.getUTCDate()
          },
          time: { hours: 0, minutes: 0, seconds: 0 }
        }
      }
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      
      const json = await res.json();
      if (json.error) {
        console.error(`[Wearables Google Health v4 Error] (${dataType}):`, JSON.stringify(json.error));
        hasApiError = true;
        return [];
      }
      return json.rollupDataPoints || json.dailyRollupDataPoints || json.dataPoints || [];
    } catch (err) {
      console.error(`[Wearables Google Health v4 Exception] (${dataType}):`, err);
      hasApiError = true;
      return [];
    }
  };

  const MAX_CHUNK_DAYS = 30;
  let currentStart = new Date(startTimeMillis);
  const targetEnd = new Date(endTimeMillis);

  // Date-based chunking loop to strictly avoid INVALID_ROLLUP_QUERY_DURATION error on 90-day limit
  while (currentStart < targetEnd) {
    let currentEnd = new Date(currentStart);
    currentEnd.setDate(currentStart.getDate() + MAX_CHUNK_DAYS);

    if (currentEnd > targetEnd) {
      currentEnd = new Date(targetEnd);
    }

    console.log(`[Wearables Sync Chunk] Fetching Health v4 safe window: ${currentStart.toISOString()} to ${currentEnd.toISOString()}`);

    // 1. Fetch Steps
    const stepsPoints = await fetchRollUp('steps', currentStart, currentEnd);
    if (hasApiError) break;

    stepsPoints.forEach((point: any) => {
      const val = point.value?.steps?.countSum ?? 0;
      const startObj = point.start || point.range?.start;
      const year = startObj?.date?.year || startObj?.year;
      const month = startObj?.date?.month || startObj?.month;
      const day = startObj?.date?.day || startObj?.day;

      if (val > 0 && year && month && day) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        stepsPayloads.push({
          user_id: userId,
          connection_id: connection.id,
          logged_date: dateStr,
          value: val,
          source: 'google_health_v4',
        });
      }
    });

    // 2. Fetch Sleep
    const sleepPoints = await fetchRollUp('sleep', currentStart, currentEnd);
    if (hasApiError) break;

    sleepPoints.forEach((point: any) => {
      const sleepObj = point.value?.sleep;
      const startObj = point.start || point.range?.start;
      const year = startObj?.date?.year || startObj?.year;
      const month = startObj?.date?.month || startObj?.month;
      const day = startObj?.date?.day || startObj?.day;

      if (sleepObj && year && month && day) {
        const rawVal = sleepObj.durationSum || sleepObj.duration || sleepObj.durationSeconds || sleepObj.totalDurationSeconds || 0;
        let sleepVal = 0;
        if (typeof rawVal === 'string') {
          const num = parseFloat(rawVal);
          if (rawVal.endsWith('s')) {
            sleepVal = num / 3600;
          } else {
            sleepVal = num / 3600000;
          }
        } else if (typeof rawVal === 'number') {
          if (rawVal > 86400) {
            sleepVal = rawVal / 3600000; // ms
          } else {
            sleepVal = rawVal / 3600; // sec
          }
        }
        if (sleepVal > 0) {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          sleepPayloads.push({
            user_id: userId,
            connection_id: connection.id,
            logged_date: dateStr,
            value: Math.round(sleepVal * 10) / 10,
            source: 'google_health_v4',
          });
        }
      }
    });

    // 3. Fetch Heart Rate
    const hrPoints = await fetchRollUp('daily-resting-heart-rate', currentStart, currentEnd);
    if (hasApiError) break;

    hrPoints.forEach((point: any) => {
      const hrObj = point.value?.['daily-resting-heart-rate'] || point.value?.restingHeartRate || point.value?.resting_heart_rate;
      const startObj = point.start || point.range?.start;
      const year = startObj?.date?.year || startObj?.year;
      const month = startObj?.date?.month || startObj?.month;
      const day = startObj?.date?.day || startObj?.day;

      if (hrObj && year && month && day) {
        const hrVal = hrObj.bpm || hrObj.restingHeartRate || hrObj.resting_heart_rate || hrObj.value || 0;
        if (hrVal > 0) {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          hrPayloads.push({
            user_id: userId,
            connection_id: connection.id,
            logged_date: dateStr,
            value: Math.round(hrVal),
            source: 'google_health_v4',
          });
        }
      }
    });

    currentStart = currentEnd;
  }

  let hasDbError = false;
  const totalExtracted = stepsPayloads.length + sleepPayloads.length + hrPayloads.length;
  const isEmptyData = totalExtracted === 0;

  if (isEmptyData) {
    console.warn(`[Wearables Sync] Empty-Data Gate triggered. No records extracted for user ${userId}.`);
  }

  // Ingest parsed records only if there are logs and no API errors occurred to guarantee transactional safety
  if (!hasApiError && !isEmptyData) {
    // 1. Ingest Steps
    if (stepsPayloads.length > 0) {
      console.log(`[Wearables Audit] Committing to wearable_steps: ${stepsPayloads.length} rows`);
      const { error: stepsError } = await supabaseAdmin
        .from('wearable_steps')
        .upsert(stepsPayloads, { onConflict: 'user_id,logged_date' });
      if (stepsError) {
        console.error('[Wearables Audit] Steps Upsert Error:', JSON.stringify(stepsError));
        hasDbError = true;
      }
    }

    // 2. Ingest Sleep
    if (sleepPayloads.length > 0) {
      console.log(`[Wearables Audit] Committing to wearable_sleep: ${sleepPayloads.length} rows`);
      const { error: sleepError } = await supabaseAdmin
        .from('wearable_sleep')
        .upsert(sleepPayloads, { onConflict: 'user_id,logged_date' });
      if (sleepError) {
        console.error('[Wearables Audit] Sleep Upsert Error:', JSON.stringify(sleepError));
        hasDbError = true;
      }
    }

    // 3. Ingest Heart Rate
    if (hrPayloads.length > 0) {
      console.log(`[Wearables Audit] Committing to wearable_resting_hr: ${hrPayloads.length} rows`);
      const { error: hrError } = await supabaseAdmin
        .from('wearable_resting_hr')
        .upsert(hrPayloads, { onConflict: 'user_id,logged_date' });
      if (hrError) {
        console.error('[Wearables Audit] Heart Rate Upsert Error:', JSON.stringify(hrError));
        hasDbError = true;
      }
    }
  }

  // Update connection sync date and set backfill completed strictly if no api/db/empty errors occurred
  const nowIso = new Date().toISOString();
  const updateData: any = { last_synced_at: nowIso };
  if (isBackfill && !hasApiError && !hasDbError && !isEmptyData) {
    updateData.backfill_completed = true;
  }

  const { error: updateErr } = await supabaseAdmin
    .from('wearable_connections')
    .update(updateData)
    .eq('id', connection.id);

  if (updateErr) {
    console.error(`[Wearables Sync] Failed to update connection status:`, updateErr);
  } else if (isBackfill && !hasApiError && !hasDbError && !isEmptyData) {
    console.log(`[Wearables Tier 1] Marked Google Health v4 backfill completed successfully for user ${userId}`);
  }

  return (hasApiError || hasDbError || isEmptyData) ? 0 : totalExtracted;
}

/**
 * Sync process for Whoop (mock generation)
 */
async function syncWhoop(connection: any): Promise<number> {
  const supabaseAdmin = createAdminClient();
  const userId = connection.user_id;

  const now = new Date();

  const isBackfill = connection.backfill_completed !== true;
  const start = isBackfill ? new Date(2026, 0, 1) : new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (isBackfill) {
    console.log('[Wearables Tier 1] Initiating 2026 Historical Backfill for Whoop user:', userId);
  } else {
    console.log('[Wearables Tier 2] Executing routine daily cumulative sync for Whoop user:', userId);
  }

  const stepsPayloads: any[] = [];
  const sleepPayloads: any[] = [];
  const hrPayloads: any[] = [];
  const curr = new Date(start.getTime());

  // Generate 1 record per day up to today
  while (curr <= now) {
    const loggedDateStr = curr.toISOString().split('T')[0];
    const stepsVal = Math.round(1500 + Math.random() * 4000);
    const sleepVal = Math.round((6.0 + Math.random() * 3.0) * 10) / 10;
    const hrVal = Math.round(48 + Math.random() * 15);

    stepsPayloads.push({
      user_id: userId,
      connection_id: connection.id,
      logged_date: loggedDateStr,
      value: stepsVal,
      source: 'wearable_sync',
    });

    sleepPayloads.push({
      user_id: userId,
      connection_id: connection.id,
      logged_date: loggedDateStr,
      value: sleepVal,
      source: 'wearable_sync',
    });

    hrPayloads.push({
      user_id: userId,
      connection_id: connection.id,
      logged_date: loggedDateStr,
      value: hrVal,
      source: 'wearable_sync',
    });

    // Advance by 1 day
    curr.setDate(curr.getDate() + 1);
  }

  let hasDbError = false;
  const totalExtracted = stepsPayloads.length + sleepPayloads.length + hrPayloads.length;
  const isEmptyData = totalExtracted === 0;

  if (isEmptyData) {
    console.warn(`[Wearables Sync] Whoop Empty-Data Gate triggered.`);
  }

  if (!isEmptyData) {
    // 1. Ingest Steps
    if (stepsPayloads.length > 0) {
      console.log(`[Wearables Audit] Committing to wearable_steps: ${stepsPayloads.length} rows`);
      const { error: stepsError } = await supabaseAdmin
        .from('wearable_steps')
        .upsert(stepsPayloads, { onConflict: 'user_id,logged_date' });
      if (stepsError) {
        console.error('[Wearables Audit] Steps Upsert Error:', JSON.stringify(stepsError));
        hasDbError = true;
      }
    }

    // 2. Ingest Sleep
    if (sleepPayloads.length > 0) {
      console.log(`[Wearables Audit] Committing to wearable_sleep: ${sleepPayloads.length} rows`);
      const { error: sleepError } = await supabaseAdmin
        .from('wearable_sleep')
        .upsert(sleepPayloads, { onConflict: 'user_id,logged_date' });
      if (sleepError) {
        console.error('[Wearables Audit] Sleep Upsert Error:', JSON.stringify(sleepError));
        hasDbError = true;
      }
    }

    // 3. Ingest Heart Rate
    if (hrPayloads.length > 0) {
      console.log(`[Wearables Audit] Committing to wearable_resting_hr: ${hrPayloads.length} rows`);
      const { error: hrError } = await supabaseAdmin
        .from('wearable_resting_hr')
        .upsert(hrPayloads, { onConflict: 'user_id,logged_date' });
      if (hrError) {
        console.error('[Wearables Audit] Heart Rate Upsert Error:', JSON.stringify(hrError));
        hasDbError = true;
      }
    }
  }

  // Update connection state
  const updateData: any = { last_synced_at: now.toISOString() };
  if (isBackfill && !hasDbError && !isEmptyData) {
    updateData.backfill_completed = true;
  }

  await supabaseAdmin
    .from('wearable_connections')
    .update(updateData)
    .eq('id', connection.id);

  return hasDbError ? 0 : totalExtracted;
}

/**
 * GET route handler for cron sync triggers.
 * Verifies CRON_SECRET token and queries all connection points.
 */
export async function GET(req: Request) {
  try {
    // Bearer token verification
    const authHeader = req.headers.get('Authorization');
    const secret = process.env.CRON_SECRET;

    if (!secret || !authHeader || !safeCompare(authHeader, `Bearer ${secret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // Query all active connections
    const { data: connections, error: connErr } = await supabaseAdmin
      .from('wearable_connections')
      .select('*');

    if (connErr) {
      console.error('[Wearables Cron] Query connections error:', connErr);
      return NextResponse.json({ error: connErr.message }, { status: 500 });
    }

    const list = connections || [];
    let usersProcessed = 0;
    let successfulInserts = 0;
    const errorsList: string[] = [];

    // The Provider Switch Statement
    for (const connection of list) {
      try {
        usersProcessed++;
        let inserts = 0;
        switch (connection.provider) {
          case 'fitbit':
            console.log(`[Wearables Debug] Routing user ${connection.user_id} (Provider: fitbit) to native syncGoogleHealthV4`);
            inserts = await syncGoogleHealthV4(connection);
            break;
          case 'google_fit':
            console.log(`[Wearables Debug] Routing user ${connection.user_id} (Provider: google_fit) to native syncGoogleHealthV4`);
            inserts = await syncGoogleHealthV4(connection);
            break;
          case 'whoop':
            console.log(`[Wearables Debug] Routing user ${connection.user_id} to syncWhoop`);
            inserts = await syncWhoop(connection);
            break;
          default:
            console.error(`[Wearables Debug] Unsupported provider: ${connection.provider}`);
        }
        successfulInserts += inserts;
      } catch (error: any) {
        console.error(
          `[Wearables] Failed to sync ${connection.provider} for user ${connection.user_id}:`,
          error
        );
        errorsList.push(`User ${connection.user_id} (${connection.provider}): ${error?.message || error}`);
      }
    }

    return NextResponse.json({
      success: errorsList.length === 0,
      usersProcessed,
      successfulInserts,
      errors: errorsList,
    });
  } catch (err: any) {
    console.error('[Wearables Cron] Fatal route error:', err);
    return NextResponse.json(
      {
        success: false,
        usersProcessed: 0,
        successfulInserts: 0,
        errors: [err?.message || String(err)],
      },
      { status: 500 }
    );
  }
}
