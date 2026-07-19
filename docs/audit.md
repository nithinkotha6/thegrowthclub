# Documentation Audit Report

Date: 2026-07-18
Source Commit: `fa4c8bbd44a33a8ce4fd5b4262602e0407719b3d`
Files Reviewed:
- [docs/01_Architecture_and_App_Structure.md](docs/01_Architecture_and_App_Structure.md)
- [docs/02_Authentication_and_Session_Management.md](docs/02_Authentication_and_Session_Management.md)
- [docs/03_Ingestion_and_AI_Pipelines.md](docs/03_Ingestion_and_AI_Pipelines.md)
- [docs/04_Security_and_Gap_Analysis.md](docs/04_Security_and_Gap_Analysis.md)
- [docs/05_Whatsapp_Agent.md](docs/05_Whatsapp_Agent.md)
- [docs/06_API_Routes_and_Server_Actions.md](docs/06_API_Routes_and_Server_Actions.md)
- [docs/07_Data_Modelling.md](docs/07_Data_Modelling.md)
- [docs/08_Client_Side_Architecture_and_UI_Component_Inventory.md](docs/08_Client_Side_Architecture_and_UI_Component_Inventory.md)
- [docs/09_Cron_Services_and_Sync_Pipelines.md](docs/09_Cron_Services_and_Sync_Pipelines.md)
- [docs/Master_Reference.md](docs/Master_Reference.md)

