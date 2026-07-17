import { NextResponse, after } from 'next/server';

export const maxDuration = 60; // Allow up to 60 seconds for LLM processing

import { generateText } from 'ai';
import { sendWhatsAppGroupMessage } from '@/lib/whatsapp';
import { buildGroupAssistantPrompt } from '@/lib/ai/prompts';
import { createAdminClient } from '@/lib/supabase/server';
import { safeCompare } from '@/lib/security';
import { executeWithKeyRotation } from '@/utils/geminiPool';

interface ProfileDetails {
  id: string;
  nickname: string | null;
  full_name: string | null;
}

interface GroupMemberRow {
  user_id: string;
  profiles: ProfileDetails | null;
}

// Robust text extractor checking all possible Green API structures
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMessageText(body: any): string {
  if (!body?.messageData) return '';
  
  const textMessage = body.messageData?.textMessageData?.textMessage;
  if (textMessage) return textMessage;
  
  const extendedText = body.messageData?.extendedTextMessageData?.text;
  if (extendedText) return extendedText;
  
  const quotedText = body.messageData?.quotedMessage?.textMessage || 
                     body.messageData?.quotedMessage?.extendedTextMessageData?.text;
  if (quotedText) return quotedText;

  const templateText = body.messageData?.templateMessageData?.contentText;
  if (templateText) return templateText;

  return '';
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createAdminClient();
    const { data: muteData } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'bot_muted')
      .maybeSingle();

    if (muteData?.value === 'true') {
      console.log('[webhook/whatsapp] Bot is muted. Returning early.');
      return NextResponse.json({ status: 'muted' }, { status: 200 });
    }

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
        { status: 200 } // Always return 200 to halt retries
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
      return NextResponse.json({ error: 'Unauthorized Green API instance' }, { status: 200 });
    }

    // Check webhook and message type
    if (typeWebhook !== 'incomingMessageReceived' || (typeMessage !== 'textMessage' && typeMessage !== 'extendedTextMessage')) {
      return NextResponse.json({ ok: true, ignored: 'not an incoming text message' });
    }

    // Verify chat group ID matches our target group
    if (chatId !== process.env.WHATSAPP_GROUP_ID) {
      return NextResponse.json({ ok: true, ignored: 'non-target chat ID' });
    }

    // Extract text message using robust parser
    const incomingMessage = extractMessageText(body);
    if (!incomingMessage) {
      console.warn('[webhook/whatsapp] No text found in incoming webhook payload:', JSON.stringify(body));
      return NextResponse.json({ ok: true, ignored: 'no text content extracted' });
    }

    // Task 2.3: Implement /clear Memory Wipe Command
    if (incomingMessage.trim().toLowerCase() === '/clear') {
      const supabaseAdmin = createAdminClient();
      
      const { data: groups } = await supabaseAdmin
        .from('groups')
        .select('*')
        .order('created_at', { ascending: true });
        
      const targetGroup = groups?.find(g => g.name === 'Texas Buds' || g.invite_code === 'TEXASBUDS') || groups?.[0];
      if (targetGroup) {
        await supabaseAdmin
          .from('chat_history')
          .delete()
          .eq('group_id', targetGroup.id);
      }

      const clearReply = `🧹 *Memory Cleared!*\n\nShort-term chat context has been wiped. I'm ready for a fresh topic! (System rules and game XP remain intact).`;
      await sendWhatsAppGroupMessage(clearReply);
      return NextResponse.json({ ok: true, message: 'memory cleared' });
    }

    const rawSender = body.senderData?.sender || '';
    const senderName = body.senderData?.senderName || 'A group member';
    const messageId = body.idMessage || '';
    console.log(`[webhook/whatsapp] Triggered by message: "${incomingMessage}" from JID: ${rawSender} (${senderName}), messageId: ${messageId}`);

    // ── 3. Asynchronous Background Execution (waitUntil / after) ────────────
    after(async () => {
      try {
        console.log('[webhook/whatsapp] Background processing started...');
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
          return;
        }

        const groupId = targetGroup.id;

        // Fetch sender's profile for nickname and gender to support flirting logic
        let senderNickname: string | null = null;
        let senderGender: string | null = null;

        if (rawSender) {
          const cleanPhone = rawSender.split('@')[0];
          const { data: profileData } = await supabaseAdmin
            .from('profiles')
            .select('nickname, gender')
            .or(`phone_number.eq.+${cleanPhone},phone_number.eq.${cleanPhone},phone_number.like.%${cleanPhone}%`)
            .limit(1)
            .maybeSingle();

          if (profileData) {
            senderNickname = profileData.nickname;
            senderGender = profileData.gender;
          }
        }

        // Task 2.2: Conversational Memory Optimization (The Token Clamp)
        let formattedHistory: { role: 'user' | 'assistant'; content: string }[] = [];
        try {
          const { data: dbHistory, error: dbHistError } = await supabaseAdmin
            .from('chat_history')
            .select('role, content, created_at')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false })
            .limit(3); // Strictly retrieve only the last 3 messages of context

          if (!dbHistError && dbHistory && dbHistory.length > 0) {
            const lastMsgTime = new Date(dbHistory[0].created_at).getTime();
            if (Date.now() - lastMsgTime > 30 * 60 * 1000) {
              console.log('[webhook/whatsapp] Session inactivity: clearing old conversation memory context');
              formattedHistory = [];
            } else {
              // Chronological order
              const chronoHistory = dbHistory.slice().reverse();
              formattedHistory = chronoHistory.map((h) => ({
                role: h.role as 'user' | 'assistant',
                content: h.content,
              }));
            }
          }
        } catch (dbHistErr) {
          console.warn('[webhook/whatsapp] Failed to fetch chat history from DB:', dbHistErr);
        }

        // B. Query latest 5 verified activities for the group
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

        // C. Query group members and verified top_golf logs for leaderboard calculation
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

        // D. Format contexts into text block (Pillar 1 Empty/Null Safeties)
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

        // E. AI Invocations & Dispatch
        const incomingWordCount = incomingMessage ? incomingMessage.split(' ').length : 10;
        const targetWordLimit = Math.max(15, incomingWordCount * 3);

        let text = '';
        const promptText = `Message from ${senderName}: ${incomingMessage}`;

        const finalMessages = [
          ...formattedHistory,
          { role: 'user' as const, content: promptText }
        ];

        // 10% chance to organically trigger fitness coach interruption phrase (truly rare and random)
        const triggerInterruption = Math.random() < 0.10;

        try {
          const result = await executeWithKeyRotation(async (modelInstance) => {
            return generateText({
              model: modelInstance,
              system: buildGroupAssistantPrompt(
                dbContext,
                targetWordLimit,
                senderGender,
                senderNickname || senderName,
                triggerInterruption
              ),
              messages: finalMessages,
            });
          });
          text = result.text;
        } catch (llmError) {
          console.error("AI execution failed or keys exhausted. Silently dropping reply to prevent spam.", llmError);
          return;
        }

        // Send LLM response back to the group quoting the trigger message JID
        await sendWhatsAppGroupMessage(text, messageId);
        console.log('[webhook/whatsapp] Background processing completed successfully.');

        // F. Save messages to database chat_history
        try {
          await supabaseAdmin.from('chat_history').insert([
            { group_id: groupId, role: 'user', sender_name: senderName, content: promptText },
            { group_id: groupId, role: 'assistant', sender_name: 'Fisky', content: text },
          ]);
        } catch (dbSaveErr) {
          console.error('[webhook/whatsapp] Failed to save conversation logs:', dbSaveErr);
        }
      } catch (backgroundErr) {
        const bgError = backgroundErr as Error;
        console.error('[webhook/whatsapp] Background processing crashed:', bgError);
      }
    });

    // Return 200 OK immediately
    return NextResponse.json({ success: true, queued: true }, { status: 200 });
  } catch (error) {
    const err = error as Error;
    console.error("[Webhook Audit Crash]:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 200 }); // Always 200 to halt retries
  }
}
