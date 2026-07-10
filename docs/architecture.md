# System Architecture & Communication Map

## 1. Infrastructure Overview
- **Hosting & Backend Serverless API:** Vercel (Next.js 15 App Router)
- **Database, Auth, & File Storage:** Supabase Cloud (PostgreSQL)
- **User Interface Platform:** Telegram Messenger (Bot API via Webhooks) [PENDING / NEXT STEPS]
- **AI Processing Engine:** Google Gemini API (via Vercel AI SDK)

## 2. Multi-Tenant Auth & Database Architecture
- **Tenant Group Isolation:**
  - The `groups` table stores isolated batches of users (e.g., 'Budbikers', '5monkeys') identified by a unique `invite_code`.
  - The `profiles` table references a user's authenticated Supabase Auth ID and holds a foreign key to their specific group (`group_id`).
- **Row-Level Security (RLS) Policies:**
  - RLS is enabled on `profiles` and `metric_logs` to ensure multi-tenant security boundaries.
  - Users are restricted to reading profiles and metric logs only from members belonging to their same group:
    ```sql
    -- profiles RLS select policy
    group_id = (select group_id from public.profiles where id = auth.uid())

    -- metric_logs RLS select policy
    exists (
      select 1 from public.profiles p
      where p.id = metric_logs.user_id
      and p.group_id = (select group_id from public.profiles where id = auth.uid())
    )
    ```

## 3. Data Ingestion Flow (Manual AI Pipeline)
1. **User Action:** A user clicks "+ Add Activity" on the dashboard and inputs a natural language activity string (e.g., "I just ran 5 miles").
2. **Server Action Dispatch:** Next.js Server Action (`ingestActivity`) is invoked.
3. **Structured Extraction (AI):** The Server Action communicates with Google Gemini API (`gemini-2.0-flash` model via `@ai-sdk/google`) using a custom prompt requesting structured JSON output conforming to a validation schema:
   - `{ metric_slug: string, value: number, unit: string }`
4. **Data Verification & Ingestion:**
   - The Server Action maps the extracted `metric_slug` to its corresponding `id` inside `metrics_config`.
   - The verified metric data is stored as a new entry inside `metric_logs` mapping to the active `user_id`.
   - XP progress triggers calculate rewards based on the configuration of the completed activity.