Files Generated Fresh: None. All Part 2 topics were already covered by existing files (see [§ File-map divergence](#file-map-divergence-part-2-spec-vs-repo-reality) for the mapping).

---

## File-map divergence (Part 2 spec vs. repo reality)

The Part 2 spec (§2 of the audit brief) declares an idealized file layout that does **not** match the on-disk filenames. Rather than delete and rename (destructive, and would erase git history for correct content), this audit kept the existing filenames intact and mapped Part-4 content requirements onto them. Mapping table:

| Part 2 idealized filename | Covered by existing file(s) | Action taken |
|---|---|---|
| `01_Architecture_and_App_Structure.md` | `docs/01_Architecture_and_App_Structure.md` | Audited in place |
| `02_UI_UX_Design_System_and_Workflows.md` | `docs/08_Client_Side_Architecture_and_UI_Component_Inventory.md` (+ Master §3) | Audited **08** in place; added Part-4.2 required sections there |
| `03_Integrations_Cron_and_Ops.md` | `docs/09_Cron_Services_and_Sync_Pipelines.md` (+ Master §1.2) | Audited **09** in place; added Part-4.3 required sections there |
| `04_Security_and_Gap_Analysis.md` | `docs/04_Security_and_Gap_Analysis.md` | Audited in place |
| `05_Whatsapp_Agent.md` | `docs/05_Whatsapp_Agent.md` (+ `docs/03_Ingestion_and_AI_Pipelines.md` §3) | Audited in place |
| `06_Data_Modelling.md` | `docs/07_Data_Modelling.md` (+ Master §2) | Audited **07** in place; added Part-4.6 required sections there |
| 07–08 discretionary | `docs/06_API_Routes_and_Server_Actions.md`, `docs/02_Authentication_and_Session_Management.md` | Both are self-contained subsystem-style docs; audited in place |

Cross-reference this table when applying Part 4 requirements — the file with content for `04_Security_and_Gap_Analysis.md` is exactly the same file; the file with content for `06_Data_Modelling.md` is `07_Data_Modelling.md` on disk; etc.

---

## Summary Table

| File | Added | Corrected | Removed | Open `[VERIFY]` Flags |
|---|---|---|---|---|
| `01_Architecture_and_App_Structure.md` | Route tree table (§4.1); `'use client'` boundary table with reasons (§4.2); state-management + `revalidatePath` matrix (§9); Session/Auth sequenceDiagram (§10); Infrastructure Topology flowchart (§11); Core Domain Types verbatim block (§12); Revision Log | Cookie config: `sameSite='strict'` (was 'lax'); JWT TTL `24h` (was 30d); “No middleware.ts” → note `proxy.ts` (Next 16 replacement) with matcher `/dashboard/:path*`; added `proxy.ts` to directory tree | — | Absolute `file:///c:/Users/nithi/...` doc-hyperlinks left intact (repo has moved to `c:\Users\J7S9\Downloads\nithinkotha6-git\thegrowthclub\`); Node.js runtime version still `[UNKNOWN]` in §6 |
| `02_Authentication_and_Session_Management.md` | Revision Log; `proxy.ts` documented as primary matcher-based guard in §3.1; `DashboardLayout` demoted to “fallback guard” (§3.2) | Local-storage key `by_session_token` → **`kiosk_session`** (§2.3) | — | — |
| `03_Ingestion_and_AI_Pipelines.md` | Revision Log; §3.3 Gay/Neutral rows; explicit note that lore + slang injection lives in `adminTriggerPoke`, not `buildGroupAssistantPrompt` | §3.3 slang table entirely replaced with the actual arrays from `utils/slangRouter.ts` (previous words were invented) | — | — |
| `04_Security_and_Gap_Analysis.md` | Revision Log; §2.1 (revised & downgraded) note about `/settings/*` gap in proxy matcher; §5 Undocumented API routes + env-var references + under-commented complex logic tables; §6 Architectural Blind Spots critic section (missing infra/logging/CI, enterprise security, data-validation edge cases, admin tools) | §1.2 TTL `24h`; §1.2 `SameSite: 'strict'`; §2.1 CRITICAL “No Middleware Auth Guard” downgraded to MEDIUM because `proxy.ts` exists; §2.2 dev-secret string corrected to `'default-dev-secret-do-not-use-in-prod-12345'`; §3 RLS matrix now lists `member_lore`, `vocab_banks` open policies and `bot_persistent_state` group isolation; §4 secret inventory adds `NODE_ENV` | Removed `NEXT_PUBLIC_APP_URL` from §4 secret inventory | Wearable-tables RLS policy set (`wearable_connections`, `wearable_steps`, `wearable_sleep`, `wearable_resting_hr` have RLS enabled but no `FOR SELECT/ALL` policies in migrations \[VERIFY]); `SettingsClient` God-Mode PIN storage location \[VERIFY]; Vercel Node.js runtime version \[VERIFY] |
| `05_Whatsapp_Agent.md` | Revision Log; §4.1 rule 5 split-attribution note (Baahubali/RRR/Pushpa forbid clause is in `adminTriggerPoke`, not `CUSTOM_SYSTEM_RULES`) | §4.1 rule 5 text | — | — |
| `06_API_Routes_and_Server_Actions.md` | Revision Log; §1.6 full `adminUpdatePersistentMood` signature/logic block; §2 Route Handlers Index table (methods + `maxDuration` + auth) | — | — | Callback route stores `provider: 'fitbit'` but connect route talks to Google Health — intentional aliasing or historical name? \[VERIFY] |
| `07_Data_Modelling.md` | Revision Log; §1.15 `system_settings`; §1.16 `bot_persistent_state`; §4 verbatim CREATE TABLE DDL for every table (16 blocks); §5 verbatim CREATE POLICY + GRANT statements; §6 synthesized sample INSERT rows for every table (fake UUIDs, illustrative values); §7 Mermaid ER diagram | — | — | Wearable-tables RLS policies not present in migrations (§5 comment matches §4's `[VERIFY]` in doc 04) |
| `08_Client_Side_Architecture_and_UI_Component_Inventory.md` | Revision Log; §4 Screen-by-Screen table with render mode + loading/empty/error/auth-guard; §5 Component State Matrix (default/hover/active/disabled/loading/error) with actual Tailwind classes; §6 Component & Interaction trace (element→server action→data touched→optimistic vs. revalidate); §7 Edge case matrix (invalid PIN, duplicate signup, admin edit, retroactive-date, soft- vs hard-delete, and 6 more) | — | — | — |
| `09_Cron_Services_and_Sync_Pipelines.md` | Revision Log; §5 Service Inventory table (Package + Version + Auth + Found In); §6 Cost Projections table (all rows `[VERIFY]`-flagged); §7 Billing-risk flags; §8 Deployment Pipeline (build gate, migration sequence, runtime auto-migration code smell) | §1.2 rewritten to describe actual Google Health API v4 endpoints (`health.googleapis.com/v4/...:dailyRollUp` + `range.start.date`/`range.end.date` body). Previous doc described the deprecated Fitness v1 API (`fitness/v1/users/me/dataset:aggregate` + `startTimeMillis`/`endTimeMillis`), which is nowhere in current code | — | Every row in §6 is `[VERIFY]` \[VERIFY]: live pricing must be reconfirmed against vendor pricing pages before any billing claim; Vercel Cron limit vs. current 4-schedule config \[VERIFY] |
| `Master_Reference.md` | Revision Log | §4.1 sequence diagram: `Fetch last 10 messages` → `Fetch last 3 messages` (matches route.ts L177 `.limit(3)`); §1.3 env-var table: `NEXT_PUBLIC_APP_URL` marked `[VERIFY — unused]` | — | `NEXT_PUBLIC_APP_URL` intent \[VERIFY — replace hardcoded footer link or remove from docs] |

---

## What Was Missing

### `01_Architecture_and_App_Structure.md`
- No route-tree table (Route Segment | Type | Render Mode | File).
- No per-`'use client'` file listing with the one-line reason each cannot be RSC.
- No state-management section describing SWR use, `sessionStorage['god_mode_unlocked']`, `localStorage['kiosk_session']`, search-param-driven fetch triggers, and `revalidatePath` call sites per action.
- No Session/Auth Mermaid `sequenceDiagram` (PIN → JWT → `x-group-id` header → RLS-scoped query), and no explicit statement that God Mode is client-only-enforced.
- No `flowchart TD` for Infrastructure Topology.
- No verbatim `typescript` blocks for core domain types (`AppSession`, `Group`, `GroupProfile`, `MetricLogRow`, `FeedRow`, `ChartPoint`, `ChartSeries`, `GangProfile`).
- `proxy.ts` not mentioned anywhere.

### `02_Authentication_and_Session_Management.md`
- `proxy.ts` (Next 16 replacement for `middleware.ts`) not documented as the primary matcher-based guard.
- Local-storage key name wrong (`by_session_token` → actual `kiosk_session`).

### `03_Ingestion_and_AI_Pipelines.md`
- §3.3 slang matrix had invented words (`lafoot`, `sollu`, `bangaram`, `dhamaka`, `keka`, `thope`, `raja`, `lepi kottu`, etc.) that do not appear anywhere in `utils/slangRouter.ts` or the `vocab_banks` seed rows.
- Missing Gay-target and Neutral-target rows in the slang table.
- §3.2 credited `buildGroupAssistantPrompt` with lore + vocab injection — actually done only inside `adminTriggerPoke`.

### `04_Security_and_Gap_Analysis.md`
- §2.1 declared no middleware auth guard existed. `proxy.ts` at repo root does exactly that.
- §1.2 & §2.2 had wrong constants: 30-day TTL (actual 24h), SameSite Lax (actual strict), dev-secret string (`'dev-secret-key-do-not-use-in-production'` → actual `'default-dev-secret-do-not-use-in-prod-12345'`).
- RLS matrix omitted `member_lore` and `vocab_banks` (both have `FOR ALL USING (true)` open policies) and `bot_persistent_state`.
- Secret inventory listed `NEXT_PUBLIC_APP_URL` but grep confirms it is unused in `.ts`/`.tsx`.
- No Part-4.4 required "Architectural Blind Spots" critic section (verdict-per-point).
- No undocumented-route table; no under-commented-complex-logic table.

### `05_Whatsapp_Agent.md`
- §4.1 rule 5 attributed the “banned from Baahubali/RRR/Pushpa/Thaggedhele” clamp to `CUSTOM_SYSTEM_RULES`; that exact clause is only in the `adminTriggerPoke` prompt string (`app/actions/admin.ts` L246).

### `06_API_Routes_and_Server_Actions.md`
- `adminUpdatePersistentMood` was only listed as a one-line bullet — no signature, no logic, no data touched.
- No consolidated Route Handlers Index (methods + `maxDuration` + auth) for the 9 route files.

### `07_Data_Modelling.md`
- Tables `system_settings` and `bot_persistent_state` were entirely absent.
- No verbatim `CREATE TABLE` DDL blocks for any of the 16 tables (Part 4.6 requirement).
- No `CREATE POLICY` / `GRANT` blocks per table.
- No sample `INSERT` data (2–3 rows per table).
- No Mermaid `erDiagram`.

### `08_Client_Side_Architecture_and_UI_Component_Inventory.md`
- No Screen-by-Screen table with Render Mode / Loading / Empty / Error / Auth Guard columns.
- No Component State Matrix (Default | Hover | Active | Disabled | Loading | Error).
- No Component & Interaction Trace table linking element → Server Action → data touched → optimistic vs. post-revalidate UI.
- No Edge Case Matrix (invalid PIN, duplicate signup, admin edit, retroactive date outside 30 days, soft- vs. hard-delete visibility, bot-mute, `/clear`, empty wearable sync).
- Typography table (Element | Font | Size | Weight | Line Height | Case Transform) was absent from formal spec.

### `09_Cron_Services_and_Sync_Pipelines.md`
- No Service Inventory table (Service | Package/SDK+Version | Auth Method | Found In).
- No Cost Projections table (even if every row is `[VERIFY]`).
- No Billing-Risk Flags section (leaderboard query pattern, wearable churn, image optimization, cron cadence vs. need).
- No Deployment Pipeline section (build gate, migration sequence).

### `Master_Reference.md`
- No revision log.
- `NEXT_PUBLIC_APP_URL` in §1.3 not flagged as unused.
- §4.1 sequence diagram said "Fetch last 10 messages" — actual limit is 3.

---

## What Was Stale / Incorrect

### `01_Architecture_and_App_Structure.md`
- §2: `sameSite: 'lax'` corrected to `'strict'` — source: `lib/session.ts` L78.
- §2: `maxAge: 30 days` corrected to `86400` seconds (24 h) — source: `lib/session.ts` L17 (`SESSION_TTL_SECONDS = 60 * 60 * 24`).
- §2: "No middleware.ts exists" corrected — `proxy.ts` (Next 16 Request Proxy replacement) exists at repo root, matcher `/dashboard/:path*` — source: `proxy.ts` L44.
- §2: The claim that login is done via `verifyPinAndLogin()` corrected to the actual name `loginWithPersonalPinAction` — source: `app/actions/auth.ts` L93.

### `02_Authentication_and_Session_Management.md`
- §2.3: `by_session_token` corrected to `kiosk_session` — source: `app/page.tsx` L83, L138, L215; `components/Sidebar.tsx` L127.
- §3: Split into "Primary Guard — `proxy.ts`" and "Fallback Guard — `DashboardLayout`" — source: `proxy.ts` vs. `app/dashboard/layout.tsx`.

### `03_Ingestion_and_AI_Pipelines.md`
- §3.3 slang table replaced verbatim with `utils/slangRouter.ts` `SLANG_MAP` contents (12 rows across ragebait/flirt_tease/motivate × Male/Female/Gay/Neutral) — source: `utils/slangRouter.ts` L7-25 and `supabase/migrations/0013_lore_and_vocab.sql` L37-46.
- §3.2 clarified that `buildGroupAssistantPrompt` (`lib/ai/prompts.ts` L19-78) does NOT read `member_lore` or `vocab_banks`; lore + slang injection is done only inside `adminTriggerPoke` (`app/actions/admin.ts` L127-260).

### `04_Security_and_Gap_Analysis.md`
- §1.2 TTL corrected to 24 h.
- §1.2 SameSite corrected to `strict`.
- §2.1 severity downgraded from CRITICAL to MEDIUM; residual risk (`/settings/*` not in proxy matcher) documented.
- §2.2 dev-secret string corrected.
- §3 RLS matrix expanded with 4 additional rows.

### `05_Whatsapp_Agent.md`
- §4.1 rule 5 rewritten to attribute the "STRICTLY FORBIDDEN from Pushpa/RRR/Baahubali" clamp to `adminTriggerPoke` (`app/actions/admin.ts` L246) and clarify that the normal Fisky reply prompt (rule 6 in `CUSTOM_SYSTEM_RULES` at `lib/ai/prompts.ts` L11) instead tells the LLM to USE Telugu comedy dialogues.

### `09_Cron_Services_and_Sync_Pipelines.md`
- §1.2 Steps endpoint changed from `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate` to `https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp` (source: `app/api/cron/sync-wearables/route.ts` L149-165).
- §1.2 Sleep endpoint changed from `fitness/v1/users/me/sessions` (activityType=72) to `health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints?filter=...` (source: route.ts L186-207).
- §1.2 Heart-Rate endpoint changed from `fitness/v1/users/me/dataset:aggregate` to `health.googleapis.com/v4/users/me/dataTypes/daily-resting-heart-rate/dataPoints:dailyRollUp` (source: route.ts L149-165 with `dataType = 'daily-resting-heart-rate'`).
- §1.2 Request body shape changed from `{aggregateBy, bucketByTime, startTimeMillis, endTimeMillis}` to `{range: {start: {date, time}, end: {date, time}}}` (source: route.ts L153-163).
- §1.2 HR extraction description corrected — actual code extracts `bpm`/`restingHeartRate` from the daily-resting-heart-rate rollup object; the previous claim of "extracts minimum bpm from the day's sample" is wrong (route.ts L268-282).

### `Master_Reference.md`
- §4.1 chat_history fetch changed from "last 10 messages" to "last 3 messages" (source: `app/api/webhooks/whatsapp/route.ts` L177 `.limit(3)`).
- §1.3 `NEXT_PUBLIC_APP_URL` row annotated `[VERIFY — unused]`.

---

## What Was Removed

### `04_Security_and_Gap_Analysis.md`
- Removed `NEXT_PUBLIC_APP_URL` from §4 secret inventory — reason: no `process.env.NEXT_PUBLIC_APP_URL` references appear in `.ts`/`.tsx` at commit `fa4c8bb` (grep-verified). The cron footer link is a hardcoded string in `app/api/cron/daily-whistle/route.ts` L211, not an env var.

No other content was removed. All other stale claims were corrected in place per Part 1 rule 5 (deletions require a stated code-based reason).

---

## Open Questions / `[VERIFY]` Items

Items where the auditor could not resolve unilaterally — surfaced here for human review rather than left silently inside the doc files.

1. **Absolute file:// hyperlinks throughout every doc.** Every doc uses fully-qualified `file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/...` links. The repo has since moved to `c:\Users\J7S9\Downloads\nithinkotha6-git\thegrowthclub\`. Links are still technically the SAME semantic references (they point to relative paths inside the project), but the URIs no longer resolve when clicked in an IDE. Left intact per Part 1 rule 4 (surgical). **Recommend**: bulk find/replace to relative Markdown links (`../lib/session.ts`) or drop the `file://` scheme; decision needed on whether that qualifies as a wording-preservation violation for the confirmed-correct sentences that contain those links.
2. **Vercel Node.js runtime version.** Doc `01` §6 still marks this `[UNKNOWN]`. Not deducible from repo contents alone; check the Vercel project settings.
3. **Wearable tables RLS policy set.** Migrations `0003` and `0020` enable RLS on `wearable_connections` / `wearable_steps` / `wearable_sleep` / `wearable_resting_hr` but declare no `FOR SELECT` / `FOR ALL` policy for `anon` or `authenticated`. Effectively only `service_role` (which bypasses RLS) can read them. Confirm no out-of-band policies were added directly in the Supabase project dashboard.
4. **`SettingsClient` God-Mode PIN location.** The PIN comparison at `components/SettingsClient.tsx` L729 (`setUnlocked(true)`) uses a constant that lives beyond the range read during this audit. If it is a hardcoded literal inside the client bundle, it is not a secret. Confirm and either move to server-side check or document it as a known limitation.
5. **Wearable callback route stores `provider: 'fitbit'` even though the connect flow builds a Google Health OAuth URL** (`app/api/wearables/callback/google/route.ts` L82). Sync route routes both `'fitbit'` and `'google_fit'` cases to `syncGoogleHealthV4`. Intentional aliasing or historical naming that should be cleaned up?
6. **Every row in `docs/09` §6 Cost Projections.** Marked `[VERIFY]` uniformly — vendor pricing changes frequently and this audit had no live-pricing access. Refresh against vendor pricing pages before publishing to stakeholders.
7. **Vercel Cron plan limits.** Vercel Hobby historically caps cron schedules at 2 concurrent; current `vercel.json` declares 4. Confirm the deployment plan supports all 4 and re-check the free-tier limit at time of publication (both may have changed).
8. **`NEXT_PUBLIC_APP_URL` intent.** Env var appears in documentation but has zero code references. Was it meant to replace the hardcoded `https://beyond-yesterday-app.vercel.app` footer in daily-whistle cron (route.ts L211)? Wire it up or delete it from Master_Reference §1.3.
9. **Vercel error-monitoring / log-drain configuration.** Doc `04` §6.1 notes `console.error(...)` is the only sink. If Sentry / Datadog / Vercel Log Drain is configured at platform level (not visible in the repo), the auditor is unaware. Confirm.

---

## Subsystems With No Home File

The following code-level subsystems exist in the repo but are not covered by any dedicated doc file. Candidates for future 07/08/discretionary docs (left for a human decision — no new files were created during this audit):

1. **Wearables sync engine** — spans `app/api/wearables/connect/google/route.ts`, `app/api/wearables/callback/google/route.ts`, `app/api/cron/sync-wearables/route.ts`, `app/actions/wearables.ts`, and 4 dedicated DB tables. Currently documented across `docs/09` (cron) and `docs/07` (schema), no single narrative. Recommend a `07_Wearables_Sync.md` self-contained file.
2. **Gamification / XP engine** — DB triggers (`trg_award_xp` in `sql/consolidated_schema.sql` L177-241), level formula (`Sidebar.tsx` L38-45 mirrors it), `metrics_config.xp_reward` catalog. No single file explains XP economy, level curves, or level-up UX. Recommend a `08_Gamification_Engine.md`.
3. **Fisky admin poke / Tone Dispatcher subsystem** — `app/actions/admin.ts` `adminTriggerPoke`, `member_lore` + `vocab_banks` DB tables, `utils/slangRouter.ts`, God-Mode UI panel in `SettingsClient.tsx`. Currently split across `docs/03` §3.2, `docs/05` §4.3, `docs/06` §1.6, `docs/08` §3.1, `docs/Master_Reference.md` §4.5. A single "God-Mode Tone Dispatcher" doc would consolidate. Optional.
4. **Runtime `long_run` → `top_golf` auto-migration** in `app/dashboard/page.tsx` L143-176. This is a code smell (per `docs/09` §8.4) but not itself a subsystem. Should be resolved by moving to a proper migration file and deleted from page render; no doc needed if fixed.
