import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { safeCompare } from '@/lib/security';

/**
 * Helper to validate logs against metric_definitions in the database.
 * Logs the mapping attempt and throws console warnings if missing.
 */
async function validateMetricDefinitions(
  supabaseAdmin: any,
  logs: any[]
): Promise<{ verifiedLogs: any[]; slugToIdMap: Record<string, string> }> {
  const verifiedLogs: any[] = [];
  const slugToIdMap: Record<string, string> = {};

  const uniqueSlugs = Array.from(new Set(logs.map((l) => l.metric_slug)));

  for (const slug of uniqueSlugs) {
    const targetMetricName = slug;
    console.log('[Wearables Sync] Attempting to map activity to metric name:', targetMetricName);

    const { data: metricDef, error } = await supabaseAdmin
      .from('metric_definitions')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (error || !metricDef) {
      console.warn(
        `[Wearables Sync] CRITICAL: Could not find matching metric definition in DB for "${targetMetricName}". Skipping insert.`
      );
    } else {
      slugToIdMap[slug] = metricDef.id;
    }
  }

  for (const log of logs) {
    if (slugToIdMap[log.metric_slug]) {
      verifiedLogs.push(log);
    }
  }

  return { verifiedLogs, slugToIdMap };
}

/**
 * Proactively refreshes the Fitbit Access Token if expired or expiring within 5 minutes.
 */
async function refreshFitbitAccessToken(connection: any): Promise<string | null> {
  const expiresAt = new Date(connection.expires_at);
  const now = new Date();

  // Refresh if expired or expiring in less than 5 minutes (300,000ms)
  const isExpiring = expiresAt.getTime() - now.getTime() < 300000;

  if (!isExpiring) {
    return connection.access_token;
  }

  console.log(`[Wearables Sync] Refreshing access token for user ${connection.user_id}...`);

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
        `[Wearables Sync] ERROR refreshing token for user ${connection.user_id}:`,
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
      `[Wearables Sync] Successfully refreshed token for user ${connection.user_id}. New expiry: ${newExpiresAt}`
    );
    return newAccessToken;
  } catch (err: any) {
    console.error(
      `[Wearables Sync] ERROR refreshing token for user ${connection.user_id}:`,
      err?.message || err
    );
    return null;
  }
}

/**
 * Sync process for Fitbit (Google Fit rest pulls)
 */
