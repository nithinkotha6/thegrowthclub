# 09 — Cron Services & Sync Pipelines

> **Schedules**: Declared in vercel.json
> **Auth**: Header validation (`Authorization: Bearer <CRON_SECRET>`)
> **Source of Truth**: [vercel.json](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/vercel.json), [app/api/cron/](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/cron)

---

## 1. Wearables Sync Engine (`/api/cron/sync-wearables`)

Source: [cron/sync-wearables/route.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/cron/sync-wearables/route.ts)

Executes daily at 00:00 UTC. Iterates active rows in `wearable_connections` to synchronize Google Fit and Fitbit (mocked via v4) and Whoop metrics.

### 1.1 Google OAuth2 Token Refresh Flow

For Google Health API v4 connections, the engine checks expiration constraints:
1. Compares current time with `expires_at` (stored in `wearable_connections`).
2. If the token has expired or will expire within 5 minutes (300,000ms):
   - Dispatches a POST request to `https://oauth2.googleapis.com/token`.
   - Body payload:
     ```json
     {
       "client_id": "GOOGLE_CLIENT_ID",
       "client_secret": "GOOGLE_CLIENT_SECRET",
       "refresh_token": "Stored Refresh Token",
       "grant_type": "refresh_token"
     }
     ```
   - On success:
     - Updates `access_token` with new value.
     - Updates `expires_at` based on the returned `expires_in` value.
     - Saves updated credentials to `wearable_connections` in database.

### 1.2 Google Health API v4 Sync Workflow

Once authorization is verified:
1. Determine Sync Window:
   - If `backfill_completed = false`: Syncs from `2026-01-01T00:00:00.000Z` to current date.
   - If `backfill_completed = true`: Routine sync targets from start of today `00:00:00` to current time.
2. Chunk Windows:
   - Chunk query range into 30-day blocks.
   - Prevents `INVALID_ROLLUP_QUERY_DURATION` API limits.
3. Fetch Step Metrics:
   - Endpoint: `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`
   - Body:
     ```json
     {
       "aggregateBy": [{ "dataTypeName": "com.google.step_count.delta" }],
       "bucketByTime": { "durationMillis": 86400000 },
       "startTimeMillis": "Chunk Start Epoch",
       "endTimeMillis": "Chunk End Epoch"
     }
     ```
4. Fetch Sleep Metrics:
   - Endpoint: `https://www.googleapis.com/fitness/v1/users/me/sessions`
   - Parameters: `startTime = ISOString`, `endTime = ISOString`, `activityType = 72` (sleep).
5. Fetch Resting Heart Rate Metrics:
   - Endpoint: `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`
   - Body:
     ```json
     {
       "aggregateBy": [{ "dataTypeName": "com.google.heart_rate.bpm" }],
       "bucketByTime": { "durationMillis": 86400000 },
       "startTimeMillis": "Chunk Start Epoch",
       "endTimeMillis": "Chunk End Epoch"
     }
     ```
   - Extraction: Resolves the lowest recorded heart rate value (minimum bpm) in the day's sample.
6. DB Persistence & De-duplication:
   - Real data is compiled into arrays.
   - De-duplication: The engine uses `UPSERT` on tables `wearable_steps`, `wearable_sleep`, and `wearable_resting_hr` targeting the constraint `(user_id, logged_date)`.
   - Replaces any existing data for that calendar day, preventing duplicate records.
   - If sync is successful and data is non-empty, updates `backfill_completed` to `true` and sets `last_synced_at` to the current timestamp.

### 1.3 Whoop Sync Simulation

For connections matching provider `whoop`, the engine runs a mock sync simulation:
- Sync window:
  - If `backfill_completed = false`: generates mock daily rows starting from `2026-01-01` to current date.
  - If `backfill_completed = true`: generates a single mock row for the current day.
- Generated ranges:
  - Steps: Random integer between 1,500 and 5,500 steps.
  - Sleep: Random decimal between 6.0 and 9.0 hours.
  - Resting Heart Rate: Random integer between 48 and 63 bpm.
- De-duplication: Upserts rows targeting `(user_id, logged_date)`.
- Updates connection status: sets `backfill_completed` to `true` and updates `last_synced_at` to current time.

---

## 2. Daily Streak Whistle Briefing (`/api/cron/daily-whistle`)

Source: [cron/daily-whistle/route.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/cron/daily-whistle/route.ts)

Executes daily at 03:00 UTC. Generates and sends a morning performance briefing to each group's WhatsApp chat JID.

### 2.1 Briefing Calculation Engine

For each group:
1. Fetch Yesterday's Logs:
   - Selects all logs where `status = 'verified'` and `logged_at` is between `now() - 24 hours` and `now()`.
2. Determine MVP:
   - Checks the user who logged the highest numeric value (or lowest for ascending metrics) in a single log.
3. Determine Slackers:
   - Resolves all active group members from `profiles` joined with `group_members`.
   - Filters out members who logged 1 or more verified activities in the last 24 hours.
   - Remaining names are marked as slackers.
4. Calculate Streaks:
   - Lookback window: Last 14 days.
   - Evaluates consecutive days of logging for each user moving backwards from yesterday.
   - A user must have logged at least 1 verified activity per day to maintain a streak.
   - Streak list includes any member with a streak length of 2 or more days.

### 2.2 AI Prompt & Message Construction

System prompt rules for briefing generation:
- Personality: Gen-Z sarcastic fitness instigator.
- Word limit: Under 100 words.
- Format: Plain text, exactly 3 bullet points, no bold, no italics, no hashtags, no markdown.
- Injects calculated lists: MVP nickname, slacker nicknames, active streaks.
- Gemini returns text. The handler appends the public dashboard root URL (`https://beyond-yesterday-app.vercel.app`) to the message footer.
- Dispatch: Calls Green API `sendMessage` to post the final text to the group's `whatsapp_group_id`.

---

## 3. Monday Prop Bet Bookie (`/api/cron/ai-bookie`)

Source: [cron/ai-bookie/route.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/cron/ai-bookie/route.ts)

Executes weekly on Mondays at 13:00 UTC.

### 3.1 Aggregations
1. Counts the total number of activities logged by each user in the last 30 days.
2. Calculates the maximum value achieved by each user per metric slug.

### 3.2 Bet Generation & Dispatch
- Compiles the statistics into a JSON-like context.
- Prompts Gemini to generate exactly 1 fitness-related prop bet challenge for the week.
- Challenge rules:
  - Specifying a target athlete.
  - Setting a numeric goal based on their history (e.g., "Macha will hit 40 pull-ups").
  - Setting a virtual coin wager amount (default 50 XP).
  - Writing the prompt in Hyderabadi slang.
- The generated plain text is sent to the group's WhatsApp JID via Green API.

---

## 4. Midday WhatsApp Digest (`/api/cron/whatsapp-digest`)

Source: [cron/whatsapp-digest/route.ts](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/app/api/cron/whatsapp-digest/route.ts)

Executes daily at 12:00 UTC.

### 4.1 Digest Construction
1. Fetch all verified logs created in the last 24 hours.
2. Fetch the top_golf leaderboard scores for the group.
3. Renders a system context payload containing the names, metrics, values, units, and leaderboard standings.
4. Invokes Gemini using the `buildGroupAssistantPrompt()` system prompt to summarize the logs into a satirical midday chat update.
5. Message output is stripped of newlines (`\n`) and truncated to follow dynamic word count clamps.
6. Outbound: Posts the plain text output to the WhatsApp group via Green API.
