# Telegram Bot API & Webhook Rules

## 1. Serverless Architecture
- The Telegram bot MUST run serverlessly via a Next.js API Route (e.g., `src/app/api/telegram/route.ts`).
- **Strict Block:** DO NOT use `node-telegram-bot-api` with long-polling. We rely entirely on Telegram Webhooks `POST`ing JSON payloads to our Vercel endpoint.
- Verify incoming requests securely using Telegram's secret token header.

## 2. AI Parsing (Vercel AI SDK)
- Extract the raw text from the Telegram payload.
- Pass the text to `generateObject` from the Vercel AI SDK (using Google Gemini 1.5 Flash).
- **Schema Mapping:** Instruct the LLM via Zod to map the natural language input strictly to an existing `slug` in the `metrics_config` table. 
- **Fallback Loop:** If the LLM returns an invalid metric or lacks a numeric value, the webhook must trigger a Telegram API call replying to the user: *"I couldn't identify that metric or value. Try something like: 'Logged 5 miles of running'."*

## 3. Media Handling (Proof Gallery)
- If a Telegram message contains a `photo` array:
  1. Use the Telegram API `getFile` method to retrieve the file path.
  2. Download the binary buffer into memory.
  3. Upload the buffer directly to the `proof-gallery` Supabase Storage bucket.
  4. Save the resulting public URL to the `evidence_url` column in the `metric_logs` table.