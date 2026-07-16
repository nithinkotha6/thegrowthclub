import { NextResponse } from 'next/server';

export const maxDuration = 60; // Allow up to 60 seconds for LLM processing
import { generateText } from 'ai';
import { googleProvider } from '@/lib/ai/google';
import { sendWhatsAppGroupMessage } from '@/lib/whatsapp';
import { buildGroupAssistantPrompt } from '@/lib/ai/prompts';
import { createAdminClient } from '@/lib/supabase/server';
import { safeCompare } from '@/lib/security';

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

// Shared request handler for GET/POST
async function handleRequest(req: Request) {
  try {
    // ── 0. Pre-Flight Environment Variable Validation ───────────────────────
    const requiredKeys = [
      'GEMINI_API_KEY',
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

    if (!secret || !authHeader || !safeCompare(authHeader, `Bearer ${secret}`)) {
      console.warn('[whatsapp-digest] Unauthorized request attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

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
    let recentActivitiesText = 'None';
    if (recentLogs && recentLogs.length > 0) {
      const typedLogs = recentLogs as unknown as HighlightLog[];
      recentActivitiesText = typedLogs.map((log: HighlightLog) => {
        const name = log.profiles?.nickname || log.profiles?.full_name || 'Someone';
        return `- ${name} logged ${log.value} ${log.unit || ''} of ${log.metric_slug} at ${new Date(log.logged_at).toLocaleDateString()}`;
      }).join('\n');
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

    const leaderboardText = leaderboard.map((entry, index) => {
      return `${index + 1}. ${entry.nickname}: ${entry.hasLogged ? `${entry.score} Yards` : 'No score logged'}`;
    }).join('\n');

    // ── 5. Build Copywriting Database Context ────────────────────────────────
    const dbContext = [
      `Recent Activities (last 24 hours):`,
      recentActivitiesText,
      ``,
      `Top Golf Leaderboard Standings:`,
      leaderboardText,
    ].join('\n');

    // ── 6. Execute AI Sports Broadcast Generation ───────────────────────────
    let broadcastText = '';

    try {
      const result = await generateText({
        model: googleProvider('gemini-3.5-flash'),
        system: buildGroupAssistantPrompt(dbContext),
        prompt: `Write today's morning sports broadcast for The Growth Club. Summarize yesterday's stats, congratulate the leader, and add a funny roast for anyone who logged 0 activities yesterday. Use emojis.`,
      });
      broadcastText = result.text;
    } catch (llmError) {
      console.error('[whatsapp-digest] Daily digest LLM generation error:', llmError);
      const errorMsg = llmError instanceof Error ? llmError.message : String(llmError);
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    console.log('[whatsapp-digest] Broadcast summary prepared:\n', broadcastText);

    // ── 7. Execute Broadcast ────────────────────────────────────────────────
    const success = await sendWhatsAppGroupMessage(broadcastText);

    return NextResponse.json({
      success,
      broadcasted: success,
      targetGroup: targetGroup.name,
      messageLength: broadcastText.length,
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
