import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { safeCompare } from '@/lib/security';

/**
 * Proactively refreshes the Google Fit Access Token if expired or expiring within 5 minutes.
 */
async function refreshGoogleAccessToken(connection: any) {
  const expiresAt = new Date(connection.token_expires_at);
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
    throw new Error('Google OAuth credentials not configured in process environment.');
  }

  if (!connection.refresh_token) {
    throw new Error(`No refresh token available for user ${connection.user_id}`);
  }

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
    throw new Error(`Google refresh token exchange failed: ${errText}`);
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
      token_expires_at: newExpiresAt,
    })
    .eq('id', connection.id);

  if (updateErr) {
    console.error(`[Wearables Sync] Failed to save refreshed credentials:`, updateErr);
  }

  return newAccessToken;
}

/**
 * Processes live Google Fit REST pulls or mock provider simulation.
 */
async function fetchAndProcessWearableData(connection: any) {
  const supabaseAdmin = createAdminClient();
  const userId = connection.user_id;

  // 1. Resolve user group
  const { data: member } = await supabaseAdmin
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!member || !member.group_id) {
    console.warn(`[Wearables Sync] User ${userId} has no active group member record.`);
    return;
  }

  const groupId = member.group_id;
  const nowStr = new Date().toISOString();

  if (connection.provider !== 'google_fit') {
    // Mock simulation processing loop for non-Google Fit connections
    const stepsVal = Math.round(1500 + Math.random() * 4000);
    const sleepVal = Math.round((6.0 + Math.random() * 3.0) * 10) / 10;
    const hrVal = Math.round(48 + Math.random() * 15);

    const { error: insertErr } = await supabaseAdmin.from('metric_logs').insert([
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
      }
    ]);

    if (insertErr) throw new Error(insertErr.message);

    await supabaseAdmin
      .from('wearable_connections')
      .update({ last_synced_at: nowStr })
      .eq('id', connection.id);

    return;
  }

  // 2. Google Fit Real API Handshake & Sync
  const accessToken = await refreshGoogleAccessToken(connection);

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
    const stepsResponse = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        aggregateBy: [{
          dataTypeName: 'com.google.step_count.delta',
          dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps'
        }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis,
        endTimeMillis,
      }),
    });

    if (stepsResponse.ok) {
      const stepsData = await stepsResponse.json();
      if (stepsData.bucket) {
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
    }
  } catch (err) {
    console.error('[Google Fit Sync] Steps API fetch failed:', err);
  }

  // B. Sleep Sessions (Sessions API)
  try {
    const sleepResponse = await fetch(
      `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${start.toISOString()}&endTime=${end.toISOString()}&activityType=72`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
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
      headers: { 'Authorization': `Bearer ${accessToken}` },
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
      // Fallback: extract minimum heart rate from standard heart rate dataset
      const fallbackUrl = `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm/datasets/${startTimeNanos}-${endTimeNanos}`;
      const fallbackResponse = await fetch(fallbackUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
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
    const { error: insertErr } = await supabaseAdmin
      .from('metric_logs')
      .insert(insertLogs);

    if (insertErr) {
      console.error('[Google Fit Sync] Database insert logs failed:', insertErr.message);
      throw new Error(insertErr.message);
    }
  }

  const { error: updateErr } = await supabaseAdmin
    .from('wearable_connections')
    .update({ last_synced_at: end.toISOString() })
    .eq('id', connection.id);

  if (updateErr) {
    console.error('[Google Fit Sync] Failed to update connection sync tracker:', updateErr.message);
    throw new Error(updateErr.message);
  }
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
    let processed = 0;

    for (const conn of list) {
      try {
        await fetchAndProcessWearableData(conn);
        processed++;
      } catch (err: any) {
        console.error(`[Wearables Cron] Failed on connection ${conn.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${processed} of ${list.length} connections.`,
    });
  } catch (err: any) {
    console.error('[Wearables Cron] Fatal route error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
