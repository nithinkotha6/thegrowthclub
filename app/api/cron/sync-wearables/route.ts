import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { safeCompare } from '@/lib/security';

/**
 * Env-var fallback wearable connections.
 *
 * The self-service "Connect Fitbit"/"Connect Whoop" OAuth flow (see
 * app/api/wearables/connect/**) is the primary, default way a member links
 * a device — it needs no code change or redeploy per person. This adds a
 * SECONDARY override for members who instead hand you a refresh token they
 * obtained manually (e.g. via Postman) from that provider's own OAuth flow:
 * set a Vercel env var named `WEARABLE_KEY_<PROVIDER>_<NICKNAME>` (provider
 * is `WHOOP` or `FITBIT`; nickname is upper-cased with non A-Z0-9
 * characters stripped, e.g. `WEARABLE_KEY_WHOOP_NITHIN`).
 *
 * Only a refresh token works here — WHOOP/Google access tokens expire in
 * ~1 hour, so a raw access token would silently stop syncing within an hour.
 * The value must be a refresh token; this cron uses the existing shared
 * WHOOP_CLIENT_ID/WHOOP_CLIENT_SECRET or GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET
 * app credentials (the same ones the OAuth flow already uses) to mint fresh
 * access tokens from it on every run, exactly like a normal DB-backed
 * connection — this fallback only auto-provisions the initial
 * `wearable_connections` row the first time; every run after that just
 * looks like an ordinary connection and self-heals through the same
 * refresh/sync functions.
 *
 * This never overrides an existing row — if the member has already
 * connected via the real OAuth flow, that row wins and the env var is
 * ignored for them.
 */
