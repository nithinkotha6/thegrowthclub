import { NextResponse } from 'next/server';

export const maxDuration = 60; // Allow up to 60 seconds for LLM processing
import { generateText } from 'ai';
import { executeWithKeyRotation } from '@/utils/geminiPool';
import { buildWebhookReplyPrompt, buildDigestUserPrompt } from '@/lib/ai/prompts';
import { createAdminClient } from '@/lib/supabase/server';
import { safeCompare } from '@/lib/security';
import { runCronIdempotent } from '@/lib/cron/idempotent-runner';

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
    const requiredKeys = ['GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
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

    // ── 2. Iterate All Groups ────────────────────────────────────────────────
    const { data: groups, error: groupsErr } = await supabaseAdmin
      .from('groups')
      .select('id, name, whatsapp_instance_id, whatsapp_token, whatsapp_group_id')
      .order('created_at', { ascending: true });

    if (groupsErr) {
      console.error('[whatsapp-digest] Failed to fetch groups:', groupsErr);
      return NextResponse.json({ error: groupsErr.message }, { status: 500 });
    }

    const processedGroups: { group: string; status: string; length?: number }[] = [];
    const todayStr = new Date().toISOString().slice(0, 10);

    for (const group of groups || []) {
      const groupId = group.id;
      const runResult = await runCronIdempotent('whatsapp-digest', groupId, todayStr, async () => {
        const instanceId = group.whatsapp_instance_id || process.env.GREEN_API_INSTANCE_ID;
        const token = group.whatsapp_token || process.env.GREEN_API_TOKEN;
        const waChatId = group.whatsapp_group_id || process.env.WHATSAPP_GROUP_ID;

        // Skip groups that lack a configured WhatsApp integration
        if (!instanceId || !token || !waChatId) {
          console.log(`[whatsapp-digest] Group "${group.name}" lacks configured WhatsApp credentials. Skipping.`);
          return;
        }

        console.log(`[whatsapp-digest] Running digest for group: ${group.name} (ID: ${groupId})`);

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
        console.error(`[whatsapp-digest] Failed to fetch recent logs for group "${group.name}":`, recentLogsErr);
        return;
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
      const { data: membersRaw, error: membersErr } = await supabaseAdmin
        .from('group_members')
        .select(`
          user_id,
          profiles!inner ( id, full_name, nickname )
        `)
        .eq('group_id', groupId);

      if (membersErr) {
        console.error(`[whatsapp-digest] Failed to fetch group members for group "${group.name}":`, membersErr);
        return;
      }

      // Query all verified top_golf logs for the group
      const { data: topGolfLogs, error: topGolfLogsErr } = await supabaseAdmin
        .from('metric_logs')
        .select('user_id, value')
        .eq('group_id', groupId)
        .eq('status', 'verified')
        .eq('metric_slug', 'top_golf');

      if (topGolfLogsErr) {
        console.error(`[whatsapp-digest] Failed to fetch top golf logs for group "${group.name}":`, topGolfLogsErr);
        return;
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
        const result = await executeWithKeyRotation(async (modelInstance) => {
          return generateText({
            model: modelInstance,
            system: buildWebhookReplyPrompt(dbContext),
            prompt: buildDigestUserPrompt(),
          });
        });
        broadcastText = result.text;
      } catch (llmError) {
        console.error(`[whatsapp-digest] Daily digest LLM generation error for group "${group.name}":`, llmError);
        return;
      }

      console.log(`[whatsapp-digest] Broadcast summary prepared for group "${group.name}":\n`, broadcastText);

      // ── 7. Dispatch to WhatsApp (per-group Green API credentials) ───────────
      const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: waChatId, message: broadcastText }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[whatsapp-digest] Green API dispatch failed for group "${group.name}":`, response.status, errorText);
          throw new Error(`Green API dispatch failed: ${response.status} ${errorText}`);
        } else {
          console.log(`[whatsapp-digest] Digest sent successfully to group "${group.name}".`);
        }
      } catch (dispatchErr) {
        console.error(`[whatsapp-digest] Connection error dispatching to group "${group.name}":`, dispatchErr);
        throw dispatchErr;
      }
    });

    processedGroups.push({ group: group.name, status: runResult.status });
  }

    return NextResponse.json({ success: true, processed: processedGroups });
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
