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
 * Proactively refreshes the Fitbit Web access token.
 */
async function refreshFitbitWebAccessToken(connection: any): Promise<string | null> {
  const expiresAt = new Date(connection.expires_at);
  const now = new Date();

  // Refresh if expired or expiring in less than 5 minutes (300,000ms)
  const isExpiring = expiresAt.getTime() - now.getTime() < 300000;

  if (!isExpiring) {
    return connection.access_token;
  }

  console.log(`[Wearables Sync] Refreshing Fitbit Web access token for user ${connection.user_id}...`);

  const clientId = process.env.FITBIT_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      `[Wearables Sync] ERROR refreshing token for user ${connection.user_id}: Fitbit OAuth credentials not configured in process environment.`
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
    const authHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://api.fitbit.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: authHeader,
      },
      body: new URLSearchParams({
        refresh_token: connection.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(
        `[Wearables Sync] ERROR refreshing Fitbit Web token for user ${connection.user_id}:`,
        errText
      );
      return null;
    }

    const data = await response.json();
    const newAccessToken = data.access_token;
    const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    const supabaseAdmin = createAdminClient();
    const { error: updateErr } = await supabaseAdmin
      .from('wearable_connections')
      .update({
        access_token: newAccessToken,
        expires_at: newExpiresAt,
        refresh_token: data.refresh_token || connection.refresh_token,
      })
      .eq('id', connection.id);

    if (updateErr) {
      console.error(`[Wearables Sync] Failed to save refreshed Fitbit Web credentials:`, updateErr);
      return null;
    }

    console.log(
      `[Wearables Sync] Successfully refreshed Fitbit Web token for user ${connection.user_id}. New expiry: ${newExpiresAt}`
    );
    return newAccessToken;
  } catch (err: any) {
    console.error(
      `[Wearables Sync] ERROR refreshing Fitbit Web token for user ${connection.user_id}:`,
      err?.message || err
    );
    return null;
  }
}

/**
 * Sync process for native Fitbit Web Cloud (api.fitbit.com)
 */
