# System Architecture & Communication Map

## 1. Infrastructure Overview
- **Hosting & Backend Serverless API:** Vercel (Next.js 15 App Router)
- **Database, Auth, & File Storage:** Supabase Cloud (PostgreSQL)
- **User Interface Platform:** Telegram Messenger (Bot API via Webhooks)
- **AI Processing Engine:** Google Gemini API (via Vercel AI SDK)

## 2. Data Lifecycle Path (The Ingestion Loop)
1. **User Action:** A user texts natural language + optional media to the Telegram Bot.
2. **Webhook Event:** Telegram forwards the JSON payload via an HTTP POST request to the Vercel API route (`/api/telegram/route.ts`).
3. **Structured Extraction:** The Vercel API route passes the text to the Vercel AI SDK (Gemini) to transform the unstructured string into an explicit JSON object mapping to the `metrics_config` schema.
4. **Media Handling:** If an image/video is present, the serverless route fetches the binary from Telegram, pushes it directly to a Supabase Storage bucket, and attaches the public URL.
5. **Persistence & Triggers:** The serverless route performs a PostgreSQL `INSERT` into the `metric_logs` table. If the status is `verified`, a Postgres database trigger automatically updates the user's XP in the `profiles` table.
6. **Real-time UI Synchronization:** Supabase broadcasts the database changes over WebSockets. The active Next.js dashboard client receives the event, invalidates the cache, and triggers a re-render of the Apache ECharts UI and the "Breaking News" timeline.