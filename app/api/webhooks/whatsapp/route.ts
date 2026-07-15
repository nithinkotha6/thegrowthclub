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

interface GroupMemberRow {
  user_id: string;
  profiles: ProfileDetails | null;
}

export async function POST(req: Request) {
  try {
    // ── 1. Pre-Flight Environment Variable Validation ───────────────────────
    const requiredKeys = [
      'GEMINI_API_KEY',
      'GREEN_API_INSTANCE_ID',
      'GREEN_API_TOKEN',
      'WHATSAPP_GROUP_ID',
      'SUPABASE_SERVICE_ROLE_KEY',
    ];
    const missingKeys = requiredKeys.filter((key) => !process.env[key]);

    if (missingKeys.length > 0) {
      console.error('[webhook/whatsapp] Missing environment variables:', missingKeys);
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required environment variables',
          missingKeys,
        },
        { status: 400 }
      );
    }

    // ── 2. Payload Parsing & Filtering ──────────────────────────────────────
    const body = await req.json();
    const typeWebhook = body.typeWebhook;
    const chatId = body.senderData?.chatId;
    const typeMessage = body.messageData?.typeMessage;

    // Secure webhook: verify it originates from our configured instance
    const idInstance = body.instanceData?.idInstance;
    const targetInstance = process.env.GREEN_API_INSTANCE_ID;
    if (!targetInstance || !idInstance || !safeCompare(String(idInstance), String(targetInstance))) {
      return NextResponse.json({ error: 'Unauthorized Green API instance' }, { status: 401 });
    }

    // Check webhook and message type
    if (typeWebhook !== 'incomingMessageReceived' || (typeMessage !== 'textMessage' && typeMessage !== 'extendedTextMessage')) {
      return NextResponse.json({ ok: true, ignored: 'not an incoming text message' });
    }

    // Verify chat group ID matches our target group
    if (chatId !== process.env.WHATSAPP_GROUP_ID) {
      return NextResponse.json({ ok: true, ignored: 'non-target chat ID' });
    }

    // Extract text message
    const incomingMessage = 
      body.messageData?.textMessageData?.textMessage || 
      body.messageData?.extendedTextMessageData?.text || 
      '';

    // Trigger detection: match triggers ignoring punctuation, leading/trailing spaces, and case (Pillar 1 Rebranding)
    const triggerRegex = /@(bot|fisky)\b|\b(stats|leaderboard|who is winning)\b/i;
    const hasTrigger = triggerRegex.test(incomingMessage);

    if (!hasTrigger) {
      return NextResponse.json({ ok: true, ignored: 'message does not target fisky' });
    }

    // Verbose logging of senderData structure (Pillar 2)
    console.log('[webhook/whatsapp] body.senderData structure:', JSON.stringify(body.senderData, null, 2));

    const rawSender = body.senderData?.sender || '';
    const senderName = body.senderData?.senderName || 'A group member';
    console.log(`[webhook/whatsapp] Triggered by message: "${incomingMessage}" from JID: ${rawSender} (${senderName})`);

    // ── 3. Synchronous Execution ───────────────────────────────────────────
    try {
      console.log('[webhook/whatsapp] Sync processing started...');
      const supabaseAdmin = createAdminClient();

      // Look for group in DB (default to Texas Buds or fallback to first group)
      const { data: groups, error: groupsError } = await supabaseAdmin
        .from('groups')
        .select('*')
        .order('created_at', { ascending: true });

      if (groupsError) {
        console.error('[webhook/whatsapp] groups query error:', groupsError);
      }

      const targetGroup = groups?.find(g => g.name === 'Texas Buds' || g.invite_code === 'TEXASBUDS') || groups?.[0];
      if (!targetGroup) {
        console.error('[webhook/whatsapp] No groups resolved in database');
        return NextResponse.json({ error: 'No groups resolved in database' }, { status: 200 });
      }

      const groupId = targetGroup.id;

      // A. Query latest 5 verified activities for the group
      const { data: recentLogs, error: recentLogsError } = await supabaseAdmin
        .from('metric_logs')
        .select(`
          id,
          value,
          unit,
          metric_slug,
          logged_at,
          profiles!inner ( nickname, full_name )
        `)
        .eq('group_id', groupId)
        .eq('status', 'verified')
        .order('logged_at', { ascending: false })
        .limit(5);

      if (recentLogsError) {
        console.error('[webhook/whatsapp] recentLogs query error:', recentLogsError);
      }

      // B. Query group members and verified top_golf logs for leaderboard calculation
      const { data: membersRaw, error: membersError } = await supabaseAdmin
        .from('group_members')
        .select(`
          user_id,
          profiles!inner ( id, full_name, nickname )
        `)
        .eq('group_id', groupId);

      if (membersError) {
        console.error('[webhook/whatsapp] group_members query error:', membersError);
      }

      const { data: topGolfLogs, error: topGolfLogsError } = await supabaseAdmin
        .from('metric_logs')
        .select('user_id, value')
        .eq('group_id', groupId)
        .eq('status', 'verified')
        .eq('metric_slug', 'top_golf');

      if (topGolfLogsError) {
        console.error('[webhook/whatsapp] top_golf logs query error:', topGolfLogsError);
      }

      interface LeaderboardEntry {
        nickname: string;
        score: number;
        hasLogged: boolean;
      }

      const members = (membersRaw || []) as unknown as GroupMemberRow[];
      const userMap = new Map<string, LeaderboardEntry>();

      for (const m of members) {
        if (m.profiles) {
          userMap.set(m.user_id, {
            nickname: m.profiles.nickname || m.profiles.full_name || 'Athlete',
            score: 0,
            hasLogged: false,
          });
        }
      }

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

      // C. Format contexts into text block (Pillar 1 Empty/Null Safeties)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recentActivitiesText = (recentLogs || []).map((log: any) => {
        const name = log.profiles?.nickname || log.profiles?.full_name || 'Someone';
        return `- ${name} logged ${log.value} ${log.unit || ''} of ${log.metric_slug} at ${new Date(log.logged_at).toLocaleDateString()}`;
      }).join('\n');

      const leaderboardText = leaderboard.map((entry, index) => {
        return `${index + 1}. ${entry.nickname}: ${entry.hasLogged ? `${entry.score} Yards` : 'No score logged'}`;
      }).join('\n');

      const dbContext = [
        `Recent Activities:`,
        recentActivitiesText || 'None',
        ``,
        `Top Golf Leaderboard Standings:`,
        leaderboardText || 'None',
      ].join('\n');

      // D. AI Invocations & Dispatch
      let text = '';
      const lowerMsg = incomingMessage.toLowerCase();
      const needsLink = lowerMsg.includes('link') || lowerMsg.includes('dashboard') || lowerMsg.includes('website') || lowerMsg.includes('how to log') || lowerMsg.includes('where to log');
      const appUrl = needsLink ? (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') : undefined;
      const promptText = `Message from ${senderName}: ${incomingMessage}`;

      try {
        const result = await generateText({
          model: googleProvider('gemini-3.5-flash'),
          system: buildGroupAssistantPrompt(dbContext, appUrl),
          prompt: promptText,
        });
        text = result.text;
      } catch (llmError) {
        console.error('[webhook/whatsapp] LLM execution error:', llmError);
        const errorStr = String(llmError).toLowerCase();
        const isRateLimit = errorStr.includes('429') || errorStr.includes('rate limit') || errorStr.includes('quota exceeded');

        if (isRateLimit) {
          text = `🤖 "Hold on, I'm analyzing too many stats at once. Let me catch my breath—ask me again in 60 seconds."`;
        } else {
          text = `🤖 "Hold on, my circuits are slightly warm right now. Give me a brief moment!"`;
        }
      }

      // Send LLM response back to the group
      await sendWhatsAppGroupMessage(text);
      console.log('[webhook/whatsapp] Sync processing completed successfully.');

      return NextResponse.json({ success: true, processed: true }, { status: 200 });
    } catch (backgroundErr) {
      const bgError = backgroundErr as Error;
      console.error('[webhook/whatsapp] Sync processing crashed:', bgError);
      const errorMsg = bgError.message || JSON.stringify(bgError);
      try {
        await sendWhatsAppGroupMessage(`⚠️ Ref here. Database/LLM Error: ${errorMsg}`);
      } catch (waErr) {
        console.error('[webhook/whatsapp] Failed to send error toast to WhatsApp:', waErr);
      }
      return NextResponse.json({ success: false, error: errorMsg }, { status: 200 });
    }
  } catch (error) {
    const err = error as Error;
    console.error("[Webhook Audit Crash]:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 200 });
  }
}
