'use server';

import { executeWithKeyRotation } from '@/utils/geminiPool';
import { z }      from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession } from '@/lib/session';
import { incrementStreakIfContinuous } from '@/lib/actions/updateStreak';
 
/**
 * Zod schema for Gemini structured extraction.
 * v2 schema: metric_slug stored directly on the log row.
 * Spec: architecture.md §5 (Manual Ingestion Path)
 */
const MetricSchema = z.object({
  metric_slug: z
    .any()
    .transform(v => (v !== null && v !== undefined) ? String(v).trim() : 'unknown')
    .describe('Snake_case metric identifier, e.g. long_run, deadlift, beers'),
  value: z
    .any()
    .transform(v => {
      if (v === null || v === undefined) return 0;
      const num = Number(v);
      return isNaN(num) ? 0 : num;
    })
    .describe('The numeric value extracted from the text'),
  unit: z
    .any()
    .transform(v => (v !== null && v !== undefined) ? String(v).trim() : '')
    .describe('Unit of measurement, e.g. miles, kg, mph, lbs, kcal, reps'),
});
 
export type IngestResult =
  | { success: true; metric_slug: string; value: number; unit: string }
  | { success: false; error: string };
 
/**
 * Server Action: parse natural language → Gemini structured JSON → Supabase INSERT.
 * userId and groupId come from the HTTP-only session cookie (passed from dashboard).
 * No Supabase Auth lookup needed — Kiosk model passes identity from the cookie.
 *
 * Spec: architecture.md §5 (Manual ingestion path), §7 (Kiosk auth)
 */
