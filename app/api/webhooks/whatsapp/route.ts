import { NextResponse, after } from 'next/server';

export const maxDuration = 60; // Allow up to 60 seconds for LLM processing

import { generateText } from 'ai';
import { sendWhatsAppGroupMessage } from '@/lib/whatsapp';
import { buildWebhookReplyPrompt, PROMPT_VERSION } from '@/lib/ai/prompts';
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

    // Resolve which group this message belongs to by matching chatId against
    // groups.whatsapp_group_id (see ISO-05) — no longer a single hardcoded
    // WHATSAPP_GROUP_ID env var comparison. Reject inbound webhooks whose
    // chatId doesn't match any configured group, or whose matched group has
    // no whatsapp_instance_id configured (defense against replayed webhooks
    // from a decommissioned group).
    const { data: groups, error: groupsLookupError } = await supabaseAdmin
      .from('groups')
      .select('*')
      .order('created_at', { ascending: true });

    if (groupsLookupError) {
      console.error('[webhook/whatsapp] groups lookup error:', groupsLookupError);
    }

    const targetGroup = groups?.find(g => g.whatsapp_group_id === chatId);
    if (!targetGroup || !targetGroup.whatsapp_instance_id) {
      return NextResponse.json({ ok: true, ignored: 'no group configured for this chat ID' });
    }

    const groupWaCredentials = {
      instanceId: targetGroup.whatsapp_instance_id,
      token: targetGroup.whatsapp_token,
      chatId: targetGroup.whatsapp_group_id,
    };

    // Extract text message using robust parser
    const incomingMessage = extractMessageText(body);
    if (!incomingMessage) {
      console.warn('[webhook/whatsapp] No text found in incoming webhook payload:', JSON.stringify(body));
      return NextResponse.json({ ok: true, ignored: 'no text content extracted' });
    }

    // Task 2.3: Implement /clear Memory Wipe Command
    if (incomingMessage.trim().toLowerCase() === '/clear') {
      await supabaseAdmin
        .from('chat_history')
        .delete()
        .eq('group_id', targetGroup.id);

      const clearReply = `🧹 *Memory Cleared!*\n\nShort-term chat context has been wiped. I'm ready for a fresh topic! (System rules and game XP remain intact).`;
      await sendWhatsAppGroupMessage(clearReply, undefined, groupWaCredentials);
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
        const groupId = targetGroup.id;

        // PERF-07: the queries below are all independent of each other — each
        // keys off `groupId` (or `rawSender`, known upfront) with no
        // cross-dependency — so fire them concurrently via Promise.all
        // instead of sequential awaits. The one truly dependent query
        // (targetProfile, which needs persistentState's target_user_id)
        // stays sequential, after this batch resolves.
        const [
          senderInfo,
          formattedHistory,
          recentLogsResult,
          membersResult,
          topGolfLogsResult,
          persistentStateResult,
          groupMembersResult,
          recentLogs7dResult,
        ] = await Promise.all([
          // Fetch sender's profile for nickname
          (async () => {
            let senderNickname: string | null = null;

            if (rawSender) {
              const cleanPhone = rawSender.split('@')[0];
              const { data: profileData } = await supabaseAdmin
                .from('profiles')
                .select('nickname')
                .or(`phone_number.eq.+${cleanPhone},phone_number.eq.${cleanPhone},phone_number.like.%${cleanPhone}%`)
                .limit(1)
                .maybeSingle();

              if (profileData) {
                senderNickname = profileData.nickname;
              }
            }
            return { senderNickname };
          })(),

          // Task 2.2: Conversational Memory Optimization (The Token Clamp)
          (async () => {
            let formattedHistory: { role: 'user' | 'assistant'; content: string }[] = [];
            try {
              const { data: dbHistory, error: dbHistError } = await supabaseAdmin
                .from('chat_history')
                .select('role, content, created_at')
                .eq('group_id', groupId)
                .order('created_at', { ascending: false })
                .limit(5); // Retrieve the last 3-5 messages of context (RULE_CONTEXT_WINDOW)

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
            return formattedHistory;
          })(),

          // B. Query latest 5 verified activities for the group
          supabaseAdmin
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
            .limit(5),

          // C. Query group members and verified top_golf logs for leaderboard calculation
          supabaseAdmin
            .from('group_members')
            .select(`
            user_id,
            profiles!inner ( id, full_name, nickname )
          `)
            .eq('group_id', groupId),

          supabaseAdmin
            .from('metric_logs')
            .select('user_id, value')
            .eq('group_id', groupId)
            .eq('status', 'verified')
            .eq('metric_slug', 'top_golf'),

          // D. Bot persistent state
          supabaseAdmin
            .from('bot_persistent_state')
            .select('persistent_mood, target_user_id')
            .eq('group_id', groupId)
            .maybeSingle(),

          // Active group members
          supabaseAdmin
            .from('group_members')
            .select('user_id, profiles(id, nickname, full_name, is_active)')
            .eq('group_id', groupId),

          // 7-day activity
          supabaseAdmin
            .from('metric_logs')
            .select('user_id')
            .eq('group_id', groupId)
            .eq('status', 'verified')
            .gte('logged_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        ]);

        const { senderNickname } = senderInfo;

        const { data: recentLogs, error: recentLogsError } = recentLogsResult;
        if (recentLogsError) {
          console.error('[webhook/whatsapp] recentLogs query error:', recentLogsError);
        }

        const { data: membersRaw, error: membersError } = membersResult;
        if (membersError) {
          console.error('[webhook/whatsapp] group_members query error:', membersError);
        }

        const { data: topGolfLogs, error: topGolfLogsError } = topGolfLogsResult;
        if (topGolfLogsError) {
          console.error('[webhook/whatsapp] top_golf logs query error:', topGolfLogsError);
        }

        const { data: persistentState } = persistentStateResult;
        const { data: groupMembers } = groupMembersResult;
        const { data: recentLogs7d } = recentLogs7dResult;

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
        // (persistentState was fetched concurrently in the Promise.all batch above)
        let persistentMoodDirective = null;
        if (persistentState && persistentState.persistent_mood !== 'Normal') {
          const mood = persistentState.persistent_mood;
          let targetName = null;
          if (persistentState.target_user_id) {
            const { data: targetProfile } = await supabaseAdmin
              .from('profiles')
              .select('nickname, full_name')
              .eq('id', persistentState.target_user_id)
              .maybeSingle();
            if (targetProfile) {
              targetName = targetProfile.nickname || targetProfile.full_name;
            }
          }

          if (targetName) {
            persistentMoodDirective = `Your persistent mood is "${mood}" specifically directed towards member "${targetName}". Maintain this emotional tone, attitude, and vibe in all your remarks to or about them!`;
          } else {
            persistentMoodDirective = `Your persistent mood is "${mood}" globally for all group members. Adopt and maintain this emotional attitude, style, and tone in all your replies!`;
          }
        }

        // ── Find active group members & 7-day inactivity slackers ──────────
        // (groupMembers and recentLogs7d were fetched concurrently in the
        // Promise.all batch above)
        const activeMembers = (groupMembers || [])
          .map((m) => m.profiles as any)
          .filter((p) => p && p.is_active !== false);

        const activeUserIdsWithLogs = new Set((recentLogs7d || []).map((l) => l.user_id));
        const slackers = activeMembers.filter((m) => !activeUserIdsWithLogs.has(m.id));

        let slackerDirective = null;
        if (slackers.length > 0) {
          const slackerNames = slackers.map((s) => s.nickname || s.full_name).join(', ');
          slackerDirective = `CRITICAL SLACKER LIST: The following group members have logged ZERO activities in the last 7 days: [${slackerNames}]. Actively mock, shame, and make fun of their laziness (specifically targeting their names if relevant). Call them "slackers" or use funny, playful shaming terms.`;
        }
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

        // Prefer the name resolved from the sender's signed-up phone number
        // (profiles.phone_number) over the raw WhatsApp push name — the two
        // can differ (WhatsApp display name vs. app nickname), and using the
        // resolved one consistently here keeps this turn's content aligned
        // with what the system prompt already tells the AI ("You're replying
        // to {senderNickname}") instead of contradicting it.
        const resolvedSenderName = senderNickname || senderName;

        let text = '';
        const promptText = `Message from ${resolvedSenderName}: ${incomingMessage}`;

        const finalMessages = [
          ...formattedHistory,
          { role: 'user' as const, content: promptText }
        ];

        try {
          const result = await executeWithKeyRotation(async (modelInstance) => {
            return generateText({
              model: modelInstance,
              system: buildWebhookReplyPrompt(
                dbContext,
                targetWordLimit,
                senderNickname || senderName,
                persistentMoodDirective,
                slackerDirective
              ),
              messages: finalMessages,
            });
          });
          text = result.text;
        } catch (llmError) {
          console.error("AI execution failed or keys exhausted. Sending fallback reply instead of dropping silently.", llmError);
          try {
            await sendWhatsAppGroupMessage(
              "Brain's overheating right now 🥵 give me a sec and try that again.",
              messageId,
              groupWaCredentials
            );
          } catch (fallbackSendErr) {
            console.error('[webhook/whatsapp] Failed to send fallback reply:', fallbackSendErr);
          }
          return;
        }

        // Send LLM response back to the group quoting the trigger message JID
        await sendWhatsAppGroupMessage(text, messageId, groupWaCredentials);
        console.log('[webhook/whatsapp] Background processing completed successfully.');

        // F. Save messages to database chat_history
        try {
          await supabaseAdmin.from('chat_history').insert([
            { group_id: groupId, role: 'user', sender_name: resolvedSenderName, content: promptText },
            { group_id: groupId, role: 'assistant', sender_name: 'Fisky', content: text, prompt_version: PROMPT_VERSION },
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
