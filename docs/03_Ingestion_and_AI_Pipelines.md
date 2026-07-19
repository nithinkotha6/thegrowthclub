# 03 — Ingestion & AI Pipelines

> **Last updated:** 2026-07-19
> **AI Provider**: Google Gemini (via `@ai-sdk/google` + Vercel AI SDK)
> **Key Management**: Multi-key rotation pool with model cascade
> **Ingestion Channels**: Web UI (NL + Manual), WhatsApp Bot
> **Source of Truth**: [utils/geminiPool.ts](../utils/geminiPool.ts), [app/actions/ingest.ts](../app/actions/ingest.ts), [lib/ai/prompts.ts](../lib/ai/prompts.ts)

### Revision Log
| Date | Commit | Sections Touched | Summary |
|---|---|---|---|
| 2026-07-18 | (feature cleanup) | header, §2.2 (removed) | Telegram ingestion channel removed entirely (`app/api/telegram/route.ts`, `buildTelegramExtractionSystem()`, `TELEGRAM_WEBHOOK_SECRET`) — it was a parallel, WhatsApp-independent input path that wasn't in active use. Web UI and WhatsApp remain the two ingestion channels. |
| 2026-07-18 | fa4c8bb | §3.2, §3.3 | Correct §3.3 slang table to match actual `utils/slangRouter.ts` and `vocab_banks` seed rows (previous table was invented — wrong words per cell). Clarify §3.2 that lore + slang injection happens in `adminTriggerPoke` (`app/actions/admin.ts`), NOT in `buildGroupAssistantPrompt`. |
| 2026-07-18 | (post-fa4c8bb) | §3.2, §3.3 | Persona rules neutralized in code (migration `0021`, `lib/ai/prompts.ts`, `app/actions/admin.ts`, `utils/slangRouter.ts`): no language / dialect / movie references shipped. Interruption phrase now empty by default. `SLANG_MAP` cells all empty; `vocab_banks` seed removed. Doc updated to match. |

---

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

(source: [utils/geminiPool.ts L25-91](../utils/geminiPool.ts#L25-L91))

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

(source: [app/actions/ingest.ts L44-183](../app/actions/ingest.ts#L44-L183))

### 2.3 Web UI Manual Log Ingestion (`logActivityManual`)

- **Signature**: `logActivityManual(metricSlug, value, unit, userId, groupId, caption?, durationSeconds?, loggedAtDate?)`
- **Normalization**:
  - If `loggedAtDate` matches `YYYY-MM-DD`, normalizes it to `${loggedAtDate}T12:00:00Z` to store a noon UTC timestamp.
- **Defensive Retries**:
  - Attempts INSERT including `caption` and `duration_seconds`.
  - If table schema is missing columns (throwing "column does not exist" error), catches exception.
  - Retries INSERT omitting `caption` and `duration_seconds` to allow successful ingestion.

(source: [app/actions/logDirect.ts L67-145](../app/actions/logDirect.ts#L67-L145))

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

Source: [lib/ai/prompts.ts L19-78](../lib/ai/prompts.ts#L19-L78)

Builds the prompt by combining:
1. **Linguistic rules** (`CUSTOM_SYSTEM_RULES`, 11 items): casual conversational English suitable for a friend-group chat; DRAMA & CLASH rule; anti-repetition guard on `[Name] darling` openings; question-answering priority rule; no-stats/no-markdown guardrails; explicit ban on relying on any specific movie, franchise, actor, or celebrity. No language, dialect, or region-specific tags shipped in code — all such content is left to per-deployment configuration.
2. **Flirting Rizz Matrix**:
   - MALE sender: Implements a possessive, dramatic female persona. Flirts aggressively, uses cheesy pickup lines, acts dramatic.
   - FEMALE sender: Implements detached "sigma male" persona. Flirts smoothly, with playful arrogance and sharp rizz.
   - UNKNOWN sender: Defaults to heavy sarcasm and friend-group teasing.
3. **Interruption phrase (opt-in)**: `COACH_INTERRUPTION_PHRASE` at the top of `lib/ai/prompts.ts` ships EMPTY — the interruption feature is disabled by default. When the constant is non-empty AND the caller passes `triggerInterruption = true` (10 % chance via `Math.random() < 0.10` in `webhooks/whatsapp/route.ts` L378), the phrase is injected verbatim into the prompt.
4. **Persistent mood + slacker directives**: `persistentMoodDirective` (from `bot_persistent_state`) and `slackerDirective` (7-day-zero-activity list) are injected verbatim if provided by the webhook handler.
5. **Output limits**: Calculates word limit via `max(15, incomingWordCount * 3)`. Instructs LLM to return output on a single line and forbid `\n`; the WhatsApp handler additionally strips residual newlines before dispatch.

> Note: `buildGroupAssistantPrompt` itself does NOT read `member_lore` or `vocab_banks`. Lore + routed-slang injection is done by `adminTriggerPoke` in [`app/actions/admin.ts`](../app/actions/admin.ts) L127-260, which builds its own single-shot prompt (no chat history, no `CUSTOM_SYSTEM_RULES`) for the manual God Mode broadcast.
### 3.3 Dynamic Slang Vocabulary Router (`getSlangFor`)

Source: [utils/slangRouter.ts](../utils/slangRouter.ts)

In-memory map keyed by `(tone, gender)`. Only consumed by `adminTriggerPoke`.

**All cells intentionally ship empty.** No slang vocabulary is bundled in code and the seed rows previously inserted by migration `0013_lore_and_vocab.sql` were removed by migration `0021_remove_deprecated_moods_and_vocab.sql`. When the resolved array is empty, the prompt builder (`adminTriggerPoke` L232-234) omits the slang instruction entirely and the LLM receives no vocabulary hint.

The scaffolding key set that `getSlangFor` recognises:

| Tone (normalized) | Aliases from UI | Recognised target genders |
|---|---|---|
| `ragebait` | `ragebait`, `sarcastic`, `fun-roast` (default) | `Male`, `Female`, `Gay`, `Neutral` |
| `flirt_tease` | `flirt`, `flirt_tease` | `Male`, `Female`, `Gay`, `Neutral` |
| `motivate` | `motivate`, `praise` | `Male`, `Female`, `Gay`, `Neutral` |

To activate slang for a deployment, either (a) fill in the arrays in `utils/slangRouter.ts` directly, or (b) upsert rows via the admin Settings panel (which writes to `vocab_banks`). Note that `getSlangFor` currently reads only from the in-memory `SLANG_MAP` — wiring it to `vocab_banks` remains proposal `AGENT-02` / `DATA-03` in `Findings_and_Recommendations.md`.
