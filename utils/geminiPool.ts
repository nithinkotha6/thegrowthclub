import { createGoogleGenerativeAI } from '@ai-sdk/google';

export const MODEL_CASCADE = [
  'gemini-2.0-flash-lite', // Lighter next-gen fallback
  'gemini-3.1-flash-lite' // Alternative low-latency endpoint

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
        const startedAt = Date.now();
        const result = await fn(modelInstance, provider);
        const latencyMs = Date.now() - startedAt;
        const usage = (result as { usage?: { promptTokens?: number; completionTokens?: number } } | undefined)?.usage;

        // AGENT-04: success-path observability. Never log the raw API key —
        // only its position in the rotation pool (keyIndex).
        console.log('[geminiPool] success', {
          model: modelName,
          keyIndex: i,
          latencyMs,
          promptTokens: usage?.promptTokens,
          completionTokens: usage?.completionTokens,
        });

        return result;
      } catch (err: unknown) {
        const errStr = String(err);
        const isRateLimit =
          errStr.includes('429') ||
          errStr.includes('RESOURCE_EXHAUSTED') ||
          errStr.includes('Quota exceeded') ||
          (err && typeof err === 'object' && ('status' in err && (err as { status?: number }).status === 429));

        if (isRateLimit) {
          const nextModel = MODEL_CASCADE[j + 1];
          console.warn('[geminiPool] cascade', {
            keyIndex: i,
            fromModel: modelName,
            toModel: nextModel ?? '(next key)',
            reason: 'rate-limit',
          });
          continue;
        }

        // Skip to the next API key immediately if it is a key auth error or bad argument
        const isAuthError = errStr.includes('API key') || errStr.includes('INVALID_ARGUMENT') || errStr.includes('400');
        if (isAuthError) {
          console.warn('[geminiPool] cascade', {
            keyIndex: i,
            fromModel: modelName,
            toModel: '(next key)',
            reason: 'auth-error',
          });
          break;
        }

        // Throw any general syntax or database errors
        throw err;
      }
    }
  }

  throw new AllKeysExhaustedError();
}
