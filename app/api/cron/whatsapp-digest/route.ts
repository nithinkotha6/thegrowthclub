import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppGroupMessage } from '@/lib/whatsapp';

// Admin client using service role key (required to query scoped/system tables in cron context)
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

interface ProfileDetails {
  id: string;
  nickname: string | null;
  full_name: string | null;
}

interface HighlightLog {
  id: string;
  user_id: string;
  value: number;
  unit: string;
  metric_slug: string;
  logged_at: string;
  profiles: ProfileDetails | null;
}

interface GroupMemberRow {
  user_id: string;
  profiles: ProfileDetails | null;
}

// Sports-center natural language highlights formatter
function formatHighlight(log: HighlightLog): string {
  const nickname = log.profiles?.nickname || log.profiles?.full_name?.split(' ')[0] || 'Someone';
  const val = Number(log.value);
  const unit = log.unit || '';
  const slug = log.metric_slug || '';

  switch (slug) {
    case 'car_top_speed':
    case 'top_speed':
      return `⚡ *${nickname}* logged ${val} ${unit} Car Top Speed!`;
    case 'top_golf':
      return `🏌️ *${nickname}* crushed a ${val} ${unit} Top Golf shot!`;
    case 'long_run':
      return `🏃 *${nickname}* completed a ${val} ${unit} Long Run!`;
    case 'deadlift':
      return `🏋️ *${nickname}* deadlifted ${val} ${unit}!`;
    case 'weight':
      return `⚖️ *${nickname}* logged a ${val} ${unit} body weight check-in!`;
    case 'calories':
      return `🔥 *${nickname}* burned ${val} ${unit}!`;
    case 'beers':
    case 'most_beers':
      return `🍺 *${nickname}* put away ${val} beer${val !== 1 ? 's' : ''}!`;
    case 'squat':
      return `🏋️ *${nickname}* squatted ${val} ${unit}!`;
    case 'bench_press':
      return `🏋️ *${nickname}* benched ${val} ${unit}!`;
    case 'push_ups':
      return `💪 *${nickname}* completed ${val} push-ups!`;
    case 'pull_ups':
      return `💪 *${nickname}* completed ${val} pull-ups!`;
    case 'cycling_distance':
      return `🚴 *${nickname}* cycled ${val} ${unit}!`;
    case 'longest_swim':
    case 'underwater_swim':
      return `🏊 *${nickname}* swam ${val} ${unit}!`;
    case 'sleep':
    case 'wearable_sleep':
      return `😴 *${nickname}* logged ${val} ${unit} of sleep!`;
    case '5k_time':
      return `⚡ *${nickname}* ran a 5K in ${val} ${unit}!`;
    case 'highest_steps':
    case 'wearable_steps':
      return `👟 *${nickname}* walked ${val.toLocaleString()} ${unit}!`;
    case 'wearable_resting_hr':
      return `❤️ *${nickname}* logged a resting heart rate of ${val} ${unit}!`;
    case 'catan_wins':
      return `🎲 *${nickname}* won Catan!`;
    case 'national_parks':
      return `🏔️ *${nickname}* visited a national park!`;
    default: {
      const display = slug.replace(/_/g, ' ');
      return `🏆 *${nickname}* logged ${val} ${unit} of ${display}!`;
    }
  }
}

