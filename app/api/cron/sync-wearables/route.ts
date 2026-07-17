import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { safeCompare } from '@/lib/security';

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

  const accessToken = await refreshFitbitAccessToken(connection);
  if (!accessToken) {
    console.warn(`[Wearables Sync] Skipping user ${userId} due to token refresh failure.`);
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
      const hasActivity = grantedScopes.some((s: string) => s.includes('fitness.activity.read'));
      const hasSleep = grantedScopes.some((s: string) => s.includes('fitness.sleep.read'));
      const hasHr = grantedScopes.some((s: string) => s.includes('fitness.heart_rate.read'));

      console.log(`[Wearables OAuth Audit] User ${userId} Scope Check: Activity=${hasActivity} | Sleep=${hasSleep} | HeartRate=${hasHr}`);
      
      if (!hasActivity) {
        console.error(`[Wearables OAuth Audit] CRITICAL: Access token lacks 'fitness.activity.read'. Google Fit will permanently return empty step arrays until the user re-authenticates!`);
      }
    }
  } catch (err) {
    console.error(`[Wearables OAuth Audit] Failed to verify token scopes:`, err);
  }

  const isBackfill = connection.backfill_completed !== true;
  let startTimeMillis: number;
  let endTimeMillis: number;

  if (isBackfill) {
    console.log('[Wearables Tier 1] Initiating chunked 2026 Historical Backfill for user:', userId);
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

  const stepsPayloads: any[] = [];
  const sleepPayloads: any[] = [];
  const hrPayloads: any[] = [];

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  let currentStart = startTimeMillis;
  let hasApiError = false;

  // Chunking API aggregate requests into 30-day windows to avoid Google Fit "duration too large" HTTP 400 errors
  while (currentStart < endTimeMillis) {
    const currentEnd = Math.min(currentStart + THIRTY_DAYS_MS, endTimeMillis);
    console.log(`[Wearables Sync Chunk] Fetching chunk: ${new Date(currentStart).toISOString()} to ${new Date(currentEnd).toISOString()}`);
    let chunkStepsCount = 0;

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
            startTimeMillis: currentStart,
            endTimeMillis: currentEnd,
          }),
        }
      );

      if (response.ok) {
        const aggregateData = await response.json();

        if (aggregateData.error) {
          console.error(
            `[Wearables Sync Chunk Error] Google Fit API chunk failed (${new Date(currentStart).toISOString()} to ${new Date(currentEnd).toISOString()}):`,
            JSON.stringify(aggregateData.error)
          );
          hasApiError = true;
          break;
        }

        if (aggregateData.bucket) {
          for (const bucket of aggregateData.bucket) {
            const bucketStart = Number(bucket.startTimeMillis);
            const loggedDateStr = new Date(bucketStart).toISOString().split('T')[0];

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
              chunkStepsCount++;
              stepsPayloads.push({
                user_id: userId,
                connection_id: connection.id,
                logged_date: loggedDateStr,
                value: bucketSteps,
                source: 'wearable_sync',
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
              sleepPayloads.push({
                user_id: userId,
                connection_id: connection.id,
                logged_date: loggedDateStr,
                value: Math.round(bucketSleep * 10) / 10,
                source: 'wearable_sync',
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
              hrPayloads.push({
                user_id: userId,
                connection_id: connection.id,
                logged_date: loggedDateStr,
                value: Math.round(minHR),
                source: 'wearable_sync',
              });
            }
          }
        }
      } else {
        const errText = await response.text();
        console.error(
          `[Wearables Sync Chunk Error] API request returned status ${response.status}:`,
          errText
        );
        hasApiError = true;
        break;
      }

      // Health Connect Raw Stream Fallback Check (if aggregated query returned 0 steps)
      if (chunkStepsCount === 0 && !hasApiError) {
        console.log(`[Wearables Sync Fallback] Aggregate steps returned 0 rows. Running Health Connect raw stream fallback query for chunk...`);
        try {
          const fallbackUrl = `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.step_count.delta:com.google.android.gms:estimated_steps/datasets/${currentStart}000000-${currentEnd}000000`;
          const fallbackRes = await fetch(fallbackUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            console.log(`[Wearables Sync Fallback] Raw stream response point count: ${fallbackData.point?.length || 0}`);
            
            // Aggregate points by day
            const stepsByDay: Record<string, number> = {};
            if (fallbackData.point) {
              for (const pt of fallbackData.point) {
                const ptStartMs = Number(pt.startTimeNanos) / 1000000;
                const ptDateStr = new Date(ptStartMs).toISOString().split('T')[0];
                let ptSteps = 0;
                if (pt.value) {
                  for (const val of pt.value) {
                    ptSteps += val.intVal || val.fpVal || 0;
                  }
                }
                if (ptSteps > 0) {
                  stepsByDay[ptDateStr] = (stepsByDay[ptDateStr] || 0) + ptSteps;
                }
              }
            }

            for (const [day, steps] of Object.entries(stepsByDay)) {
              stepsPayloads.push({
                user_id: userId,
                connection_id: connection.id,
                logged_date: day,
                value: steps,
                source: 'wearable_sync_fallback',
              });
              console.log(`[Wearables Sync Fallback] Logged fallback step value ${steps} for day ${day}`);
            }
          } else {
            console.error(`[Wearables Sync Fallback] Health Connect raw stream fallback query failed:`, await fallbackRes.text());
          }
        } catch (fallbackErr) {
          console.error(`[Wearables Sync Fallback] Error in raw stream fallback query:`, fallbackErr);
        }
      }
    } catch (err) {
      console.error(`[Wearables Sync Chunk Error] Network exception during chunk fetch:`, err);
      hasApiError = true;
      break;
    }

    currentStart = currentEnd;
  }

  let hasDbError = false;

  // Ingest parsed records only if there are logs and no API errors occurred to guarantee transactional safety
  if (!hasApiError) {
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

  // Update connection sync date and set backfill completed strictly if no api or db errors occurred
  const nowIso = new Date().toISOString();
  const updateData: any = { last_synced_at: nowIso };
  if (isBackfill && !hasApiError && !hasDbError) {
    updateData.backfill_completed = true;
  }

  const { error: updateErr } = await supabaseAdmin
    .from('wearable_connections')
    .update(updateData)
    .eq('id', connection.id);

  if (updateErr) {
    console.error(`[Wearables Sync] Failed to update connection status:`, updateErr);
  } else if (isBackfill && !hasApiError && !hasDbError) {
    console.log(`[Wearables Tier 1] Marked backfill completed successfully for user ${userId}`);
  }

  return (hasApiError || hasDbError) ? 0 : (stepsPayloads.length + sleepPayloads.length + hrPayloads.length);
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

  // Update connection state strictly if no DB errors occurred
  const updateData: any = { last_synced_at: now.toISOString() };
  if (isBackfill && !hasDbError) {
    updateData.backfill_completed = true;
  }

  await supabaseAdmin
    .from('wearable_connections')
    .update(updateData)
    .eq('id', connection.id);

  return hasDbError ? 0 : (stepsPayloads.length + sleepPayloads.length + hrPayloads.length);
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