async function syncFitbitCloud(connection: any): Promise<number> {
  const supabaseAdmin = createAdminClient();
  const userId = connection.user_id;

  const accessToken = await refreshFitbitWebAccessToken(connection);
  if (!accessToken) {
    console.warn(`[Wearables Sync] Skipping user ${userId} due to Fitbit Web token refresh failure.`);
    return 0;
  }

  const isBackfill = connection.backfill_completed !== true;
  let startTimeMillis: number;
  let endTimeMillis: number;

  if (isBackfill) {
    console.log('[Wearables Tier 1] Initiating native Fitbit Cloud 2026 Historical Backfill for user:', userId);
    const startOf2026 = new Date(2026, 0, 1, 0, 0, 0, 0);
    startTimeMillis = startOf2026.getTime();
    endTimeMillis = Date.now();
  } else {
    console.log('[Wearables Tier 2] Executing routine Fitbit Cloud daily cumulative sync for user:', userId);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startTimeMillis = startOfToday.getTime();
    endTimeMillis = now.getTime();
  }

  const stepsPayloads: any[] = [];
  const sleepPayloads: any[] = [];
  const hrPayloads: any[] = [];

  const startDateStr = new Date(startTimeMillis).toISOString().split('T')[0];
  const endDateStr = new Date(endTimeMillis).toISOString().split('T')[0];

  let hasApiError = false;

  try {
    // 1. Fetch Steps from tracker steps endpoint
    const stepsRes = await fetch(
      `https://api.fitbit.com/1/user/-/activities/tracker/steps/date/${startDateStr}/${endDateStr}.json`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (stepsRes.ok) {
      const data = await stepsRes.json();
      console.log('[Wearables Sync] Fitbit Cloud Raw Steps Response:', JSON.stringify(data, null, 2));
      const arr = data['activities-tracker-steps'] || [];
      for (const item of arr) {
        const stepsVal = parseInt(item.value);
        if (stepsVal > 0) {
          stepsPayloads.push({
            user_id: userId,
            connection_id: connection.id,
            logged_date: item.dateTime,
            value: stepsVal,
            source: 'fitbit_cloud',
          });
        }
      }
    } else {
      console.error(`[Wearables Sync Fitbit] Steps fetch failed:`, await stepsRes.text());
      hasApiError = true;
    }

    // 2. Fetch Sleep duration (V1.2)
    const sleepRes = await fetch(
      `https://api.fitbit.com/1.2/user/-/sleep/date/${startDateStr}/${endDateStr}.json`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (sleepRes.ok) {
      const data = await sleepRes.json();
      console.log('[Wearables Sync] Fitbit Cloud Raw Sleep Response:', JSON.stringify(data, null, 2));
      const arr = data.sleep || [];
      const sleepByDay: Record<string, number> = {};
      for (const item of arr) {
        const dateKey = item.dateOfSleep;
        const hrs = (item.duration || 0) / (1000 * 60 * 60);
        sleepByDay[dateKey] = (sleepByDay[dateKey] || 0) + hrs;
      }
      for (const [day, hrs] of Object.entries(sleepByDay)) {
        if (hrs > 0) {
          sleepPayloads.push({
            user_id: userId,
            connection_id: connection.id,
            logged_date: day,
            value: Math.round(hrs * 10) / 10,
            source: 'fitbit_cloud',
          });
        }
      }
    } else {
      console.error(`[Wearables Sync Fitbit] Sleep fetch failed:`, await sleepRes.text());
      hasApiError = true;
    }

    // 3. Fetch Heart Rate zones and resting HR summary
    const hrRes = await fetch(
      `https://api.fitbit.com/1/user/-/activities/heart/date/${startDateStr}/${endDateStr}.json`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (hrRes.ok) {
      const data = await hrRes.json();
      console.log('[Wearables Sync] Fitbit Cloud Raw Heart Response:', JSON.stringify(data, null, 2));
      const arr = data['activities-heart'] || [];
      for (const item of arr) {
        const hrVal = item.value?.restingHeartRate;
        if (hrVal && hrVal > 0) {
          hrPayloads.push({
            user_id: userId,
            connection_id: connection.id,
            logged_date: item.dateTime,
            value: Math.round(hrVal),
            source: 'fitbit_cloud',
          });
        }
      }
    } else {
      console.error(`[Wearables Sync Fitbit] Heart rate fetch failed:`, await hrRes.text());
      hasApiError = true;
    }
  } catch (err) {
    console.error(`[Wearables Sync Fitbit] Exception in fetch calls:`, err);
    hasApiError = true;
  }

  let hasDbError = false;
  const totalExtracted = stepsPayloads.length + sleepPayloads.length + hrPayloads.length;
  const isEmptyData = totalExtracted === 0;

  if (isEmptyData) {
    console.warn(`[Wearables Sync] Empty-Data Gate triggered. No records extracted for user ${userId}.`);
  }

  // Ingest parsed records strictly if there are logs and no API errors occurred to guarantee transactional safety
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
    console.log(`[Wearables Tier 1] Marked Fitbit Cloud backfill completed successfully for user ${userId}`);
  }

  return (hasApiError || hasDbError || isEmptyData) ? 0 : totalExtracted;
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

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  let currentStart = startTimeMillis;
  let hasApiError = false;

  // Chunking v4 rollup requests into 30-day windows to avoid long latency ranges
  while (currentStart < endTimeMillis) {
    const currentEnd = Math.min(currentStart + THIRTY_DAYS_MS, endTimeMillis);
    console.log(`[Wearables Sync Chunk] Fetching Health v4 chunk: ${new Date(currentStart).toISOString()} to ${new Date(currentEnd).toISOString()}`);

    const startDate = new Date(currentStart);
    const endDate = new Date(currentEnd);

    const payload = {
      start: {
        year: startDate.getUTCFullYear(),
        month: startDate.getUTCMonth() + 1,
        day: startDate.getUTCDate(),
        hours: 0, minutes: 0, seconds: 0
      },
      end: {
        year: endDate.getUTCFullYear(),
        month: endDate.getUTCMonth() + 1,
        day: endDate.getUTCDate(),
        hours: 23, minutes: 59, seconds: 59
      },
      pageSize: 1000
    };

    try {
      // 1. Fetch Steps Daily Rollup
      const stepsUrl = 'https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp';
      const stepsRes = await fetch(stepsUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (stepsRes.ok) {
        const data = await stepsRes.json();
        console.log('[Wearables Sync] Google Health v4 Raw Steps Response:', JSON.stringify(data, null, 2));
        if (data.dailyRollupDataPoints) {
          data.dailyRollupDataPoints.forEach((point: any) => {
            const val = point.value?.steps?.countSum ?? 0;
            if (val > 0) {
              const dateStr = `${point.start.year}-${String(point.start.month).padStart(2, '0')}-${String(point.start.day).padStart(2, '0')}`;
              stepsPayloads.push({
                user_id: userId,
                connection_id: connection.id,
                logged_date: dateStr,
                value: val,
                source: 'google_health_v4',
              });
            }
          });
        }
      } else {
        console.error(`[Wearables Sync Google] Steps rollup failed:`, await stepsRes.text());
        hasApiError = true;
        break;
      }

      // 2. Fetch Sleep Daily Rollup
      const sleepUrl = 'https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints:dailyRollUp';
      const sleepRes = await fetch(sleepUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (sleepRes.ok) {
        const data = await sleepRes.json();
        console.log('[Wearables Sync] Google Health v4 Raw Sleep Response:', JSON.stringify(data, null, 2));
        if (data.dailyRollupDataPoints) {
          data.dailyRollupDataPoints.forEach((point: any) => {
            const sleepObj = point.value?.sleep;
            if (sleepObj) {
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
                const dateStr = `${point.start.year}-${String(point.start.month).padStart(2, '0')}-${String(point.start.day).padStart(2, '0')}`;
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
        }
      } else {
        console.error(`[Wearables Sync Google] Sleep rollup failed:`, await sleepRes.text());
        hasApiError = true;
        break;
      }

      // 3. Fetch Resting HR Daily Rollup
      const hrUrl = 'https://health.googleapis.com/v4/users/me/dataTypes/daily-resting-heart-rate/dataPoints:dailyRollUp';
      const hrRes = await fetch(hrUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (hrRes.ok) {
        const data = await hrRes.json();
        console.log('[Wearables Sync] Google Health v4 Raw Heart Response:', JSON.stringify(data, null, 2));
        if (data.dailyRollupDataPoints) {
          data.dailyRollupDataPoints.forEach((point: any) => {
            const hrObj = point.value?.['daily-resting-heart-rate'] || point.value?.restingHeartRate || point.value?.resting_heart_rate;
            if (hrObj) {
              const hrVal = hrObj.bpm || hrObj.restingHeartRate || hrObj.resting_heart_rate || hrObj.value || 0;
              if (hrVal > 0) {
                const dateStr = `${point.start.year}-${String(point.start.month).padStart(2, '0')}-${String(point.start.day).padStart(2, '0')}`;
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
        }
      } else {
        console.error(`[Wearables Sync Google] Heart rate rollup failed:`, await hrRes.text());
        hasApiError = true;
        break;
      }
    } catch (err) {
      console.error(`[Wearables Sync Chunk Error] Network exception during chunk fetch:`, err);
      hasApiError = true;
      break;
    }

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
            console.log(`[Wearables Debug] Routing user ${connection.user_id} (Provider: fitbit) to native syncFitbitCloud`);
            inserts = await syncFitbitCloud(connection);
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
