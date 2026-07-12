import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Helper to build an admin/service-role client bypassing RLS dynamically.
 */
function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is not defined.');
  }
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Helper to process mock wearable data retrieval for a connection.
 * Simulates steps, sleep, and resting heart rate entries for the last 6 hours.
 */
async function fetchAndProcessWearableData(connection: any) {
  const supabaseAdmin = getAdminClient();
  const userId = connection.user_id;

  // 1. Get the user's group_id
  const { data: member } = await supabaseAdmin
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!member || !member.group_id) {
    console.warn(`[Wearables Cron] User ${userId} has no active group member record.`);
    return;
  }

  const groupId = member.group_id;

  // 2. Generate simulated steps, sleep, and heart rate values
  const stepsVal = Math.round(1500 + Math.random() * 4000);  // e.g. 1500–5500 steps
  const sleepVal = Math.round((6.0 + Math.random() * 3.0) * 10) / 10; // e.g. 6.0–9.0 hours
  const hrVal = Math.round(48 + Math.random() * 15); // e.g. 48–63 bpm

  const now = new Date().toISOString();

  // 3. Write directly to metric_logs table with status 'verified' (bypassing peer-review)
  const { error: insertErr } = await supabaseAdmin.from('metric_logs').insert([
    {
      user_id: userId,
      group_id: groupId,
      metric_slug: 'wearable_steps',
      value: stepsVal,
      unit: 'steps',
      status: 'verified',
      logged_at: now,
    },
    {
      user_id: userId,
      group_id: groupId,
      metric_slug: 'wearable_sleep',
      value: sleepVal,
      unit: 'hrs',
      status: 'verified',
      logged_at: now,
    },
    {
      user_id: userId,
      group_id: groupId,
      metric_slug: 'wearable_resting_hr',
      value: hrVal,
      unit: 'bpm',
      status: 'verified',
      logged_at: now,
    }
  ]);

  if (insertErr) {
    console.error(`[Wearables Cron] Failed to insert metrics for user ${userId}:`, insertErr.message);
    throw new Error(insertErr.message);
  }

  // 4. Update the connection's last_synced_at timestamp
  const { error: updateErr } = await supabaseAdmin
    .from('wearable_connections')
    .update({ last_synced_at: now })
    .eq('id', connection.id);

  if (updateErr) {
    console.error(`[Wearables Cron] Failed to update connection timestamp for user ${userId}:`, updateErr.message);
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
    
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = getAdminClient();

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
