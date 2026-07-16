import { createGoogleGenerativeAI } from '@ai-sdk/google';

export const MODEL_CASCADE = [
  'gemini-2.5-flash-lite', // Primary workhorse
  'gemini-1.5-flash',      // Ultra-stable fallback
  'gemini-2.0-flash-lite', // Alternative lightweight tier
  'gemini-3.5-flash'       // High-intelligence tier
] as const;

export type CascadeModel = typeof MODEL_CASCADE[number];

export class AllKeysExhaustedError extends Error {
  constructor(message?: string) {
    super(message || 'All Gemini API keys and fallback models in the rotation pool have been exhausted.');
    this.name = 'AllKeysExhaustedError';
  }
}

/**
 * Executes a Gemini model operation, cascading down model tiers
 * and rotating through the API key pool if rate limits are hit.
 */
export async function executeWithKeyRotation<T>(
  fn: (model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>, provider: ReturnType<typeof createGoogleGenerativeAI>) => Promise<T>
): Promise<T> {
  const keysStr = process.env.GEMINI_API_KEYS || '';
  let keys = keysStr.split(',').map((k) => k.trim()).filter(Boolean);

  if (keys.length === 0) {
    const fallbackKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (fallbackKey) {
      keys = [fallbackKey];
    }
  }

  if (keys.length === 0) {
    throw new Error('No Gemini API keys found in environment variables.');
  }

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const provider = createGoogleGenerativeAI({ apiKey: key });

    for (let j = 0; j < MODEL_CASCADE.length; j++) {
      const modelName = MODEL_CASCADE[j];
      const modelInstance = provider(modelName);

      try {
        return await fn(modelInstance, provider);
      } catch (err: unknown) {
        const errStr = String(err);
        const isRateLimit = 
          errStr.includes('429') || 
          errStr.includes('RESOURCE_EXHAUSTED') || 
          errStr.includes('Quota exceeded') ||
          (err && typeof err === 'object' && ('status' in err && (err as { status?: number }).status === 429));

        if (isRateLimit) {
          console.warn(`[geminiPool] Key index ${i} with model ${modelName} rate-limited. Trying next fallback model...`);
          continue;
        }

        // Skip to the next API key immediately if it is a key auth error or bad argument
        const isAuthError = errStr.includes('API key') || errStr.includes('INVALID_ARGUMENT') || errStr.includes('400');
        if (isAuthError) {
          console.warn(`[geminiPool] Key index ${i} failed credentials validation. Skipping key...`);
          break;
        }

        // Throw any general syntax or database errors
        throw err;
      }
    }
  }

  throw new AllKeysExhaustedError();
}