async function syncFitbit(connection: any): Promise<number> {
  const supabaseAdmin = createAdminClient();
  const userId = connection.user_id;

  // Resolve user group
  const { data: member } = await supabaseAdmin
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!member || !member.group_id) {
    console.warn(`[Wearables Sync] User ${userId} has no active group member record.`);
    return 0;
  }

  const groupId = member.group_id;

  const accessToken = await refreshFitbitAccessToken(connection);
  if (!accessToken) {
    console.warn(`[Wearables Sync] Skipping user ${userId} due to token refresh failure.`);
    return 0;
  }

  const isBackfill = connection.backfill_completed !== true;
  let startTimeMillis: number;
  let endTimeMillis: number;

  if (isBackfill) {
    console.log('[Wearables Tier 1] Initiating 2026 Historical Backfill for user:', userId);
    // Start of Jan 1, 2026
    const startOf2026 = new Date(2026, 0, 1, 0, 0, 0, 0);
    startTimeMillis = startOf2026.getTime();
    endTimeMillis = Date.now();
  } else {
    console.log('[Wearables Tier 2] Executing routine daily cumulative sync for user:', userId);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startTimeMillis = startOfToday.getTime();
    endTimeMillis = now.getTime();
  }

  const insertLogs: any[] = [];

  // Unified Google Fit Aggregate Query
  try {
    const response = await fetch(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          aggregateBy: [
            { dataTypeName: 'com.google.step_count.delta' },
            { dataTypeName: 'com.google.sleep.segment' },
            { dataTypeName: 'com.google.heart_rate.bpm' }
          ],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis,
          endTimeMillis,
        }),
      }
    );

    if (response.ok) {
      const aggregateData = await response.json();
      console.log(
        '[Wearables Sync] Raw Google Fit Aggregate Response for user',
        userId,
        JSON.stringify(aggregateData, null, 2)
      );

      if (aggregateData.bucket) {
        for (const bucket of aggregateData.bucket) {
          const bucketStart = Number(bucket.startTimeMillis);
          const bucketDateStr = new Date(bucketStart).toISOString();

          // 1. Steps (Index 0)
          let bucketSteps = 0;
          const stepsDataset = bucket.dataset?.[0];
          if (stepsDataset?.point) {
            for (const pt of stepsDataset.point) {
              if (pt.value) {
                for (const val of pt.value) {
                  bucketSteps += val.intVal || val.fpVal || 0;
                }
              }
            }
          }
          if (bucketSteps > 0) {
            insertLogs.push({
              user_id: userId,
              group_id: groupId,
              metric_slug: 'wearable_steps',
              value: bucketSteps,
              unit: 'steps',
              status: 'verified',
              logged_at: bucketDateStr,
            });
          }

          // 2. Sleep (Index 1)
          let bucketSleep = 0;
          const sleepDataset = bucket.dataset?.[1];
          if (sleepDataset?.point) {
            for (const pt of sleepDataset.point) {
              const startNs = Number(pt.startTimeNanos);
              const endNs = Number(pt.endTimeNanos);
              if (endNs > startNs) {
                bucketSleep += (endNs - startNs) / (1e6 * 1000 * 60 * 60);
              }
            }
          }
          if (bucketSleep > 0) {
            insertLogs.push({
              user_id: userId,
              group_id: groupId,
              metric_slug: 'wearable_sleep',
              value: Math.round(bucketSleep * 10) / 10,
              unit: 'hrs',
              status: 'verified',
              logged_at: bucketDateStr,
            });
          }

          // 3. Resting HR (Index 2)
          let minHR = null;
          const hrDataset = bucket.dataset?.[2];
          if (hrDataset?.point) {
            for (const pt of hrDataset.point) {
              if (pt.value) {
                for (const val of pt.value) {
                  const hrVal = val.fpVal || val.intVal;
                  if (hrVal && hrVal >= 35 && hrVal <= 120) {
                    if (minHR === null || hrVal < minHR) {
                      minHR = hrVal;
                    }
                  }
                }
              }
            }
          }
          if (minHR !== null) {
            insertLogs.push({
              user_id: userId,
              group_id: groupId,
              metric_slug: 'wearable_resting_hr',
              value: Math.round(minHR),
              unit: 'bpm',
              status: 'verified',
              logged_at: bucketDateStr,
            });
          }
        }
      }
    } else {
      const errText = await response.text();
      console.error(
        `[Wearables Sync] Google Fit aggregate query failed for user ${userId}:`,
        errText
      );
    }
  } catch (err) {
    console.error(`[Google Fit Sync] Aggregate call failed:`, err);
  }

  if (insertLogs.length > 0) {
    const { verifiedLogs, slugToIdMap } = await validateMetricDefinitions(
      supabaseAdmin,
      insertLogs
    );

    if (verifiedLogs.length > 0) {
      // Bulk range delete of existing records to avoid duplicate keys or double-counting
      const rangeStartStr = new Date(startTimeMillis).toISOString();
      const rangeEndStr = new Date(endTimeMillis).toISOString();

      await supabaseAdmin
        .from('metric_logs')
        .delete()
        .eq('user_id', userId)
        .in('metric_slug', ['wearable_steps', 'wearable_sleep', 'wearable_resting_hr'])
        .gte('logged_at', rangeStartStr)
        .lte('logged_at', rangeEndStr);

      const { error: insertErr } = await supabaseAdmin.from('metric_logs').insert(verifiedLogs);
      if (insertErr) {
        console.error('[Wearables Sync] DB INSERT ERROR:', JSON.stringify(insertErr));
        throw new Error(insertErr.message);
      }

      for (const log of verifiedLogs) {
        const metricId = slugToIdMap[log.metric_slug] || log.metric_slug;
        console.log(
          `[Wearables Sync] SUCCESS: Logged value ${log.value} for user ${log.user_id} in metric ${metricId}`
        );
      }
    }
  }

  // Update connection sync date and set backfill completed
  const nowIso = new Date().toISOString();
  const updateData: any = { last_synced_at: nowIso };
  if (isBackfill) {
    updateData.backfill_completed = true;
  }

  const { error: updateErr } = await supabaseAdmin
    .from('wearable_connections')
    .update(updateData)
    .eq('id', connection.id);

  if (updateErr) {
    console.error(`[Wearables Sync] Failed to update connection status:`, updateErr);
  } else if (isBackfill) {
    console.log(`[Wearables Tier 1] Marked backfill completed successfully for user ${userId}`);
  }

  return insertLogs.length;
}

