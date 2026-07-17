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

  const start = connection.last_synced_at
    ? new Date(connection.last_synced_at)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const end = new Date();

  const startTimeMillis = start.getTime();
  const endTimeMillis = end.getTime();
  const startTimeNanos = startTimeMillis + '000000';
  const endTimeNanos = endTimeMillis + '000000';

  const insertLogs: any[] = [];

  // A. Steps (Aggregate API)
  try {
    const stepsResponse = await fetch(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          aggregateBy: [
            {
              dataTypeName: 'com.google.step_count.delta',
              dataSourceId:
                'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps',
            },
          ],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis,
          endTimeMillis,
        }),
      }
    );

    if (stepsResponse.ok) {
      const stepsData = await stepsResponse.json();
      console.log(
        '[Wearables Sync] Google Fit raw response for user',
        userId,
        JSON.stringify(stepsData, null, 2)
      );

      if (!stepsData.bucket || stepsData.bucket.length === 0) {
        console.log(
          '[Wearables Sync] WARNING: Google Fit returned 0 data points for this timeframe.'
        );
      } else {
        for (const bucket of stepsData.bucket) {
          let bucketSteps = 0;
          if (bucket.dataset) {
            for (const ds of bucket.dataset) {
              if (ds.point) {
                for (const pt of ds.point) {
                  if (pt.value) {
                    for (const val of pt.value) {
                      bucketSteps += val.intVal || val.fpVal || 0;
                    }
                  }
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
              logged_at: new Date(Number(bucket.startTimeMillis)).toISOString(),
            });
          }
        }
      }
    } else {
      const errText = await stepsResponse.text();
      console.error(
        `[Wearables Sync] Google Fit raw request failed for user ${userId}:`,
        errText
      );
    }
  } catch (err) {
    console.error('[Google Fit Sync] Steps API fetch failed:', err);
  }

  // B. Sleep Sessions (Sessions API)
  try {
    const sleepResponse = await fetch(
      `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${start.toISOString()}&endTime=${end.toISOString()}&activityType=72`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (sleepResponse.ok) {
      const sleepData = await sleepResponse.json();
      if (sleepData.session) {
        for (const s of sleepData.session) {
          const sStart = Number(s.startTimeMillis);
          const sEnd = Number(s.endTimeMillis);
          if (sEnd > sStart) {
            const durationHours = (sEnd - sStart) / (1000 * 60 * 60);
            insertLogs.push({
              user_id: userId,
              group_id: groupId,
              metric_slug: 'wearable_sleep',
              value: Math.round(durationHours * 10) / 10,
              unit: 'hrs',
              status: 'verified',
              logged_at: new Date(sStart).toISOString(),
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[Google Fit Sync] Sleep sessions fetch failed:', err);
  }

  // C. Resting HR (Dataset API with Fallback)
  try {
    const hrUrl = `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.heart_rate.bpm:com.google.android.gms:resting_heart_rate/datasets/${startTimeNanos}-${endTimeNanos}`;
    const hrResponse = await fetch(hrUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let hrFetched = false;
    if (hrResponse.ok) {
      const hrData = await hrResponse.json();
      if (hrData.point && hrData.point.length > 0) {
        for (const pt of hrData.point) {
          if (pt.value) {
            for (const val of pt.value) {
              const hrVal = val.fpVal || val.intVal;
              if (hrVal) {
                insertLogs.push({
                  user_id: userId,
                  group_id: groupId,
                  metric_slug: 'wearable_resting_hr',
                  value: Math.round(hrVal),
                  unit: 'bpm',
                  status: 'verified',
                  logged_at: new Date(Number(pt.startTimeNanos) / 1000000).toISOString(),
                });
                hrFetched = true;
              }
            }
          }
        }
      }
    }

    if (!hrFetched) {
      const fallbackUrl = `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm/datasets/${startTimeNanos}-${endTimeNanos}`;
      const fallbackResponse = await fetch(fallbackUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        if (fallbackData.point && fallbackData.point.length > 0) {
          const hrByDay: Record<string, number> = {};
          for (const pt of fallbackData.point) {
            const ptTime = new Date(Number(pt.startTimeNanos) / 1000000);
            const dayKey = ptTime.toISOString().split('T')[0];
            if (pt.value) {
              for (const val of pt.value) {
                const valNum = val.fpVal || val.intVal;
                if (valNum && valNum > 0) {
                  if (!hrByDay[dayKey] || valNum < hrByDay[dayKey]) {
                    hrByDay[dayKey] = valNum;
                  }
                }
              }
            }
          }
          for (const [day, hr] of Object.entries(hrByDay)) {
            insertLogs.push({
              user_id: userId,
              group_id: groupId,
              metric_slug: 'wearable_resting_hr',
              value: Math.round(hr),
              unit: 'bpm',
              status: 'verified',
              logged_at: new Date(day + 'T12:00:00.000Z').toISOString(),
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[Google Fit Sync] Heart rate fetch failed:', err);
  }

  // F. Insert normalized metrics & advance sync tracker
  if (insertLogs.length > 0) {
    const { verifiedLogs, slugToIdMap } = await validateMetricDefinitions(
      supabaseAdmin,
      insertLogs
    );
    if (verifiedLogs.length === 0) {
      console.warn(`[Wearables Sync] No valid metrics to insert for user ${userId}.`);
      return 0;
    }

    // Deduplicate synced dates to avoid leaderboard score inflation
    for (const log of verifiedLogs) {
      const d = new Date(log.logged_at);
      const startOfDay = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      ).toISOString();
      const endOfDay = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
      ).toISOString();

      await supabaseAdmin
        .from('metric_logs')
        .delete()
        .eq('user_id', log.user_id)
        .eq('metric_slug', log.metric_slug)
        .gte('logged_at', startOfDay)
        .lt('logged_at', endOfDay);
    }

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

    await supabaseAdmin
      .from('wearable_connections')
      .update({ last_synced_at: end.toISOString() })
      .eq('id', connection.id);

    return verifiedLogs.length;
  }

  return 0;
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
  const nowStr = new Date().toISOString();

  // Mock Whoop data simulation
  const stepsVal = Math.round(1500 + Math.random() * 4000);
  const sleepVal = Math.round((6.0 + Math.random() * 3.0) * 10) / 10;
  const hrVal = Math.round(48 + Math.random() * 15);

  const mockLogs = [
    {
      user_id: userId,
      group_id: groupId,
      metric_slug: 'wearable_steps',
      value: stepsVal,
      unit: 'steps',
      status: 'verified',
      logged_at: nowStr,
    },
    {
      user_id: userId,
      group_id: groupId,
      metric_slug: 'wearable_sleep',
      value: sleepVal,
      unit: 'hrs',
      status: 'verified',
      logged_at: nowStr,
    },
    {
      user_id: userId,
      group_id: groupId,
      metric_slug: 'wearable_resting_hr',
      value: hrVal,
      unit: 'bpm',
      status: 'verified',
      logged_at: nowStr,
    },
  ];

  const { verifiedLogs, slugToIdMap } = await validateMetricDefinitions(
    supabaseAdmin,
    mockLogs
  );
  if (verifiedLogs.length === 0) {
    console.warn(`[Wearables Sync] No valid metrics to insert for Whoop user ${userId}.`);
    return 0;
  }

  // Truncate time and delete existing duplicate logs for the current calendar day (UTC)
  const d = new Date();
  const startOfDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  ).toISOString();
  const endOfDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  ).toISOString();

  for (const log of verifiedLogs) {
    await supabaseAdmin
      .from('metric_logs')
      .delete()
      .eq('user_id', userId)
      .eq('metric_slug', log.metric_slug)
      .gte('logged_at', startOfDay)
      .lt('logged_at', endOfDay);
  }

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

  await supabaseAdmin
    .from('wearable_connections')
    .update({ last_synced_at: nowStr })
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
          case 'fitbit':
          case 'google_fit': // backward compatibility
            inserts = await syncFitbit(connection);
            break;
          case 'whoop':
            inserts = await syncWhoop(connection);
            break;
          default:
            console.warn(`[Wearables] Unsupported provider: ${connection.provider}`);
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
