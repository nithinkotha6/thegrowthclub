# Admin To-Do — Deployment Runbook

> **Last updated:** 2026-07-19

This is an **external-actions runbook**, not a code doc. Every step below happens *outside* this repo (Supabase dashboard, Vercel dashboard, GitHub settings, third-party developer consoles) and cannot be automated by an agent working only inside the codebase. Work through it top to bottom before/during the first production deploy; re-run the relevant section any time a new migration or env var is added later.

---

## 0. Accounts you need before starting

| Provider | Why | Where |
|---|---|---|
| Supabase | Database + auth-less RLS backend | supabase.com |
| Vercel | Hosting, cron scheduler, env vars | vercel.com |
| GitHub | Repo + two supplementary Actions workflows | github.com |
| Green API | WhatsApp gateway (bot messages) | green-api.com |
| Google Cloud Console | OAuth for Google Fit / Health Connect wearable sync | console.cloud.google.com |
| WHOOP Developer Portal | OAuth for WHOOP wearable sync | developer.whoop.com |

---

## 1. Supabase: create the project and apply the schema

1. Create a new Supabase project (or use an existing one). Note the **Project URL**, **anon public key**, and **service_role key** (Settings → API) — you'll need all three in Step 3.
2. Apply every migration in `supabase/migrations/`, **in numeric order, with no gaps** (`0001_initial_schema.sql` through the highest-numbered file — currently `0039_add_streak_to_profiles.sql`). There is no Supabase CLI available in this dev environment, so the most reliable path is:
   - Open **Supabase Dashboard → SQL Editor**.
   - Open each migration file from `supabase/migrations/` in order, paste its full contents into a new query, and run it. Confirm no errors before moving to the next file.
   - Every migration in this repo is written to be idempotent (`IF NOT EXISTS` / guarded), so re-running an already-applied file is a safe no-op — if you're ever unsure how far you got, it's safe to just re-run from `0001` forward.
   - Alternative (if you set up the Supabase CLI locally): `supabase link --project-ref <your-project-ref>` then `supabase db push`.
3. **Do this before every future deploy that adds a new migration file** — Vercel deploys never apply Supabase migrations automatically. If you skip a migration, the app will fail at runtime with a Postgres "column/table does not exist" error on whatever code path touches that schema.

## 2. Bootstrap the very first group (manual, one-time)

The app has no self-serve "create the first group" flow — `adminCreateGroup` requires an already-logged-in session, and signup requires an existing group's invite code (source: [app/actions/groups.ts](../app/actions/groups.ts), [app/actions/auth.ts](../app/actions/auth.ts)). On a brand-new database there is nothing to log into yet, so the first group must be inserted directly:

```sql
insert into public.groups (name, invite_code)
values ('Your Group Name', 'YOUR-INVITE-CODE');
```

Run this once in the Supabase SQL Editor after migrations are applied. After that, the first person can sign up at `/` using `YOUR-INVITE-CODE` and will become a normal member — **immediately promote them to admin** so they can use the Admin Portal for everything else:

```sql
update public.group_members
set role = 'admin'
where user_id = '<their profile id>' and group_id = '<the group id>';
```