/**
 * Sync process for Whoop (mock generation)
 */
async function syncWhoop(connection: any): Promise<number> {
  const supabaseAdmin = createAdminClient();
  const userId = connection.user_id;

  // Resolve user group
  const { data: member } = await supabaseAdmin
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!member || !member.group_id) {
    console.warn(`[Wearables Sync] User ${userId} has no active group member record.`);
    return 0;
  }

  const groupId = member.group_id;
  const now = new Date();

  const isBackfill = connection.backfill_completed !== true;
  const start = isBackfill ? new Date(2026, 0, 1) : new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (isBackfill) {
    console.log('[Wearables Tier 1] Initiating 2026 Historical Backfill for Whoop user:', userId);
  } else {
    console.log('[Wearables Tier 2] Executing routine daily cumulative sync for Whoop user:', userId);
  }

  const mockLogs: any[] = [];
  const curr = new Date(start.getTime());

  // Generate 1 record per day up to today
  while (curr <= now) {
    const dateStr = curr.toISOString();
    const stepsVal = Math.round(1500 + Math.random() * 4000);
    const sleepVal = Math.round((6.0 + Math.random() * 3.0) * 10) / 10;
    const hrVal = Math.round(48 + Math.random() * 15);

    mockLogs.push(
      {
        user_id: userId,
        group_id: groupId,
        metric_slug: 'wearable_steps',
        value: stepsVal,
        unit: 'steps',
        status: 'verified',
        logged_at: dateStr,
      },
      {
        user_id: userId,
        group_id: groupId,
        metric_slug: 'wearable_sleep',
        value: sleepVal,
        unit: 'hrs',
        status: 'verified',
        logged_at: dateStr,
      },
      {
        user_id: userId,
        group_id: groupId,
        metric_slug: 'wearable_resting_hr',
        value: hrVal,
        unit: 'bpm',
        status: 'verified',
        logged_at: dateStr,
      }
    );

    // Advance by 1 day
    curr.setDate(curr.getDate() + 1);
  }

  const { verifiedLogs, slugToIdMap } = await validateMetricDefinitions(
    supabaseAdmin,
    mockLogs
  );

  if (verifiedLogs.length === 0) {
    console.warn(`[Wearables Sync] No valid metrics to insert for Whoop user ${userId}.`);
    return 0;
  }

  // Delete existing in range
  await supabaseAdmin
    .from('metric_logs')
    .delete()
    .eq('user_id', userId)
    .in('metric_slug', ['wearable_steps', 'wearable_sleep', 'wearable_resting_hr'])
    .gte('logged_at', start.toISOString())
    .lte('logged_at', now.toISOString());

  const { error: insertErr } = await supabaseAdmin.from('metric_logs').insert(verifiedLogs);
  if (insertErr) {
    console.error('[Wearables Sync] DB INSERT ERROR:', JSON.stringify(insertErr));
    throw new Error(insertErr.message);
  }

  for (const log of verifiedLogs) {
    const metricId = slugToIdMap[log.metric_slug] || log.metric_slug;
    console.log(
      `[Wearables Sync] SUCCESS: Logged mock value ${log.value} for user ${log.user_id} in metric ${metricId}`
    );
  }

  // Update connection state
  const updateData: any = { last_synced_at: now.toISOString() };
  if (isBackfill) {
    updateData.backfill_completed = true;
  }

  await supabaseAdmin
    .from('wearable_connections')
    .update(updateData)
    .eq('id', connection.id);

  return verifiedLogs.length;
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
          case 'google_fit':
          case 'fitbit':
            console.log(`[Wearables Debug] Routing user ${connection.user_id} (Provider: ${connection.provider}) to syncFitbit/syncGoogleFit`);
            inserts = await syncFitbit(connection);
            break;
          case 'whoop':
            console.log(`[Wearables Debug] Routing user ${connection.user_id} to syncWhoop`);
            inserts = await syncWhoop(connection);
            break;
          default:
            console.error(`[Wearables Debug] CRITICAL MISMATCH: Provider "${connection.provider}" did not match any case statement.`);
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