export async function ingestActivity(
  rawText: string,
  userId: string,
  groupId: string,
): Promise<IngestResult> {
  if (!rawText.trim()) {
    return { success: false, error: 'Please enter a description of your activity.' };
  }
  if (!userId || !groupId) {
    return { success: false, error: 'Session expired. Please return to the home screen.' };
  }
 
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session || String(session.userId) !== String(userId) || String(session.groupId) !== String(groupId)) {
    return { success: false, error: 'Unauthorized: Session credentials mismatch.' };
  }
 
  const supabase = createAdminClient();
 
  // Fetch active configurations and dynamic user metrics
  const { data: configs } = await supabase.from('metrics_config').select('slug, display_name, unit, requires_verification');
  let customs = null;
  const { data: activeCustoms, error: hideCustomsErr } = await supabase
    .from('metric_definitions')
    .select('id, name, unit, requires_verification')
    .eq('group_id', groupId)
    .eq('is_hidden', false);

  if (hideCustomsErr) {
    console.warn('[ingest] Failed to query with is_hidden filter (migration might be pending), falling back to full list.');
    const { data: fallbackCustoms } = await supabase
      .from('metric_definitions')
      .select('id, name, unit, requires_verification')
      .eq('group_id', groupId);
    customs = fallbackCustoms;
  } else {
    customs = activeCustoms;
  }
 
  const validConfigs = configs || [];
  const validCustoms = customs || [];
 
  const configHints = validConfigs.map(c => `- "${c.display_name}" (use slug: "${c.slug}", unit: "${c.unit}")`).join('\n');
  const customHints = validCustoms.map(c => `- "${c.name}" (use UUID: "${c.id}", unit: "${c.unit}")`).join('\n');
 
  // ── 1. Structured extraction via Gemini ──────────────────────────────────
  let extracted: z.infer<typeof MetricSchema>;
  try {
    const { generateText } = await import('ai');
    const result = await executeWithKeyRotation(async (modelInstance) => {
      return generateText({
        model: modelInstance,
        prompt: `You are a fitness data parser. Extract the metric from the user's text and return ONLY a raw JSON object with no markdown, no code fences, no explanation.
  
You MUST map the activity to one of these valid metric slug/UUID keys:
=== STANDARD TRACKERS ===
${configHints}
 
=== CUSTOM DYNAMIC TRACKERS ===
${customHints}
=========================
 
Required JSON shape:
{
  "metric_slug": <exact matching slug string or UUID string from valid list above>,
  "value": <number>,
  "unit": <string, matching the unit listed above>
}
 
User text: "${rawText}"`,
      });
    });
    const text = result.text;
    const cleaned   = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed    = JSON.parse(cleaned);
    const validated = MetricSchema.safeParse(parsed);
 
    if (!validated.success) {
      const issues = validated.error.issues.map(i => i.message).join(', ');
      console.error('[ingest] Schema validation failed:', validated.error);
      return { success: false, error: `Parsing error: ${issues}` };
    }
    extracted = validated.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ingest] Gemini error:', msg);
    return { success: false, error: `AI error: ${msg}` };
  }
 
  // Validate extracted slug against valid configurations and custom metrics
  const isValid = validConfigs.some(c => c.slug === extracted.metric_slug) ||
                  validCustoms.some(c => c.id === extracted.metric_slug);
 
  if (!isValid) {
    const matchedConfig = validConfigs.find(c => c.display_name.toLowerCase() === extracted.metric_slug.toLowerCase() || c.slug.toLowerCase() === extracted.metric_slug.toLowerCase());
    const matchedCustom = validCustoms.find(c => c.name.toLowerCase() === extracted.metric_slug.toLowerCase() || c.id.toLowerCase() === extracted.metric_slug.toLowerCase());
 
    if (matchedConfig) {
      extracted.metric_slug = matchedConfig.slug;
      extracted.unit = matchedConfig.unit;
    } else if (matchedCustom) {
      extracted.metric_slug = matchedCustom.id;
      extracted.unit = matchedCustom.unit;
    } else {
      return { success: false, error: `Invalid activity: "${extracted.metric_slug}" is not a recognized metric tracker.` };
    }
  }
 
  // ── 2. INSERT into metric_logs (v2 schema — metric_slug direct) ───────────
  // status defaults to 'pending' → requires 3 peer votes to become 'verified'.
  // Checks both the built-in metrics_config flag AND the custom
  // metric_definitions flag — a custom metric can now also require
  // verification if its creator ticked that box in Settings.
  const requiresVerification =
    validConfigs.find(c => c.slug === extracted.metric_slug)?.requires_verification ??
    validCustoms.find(c => c.id === extracted.metric_slug)?.requires_verification ??
    false;
  // DATA-01: custom metrics are still identified via metric_slug (holding the
  // metric_definitions UUID) for backward compatibility, but are now also
  // recorded via a real FK column so the reference is DB-enforced.
  const matchedCustomMetric = validCustoms.find(c => c.id === extracted.metric_slug);
  const { error: insertErr } = await supabase.from('metric_logs').insert({
    user_id:              userId,
    group_id:             groupId,
    metric_slug:          extracted.metric_slug,
    metric_definition_id: matchedCustomMetric?.id ?? null,
    value:                extracted.value,
    unit:                 extracted.unit,
    status:               requiresVerification ? 'pending' : 'verified',
  });
 
  if (insertErr) {
    if (insertErr.code === '23505' || insertErr.message?.includes('unique') || insertErr.message?.includes('duplicate')) {
      return { success: false, error: 'Activity already logged today with this value.' };
    }
    console.error('[ingest] Insert error details:', {
      message: insertErr.message,
      code: insertErr.code,
      details: insertErr.details,
    });
    return { success: false, error: `Database error: ${insertErr.message} (Code: ${insertErr.code})` };
  }
 
  try {
    await incrementStreakIfContinuous(userId, groupId);
  } catch (streakErr) {
    console.error('[ingestActivity] Error updating streak:', streakErr);
  }

  const { revalidatePath } = await import('next/cache');
  // PERF-06: log ingestion only affects the dashboard chart/feed/rankings,
  // not the whole layout.
  revalidatePath('/dashboard');
 
  return {
    success:     true,
    metric_slug: extracted.metric_slug,
    value:       extracted.value,
    unit:        extracted.unit,
  };
}
