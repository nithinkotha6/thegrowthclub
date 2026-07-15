import { NextResponse } from 'next/server';
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

interface LogRow {
  id: string;
  user_id: string;
  value: number;
  unit: string;
  metric_slug: string;
  logged_at: string;
}

async function handleRequest(req: Request) {
  try {
    // ── 1. Security Authorization ───────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    const secret = process.env.CRON_SECRET;

    if (secret && (!authHeader || !safeCompare(authHeader, `Bearer ${secret}`))) {
      console.warn('[daily-whistle] Unauthorized cron trigger attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // ── 2. Retrieve All Active Groups ───────────────────────────────────────
    const { data: groups, error: groupsErr } = await supabaseAdmin
      .from('groups')
      .select('id, name, whatsapp_instance_id, whatsapp_token, whatsapp_group_id');

    if (groupsErr) {
      console.error('[daily-whistle] Failed to fetch groups:', groupsErr);
      return NextResponse.json({ error: groupsErr.message }, { status: 500 });
    }

    const processedGroups = [];

    for (const group of groups || []) {
      const instanceId = group.whatsapp_instance_id || process.env.GREEN_API_INSTANCE_ID;
      const token = group.whatsapp_token || process.env.GREEN_API_TOKEN;
      const waChatId = group.whatsapp_group_id || process.env.WHATSAPP_GROUP_ID;

      // Skip groups that lack a configured WhatsApp integration
      if (!instanceId || !token || !waChatId) {
        console.log(`[daily-whistle] Group "${group.name}" lacks configured WhatsApp credentials. Skipping.`);
        continue;
      }

      console.log(`[daily-whistle] Processing Daily Whistle for Group: "${group.name}"`);

      // ── 3. Query Group Members ────────────────────────────────────────────
      const { data: membersRaw, error: membersErr } = await supabaseAdmin
        .from('group_members')
        .select(`
          user_id,
          profiles!inner ( id, nickname, full_name )
        `)
        .eq('group_id', group.id);

      if (membersErr || !membersRaw) {
        console.error(`[daily-whistle] Error querying members for group "${group.name}":`, membersErr);
        continue;
      }

      const members = membersRaw as unknown as GroupMemberRow[];

      // ── 4. Query Yesterday's Verified Logs (Last 24 Hours) ────────────────
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: logsRaw, error: logsErr } = await supabaseAdmin
        .from('metric_logs')
        .select('id, user_id, value, unit, metric_slug, logged_at')
        .eq('group_id', group.id)
        .eq('status', 'verified')
        .gte('logged_at', yesterday);

      if (logsErr) {
        console.error(`[daily-whistle] Error querying logs for group "${group.name}":`, logsErr);
        continue;
      }

      const logs = (logsRaw || []) as unknown as LogRow[];

      // ── 5. Calculate yesterday's MVP and zero-loggers (slackers) ──────────
      // MVP is the member with the single highest value log logged yesterday
      const sortedLogs = [...logs].sort((a, b) => Number(b.value) - Number(a.value));
      const highestLog = sortedLogs[0] || null;

      let mvpName = '';
      let mvpValue = 0;
      let mvpUnit = '';
      let mvpSlug = '';

      if (highestLog) {
        const mvpMember = members.find(m => m.user_id === highestLog.user_id);
        if (mvpMember && mvpMember.profiles) {
          mvpName = mvpMember.profiles.nickname || mvpMember.profiles.full_name || 'Athlete';
          mvpValue = highestLog.value;
          mvpUnit = highestLog.unit || '';
          mvpSlug = highestLog.metric_slug.replace(/_/g, ' ');
        }
      }

      // Slackers are members who logged exactly zero verified activities yesterday
      const loggedUserIds = new Set(logs.map(l => l.user_id));
      const slackers: string[] = [];

      for (const m of members) {
        if (m.profiles && !loggedUserIds.has(m.user_id)) {
          slackers.push(m.profiles.nickname || m.profiles.full_name || 'Athlete');
        }
      }

      // ── 6. Compute Log Streaks (Last 14 days consecutive check) ───────────
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: historicalRaw } = await supabaseAdmin
        .from('metric_logs')
        .select('user_id, logged_at')
        .eq('group_id', group.id)
        .eq('status', 'verified')
        .gte('logged_at', twoWeeksAgo);

      const historicalLogs = (historicalRaw || []) as { user_id: string; logged_at: string }[];
      const userStreakMap: Record<string, number> = {};

      for (const m of members) {
        const userId = m.user_id;
        const userLogs = historicalLogs.filter(l => l.user_id === userId);
        const loggedDates = new Set<string>();

        for (const l of userLogs) {
          loggedDates.add(new Date(l.logged_at).toISOString().split('T')[0]);
        }

        let streak = 0;
        const checkDate = new Date();
        let dateStr = checkDate.toISOString().split('T')[0];

        // Active streak check (today or yesterday start)
        if (loggedDates.has(dateStr)) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
          while (true) {
            dateStr = checkDate.toISOString().split('T')[0];
            if (loggedDates.has(dateStr)) {
              streak++;
              checkDate.setDate(checkDate.getDate() - 1);
            } else {
              break;
            }
          }
        } else {
          checkDate.setDate(checkDate.getDate() - 1);
          dateStr = checkDate.toISOString().split('T')[0];
          if (loggedDates.has(dateStr)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
            while (true) {
              dateStr = checkDate.toISOString().split('T')[0];
              if (loggedDates.has(dateStr)) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
              } else {
                break;
              }
            }
          }
        }

        if (streak >= 2) {
          if (m.profiles) {
            const name = m.profiles.nickname || m.profiles.full_name || 'Athlete';
            userStreakMap[name] = streak;
          }
        }
      }

      const streakEntries = Object.entries(userStreakMap).map(([name, days]) => `- ${name}: ${days} days streak 🔥`);
      const streakListText = streakEntries.join('\n');

      // ── 7. Generate daily whistle message using Gemini 3.5 Flash ─────────
      const promptText = `
You are @fisky, the Gen-Z AI Referee for The Growth Club. Write today's morning daily whistle briefing for the group "${group.name}".

Yesterday's Group Stats:
- MVP: ${mvpName ? `${mvpName} (Logged: ${mvpValue} ${mvpUnit} for ${mvpSlug})` : 'No MVP yesterday (no verified logs completed)'}
- Slackers (Logged 0 activities yesterday): ${slackers.length > 0 ? slackers.join(', ') : 'None! Everyone logged workouts!'}

Active Group Streaks:
${streakListText || 'No active streaks of 2+ days.'}

System Directive:
Write a high-energy, 3-bullet morning briefing for the WhatsApp group chat.
1. Acknowledge yesterday's MVP.
2. Playfully but brutally call out anyone who logged zero workouts yesterday (the slackers).
3. Set the daily target challenge to motivate the group.
Keep it under 100 words. Use natural Gen-Z slang, abbreviations, and emojis. Do not use hashtags or markdown formatting (no bolding, no italics, no asterisks for formatting). Return only the final text message.`;

      let broadcastText = '';
      try {
        const result = await generateText({
          model: googleProvider('gemini-3.5-flash'),
          prompt: promptText,
        });
        broadcastText = result.text.trim();
      } catch (aiErr) {
        console.error(`[daily-whistle] Gemini generation failed for group "${group.name}":`, aiErr);
        continue;
      }

      if (!broadcastText) {
        continue;
      }

      // ── 8. Dispatch to WhatsApp ───────────────────────────────────────────
      const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId: waChatId,
            message: broadcastText,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[daily-whistle] Green API dispatch failed for group "${group.name}":`, response.status, errorText);
        } else {
          console.log(`[daily-whistle] Morning briefing sent successfully to group "${group.name}".`);
          processedGroups.push({ group: group.name, status: 'sent', length: broadcastText.length });
        }
      } catch (dispatchErr) {
        console.error(`[daily-whistle] Connection error dispatching to group "${group.name}":`, dispatchErr);
      }
    }

    return NextResponse.json({ success: true, processed: processedGroups });
  } catch (err) {
    const error = err as Error;
    console.error('[daily-whistle] Fatal execution error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Unexpected server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}
