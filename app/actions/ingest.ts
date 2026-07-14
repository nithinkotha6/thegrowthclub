'use server';

import { google } from '@ai-sdk/google';
import { z }      from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Zod schema for Gemini structured extraction.
 * v2 schema: metric_slug stored directly on the log row.
 * Spec: architecture.md §5 (Manual Ingestion Path)
 */
const MetricSchema = z.object({
  metric_slug: z
    .string()
    .describe('Snake_case metric identifier, e.g. long_run, deadlift, beers'),
  value: z
    .number()
    .describe('The numeric value extracted from the text'),
  unit: z
    .string()
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

  // ── 1. Structured extraction via Gemini ──────────────────────────────────
  let extracted: z.infer<typeof MetricSchema>;
  try {
    const { generateText } = await import('ai');
    const { text } = await generateText({
      model: google('gemini-2.5-flash'),
      prompt: `You are a fitness data parser. Extract the metric from the user's text and return ONLY a raw JSON object with no markdown, no code fences, no explanation.

Required JSON shape:
{
  "metric_slug": <snake_case string, e.g. "long_run", "deadlift", "beers", "top_speed", "calories", "weight", "push_ups", "pull_ups", "squat", "sleep", "cycling_distance", "longest_swim">,
  "value": <number>,
  "unit": <string, e.g. "miles", "kg", "mph", "lbs", "kcal", "reps", "hrs">
}

User text: "${rawText}"`,
    });

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

  // ── 2. INSERT into metric_logs (v2 schema — metric_slug direct) ───────────
  // status defaults to 'pending' → requires 3 peer votes to become 'verified'
  const supabase = await createClient();

  const { error: insertErr } = await supabase.from('metric_logs').insert({
    user_id:     userId,
    group_id:    groupId,
    metric_slug: extracted.metric_slug,
    value:       extracted.value,
    unit:        extracted.unit,
    status:      (extracted.metric_slug === 'car_top_speed' || extracted.metric_slug === 'most_beers') ? 'pending' : 'verified',
  });

  if (insertErr) {
    console.error('[ingest] Insert error:', insertErr);
    return { success: false, error: 'Failed to save activity. Please try again.' };
  }

  const { revalidatePath } = await import('next/cache');
  revalidatePath('/', 'layout');

  return {
    success:     true,
    metric_slug: extracted.metric_slug,
    value:       extracted.value,
    unit:        extracted.unit,
  };
}