function sanitizeEnvKeySegment(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function provisionEnvFallbackConnections(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  groupId: string,
  existingConnections: any[],
): Promise<any[]> {
  const { data: members, error: membersErr } = await supabaseAdmin
    .from('group_members')
    .select('user_id, profiles!inner ( id, nickname, full_name )')
    .eq('group_id', groupId);

  if (membersErr || !members) {
    if (membersErr) console.error('[Wearables Cron] Env-fallback member lookup failed:', membersErr);
    return [];
  }

  const hasConnection = (userId: string, provider: string) =>
    existingConnections.some((c) => c.user_id === userId && (c.provider === provider || (provider === 'fitbit' && c.provider === 'google_fit')));

  const provisioned: any[] = [];

  for (const m of members) {
    const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (!profile) continue;
    const nameSegment = sanitizeEnvKeySegment(profile.nickname || profile.full_name || '');
    if (!nameSegment) continue;

    for (const provider of ['whoop', 'fitbit'] as const) {
      if (hasConnection(profile.id, provider)) continue;

      const envKey = `WEARABLE_KEY_${provider.toUpperCase()}_${nameSegment}`;
      const refreshToken = process.env[envKey];
      if (!refreshToken) continue;

      console.log(`[Wearables Cron] Provisioning env-fallback ${provider} connection for user ${profile.id} from ${envKey}`);

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('wearable_connections')
        .insert({
          user_id: profile.id,
          group_id: groupId,
          provider,
          refresh_token: refreshToken,
          access_token: '',
          // Already-expired so the first sync immediately exchanges the
          // refresh token for a real access token via the normal refresh path.
          expires_at: new Date(0).toISOString(),
          status: 'active',
          backfill_completed: false,
          last_synced_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('*')
        .single();

      if (insertErr) {
        console.error(`[Wearables Cron] Failed to provision env-fallback connection (${envKey}):`, insertErr);
        continue;
      }

      provisioned.push(inserted);
    }
  }

  return provisioned;
}

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
 * Sync process for Google Health API v4 (daily rollup consolidation & list details)
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

  // Dynamic fetcher that selects the correct action and HTTP method based on DataType
  const fetchGoogleHealthData = async (dataType: string, chunkStart: Date, chunkEnd: Date) => {
    // Determine the correct action: steps/resting-hr use dailyRollUp, sleep uses GET list
    const isRollup = (dataType === 'steps' || dataType === 'daily-resting-heart-rate' || dataType === 'heart-rate');
      
    if (isRollup) {
      const url = `https://health.googleapis.com/v4/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`;
      const body = {
        range: {
          start: {
            date: { year: chunkStart.getUTCFullYear(), month: chunkStart.getUTCMonth() + 1, day: chunkStart.getUTCDate() },
            time: { hours: 0, minutes: 0, seconds: 0 }
          },
          end: {
            date: { year: chunkEnd.getUTCFullYear(), month: chunkEnd.getUTCMonth() + 1, day: chunkEnd.getUTCDate() },
            time: { hours: 0, minutes: 0, seconds: 0 }
          }
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Google Health API Error: ${res.status} - ${errorText}`);
        throw new Error(`Google Health API Error: ${res.status} - ${errorText}`);
      }

      const json = await res.json();
      return json.rollupDataPoints || json.dailyRollupDataPoints || json.dataPoints || [];
    } else {
      // Sleep (or other dataTypes) uses GET list
      const startStr = chunkStart.toISOString();
      const endStr = chunkEnd.toISOString();
      const filter = `${dataType}.interval.end_time >= "${startStr}" AND ${dataType}.interval.end_time < "${endStr}"`;
      const url = `https://health.googleapis.com/v4/users/me/dataTypes/${dataType}/dataPoints?filter=${encodeURIComponent(filter)}`;

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Google Health API Error: ${res.status} - ${errorText}`);
        throw new Error(`Google Health API Error: ${res.status} - ${errorText}`);
      }

      const json = await res.json();
      return json.rollupDataPoints || json.dailyRollupDataPoints || json.dataPoints || [];
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

    try {
      // 1. Fetch Steps (:dailyRollUp)
      const stepsPoints = await fetchGoogleHealthData('steps', currentStart, currentEnd);
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

      // 2. Fetch Sleep (GET list)
      const sleepPoints = await fetchGoogleHealthData('sleep', currentStart, currentEnd);
      const sleepByDay: Record<string, number> = {};
      sleepPoints.forEach((point: any) => {
        const sleepObj = point.value?.sleep;
        const startObj = point.start || point.range?.start;
        let dateStr = '';
        if (startObj?.date) {
          dateStr = `${startObj.date.year}-${String(startObj.date.month).padStart(2, '0')}-${String(startObj.date.day).padStart(2, '0')}`;
        } else if (point.startTime) {
          dateStr = point.startTime.split('T')[0];
        }

        if (sleepObj && dateStr) {
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
            sleepByDay[dateStr] = (sleepByDay[dateStr] || 0) + sleepVal;
          }
        }
      });

      for (const [day, val] of Object.entries(sleepByDay)) {
        sleepPayloads.push({
          user_id: userId,
          connection_id: connection.id,
          logged_date: day,
          value: Math.round(val * 10) / 10,
          source: 'google_health_v4',
        });
      }

      // 3. Fetch Heart Rate (:dailyRollUp)
      const hrPoints = await fetchGoogleHealthData('daily-resting-heart-rate', currentStart, currentEnd);
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
    } catch (err) {
      console.error(`[Wearables Sync Chunk Error] Failed to fetch Health v4 data:`, err);
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
 * Proactively refreshes the WHOOP access token if expired or expiring within
 * 5 minutes. Docs: https://developer.whoop.com/docs/developing/oauth
 * WHOOP invalidates the previous refresh token on every refresh — the new
 * one from the response MUST be persisted or the next refresh will fail.
 */
async function refreshWhoopAccessToken(connection: any): Promise<string | null> {
  const expiresAt = new Date(connection.expires_at);
  const now = new Date();
  const isExpiring = expiresAt.getTime() - now.getTime() < 300000;

  if (!isExpiring) {
    return connection.access_token;
  }

  console.log(`[Wearables Sync] Refreshing WHOOP access token for user ${connection.user_id}...`);

  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(`[Wearables Sync] ERROR refreshing WHOOP token for user ${connection.user_id}: WHOOP OAuth credentials not configured.`);
    return null;
  }
  if (!connection.refresh_token) {
    console.error(`[Wearables Sync] ERROR refreshing WHOOP token for user ${connection.user_id}: No refresh token available in database.`);
    return null;
  }

  try {
    const response = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: connection.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'offline',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Wearables Sync] ERROR refreshing WHOOP token for user ${connection.user_id}:`, errText);
      return null;
    }

    const data = await response.json();
    const newAccessToken = data.access_token;
    const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    const supabaseAdmin = createAdminClient();
    // WHOOP invalidates the old refresh_token on every use — persist the new one too.
    const { error: updateErr } = await supabaseAdmin
      .from('wearable_connections')
      .update({
        access_token: newAccessToken,
        refresh_token: data.refresh_token || connection.refresh_token,
        expires_at: newExpiresAt,
      })
      .eq('id', connection.id);

    if (updateErr) {
      console.error(`[Wearables Sync] Failed to save refreshed WHOOP credentials:`, updateErr);
      return null;
    }

    console.log(`[Wearables Sync] Successfully refreshed WHOOP token for user ${connection.user_id}. New expiry: ${newExpiresAt}`);
    return newAccessToken;
  } catch (err: any) {
    console.error(`[Wearables Sync] ERROR refreshing WHOOP token for user ${connection.user_id}:`, err?.message || err);
    return null;
  }
}

/**
 * Sync process for WHOOP via the real WHOOP API v2
 * (https://developer.whoop.com/api). Fetches `GET /v2/recovery` (resting
 * heart rate) and `GET /v2/activity/sleep` (sleep stage durations),
 * paginating via `next_token` until the requested date range is covered.
 *
 * Accuracy note: WHOOP hardware (3.0/4.0/5.0/MG) all share this same API —
 * no per-model branching is needed. WHOOP does NOT measure step count (no
 * accelerometer step metric exists in its data model), so this function
 * intentionally never writes to `wearable_steps` for Whoop connections
 * rather than fabricating a number the device doesn't actually produce.
 */
async function syncWhoop(connection: any): Promise<number> {
  const supabaseAdmin = createAdminClient();
  const userId = connection.user_id;
  const now = new Date();

  const accessToken = await refreshWhoopAccessToken(connection);
  if (!accessToken) {
    console.warn(`[Wearables Sync] Skipping user ${userId} due to WHOOP OAuth token refresh failure.`);
    return 0;
  }

  const isBackfill = connection.backfill_completed !== true;
  const start = isBackfill ? new Date(2026, 0, 1) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);

  if (isBackfill) {
    console.log('[Wearables Tier 1] Initiating historical backfill for WHOOP user:', userId);
  } else {
    console.log('[Wearables Tier 2] Executing routine daily sync for WHOOP user:', userId);
  }

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  /** Paginates a WHOOP v2 collection endpoint across the [start, now] window. */
  async function fetchAllRecords(path: string): Promise<any[]> {
    const records: any[] = [];
    let nextToken: string | undefined;
    do {
      const url = new URL(`https://api.prod.whoop.com${path}`);
      url.searchParams.set('start', start.toISOString());
      url.searchParams.set('end', now.toISOString());
      url.searchParams.set('limit', '25');
      if (nextToken) url.searchParams.set('nextToken', nextToken);

      const res = await fetch(url.toString(), { headers: authHeaders });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Wearables Sync] WHOOP ${path} fetch failed for user ${userId}:`, res.status, errText);
        break;
      }
      const data = await res.json();
      records.push(...(data.records || []));
      nextToken = data.next_token;
    } while (nextToken);
    return records;
  }

  const [recoveries, sleeps] = await Promise.all([
    fetchAllRecords('/v2/recovery'),
    fetchAllRecords('/v2/activity/sleep'),
  ]);

  // Resting heart rate: one row per day, keyed off the recovery's sleep date.
  const hrPayloads = recoveries
    .filter((r) => r.score_state === 'SCORED' && typeof r.score?.resting_heart_rate === 'number')
    .map((r) => ({
      user_id: userId,
      connection_id: connection.id,
      logged_date: new Date(r.created_at).toISOString().split('T')[0],
      value: r.score.resting_heart_rate,
      source: 'wearable_sync',
    }));

  // Sleep duration: sum of light + slow-wave + REM stage time (excludes
  // awake time), converted from milliseconds to hours. `stage_summary`
  // fields per https://developer.whoop.com/api (Sleep schema).
  const sleepPayloads = sleeps
    .filter((s) => s.score_state === 'SCORED' && s.score?.stage_summary && !s.nap)
    .map((s) => {
      const stages = s.score.stage_summary;
      const totalMs =
        (stages.total_light_sleep_time_milli || 0) +
        (stages.total_slow_wave_sleep_time_milli || 0) +
        (stages.total_rem_sleep_time_milli || 0);
      return {
        user_id: userId,
        connection_id: connection.id,
        logged_date: new Date(s.start).toISOString().split('T')[0],
        value: Math.round((totalMs / 3600000) * 10) / 10,
        source: 'wearable_sync',
      };
    });

  let hasDbError = false;
  const totalExtracted = hrPayloads.length + sleepPayloads.length;
  const isEmptyData = totalExtracted === 0;

  if (isEmptyData) {
    console.warn(`[Wearables Sync] WHOOP Empty-Data Gate triggered for user ${userId}.`);
  } else {
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
 * Verifies CRON_SECRET token and queries all connection points, group by
 * group (see ISO-06) so no single job execution spans tenant boundaries.
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

    const { data: groups, error: groupsErr } = await supabaseAdmin
      .from('groups')
      .select('id, name')
      .order('created_at', { ascending: true });

    if (groupsErr) {
      console.error('[Wearables Cron] Query groups error:', groupsErr);
      return NextResponse.json({ error: groupsErr.message }, { status: 500 });
    }

    let usersProcessed = 0;
    let successfulInserts = 0;
    const errorsList: string[] = [];
    const processedGroups: { group: string; usersProcessed: number; inserts: number }[] = [];

    for (const group of groups || []) {
      const { data: connections, error: connErr } = await supabaseAdmin
        .from('wearable_connections')
        .select('*')
        .eq('group_id', group.id);

      if (connErr) {
        console.error(`[Wearables Cron] Query connections error for group ${group.name}:`, connErr);
        errorsList.push(`Group ${group.name}: ${connErr.message}`);
        continue;
      }

      // Auto-provision any WEARABLE_KEY_<PROVIDER>_<NICKNAME> env-var fallback
      // connections for members who don't already have a real OAuth-linked row.
      const allConnections = [...(connections || [])];
      const envFallbackConnections = await provisionEnvFallbackConnections(supabaseAdmin, group.id, allConnections);
      allConnections.push(...envFallbackConnections);

      let groupUsersProcessed = 0;
      let groupInserts = 0;

      // The Provider Switch Statement
      for (const connection of allConnections) {
        try {
          groupUsersProcessed++;
          let inserts = 0;
          switch (connection.provider) {
            case 'fitbit':
              console.log(`[Wearables Debug] Routing user ${connection.user_id} (Provider: fitbit, Group: ${group.name}) to native syncGoogleHealthV4`);
              inserts = await syncGoogleHealthV4(connection);
              break;
            case 'google_fit':
              console.log(`[Wearables Debug] Routing user ${connection.user_id} (Provider: google_fit, Group: ${group.name}) to native syncGoogleHealthV4`);
              inserts = await syncGoogleHealthV4(connection);
              break;
            case 'whoop':
              console.log(`[Wearables Debug] Routing user ${connection.user_id} (Group: ${group.name}) to syncWhoop`);
              inserts = await syncWhoop(connection);
              break;
            default:
              console.error(`[Wearables Debug] Unsupported provider: ${connection.provider}`);
          }
          groupInserts += inserts;
        } catch (error: any) {
          console.error(
            `[Wearables] Failed to sync ${connection.provider} for user ${connection.user_id} (Group: ${group.name}):`,
            error
          );
          errorsList.push(`Group ${group.name} / User ${connection.user_id} (${connection.provider}): ${error?.message || error}`);
        }
      }

      usersProcessed += groupUsersProcessed;
      successfulInserts += groupInserts;
      processedGroups.push({ group: group.name, usersProcessed: groupUsersProcessed, inserts: groupInserts });
    }

    return NextResponse.json({
      success: errorsList.length === 0,
      usersProcessed,
      successfulInserts,
      processedGroups,
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
