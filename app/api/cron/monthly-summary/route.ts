import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { executeWithKeyRotation } from '@/utils/geminiPool';
import { createAdminClient } from '@/lib/supabase/server';
import { safeCompare } from '@/lib/security';
import { sendWhatsAppGroupMessage } from '@/lib/whatsapp';

export const maxDuration = 60;

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
  user_id: string;
  value: number;
  unit: string;
  metric_slug: string;
}

/**
 * Monthly bot summary cron. Runs 1st of every month — queries the previous
 * calendar month's verified `metric_logs` per group, compiles per-member
 * stats (total activities, top metric, personal best), and dispatches a
 * WhatsApp broadcast via each group's own Green API credentials — same
 * per-group iteration/dispatch pattern as `daily-whistle`.
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    const secret = process.env.CRON_SECRET;

    if (!secret || !authHeader || !safeCompare(authHeader, `Bearer ${secret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // Previous calendar month's [start, end) bounds.
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

    const { data: groups, error: groupsErr } = await supabaseAdmin
      .from('groups')
      .select('id, name, whatsapp_instance_id, whatsapp_token, whatsapp_group_id');

    if (groupsErr) {
      console.error('[monthly-summary] Failed to fetch groups:', groupsErr);
      return NextResponse.json({ error: groupsErr.message }, { status: 500 });
    }

    const processedGroups: { group: string; sent: boolean }[] = [];

    for (const group of groups || []) {
      const instanceId = group.whatsapp_instance_id || process.env.GREEN_API_INSTANCE_ID;
      const token = group.whatsapp_token || process.env.GREEN_API_TOKEN;
      const waChatId = group.whatsapp_group_id || process.env.WHATSAPP_GROUP_ID;

      if (!instanceId || !token || !waChatId) {
        console.log(`[monthly-summary] Group "${group.name}" lacks configured WhatsApp credentials. Skipping.`);
        processedGroups.push({ group: group.name, sent: false });
        continue;
      }

      const { data: membersRaw } = await supabaseAdmin
        .from('group_members')
        .select('user_id, profiles!inner ( id, nickname, full_name )')
        .eq('group_id', group.id);
      const members = (membersRaw || []) as unknown as GroupMemberRow[];
      const nameByUserId = new Map<string, string>();
      for (const m of members) {
        if (m.profiles) nameByUserId.set(m.user_id, m.profiles.nickname || m.profiles.full_name || 'Athlete');
      }

      const { data: logsRaw, error: logsErr } = await supabaseAdmin
        .from('metric_logs')
        .select('user_id, value, unit, metric_slug')
        .eq('group_id', group.id)
        .eq('status', 'verified')
        .gte('logged_at', monthStart.toISOString())
        .lt('logged_at', monthEnd.toISOString());

      if (logsErr) {
        console.error(`[monthly-summary] Error querying logs for group "${group.name}":`, logsErr);
        processedGroups.push({ group: group.name, sent: false });
        continue;
      }

      const logs = (logsRaw || []) as unknown as LogRow[];
      if (logs.length === 0) {
        console.log(`[monthly-summary] No verified logs for group "${group.name}" in ${monthLabel}. Skipping.`);
        processedGroups.push({ group: group.name, sent: false });
        continue;
      }

      // Aggregate per user: total activity count, per-metric count (for "top
      // metric"), and per-metric personal best (max value).
      type UserStats = {
        total: number;
        metricCounts: Record<string, number>;
        bests: Record<string, { value: number; unit: string }>;
      };
      const statsByUser = new Map<string, UserStats>();

      for (const log of logs) {
        const stats = statsByUser.get(log.user_id) ?? { total: 0, metricCounts: {}, bests: {} };
        stats.total += 1;
        stats.metricCounts[log.metric_slug] = (stats.metricCounts[log.metric_slug] || 0) + 1;
        const existingBest = stats.bests[log.metric_slug];
        const val = Number(log.value);
        if (!existingBest || val > existingBest.value) {
          stats.bests[log.metric_slug] = { value: val, unit: log.unit };
        }
        statsByUser.set(log.user_id, stats);
      }

      const summaryLines: string[] = [];
      for (const [userId, stats] of statsByUser.entries()) {
        const name = nameByUserId.get(userId) || 'Someone';
        const topMetric = Object.entries(stats.metricCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'activity';
        const bestEntries = Object.entries(stats.bests)
          .map(([slug, b]) => `${slug.replace(/_/g, ' ')}: ${b.value} ${b.unit}`)
          .join(', ');
        summaryLines.push(`- ${name}: ${stats.total} activities logged, top metric "${topMetric}". Personal bests — ${bestEntries}`);
      }

      const statsSummary = summaryLines.join('\n');

      let broadcastText = '';
      try {
        const result = await executeWithKeyRotation(async (modelInstance) => {
          return generateText({
            model: modelInstance,
            prompt: [
              `You are 'Fisky', a witty banter bot for the "${group.name}" WhatsApp group.`,
              `Write a fun, high-energy monthly recap for ${monthLabel} using this data (do not invent numbers not present here):`,
              statsSummary,
              ``,
              `Keep it under 120 words, no markdown formatting, no hashtags. Return only the final message text.`,
            ].join('\n'),
          });
        });
        broadcastText = result.text.trim();
      } catch (aiErr) {
        console.error(`[monthly-summary] Gemini generation failed for group "${group.name}":`, aiErr);
        processedGroups.push({ group: group.name, sent: false });
        continue;
      }

      if (!broadcastText) {
        processedGroups.push({ group: group.name, sent: false });
        continue;
      }

      try {
        await sendWhatsAppGroupMessage(broadcastText, undefined, {
          instanceId: group.whatsapp_instance_id,
          token: group.whatsapp_token,
          chatId: group.whatsapp_group_id,
        });
        console.log(`[monthly-summary] Sent monthly summary to group "${group.name}".`);
        processedGroups.push({ group: group.name, sent: true });
      } catch (sendErr) {
        console.error(`[monthly-summary] Failed to send WhatsApp message for group "${group.name}":`, sendErr);
        processedGroups.push({ group: group.name, sent: false });
      }
    }

    return NextResponse.json({ ok: true, month: monthLabel, processedGroups });
  } catch (err) {
    console.error('[monthly-summary] Fatal error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
