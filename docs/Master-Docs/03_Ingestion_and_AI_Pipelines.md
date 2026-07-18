# 03 — Ingestion & AI Pipelines

> **AI Provider**: Google Gemini (via `@ai-sdk/google` + Vercel AI SDK)
> **Key Management**: Multi-key rotation pool with model cascade
> **Ingestion Channels**: Web UI (NL + Manual), Telegram Bot, WhatsApp Bot
> **Source of Truth**: [utils/geminiPool.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/utils/geminiPool.ts), [app/actions/ingest.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/ingest.ts), [app/api/telegram/route.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/telegram/route.ts), [lib/ai/prompts.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/ai/prompts.ts)

---

## 1. Gemini Key Rotation Pool

### 1.1 Configuration Priority
1. `GEMINI_API_KEYS` — Comma-separated string containing multiple keys.
2. `GOOGLE_GENERATIVE_AI_API_KEY` — Fallback string key.
3. `GEMINI_API_KEY` — Secondary fallback string key.

### 1.2 Model Cascade Selection
```typescript
export const MODEL_CASCADE = [
  'gemini-2.0-flash-lite',
  'gemini-3.1-flash-lite'
] as const;
```

### 1.3 Execution Logic (`executeWithKeyRotation`)
```
For each key in KeyPool:
  For each model in MODEL_CASCADE:
    Try:
      Execute LLM callback function using resolved key and model
      If execution succeeds, return result immediately
    Catch Error:
      If error code is 429, RESOURCE_EXHAUSTED, or message matches quota limits:
        Log warning, proceed to next model in cascade
      If error code is 400, INVALID_ARGUMENT, or key is unauthorized:
        Log key failure, skip directly to next key in pool
      Else:
        Throw exception immediately (halts execution)
If all iterations exhaust:
  Throw error "All configured Gemini API keys exhausted"
```

