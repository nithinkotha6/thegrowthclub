import { NextResponse } from 'next/server';

export const maxDuration = 60; // Allow up to 60 seconds for LLM processing

import { generateText } from 'ai';
import { googleProvider } from '@/lib/ai/google';
import { createAdminClient } from '@/lib/supabase/server';
import { safeCompare } from '@/lib/security';

interface ProfileDetails {
  id: string;
  nickname: string | null;
  full_name: string | null;
}

interface GroupMemberRow {
  user_id: string;
  profiles: ProfileDetails | null;
}

async function handleRequest(req: Request) {
  try {
    // 1. Security Authorization
    const authHeader = req.headers.get('Authorization');
    const secret = process.env.CRON_SECRET;

    if (secret && (!authHeader || !safeCompare(authHeader, `Bearer ${secret}`))) {
      console.warn('[ai-bookie] Unauthorized cron trigger attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // 2. Retrieve All Active Groups
    const { data: groups, error: groupsErr } = await supabaseAdmin
      .from('groups')
      .select('id, name, whatsapp_instance_id, whatsapp_token, whatsapp_group_id');

    if (groupsErr) {
      console.error('[ai-bookie] Failed to fetch groups:', groupsErr);
      return NextResponse.json({ error: groupsErr.message }, { status: 500 });
    }

    const processedGroups = [];

    for (const group of groups || []) {
      const instanceId = group.whatsapp_instance_id || process.env.GREEN_API_INSTANCE_ID;
      const token = group.whatsapp_token || process.env.GREEN_API_TOKEN;
      const waChatId = group.whatsapp_group_id || process.env.WHATSAPP_GROUP_ID;

      if (!instanceId || !token || !waChatId) {
        console.log(`[ai-bookie] Skipping group "${group.name}" - WhatsApp not configured`);
        continue;
      }

      // 3. Query group members
      const { data: membersRaw, error: membersErr } = await supabaseAdmin
        .from('group_members')
        .select(`
          user_id,
          profiles!inner ( id, nickname, full_name )
        `)
        .eq('group_id', group.id);

      if (membersErr || !membersRaw) {
        console.error(`[ai-bookie] Members query failed for group "${group.name}":`, membersErr);
        continue;
      }

      const members = membersRaw as unknown as GroupMemberRow[];
      const userNames = new Map<string, string>();
      for (const m of members) {
        if (m.profiles) {
          userNames.set(m.user_id, m.profiles.nickname || m.profiles.full_name || 'Athlete');
        }
      }

      // 4. Query last 30 days of verified activity logs
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: logs, error: logsErr } = await supabaseAdmin
        .from('metric_logs')
        .select('user_id, value, unit, metric_slug, logged_at')
        .eq('group_id', group.id)
        .eq('status', 'verified')
        .gte('logged_at', thirtyDaysAgo.toISOString());

      if (logsErr) {
        console.error(`[ai-bookie] Metric logs query failed for group "${group.name}":`, logsErr);
        continue;
      }

      // 5. Aggregate stats by user
      const userActivityCounts = new Map<string, number>();
      const userMetricMaximums = new Map<string, { [metric: string]: number }>();

      for (const log of logs || []) {
        const uid = log.user_id;
        userActivityCounts.set(uid, (userActivityCounts.get(uid) || 0) + 1);

        const val = Number(log.value);
        if (!isNaN(val)) {
          const maxMap = userMetricMaximums.get(uid) || {};
          maxMap[log.metric_slug] = Math.max(maxMap[log.metric_slug] || 0, val);
          userMetricMaximums.set(uid, maxMap);
        }
      }

      // Build stats representation
      const statsSummaryLines: string[] = [];
      for (const [uid, name] of userNames.entries()) {
        const count = userActivityCounts.get(uid) || 0;
        const maxes = userMetricMaximums.get(uid) || {};
        const maxesText = Object.entries(maxes)
          .map(([metric, val]) => `${metric}: max ${val}`)
          .join(', ');
        statsSummaryLines.push(`- ${name}: ${count} total workouts in last 30d. Best efforts: ${maxesText || 'none'}`);
      }

      const statsSummary = statsSummaryLines.join('\n');

      // 6. Call Gemini to synthesize prop bet
      const promptText = `You are @fisky, the group bookie, referee, and sports analyst for "The Growth Club".
Here is the performance payload summarizing the last 30 days of workouts for our group members:
${statsSummary || 'No workouts recorded yet.'}

System instructions:
Generate 1 dynamic, interesting, and humorous prop bet for the upcoming week based on these stats (e.g. Will [Name] run a faster time, or log more than X workouts, or beat their previous high score?).
Set the bet value at exactly 50 XP.
Format it cleanly for WhatsApp to look EXACTLY like the following template (do not include markdown asterisks for bolding/italics inside the message body, only emojis, caps, and clean breaks):

🎰 *@FISKY’S MONDAY PROP BET* 🎰

[Short description of stats/streak/record attempt]
The lines are open! Will [User Name] [bet objective] this week?

Reply *YES* or *NO* in this chat to wager 50 XP! (Bets close at midnight).

Do NOT include any dashboard links, website URLs, or external references. Keep the response under 80 words.`;

      let broadcastText = '';
      try {
        const result = await generateText({
          model: googleProvider('gemini-3.5-flash'),
          prompt: promptText,
        });
        broadcastText = result.text.trim();
      } catch (aiErr) {
        console.error(`[ai-bookie] Gemini generation failed for group "${group.name}":`, aiErr);
        continue;
      }

      if (!broadcastText) continue;

      // 7. Dispatch to WhatsApp via Green API
      const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId: waChatId,
            message: broadcastText,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[ai-bookie] Green API dispatch failed for group "${group.name}":`, response.status, errorText);
        } else {
          console.log(`[ai-bookie] Monday Prop Bet sent successfully to group "${group.name}".`);
          processedGroups.push({ group: group.name, status: 'sent', length: broadcastText.length });
        }
      } catch (dispatchErr) {
        console.error(`[ai-bookie] Connection error dispatching to group "${group.name}":`, dispatchErr);
      }
    }

    return NextResponse.json({ success: true, processed: processedGroups });
  } catch (err) {
    const error = err as Error;
    console.error('[ai-bookie] Fatal execution error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Unexpected server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}