// Shared request handler for GET/POST
async function handleRequest(req: Request) {
  try {
    // ── 0. Pre-Flight Environment Variable Validation ───────────────────────
    const requiredKeys = [
      'GREEN_API_INSTANCE_ID',
      'GREEN_API_TOKEN',
      'WHATSAPP_GROUP_ID',
      'SUPABASE_SERVICE_ROLE_KEY',
    ];
    const missingKeys = requiredKeys.filter((key) => !process.env[key]);

    if (missingKeys.length > 0) {
      console.error('[whatsapp-digest] Pre-flight validation failed. Missing keys:', missingKeys);
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required environment variables',
          missingKeys,
        },
        { status: 400 }
      );
    }

    // ── 1. Security Authorization ───────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    const secret = process.env.CRON_SECRET;

    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      console.warn('[whatsapp-digest] Unauthorized request attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = getAdminClient();

    // ── 2. Resolve Active Group ─────────────────────────────────────────────
    // Fetch all groups and resolve the target group ("Texas Buds" first, or fallback to the first group)
    const { data: groups, error: groupsErr } = await supabaseAdmin
      .from('groups')
      .select('*')
      .order('created_at', { ascending: true });

    if (groupsErr) {
      console.error('[whatsapp-digest] Failed to fetch groups:', groupsErr);
      return NextResponse.json({ error: groupsErr.message }, { status: 500 });
    }

    const targetGroup = groups?.find(g => g.name === 'Texas Buds' || g.invite_code === 'TEXASBUDS') || groups?.[0];
    if (!targetGroup) {
      console.error('[whatsapp-digest] No groups found in database');
      return NextResponse.json({ error: 'No groups found' }, { status: 404 });
    }

    const groupId = targetGroup.id;
    console.log(`[whatsapp-digest] Running digest for group: ${targetGroup.name} (ID: ${groupId})`);

    // ── 3. Database Aggregation (Last 24 Hours) ─────────────────────────────
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentLogs, error: recentLogsErr } = await supabaseAdmin
      .from('metric_logs')
      .select(`
        id,
        user_id,
        value,
        unit,
        metric_slug,
        logged_at,
        profiles!inner ( id, nickname, full_name )
      `)
      .eq('group_id', groupId)
      .eq('status', 'verified')
      .gte('logged_at', yesterday)
      .order('logged_at', { ascending: false });

    if (recentLogsErr) {
      console.error('[whatsapp-digest] Failed to fetch recent logs:', recentLogsErr);
      return NextResponse.json({ error: recentLogsErr.message }, { status: 500 });
    }

    // Format highlights string list
    let highlightsSection = '';
    if (recentLogs && recentLogs.length > 0) {
      const typedLogs = recentLogs as unknown as HighlightLog[];
      highlightsSection = typedLogs.map(formatHighlight).join('\n');
    } else {
      highlightsSection = `💤 _No activities logged yesterday! Who is setting the pace today?_`;
    }

    // ── 4. PVP Leaderboard Standings (Calculated by Deduplicated Best-Score) ─
    // Query all members belonging to the active group
    const { data: membersRaw, error: membersErr } = await supabaseAdmin
      .from('group_members')
      .select(`
        user_id,
        profiles!inner ( id, full_name, nickname )
      `)
      .eq('group_id', groupId);

    if (membersErr) {
      console.error('[whatsapp-digest] Failed to fetch group members:', membersErr);
      return NextResponse.json({ error: membersErr.message }, { status: 500 });
    }

    // Query all verified top_golf logs for the group
    const { data: topGolfLogs, error: topGolfLogsErr } = await supabaseAdmin
      .from('metric_logs')
      .select('user_id, value')
      .eq('group_id', groupId)
      .eq('status', 'verified')
      .eq('metric_slug', 'top_golf');

    if (topGolfLogsErr) {
      console.error('[whatsapp-digest] Failed to fetch top golf logs:', topGolfLogsErr);
      return NextResponse.json({ error: topGolfLogsErr.message }, { status: 500 });
    }

    interface LeaderboardEntry {
      nickname: string;
      score: number;
      hasLogged: boolean;
    }

    const members = (membersRaw || []) as unknown as GroupMemberRow[];
    const userMap = new Map<string, LeaderboardEntry>();

    // Initialize map with all members
    for (const m of members) {
      if (m.profiles) {
        userMap.set(m.user_id, {
          nickname: m.profiles.nickname || m.profiles.full_name || 'Athlete',
          score: 0,
          hasLogged: false,
        });
      }
    }

    // Deduplicate and process best score (max for top_golf)
    for (const log of topGolfLogs || []) {
      const existing = userMap.get(log.user_id);
      if (!existing) continue;

      const val = Number(log.value);
      if (!existing.hasLogged) {
        existing.score = val;
        existing.hasLogged = true;
      } else {
        existing.score = Math.max(existing.score, val);
      }
    }

    // Convert to sorted array
    const leaderboard = Array.from(userMap.values())
      .map(entry => ({
        ...entry,
        score: Math.round(entry.score * 10) / 10,
      }))
      .sort((a, b) => {
        if (a.hasLogged && !b.hasLogged) return -1;
        if (!a.hasLogged && b.hasLogged) return 1;
        if (!a.hasLogged && !b.hasLogged) return 0;
        return b.score - a.score;
      });

    // Extract top 3 positions
    const podiumMedals = ['🥇', '🥈', '🥉'];
    const podiumLines: string[] = [];

    for (let i = 0; i < 3; i++) {
      const entry = leaderboard[i];
      const medal = podiumMedals[i];
      const ordinal = i === 0 ? '1st' : i === 1 ? '2nd' : '3rd';
      if (entry) {
        const scoreStr = entry.hasLogged ? `${entry.score} Yards` : '—';
        podiumLines.push(`${medal} ${ordinal}: *${entry.nickname}* — ${scoreStr}`);
      } else {
        podiumLines.push(`${medal} ${ordinal}: _Empty_ — —`);
      }
    }

    // ── 5. Build Copywriting Digest Payload ──────────────────────────────────
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const message = [
      `🚨 *THE GROWTH CLUB • DAILY DROP* 🚨`,
      ``,
      `*Yesterday's Highlights:*`,
      highlightsSection,
      ``,
      `*Current Leaderboard Podium:*`,
      ...podiumLines,
      ``,
      `👉 Log today's activity: ${appUrl}`,
    ].join('\n');

    console.log('[whatsapp-digest] Prepared payload:\n', message);

    // ── 6. Execute Broadcast ────────────────────────────────────────────────
    const success = await sendWhatsAppGroupMessage(message);

    return NextResponse.json({
      success,
      broadcasted: success,
      targetGroup: targetGroup.name,
      messageLength: message.length,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[whatsapp-digest] Fatal route error:', error);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}
