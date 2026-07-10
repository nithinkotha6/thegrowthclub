'use server';

import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * The shape Gemini must return — maps directly to a metric_logs INSERT.
 * Spec: .claude/rules/database.md §1 (EAV pattern).
 */
const MetricSchema = z.object({
  metric_slug: z
    .enum(['long_run', 'deadlift', 'top_speed', 'weight', 'calories'])
    .describe('Which metric this activity belongs to'),
  value: z
    .number()
    .describe('The numeric value extracted from the text'),
  unit: z
    .string()
    .describe('Unit of measurement, e.g. miles, kg, mph, lbs, kcal'),
});

export type IngestResult =
  | { success: true; metric_slug: string; value: number; unit: string }
  | { success: false; error: string };

/**
 * Server Action: parse natural language → Gemini structured JSON → Supabase INSERT.
 * Architecture: Features.md §6, architecture.md §2 steps 3 & 5.
 *
 * Usage: called from AddActivityModal ('use client').
 */
export async function ingestActivity(rawText: string): Promise<IngestResult> {
  if (!rawText.trim()) {
    return { success: false, error: 'Please enter a description of your activity.' };
  }

  // ── 1. Structured extraction via Gemini ───────────────────────────────────
  // Using generateText + manual parse is more reliable across key types than
  // generateObject (which requires tool-calling mode support).
  let extracted: z.infer<typeof MetricSchema>;
  try {
    const { generateText } = await import('ai');
    const { text } = await generateText({
      model: google('gemini-2.0-flash'),
      prompt: `You are a fitness data parser. Extract the metric from the user's text and return ONLY a raw JSON object with no markdown, no code fences.

Required JSON shape:
{
  "metric_slug": one of ["long_run","deadlift","top_speed","weight","calories"],
  "value": <number>,
  "unit": <string, e.g. "miles","kg","mph","lbs","kcal">
}

User text: "${rawText}"`,
    });

    // Strip any accidental markdown code fences Gemini might add
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(cleaned);
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


  // ── 2. Resolve metric_id from metrics_config ──────────────────────────────
  const supabase = await createClient();

  const { data: metric, error: metricErr } = await supabase
    .from('metrics_config')
    .select('id')
    .eq('slug', extracted.metric_slug)
    .single();

  if (metricErr || !metric) {
    return { success: false, error: `Unknown metric type: ${extracted.metric_slug}` };
  }

  // ── 3. Get the current user ───────────────────────────────────────────────
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  // For manual testing without auth, fall back to the first profile row.
  let userId: string;
  if (authErr || !user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)
      .single();
    if (!profile) {
      return { success: false, error: 'No user profile found. Please sign in.' };
    }
    userId = profile.id;
  } else {
    userId = user.id;
  }

  // ── 4. INSERT into metric_logs (status defaults to 'pending') ─────────────
  const { error: insertErr } = await supabase.from('metric_logs').insert({
    user_id: userId,
    metric_id: metric.id,
    value: extracted.value,
    status: 'pending',
  });

  if (insertErr) {
    console.error('[ingest] Insert error:', insertErr);
    return { success: false, error: 'Failed to save activity. Please try again.' };
  }

  return {
    success: true,
    metric_slug: extracted.metric_slug,
    value: extracted.value,
    unit: extracted.unit,
  };
}
