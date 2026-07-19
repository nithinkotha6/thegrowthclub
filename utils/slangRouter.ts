import { createAdminClient } from '@/lib/supabase/server';

/**
 * Slang Routing Utility
 *
 * Maps user-selected conversational tones and gender styles to vocabulary
 * arrays. Consumed by `adminTriggerPoke` (see `app/actions/admin.ts`) — the
 * resolved array is injected verbatim into the LLM prompt as "friendly-insult
 * / banter expressions" the model MUST incorporate.
 *
 * `vocab_banks` (managed via the admin Settings "Vocab Bank Editor" panel) is
 * the single source of truth and is scoped per group via its `group_id`
 * column (see ISO-04) — one group's admin-authored vocab never leaks into
 * another group's poke output. This file contains no hardcoded vocabulary —
 * only routing/normalization logic and a short-lived per-group read cache so
 * repeated calls within the cache window don't hit the database every time.
 */

type VocabRow = { tone: string; target_gender: string; words: string[] };

const CACHE_TTL_MS = 60_000;
const cacheByGroup = new Map<string, { rows: VocabRow[]; fetchedAt: number }>();

async function loadVocabBanks(groupId: string): Promise<VocabRow[]> {
  const cached = cacheByGroup.get(groupId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rows;
  }

  try {
    const supabase = createAdminClient(groupId);
    const { data, error } = await supabase
      .from('vocab_banks')
      .select('tone, target_gender, words')
      .eq('group_id', groupId);

    if (error) throw error;

    const entry = { rows: data || [], fetchedAt: Date.now() };
    cacheByGroup.set(groupId, entry);
    return entry.rows;
  } catch (err) {
    console.error('[slangRouter] Failed to load vocab_banks:', err);
    return cacheByGroup.get(groupId)?.rows || [];
  }
}

/**
 * Returns the tone + gender appropriate slang vocabulary list from the
 * caller's own group's `vocab_banks` rows, or an empty array when no
 * vocabulary is configured for the requested cell.
 */
export async function getSlangFor(groupId: string, tone: string, gender: string): Promise<string[]> {
  // Map UI tone strings to seed tones
  let mappedTone = 'ragebait';
  if (tone === 'motivate' || tone === 'praise') {
    mappedTone = 'motivate';
  } else if (tone === 'flirt' || tone === 'flirt_tease') {
    mappedTone = 'flirt_tease';
  } else {
    mappedTone = 'ragebait'; // default for ragebait, fun-roast, sarcastic
  }

  // Normalize target gender
  let targetGender = 'Neutral';
  if (gender === 'Male' || gender === 'male') {
    targetGender = 'Male';
  } else if (gender === 'Female' || gender === 'female') {
    targetGender = 'Female';
  } else if (gender === 'Gay' || gender === 'gay') {
    targetGender = 'Gay';
  }

  const rows = await loadVocabBanks(groupId);
  const match = rows.find((r) => r.tone === mappedTone && r.target_gender === targetGender);
  if (match) return match.words || [];

  const neutralMatch = rows.find((r) => r.tone === mappedTone && r.target_gender === 'Neutral');
  return neutralMatch?.words || [];
}