Every subsequent group can be created normally from inside the app (Settings → Groups panel, once you're an admin).

## 3. Environment variables

Copy `.env.example` to `.env.local` for local dev, and add the same keys to **Vercel → Project → Settings → Environment Variables** for production/preview. Every variable the app reads at runtime is listed in `.env.example` — treat that file as the source of truth; if you add a new `process.env.X` read anywhere in the code, add `X=` to `.env.example` in the same change.

| Variable | Where to get it | Required? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (keep secret, server-only) | Yes |
| `SESSION_SECRET` | Generate yourself: any random string ≥32 chars (e.g. `openssl rand -base64 32`) | Yes |
| `GEMINI_API_KEYS` | Google AI Studio — comma-separated list of keys for pooled rotation (preferred) | Yes (or the two fallbacks below) |
| `GOOGLE_GENERATIVE_AI_API_KEY` / `GEMINI_API_KEY` | Google AI Studio — single-key fallback if you don't set up the pool | Yes if `GEMINI_API_KEYS` unset |
| `GREEN_API_INSTANCE_ID` / `GREEN_API_TOKEN` | Green API console, per WhatsApp instance | Yes (global fallback — each group can override its own in Settings → Groups) |
| `WHATSAPP_GROUP_ID` | The WhatsApp group's chat ID from Green API | Yes (global fallback, same override note as above) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Generate once: `node -e "console.log(require('web-push').generateVAPIDKeys())"` — public key value goes in both `VAPID_PUBLIC_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Only if using push notifications |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console OAuth client (see Step 5) | Only if using Google Fit wearable sync |
| `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET` | WHOOP Developer Portal app (see Step 6) | Only if using WHOOP wearable sync |
| `WEARABLE_KEY_<PROVIDER>_<NICKNAME>` | Manually obtained refresh token per member, see comment block in `.env.example` | Optional, per-member fallback only |
| `CRON_SECRET` | Generate yourself: any random string | Yes — gates every `/api/cron/*` route |
| `NEXT_PUBLIC_APP_URL` | Your production domain, e.g. `https://thegrowthclub.vercel.app` | Optional — omitting it just removes the dashboard link from the daily broadcast footer |

**Do not** commit `.env.local` — it's already gitignored. `.env.example` (checked into git) intentionally has no real values.

## 4. Vercel deployment

1. Import the repo into Vercel, set the env vars from Step 3 (Production + Preview environments).
2. `vercel.json` already declares all four scheduled crons (`daily-whistle`, `sync-wearables`, `reset-monthly-streaks`, `monthly-summary`) — Vercel registers these automatically on deploy, no dashboard action needed beyond having `CRON_SECRET` set.
3. Deploy. Confirm `GET /api/health` returns `{ok:true}` afterward — this is the fastest way to confirm the Supabase connection + env vars are wired correctly (source: [app/api/health/route.ts](../app/api/health/route.ts)).

## 5. GitHub Actions secrets (supplementary workflows)

Two workflows in `.github/workflows/` call the deployed app over HTTP instead of relying solely on Vercel's cron scheduler:

- `sync-wearables.yml` — runs every 6 hours (Vercel Hobby plans only allow daily-granularity crons; this fills the gap for more frequent wearable syncing).
- `whatsapp-digest.yml` — **manual-trigger only** (`workflow_dispatch`), intentionally has no automatic schedule. This mirrors the product decision to keep only one automatic daily broadcast (`daily-whistle`); do not re-add a `schedule:` trigger here without deliberately reversing that decision.

Both need these two repository secrets (GitHub repo → Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `APP_BASE_URL` | Your production URL, no trailing slash, e.g. `https://thegrowthclub.vercel.app` |
| `CRON_SECRET` | The same value you set in Vercel's `CRON_SECRET` env var |

## 6. WhatsApp (Green API) setup

1. Create a Green API instance, get its instance ID + API token.
2. Either set `GREEN_API_INSTANCE_ID`/`GREEN_API_TOKEN`/`WHATSAPP_GROUP_ID` as global env-var fallbacks (Step 3), **or** (recommended for multi-group setups) log in as an admin and configure each group's own credentials individually via **Settings → Groups**. Per-group credentials always take priority over the env-var fallback.
3. Configure the Green API instance's webhook URL to point at `https://<your-domain>/api/webhooks/whatsapp` so inbound messages reach the bot.

## 7. Google OAuth (wearables — Google Fit / Health Connect)

1. Google Cloud Console → create an OAuth 2.0 Client ID (Web application).
2. Add this **exact** authorized redirect URI (the app builds it dynamically from the request host, so it must match your real production domain): `https://<your-domain>/api/wearables/callback/google`.
3. Put the client ID/secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## 8. WHOOP OAuth (wearables)

1. Register an app at developer.whoop.com.
2. Add this authorized redirect URI: `https://<your-domain>/api/wearables/callback/whoop`.
3. Put the client ID/secret into `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET`.

## 9. Post-deploy smoke test (do this every deploy)

1. `GET /api/health` → `{ok:true}`.
2. Sign up a test user with the invite code from Step 2 → confirm redirect to `/dashboard`.
3. Log an activity from the dashboard → confirm it appears on `/dashboard/leaderboard`.
4. As an admin, open Settings → confirm the Groups/Metrics/Users panels load without errors.
5. If WhatsApp is configured: send a message in the linked group and confirm the bot replies.
6. Wait for (or manually curl with the `CRON_SECRET` bearer token) `/api/cron/daily-whistle` once to confirm the broadcast dispatches without error.

## 10. Known outstanding items (as of this doc's writing)

- Lint (`npm run lint`) has a stable baseline of pre-existing `@typescript-eslint/no-explicit-any` errors — this does not block `npm run build` or the Vercel deploy, but is a known, not-yet-scheduled cleanup (see `Findings_and_Recommendations.md` QA-05).
- The `postcss` moderate CVE transitively bundled inside Next.js has no safe fix available yet without downgrading Next itself — monitor upstream.
- Every migration listed in Step 1 must be (re-)applied to any new/rebuilt Supabase project — this is the single most common cause of a "works locally, breaks in prod" report.