(source: [utils/geminiPool.ts L25-91](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/utils/geminiPool.ts#L25-L91))

---

## 2. Ingestion Channels

### 2.1 Web UI Ingestion (`ingestActivity`)

- **Signature**: `ingestActivity(rawText: string, userId: string, groupId: string)`
- **Zod Validation Schema (`MetricSchema`)**:
  ```typescript
  const MetricSchema = z.object({
    metric_slug: z.any().transform(v => v ? String(v).trim() : 'unknown'),
    value: z.any().transform(v => (v !== null && !isNaN(Number(v))) ? Number(v) : 0),
    unit: z.any().transform(v => v ? String(v).trim() : '')
  });
  ```
- **Gemini Context Assembly**:
  - Queries `metrics_config` for canonical display names and slugs.
  - Queries `metric_definitions` for group-specific custom names and UUIDs (`is_hidden = false`).
  - Formats tracker mappings as prompt hints.
- **Remapping Logic**:
  - Performs case-insensitive matching if the model outputs a display name instead of a slug.
  - Matches `extracted.metric_slug` against configs or custom definitions.
  - Fallback error thrown if no match can be resolved.
- **Database Mutation**:
  - Inserts row into `metric_logs`.
  - Sets `status = 'pending'` if the resolved slug is `car_top_speed` or `most_beers`.
  - Sets `status = 'verified'` for all other slugs.
  - Triggers Next.js `revalidatePath('/', 'layout')`.

(source: [app/actions/ingest.ts L44-183](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/ingest.ts#L44-L183))

### 2.2 Telegram Webhook Ingestion (`POST /api/telegram`)

- **Payload Schema (`ExtractionSchema`)**:
  ```typescript
  const ExtractionSchema = z.object({
    metric_slug: z.string().min(1).max(64).regex(/^[a-z_]+$/),
    value: z.number().positive(),
    unit: z.string().min(1).max(32)
  });
  ```
- **Verification**: Evaluates header `X-Telegram-Bot-Api-Secret-Token` against `TELEGRAM_WEBHOOK_SECRET`.
- **Flow**:
  1. Resolves `telegram_user_id` to database profile row.
  2. Resolves profile's group membership.
  3. Formats extraction prompt with strict rules.
  4. Runs Gemini `generateObject()` mapping input to `ExtractionSchema`.
  5. Performs case-insensitive mapping validation.
  6. Inserts log into `metric_logs` with status set based on slug.
  7. Returns HTTP `200 OK` (silently acknowledges unknown users or failed extractions to halt retries).

(source: [api/telegram/route.ts L85-218](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/telegram/route.ts#L85-L218))

### 2.3 Web UI Manual Log Ingestion (`logActivityManual`)

- **Signature**: `logActivityManual(metricSlug, value, unit, userId, groupId, caption?, durationSeconds?, loggedAtDate?)`
- **Normalization**:
  - If `loggedAtDate` matches `YYYY-MM-DD`, normalizes it to `${loggedAtDate}T12:00:00Z` to store a noon UTC timestamp.
- **Defensive Retries**:
  - Attempts INSERT including `caption` and `duration_seconds`.
  - If table schema is missing columns (throwing "column does not exist" error), catches exception.
  - Retries INSERT omitting `caption` and `duration_seconds` to allow successful ingestion.

(source: [app/actions/logDirect.ts L67-145](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/actions/logDirect.ts#L67-L145))

---

## 3. WhatsApp Banter Engine (Fisky)

### 3.1 Webhook Flow (`POST /api/webhooks/whatsapp`)

- **Route Execution**:
  - Compares incoming `instanceData.idInstance` with `GREEN_API_INSTANCE_ID`.
  - Verifies `senderData.chatId` matches `WHATSAPP_GROUP_ID`.
  - Dispatches `200 OK` immediately to halt gateway retries.
  - Offloads generation and dispatch to Next.js background threads using `after()` or `waitUntil()`.
- **System Settings Guard**: Checks system settings key `bot_muted`. If set to `'true'`, early-terminates the execution.

### 3.2 Dynamic System Prompt Assembly (`buildGroupAssistantPrompt`)

Source: [lib/ai/prompts.ts L19-78](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/lib/ai/prompts.ts#L19-L78)

Builds the prompt by combining:
1. **Linguistic rules**: Romanized "Urban Hyderabadi Telugu" written in Latin alphabet, natural address terms, local sentence tags, and urban fusion slang.
2. **Flirting Rizz Matrix**:
   - MALE sender: Implements possessive Tollywood female persona. Flirts aggressively, uses cheesy pickup lines, and acts dramatic.
   - FEMALE sender: Implements detached "sigma male" persona. Flirts smoothly, with playful arrogance and sharp rizz.
   - UNKNOWN sender: Defaults to heavy sarcasm and friend-group teasing.
3. **Interruption phrases**: 10% chance to force the exact string: `"Nenu me fitness coach la undham anukunte... meru nannu group lo petti football aadukuntunnaru ga!"`
4. **Lore injection**: Integrates `member_lore` (stunts, habits, ego triggers, catchphrases, nemesis) and custom `vocab_banks`.
5. **Output limits**: Calculates word limit via `max(15, incomingWordCount * 3)`. Instructs LLM to return output on a single line. Replacement filters strip out all newline characters (`\n`).

### 3.3 Dynamic Slang Vocabulary Router (`getSlangFor`)

Source: [utils/slangRouter.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/utils/slangRouter.ts)

Resolves word arrays based on chosen tone and gender mappings:

| Vibe / Tone | Target Gender | Routed Slang Arrays |
|---|---|---|
| **Ragebait** | Male | `"lafoot"`, `"sollu"`, `"babu"`, `"pedha hero"`, `"scene ledu"` |
| **Ragebait** | Female | `"overaction"`, `"comedy"`, `"nakralu"`, `"too much"` |
| **Flirt/Tease** | Male | `"bangaram"`, `"darling"`, `"hero"`, `"pilla"`, `"dhamaka"` |
| **Flirt/Tease** | Female | `"smart"`, `"attitude"`, `"arrogant"`, `"smooth"`, `"rizz"` |
| **Motivate** | All | `"thope"`, `"keka"`, `"raja"`, `"lepi kottu"`, `"super"` |
