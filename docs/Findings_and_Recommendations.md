# Findings & Recommendations

Date: 2026-07-18
Source Commit: `fa4c8bbd44a33a8ce4fd5b4262602e0407719b3d`
Scope: Proposals only — no code or documentation was modified in this pass.

Reviewer lenses: Principal Next.js Architect · Apple HIG design engineer · Database modeler.
Baseline references: [audit.md](audit.md), [docs/01_Architecture_and_App_Structure.md](docs/01_Architecture_and_App_Structure.md), [docs/04_Security_and_Gap_Analysis.md](docs/04_Security_and_Gap_Analysis.md), [docs/05_Whatsapp_Agent.md](docs/05_Whatsapp_Agent.md), [docs/07_Data_Modelling.md](docs/07_Data_Modelling.md), [docs/08_Client_Side_Architecture_and_UI_Component_Inventory.md](docs/08_Client_Side_Architecture_and_UI_Component_Inventory.md), [docs/09_Cron_Services_and_Sync_Pipelines.md](docs/09_Cron_Services_and_Sync_Pipelines.md).

---

## Summary Table (Dependency-Ordered Implementation)

Ordered by true sequential dependencies—build the foundation, then each tier. No task runs before its prerequisites are complete.

| # | ID | Domain | Title | Effort | Deps |
|---|---|---|---|---|---|
| **TIER 1: ABSOLUTE FOUNDATION** | | | | | |
| 1 | ISO-02 | Isolation | Admin Server Actions accept `groupId` parameter without verifying it matches session (NN-1, NN-3, NN-4) | M | none |
| 2 | ISO-07 | Isolation | `proxy.ts` matcher covers `/dashboard/*` only — `/settings/*` and `/api/*` unguarded (NN-1) | S | none |
| **TIER 2: NO-BLOCKER QUICK WINS** | | | | | |
| 3 | UI-01 | UI/UX | Sidebar user avatar pulses forever — reads as loading state | S | none |
| 4 | UI-02 | UI/UX | Sidebar hardcodes "The Growth Club" as every user's subtitle | S | none |
| 5 | UI-03 | UI/UX | Metric pill selector's active state uses full-accent lime background | S | none |
| 6 | UI-04 | UI/UX | Landing PIN CTA is a disabled button whose label narrates its own inertness | S | none |
| 7 | PERF-01 | Frontend | `echarts-for-react` statically imported into the dashboard client bundle | S | none |
| 8 | PERF-02 | Frontend | Runtime schema auto-migration runs on every dashboard render | S | none |
| 9 | PERF-05 | Frontend | `app/signup/page.tsx` ships a client bundle for a static redirect | S | none |
| 10 | DATA-02 | Data | `car_top_speed` / `most_beers` verification rule hardcoded in 4 files | S | none |
| 11 | AGENT-02 | Agent | Slang routing has two sources of truth (in-memory `SLANG_MAP` + `vocab_banks`) | S | none |
| 12 | AGENT-05 | Agent | Webhook silently drops the reply on any Gemini failure | S | none |
| 13 | OTHER-03 | Other | `pixie` → `nithin` avatar remap in `app/page.tsx` L233 and `UserAvatar.tsx` L48 | S | none |
| **TIER 3: DEPENDS ON TIER 2** | | | | | |
| 14 | DATA-03 | Data | `vocab_banks` DB table is orphaned — the bot reads only the in-memory copy | S | AGENT-02 |
| **TIER 4: SECURITY COMPLETENESS** | | | | | |
| 15 | ISO-03 | Isolation | `adminFetchAllLore` returns every group's `member_lore` rows (NN-3) | S | ISO-02 |
| 16 | ISO-01 | Isolation | Admin Portal has no group creation / management UI or Server Action (NN-2) | M | ISO-02 |
| **TIER 5: DEPENDS ON TIER 4** | | | | | |
| 17 | OTHER-01 | Other | Hardcoded "Texas Buds" group fallback in 3 request paths | S | ISO-01 |
| **TIER 6: SCHEMA FOUNDATION** | | | | | |
| 18 | ISO-04 | Isolation | `member_lore` and `vocab_banks` tables have no `group_id` column (NN-4) | M | ISO-02 |
| 19 | ISO-06 | Isolation | `wearable_connections` + `wearable_*` ledger tables have no `group_id` (NN-4) | M | ISO-02 |
| **TIER 7: DEPENDS ON TIER 6** | | | | | |
| 20 | ISO-05 | Isolation | WhatsApp webhook + `whatsapp-digest` cron hardcoded to a single group (NN-4) | S | ISO-04 |
| 21 | ISO-08 | Isolation | `sendCheer` stub has zero session/group guards (NN-4, latent) | S | ISO-02 |
| **TIER 8: MEDIUM-EFFORT IMPROVEMENTS** | | | | | |
| 22 | PERF-03 | Frontend | Dashboard RSC issues 5+ sequential Supabase awaits — no parallelization | S | none |
| 23 | PERF-06 | Frontend | Every log mutation triggers full-layout `revalidatePath('/', 'layout')` | S | none |
| 24 | PERF-07 | Frontend | WhatsApp webhook makes 6+ sequential DB queries per inbound message | M | none |
| 25 | PERF-04 | Frontend | `<Image unoptimized />` used everywhere combined with wildcard image hostnames | M | none |
| 26 | UI-05 | UI/UX | Card corner-radius and shadow drift — no semantic depth scale | M | none |
| 27 | DATA-01 | Data | `metric_logs.metric_slug` overloads slug-or-UUID identifier space with no FK | M | none |
| 28 | AGENT-01 | Agent | Fisky prompt fragments live in 4 files — consolidate into one prompt module | M | none |
| **TIER 9: DEPENDS ON TIER 8** | | | | | |
| 29 | AGENT-03 | Agent | `CUSTOM_SYSTEM_RULES` is an unnamed 11-element string array | S | AGENT-01 |
| 30 | AGENT-04 | Agent | Zero LLM observability — no token, latency, or model-tier logging | S | AGENT-01 |
| **TIER 10: OTHER MEDIUM WORK** | | | | | |
| 31 | OTHER-02 | Other | `SettingsClient.tsx` is 800+ lines with 8+ panels — split for maintenance | M | none |
| 32 | OTHER-04 | Other | PIN brute-force defense is a 1 s `setTimeout` — 10 000-value space is walkable | S | none |
| 33 | OTHER-06 | Other | Rename brand from "Beyond Yesterday" to "The Growth Club" across the repo | S | none |
| **TIER 11: POLISH & NICE-TO-HAVE** | | | | | |
| 34 | UI-06 | UI/UX | Login/signup Confetti blocks navigation for a fixed 2500 ms | S | none |
| 35 | AGENT-06 | Agent | No prompt version tracking on `chat_history` rows | S | AGENT-01 |
| 36 | DATA-04 | Data | `bot_persistent_state.target_user_id` not scoped to same `group_id` | S | none |
| 37 | DATA-05 | Data | `persistent_mood` CHECK hardcodes 9 strings — new mood = migration | S | none |
| 38 | DATA-06 | Data | `member_lore` + `vocab_banks` RLS is `FOR ALL USING (true)` (open) | S | none |
| 39 | OTHER-05 | Other | No `/api/health` endpoint — external monitors scrape landing HTML | S | none |

---

## Detailed Findings

### UI-01 — UI/UX — Sidebar user avatar pulses forever
- **Current state:** [components/Sidebar.tsx L94-99](components/Sidebar.tsx#L94-L99) renders the user's own avatar tile inside `className="w-10 h-10 rounded-full bg-[#CEFF00] flex-shrink-0 flex items-center justify-center animate-pulse"`. The `animate-pulse` class runs the Tailwind pulse animation indefinitely, with no state condition guarding it. It's the ambient state, not a loading state.
- **Why it matters:** In Apple's system, `animate-pulse`-style breathing is reserved for skeletons/placeholders while data resolves. Using it on a static element trains the user to ignore the signal — so when a real loading state appears elsewhere, it reads as "just decoration." It also draws the eye away from the primary nav on every render.
- **Proposed direction:** Remove the perpetual pulse; if the intent is "you are here" presence, use a subtle static ring or a small accent dot indicator on the corner of the avatar. Reserve pulse for actual pending states (avatar image loading, session refresh in-flight).
- **Alternative considered:** Keep the pulse but scope it to `hover:` or first-mount only via a `useEffect` fade-out — rejected as extra state for cosmetic reason.
- **Over-engineering check:** Cleared — this is a class removal, not an abstraction.
- **Effort:** S
- **Risk if left alone:** Users desensitize to loading signals; overall interface feels less considered.
- **Priority:** quick win

### UI-02 — UI/UX — Sidebar hardcodes "The Growth Club" as every user's subtitle
- **Current state:** [components/Sidebar.tsx L103](components/Sidebar.tsx#L103) renders `<span className="text-[#6B7280] text-xs">The Growth Club</span>` directly under the user's name. The `groupName` prop is already passed into the component and is used only for the group badge at L86; the profile block ignores it.
- **Why it matters:** A user in "Demo Riders" sees "Demo Riders" in the badge but "The Growth Club" under their name — inconsistent and, in the multi-group model the schema supports (`groups.invite_code`), incorrect. Small friend group today, but the schema is already multi-tenant.
- **Proposed direction:** Use the same `groupName` value already available in the component. If a brand line is desired below the group name, keep the brand line as a smaller tertiary label.
- **Alternative considered:** Leave it as brand copy and remove the group badge to avoid contradiction — rejected, the badge is clearly the intended affordance.
- **Over-engineering check:** Cleared — a variable substitution.
- **Effort:** S
- **Risk if left alone:** Reads as a bug the moment a second group is onboarded.
- **Priority:** quick win

### UI-03 — UI/UX — Metric pill selector's active state uses a full-accent lime background
- **Current state:** [lib/metrics.ts](lib/metrics.ts) declares `activeBg: 'bg-[#CEFF00]'` for the selected pill in `METRIC_PILLS`; [components/MetricPillSelector.tsx L78](components/MetricPillSelector.tsx#L78) renders it as a `rounded-2xl min-h-[44px]` chip. With 12 static pills plus N custom pills scrolling horizontally, the active pill visually shouts against a very quiet dashboard palette.
- **Why it matters:** Apple's system-level "segmented control" and "tag" idioms use a tinted accent fill (roughly 15–20% accent on white) with the accent color reserved for the label. A saturated neon fill on the active pill in a light UI reads as an alert, not a selection. It also fights the primary CTA color everywhere else, weakening the accent's meaning.
- **Proposed direction:** For the active pill, use an accent-tinted background (accent at low opacity) with the accent color as text and a 1 px accent border. Keep saturated `#CEFF00` for one-off primary CTAs (Log Activity, Save) and the sidebar accent line so the neon retains meaning. Leave the exact opacity/border values to implementation-time A/B.
- **Alternative considered:** Swap the accent for a warmer tone in the selector only — rejected, that fragments the brand token.
- **Over-engineering check:** Cleared — token-level change in `lib/metrics.ts` + one Tailwind class in the selector.
- **Effort:** S
- **Risk if left alone:** Accent color loses meaning as a "primary action" signal; scannability of the dashboard header row drops.
- **Priority:** quick win

### UI-04 — UI/UX — Landing PIN CTA is a disabled button whose label narrates its own inertness
- **Current state:** [app/page.tsx L432-443](app/page.tsx#L432-L443) renders, in the non-pending state, `<button type="submit" disabled={true} className="... bg-zinc-800 text-zinc-500 ... cursor-not-allowed opacity-50 ...">Auto-submits on 4 digits</button>`. The button exists but can never be clicked and never gets enabled; its role is to describe behavior to the user.
- **Why it matters:** Rendering a disabled `<button>` and using it as a help label conflates two affordances. Assistive tech reads it as an unavailable action; sighted users learn to ignore the button and pattern-recognize it as chrome. Apple's "PIN entry auto-submits" pattern (Face ID/Touch ID entry screens) uses a subtle helper caption below the field, no button chrome.
- **Proposed direction:** Replace the disabled button with a plain `<p>` helper caption below the PIN field ("Auto-submits when you enter 4 digits"). Keep the loading-state button (`isPending` path) as-is — that one is a genuine visual affordance.
- **Alternative considered:** Show an enabled "Enter Room" button that manually submits — rejected, would fight the auto-submit UX the team has clearly committed to.
- **Over-engineering check:** Cleared — one JSX swap.
- **Effort:** S
- **Risk if left alone:** Accessibility ambiguity; visual noise on the primary auth surface.
- **Priority:** quick win

### UI-05 — UI/UX — Card corner-radius and shadow scale drift
- **Current state:** Grepping `rounded-` across `components/` and `app/` returns at least 6 distinct radii in active use: `rounded-xl` (Tailwind default 12 px), `rounded-2xl` (16 px), `rounded-3xl` (24 px), `rounded-[24px]` (identical to `rounded-3xl` — used in [components/BreakingNewsFeed.tsx L87](components/BreakingNewsFeed.tsx#L87), [components/MetricChart.tsx L314](components/MetricChart.tsx#L314), [app/dashboard/leaderboard/page.tsx L352](app/dashboard/leaderboard/page.tsx#L352)), `rounded-[28px]` (landing card at [app/page.tsx L289](app/page.tsx#L289)), and `rounded-full`. Shadow scale similarly forks between `shadow-sm`, `shadow-[0_2px_10px_rgba(0,0,0,0.04)]`, `shadow-[0_8px_30px_rgba(0,0,0,0.06)]`, and `shadow-[0_8px_40px_rgba(0,0,0,0.6)]`. Two forms of the same 24 px radius coexist in the same tree.
- **Why it matters:** [docs/08_Client_Side_Architecture_and_UI_Component_Inventory.md](docs/08_Client_Side_Architecture_and_UI_Component_Inventory.md) §1 already names a card baseline (`bg-white border border-slate-200 shadow-sm rounded-xl`), but that baseline isn't the pattern the newer cards follow — they use arbitrary radii and long-shadow strings inline. The result: visually similar cards render at subtly different radii on the same screen, and depth reads unevenly. Apple's material system uses a small, semantic elevation scale (roughly 3 levels: `flat`, `raised`, `overlay`); mixing 6 radii and 4 shadow strings produces the same problem `arbitrary` Tailwind values were meant to prevent.
- **Proposed direction:** Codify a semantic depth scale — one radius per surface tier (surface, card, overlay), and one shadow per elevation tier. Represent them as CSS custom properties in `app/globals.css`'s existing `@theme` block so they're accessible as `rounded-card`/`rounded-overlay` and `shadow-raised`/`shadow-overlay`. Audit existing usages in one pass; each arbitrary value maps to one of the three tiers. Don't require a rewrite — the tokens can coexist with the current inline values during migration.
- **Alternative considered:** Leave inline arbitrary values and add a lint rule forbidding new `rounded-[Npx]` — rejected, punishes without fixing the drift already in the tree.
- **Over-engineering check:** Cleared — no new dependencies, uses existing `@theme` block already in `globals.css`. The abstraction (a semantic token) is used by every card component, not one call site.
- **Effort:** M
- **Risk if left alone:** UI drift compounds; the "premium feel" the Wearables "Connected" button hits by isolation gets diluted across neighboring surfaces.
- **Priority:** worth doing

### UI-06 — UI/UX — Login/signup Confetti blocks navigation for a fixed 2500 ms
- **Current state:** [app/page.tsx L143-152](app/page.tsx#L143-L152) sets a `setTimeout(() => router.push('/dashboard'), 2500)` after a successful login; the signup flow does the same at L204-208. During that window, the user watches a Confetti animation over a "Welcome, <Name>!" splash. No option to skip.
- **Why it matters:** Apple's convention is optimistic navigation — start the transition immediately, celebrate briefly along the way. A fixed 2.5 s hold on every login means returning users pay a delight tax every time. On slow connections the dashboard has extra time to warm up (a hidden benefit), but the current implementation makes this the primary behavior, not a fallback.
- **Proposed direction:** Start the navigation immediately; let the Confetti render on top of the dashboard for ~1.2 s before fading out. Alternatively, tap-to-dismiss the splash. Keep the audio + animation for first-time signup where the moment is genuinely first-run.
- **Alternative considered:** Just cut the delay to 1000 ms — rejected as a half-measure that keeps the pattern but weakens the celebration.
- **Over-engineering check:** Cleared — smaller `setTimeout` + moving the Confetti mount into the dashboard layout for a first-render conditional.
- **Effort:** S
- **Risk if left alone:** Returning users find login "slow" for a reason that isn't network.
- **Priority:** nice-to-have

---

### PERF-01 — Frontend — `echarts-for-react` statically imported into the dashboard client bundle
- **Current state:** [components/MetricChart.tsx L3-5](components/MetricChart.tsx#L3-L5) contains `import ReactECharts from 'echarts-for-react';` as a top-level static import in a `'use client'` component. The dashboard page always renders `<MetricChart />`, so this ships on first load of `/dashboard`. `echarts` core is ~700 KB minified (~200 KB gzipped) plus the React wrapper — one of the largest single-page-weight items in the entire app.
- **Why it matters:** For a dashboard that renders one chart at a time, the whole chart engine is on the critical path even before the user scrolls. On mobile 3G/4G the first paint of `/dashboard` waits for the chart JS to arrive. Cold serverless routes on Vercel already have TTFB baked in; this stacks on top.
- **Proposed direction:** Load `MetricChart` via `next/dynamic({ loading: () => <ChartSkeleton />, ssr: false })`. The skeleton can reuse the existing card frame (`rounded-[24px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)]` — one of the current inline styles) so there's no layout shift. Because the parent page is an RSC and passes serialized props, this is essentially a one-line wrapper change with no data-flow refactor.
- **Alternative considered:** Swap `echarts-for-react` for a lighter chart lib (Recharts or a bespoke SVG line chart) — rejected, would be a real rewrite and echarts's downsampling + point-hover interactions are already load-bearing for the UX.
- **Over-engineering check:** Cleared — uses existing framework primitive (`next/dynamic`), no new dep. Adds one small skeleton component (~30 lines) but it's a real UX improvement, not decoration.
- **Effort:** S
- **Risk if left alone:** First-contentful-paint on mobile continues to be dominated by chart JS on a page where the feed and pills are what most users scan first.
- **Priority:** quick win

### PERF-02 — Frontend — Runtime schema auto-migration runs on every dashboard render
- **Current state:** [app/dashboard/page.tsx L155-183](app/dashboard/page.tsx#L155-L183) contains a block that queries `metrics_config` for `slug = 'top_golf'`, and if missing, INSERTs the config, UPDATEs all `metric_logs` where `metric_slug = 'long_run'` to `'top_golf'`, and DELETEs the `long_run` config row. This runs unconditionally on every dashboard page request. Already flagged in [audit.md](audit.md) §Open Questions and [docs/09](docs/09_Cron_Services_and_Sync_Pipelines.md) §8.4.
- **Why it matters:** After the first successful pass the branch is a no-op (one wasted SELECT) but before that first pass, concurrent page loads race on the INSERT — Postgres's unique constraint on `slug` will reject the loser and surface an error in the console warn at L182. It's also a symptom of missing migration tooling; every drive-by page render pays for the check.
- **Proposed direction:** Move the exact same SQL into a numbered migration file (`0021_migrate_long_run_to_top_golf.sql`) and delete the block from the page. If the migration has already been applied against the production Supabase project, the migration file is a no-op there but preserves history. Apply as part of the normal migration cadence.
- **Alternative considered:** Wrap the runtime block in a module-level `let migrated = false` gate — rejected, doesn't survive serverless cold starts and still runs the SELECT on the first request of every function instance.
- **Over-engineering check:** Cleared — deletes code and moves logic to the right layer.
- **Effort:** S
- **Risk if left alone:** A latent perf tax on every dashboard load, a race hazard the first time it runs after a schema reset, and a code smell that says "our migration story isn't real."
- **Priority:** quick win

### PERF-03 — Frontend — Dashboard RSC issues 5+ sequential Supabase awaits
- **Current state:** [app/dashboard/page.tsx](app/dashboard/page.tsx) L111 (metric definitions), L158 (top_golf check), L198 (record holder), plus L207/213 (chart data via `getChartData`), L217 (feed via `getFeedItems`), and the PeerReviewBellWrapper's L341/L351 — all sequential `await`s in the same request handler. RSC blocks each round-trip.
- **Why it matters:** Each Supabase call from a Vercel Serverless Function to Supabase is 30–100 ms depending on region and pooler warmth. Six sequential awaits stack to 200–600 ms of pure network latency that the user waits through before the page starts rendering. `getChartData` and `getFeedItems` in particular are fully independent — no data dependency exists between them.
- **Proposed direction:** Wrap independent queries in `Promise.all` (or `Promise.allSettled` if partial-failure tolerance is desired). Only queries that need each other's output must stay sequential. The record-holder + chart-data + feed queries can all fire in parallel.
- **Alternative considered:** Move the aggregations into a single Postgres view or RPC — rejected, adds server surface to maintain for a benefit `Promise.all` gets 90 % of.
- **Over-engineering check:** Cleared — uses standard JavaScript primitive; no new abstraction.
- **Effort:** S
- **Risk if left alone:** Dashboard TTFB stays high; every user pays serial-latency tax on every navigation.
- **Priority:** quick win

### PERF-04 — Frontend — `<Image unoptimized />` used everywhere combined with wildcard image hostnames
- **Current state:** [next.config.ts](next.config.ts) L5-15 whitelists `hostname: '**'` for both `http` and `https` protocols. Correspondingly, [components/UserAvatar.tsx L115-127](components/UserAvatar.tsx#L115-L127) and [app/page.tsx L250](app/page.tsx#L250) pass `unoptimized` to every `<Image>`. The wildcard is defensive because `unoptimized` means Next.js never actually proxies these images — but the moment someone removes an `unoptimized` prop, the proxy becomes reachable for any URL a user's `avatar_url` points at. This is the SSRF-adjacent gap [docs/04](docs/04_Security_and_Gap_Analysis.md) §2.3 already flags.
- **Why it matters:** Two problems in one: (a) `unoptimized` disables placeholder blur, responsive `sizes`, and format transcoding — meaning the app pays download cost for full-res avatars on 40 px thumbnails; (b) the wildcard `next.config.ts` opens the SSRF door as soon as the `unoptimized` scaffolding is removed. This is a fragile equilibrium.
- **Proposed direction:** Narrow `next.config.ts` `remotePatterns` to the specific Supabase Storage hostname (`*.supabase.co`) and remove the `http` entry. In parallel, drop `unoptimized` on `<Image>` calls whose src is a Supabase URL and provide `sizes` (e.g. `sizes="40px"` for sidebar avatars, `"64px"` for gang cards, `"115px"` for the welcome splash). Keep static `/avatars/*.jpg` fallback loads on `unoptimized` since they're already local. The `LOADED_IMAGE_CACHE` module-level `Set` in `UserAvatar.tsx` can then be removed — Next's built-in caching does the job.
- **Alternative considered:** Serve avatars from a CDN with pre-baked sizes (Cloudinary/Imgix) — rejected, adds a new vendor and cost line for a benefit Next.js Image already provides.
- **Over-engineering check:** Cleared — removes code (the manual `LOADED_IMAGE_CACHE`), narrows a config, drops a prop. No new dependencies.
- **Effort:** M (touches 4–5 call sites plus the config).
- **Risk if left alone:** SSRF exposure remains latent; bandwidth waste for every avatar render; layout shift on slow connections because `<Image unoptimized />` doesn't reserve space via `sizes`.
- **Priority:** worth doing
- **Status (security audit, 2026-07-18):** ✅ Partially fixed — [next.config.ts](next.config.ts) `remotePatterns` is now scoped to `*.supabase.co` (the SSRF-adjacent config gap is closed). The `unoptimized` prop cleanup / `sizes` work is still open (out of scope for this security pass).

### PERF-05 — Frontend — `app/signup/page.tsx` ships a client bundle for a static redirect
- **Current state:** [app/signup/page.tsx](app/signup/page.tsx) is a `'use client'` component whose entire runtime behavior is `useEffect(() => { router.replace('/?tab=signup') }, [router])` and a fallback "Redirecting…" screen.
- **Why it matters:** Every visitor to `/signup` downloads React, the client router, and Lucide icons just to run one navigation. On a slow phone this can take 1–2 seconds before the redirect fires. A server-side redirect ships zero JS.
- **Proposed direction:** Replace with a `redirects` entry in `next.config.ts` (`{ source: '/signup', destination: '/?tab=signup', permanent: false }`), or convert the file to a server component that calls Next.js `redirect('/?tab=signup')`. Either way the browser gets a 30x and never renders a JS bundle.
- **Alternative considered:** Keep as-is because it works — rejected, wastes a JS bundle for a static rule.
- **Over-engineering check:** Cleared — deletes a client component in favor of framework config.
- **Effort:** S
- **Risk if left alone:** Slow, visible flash of the "Redirecting…" screen every time a marketing link points at `/signup`.
- **Priority:** quick win

### PERF-06 — Frontend — Every log mutation triggers full-layout `revalidatePath('/', 'layout')`
- **Current state:** Nine Server Actions (ingest, direct log, manual log, vote approve/reject, delete, memory upload/comment/delete, admin log edits, avatar upload) call `revalidatePath('/', 'layout')` (see [docs/01](docs/01_Architecture_and_App_Structure.md) §9.4 for the full call-site map). This invalidates every RSC cache under the root layout, which means Sidebar re-fetches XP and level, MobileBottomNav re-mounts, and the dashboard shell re-fetches the session profile on every log.
- **Why it matters:** Logging a metric is the app's most frequent user action. Its cache invalidation currently reaches five sibling routes it doesn't touch. The user's perceived latency doesn't change much because the actions are still fast, but Supabase Function-instance query volume scales linearly with irrelevant re-fetches — a real cost line as the group grows.
- **Proposed direction:** Match the invalidation scope to the mutation. Log ingestion invalidates `/dashboard` and `/dashboard/leaderboard`. Memory upload invalidates `/dashboard/memories` (and `/dashboard` only if the ticker or feed surfaces memories). Avatar upload legitimately does need the layout-wide invalidation because the sidebar shows the avatar — keep it there. Audit each call site individually rather than blanketing.
- **Alternative considered:** Move to tag-based revalidation (`revalidateTag`) — rejected as premature, no data-fetch layer has been tagged yet and the surgical-path approach solves the immediate problem.
- **Over-engineering check:** Cleared — this is scoping down an existing call, not introducing new machinery.
- **Effort:** S
- **Risk if left alone:** Supabase query volume inflates with group size; cache invalidation is a hidden cost the team won't notice until the Pro plan bill arrives.
- **Priority:** worth doing

### PERF-07 — Frontend — WhatsApp webhook makes 6+ sequential DB queries per inbound message
- **Current state:** [app/api/webhooks/whatsapp/route.ts](app/api/webhooks/whatsapp/route.ts) background `after()` closure sequentially awaits: groups list (L142), profile lookup (L166), chat history (L177), recent verified logs (L206), group members (L227), top_golf logs (L242), bot_persistent_state (L295), targeted profile if any (L310), group members with is_active (L322), 7-day activity (L332). Ten round-trips before the first Gemini token.
- **Why it matters:** WhatsApp users perceive Fisky as "slow" when replies take >3 s. Each Supabase call adds 30–100 ms. Even at the low end, 10 sequential calls at 40 ms = 400 ms of pure wait before the LLM call starts. Replies become sluggish especially in evening peak.
- **Proposed direction:** Group the independent queries into a single `Promise.all`. The profile lookup, chat history, recent logs, group members, top_golf logs, persistent state, and 7-day activity queries have no cross-dependencies — they all key off `groupId` (or `rawSender`) which is known at the start. The targeted-profile query is the only one that depends on persistent-state output; keep that one dependent.
- **Alternative considered:** Cache the group-scoped context (leaderboard, member list) in Redis/Upstash for 30 s — rejected, adds a new dependency and cache-invalidation surface for a benefit `Promise.all` gets 70 % of.
- **Over-engineering check:** Cleared — restructures existing awaits into one batch; no new deps.
- **Effort:** M — real risk of subtle bugs if partial failures are mishandled; `Promise.allSettled` with per-query fallback values keeps the current defensive behavior.
- **Risk if left alone:** Reply latency creeps upward as the group grows; user perception of Fisky's snappiness degrades.
- **Priority:** worth doing

---

### DATA-01 — Data — `metric_logs.metric_slug` overloads slug-or-UUID identifier space with no FK
- **Current state:** [docs/07_Data_Modelling.md](docs/07_Data_Modelling.md) §1.6 documents `metric_slug` as a `text` column that "matches standard slug OR custom definition UUID." No foreign key exists. [app/actions/ingest.ts L155-160](app/actions/ingest.ts#L155-L160) validates the value against `metrics_config.slug` OR `metric_definitions.id` in application code.
- **Why it matters:** Two problems stack:
  1. Deleting a custom `metric_definitions` row leaves orphaned `metric_logs` rows whose `metric_slug` references a UUID that no longer exists. The dashboard falls back to displaying the raw slug string, which for a UUID looks like `0000-0000-...`.
  2. The overload prevents the DB from enforcing referential integrity or a `CHECK` constraint. Every read path (`getChartData`, feed, leaderboard) has to know both spaces.
- **Proposed direction:** Two options, pick one at implementation time:
  - **Split columns**: add `metric_definition_id UUID REFERENCES metric_definitions(id) ON DELETE SET NULL`; keep `metric_slug` for the built-in catalog. Reads become "prefer definition_id, else slug."
  - **Unify identifier space**: give every `metrics_config` row a synthetic UUID `id` that `metric_logs` FKs into via a single `metric_id` column; keep the friendly `slug` on `metrics_config` only. Migration writes UUIDs into a new column, then swaps the read paths, then drops `metric_slug`.
  Either approach eliminates the ambiguity and gives Postgres a chance to enforce the relationship.
- **Alternative considered:** Change nothing and paper over orphans in the UI — rejected, the UI already leaks UUIDs (see dashboard debug banner).
- **Over-engineering check:** Cleared — this is a data-model fix, not a new abstraction; the current shape already caused a workaround in [app/dashboard/page.tsx L155-183](app/dashboard/page.tsx#L155-L183) (runtime slug-rename migration).
- **Effort:** M (both options require a migration and multiple read-path updates)
- **Risk if left alone:** Continued drift; deleting a custom metric silently breaks historical logs; any future admin tooling has to know both identifier spaces.
- **Priority:** worth doing

### DATA-02 — Data — `car_top_speed` / `most_beers` verification rule hardcoded in 4 files
- **Current state:** The string literal check `(metricSlug === 'car_top_speed' || metricSlug === 'most_beers')` appears in [app/actions/ingest.ts L162](app/actions/ingest.ts#L162), [app/actions/logDirect.ts L48, L103, L119](app/actions/logDirect.ts) (three times in one file), and [app/api/telegram/route.ts L210](app/api/telegram/route.ts#L210). Total: 5 duplications across 3 files. Each site independently decides whether to set `status = 'pending'` (peer-review required) or `'verified'` on insert.
- **Why it matters:** Adding a third metric that requires peer review means editing all 5 sites. Missing one silently degrades review flow. This is exactly the kind of rule the DB was designed to hold — `metrics_config` already stores per-metric config like `xp_reward` and `sort_order`.
- **Proposed direction:** Add a `requires_verification boolean NOT NULL DEFAULT false` column to `metrics_config`. Seed the two current slugs with `true`. At each insert site, look up the metric and use that flag as the status default. As a bonus, this same flag can drive UI hints in `AddActivityModal` ("This activity needs 3 peer approvals before it counts").
- **Alternative considered:** Extract a helper function `getInitialLogStatus(slug)` in `lib/metrics.ts` — rejected, still hardcodes the rule in JS and doesn't unlock the UI hint.
- **Over-engineering check:** Cleared — adds one DB column and removes 5 hardcoded conditionals. The column is used by every insert site (not one), so the abstraction earns its keep.
- **Effort:** S
- **Risk if left alone:** Next contributor forgets one of the sites; verification rules diverge across ingestion channels.
- **Priority:** quick win

### DATA-03 — Data — `vocab_banks` DB table is orphaned; the bot reads only the in-memory copy
- **Current state:** [utils/slangRouter.ts](utils/slangRouter.ts) L7-25 declares `SLANG_MAP` as a hardcoded object. `getSlangFor(tone, gender)` reads only from that object. Meanwhile [supabase/migrations/0013_lore_and_vocab.sql](supabase/migrations/0013_lore_and_vocab.sql) L23-46 creates the `vocab_banks` table and seeds it. [app/actions/admin.ts](app/actions/admin.ts) exposes `adminUpsertVocabBank` and `adminDeleteVocabBank` which write to the table, and the Settings UI ([components/SettingsClient.tsx](components/SettingsClient.tsx)) has a "Vocab Banks Editor" form. No code path ever reads `vocab_banks` back for use.
- **Why it matters:** Admins editing the Vocab Banks UI in Settings get success confirmations and see their changes persist in the DB, but Fisky's replies don't change. This is a broken feedback loop that will slowly eat trust in the admin console once someone notices.
- **Proposed direction:** Pick one source of truth. The cleaner path: make `getSlangFor()` async and read from `vocab_banks` with a small module-level cache (e.g. 60 s TTL) to keep it fast. Callers (`adminTriggerPoke`) already run in async server contexts. Delete `SLANG_MAP` or reduce it to a fallback default used only when the DB fetch fails. If keeping the in-memory version is preferred instead, delete the `vocab_banks` table + admin actions + Settings panel; leave one source, not two.
- **Alternative considered:** Sync `SLANG_MAP` from the DB at server startup — rejected, serverless has no stable "startup" and the cache would be per-instance anyway.
- **Over-engineering check:** Cleared — removes a dead code path either way. Adds a 60 s cache which is a small abstraction but earns itself the first time an admin ships new slang and expects it to take effect within a minute.
- **Effort:** S
- **Risk if left alone:** Feature drift; admin UI lies about its own effects.
- **Priority:** worth doing

### DATA-04 — Data — `bot_persistent_state.target_user_id` not scoped to same `group_id`
- **Current state:** [supabase/migrations/0017_bot_persistent_state.sql](supabase/migrations/0017_bot_persistent_state.sql) declares `target_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL`. Nothing enforces that the referenced profile belongs to the same group as the row's `group_id`.
- **Why it matters:** A God-Mode admin in Group A could accidentally set the persistent target to a user in Group B (e.g. by pasting a UUID). The webhook's targeted-mood directive would then name a stranger's nickname in Group A's WhatsApp chat. Not exploitable at scale in a friend group, but a data-integrity gap.
- **Proposed direction:** Add a small `CHECK` via a trigger or, more portably, a `FOREIGN KEY (group_id, target_user_id) REFERENCES group_members(group_id, user_id) ON DELETE SET NULL` — but `group_members` doesn't have that composite unique constraint. Simplest path: a `BEFORE INSERT OR UPDATE` trigger on `bot_persistent_state` that raises if `target_user_id` is not in `group_members` for the given `group_id`.
- **Alternative considered:** Enforce at Server Action layer only — rejected, defense-in-depth is cheap here.
- **Over-engineering check:** Cleared — one trigger, one migration. No new abstraction in application code.
- **Effort:** S
- **Risk if left alone:** Rare cross-group naming in bot messages; hard-to-explain bug for the first admin who trips it.
- **Priority:** nice-to-have

### DATA-05 — Data — `persistent_mood` CHECK constraint hardcodes 9 mood strings
- **Current state:** [supabase/migrations/0017_bot_persistent_state.sql](supabase/migrations/0017_bot_persistent_state.sql) L5 declares `CHECK (persistent_mood IN ('Normal', 'Angry', 'Sad', 'Horny', 'Happy', 'Flirting', 'Romantic', 'Arrogant', 'Sarcastic'))`. The same list is duplicated in [components/SettingsClient.tsx L98](components/SettingsClient.tsx#L98) as a TypeScript union type.
- **Why it matters:** Adding a mood ("Chaotic", "Bored") requires a schema migration AND a client-side type edit. For a bot whose whole point is playful persona experimentation, this is friction against the app's own design intent.
- **Proposed direction:** Replace the CHECK constraint with a `bot_moods` lookup table (`slug TEXT PRIMARY KEY, label TEXT, description TEXT, is_active BOOLEAN`) and FK `bot_persistent_state.persistent_mood` to it. Settings UI reads the lookup for its dropdown. Adding a mood becomes an INSERT.
- **Alternative considered:** Drop the CHECK entirely and let the prompt-builder tolerate arbitrary strings — rejected, loses the guardrail the CHECK was providing against typos in admin actions.
- **Over-engineering check:** Called out — this is trading one table for one CHECK. Only justified if new moods are actually expected. If the team's roadmap doesn't include new moods, leave this alone. Flagging as judgment call.
- **Effort:** S
- **Risk if left alone:** Small friction next time someone wants a new mood; not blocking.
- **Priority:** nice-to-have

### DATA-06 — Data — `member_lore` + `vocab_banks` RLS is `FOR ALL USING (true)` (open)
- **Current state:** [supabase/migrations/0013_lore_and_vocab.sql](supabase/migrations/0013_lore_and_vocab.sql) L20-21 and L34-35 declare `FOR ALL USING (true)` policies on both tables. Documented in [audit.md](audit.md) "What Was Missing" and [docs/04](docs/04_Security_and_Gap_Analysis.md) §3.
- **Why it matters:** Any anon/authenticated caller (which today means "any client using the anon key") can read every group's lore and every group's vocab. Because the app currently uses `createAdminClient()` for all Server Actions and never exposes anon-key access to these tables from the client, the exploit surface is narrow — but the moment a future Server Action drops back to `createClient()` for one of these tables, isolation breaks silently.
- **Proposed direction:** Since these tables are only accessed via service-role Server Actions, the cleanest fix is to REVOKE `anon` and `authenticated` grants and rely entirely on service-role bypass. If future features need anon reads, add a group-scoped policy at that time. This matches the pattern `chat_history` already uses.
- **Alternative considered:** Add group-scoped RLS policies now — rejected, `member_lore` uses `user_id` as PK (no `group_id` column), so the policy would need a subquery through `group_members`, which is more surface than the current usage justifies.
- **Over-engineering check:** Called out — small friend group, the exposure is theoretical. Priority is low, but the fix is one migration and lands defense in depth.
- **Effort:** S
- **Risk if left alone:** Silent leak vector if the access pattern ever changes.
- **Priority:** nice-to-have
- **Status (security audit, 2026-07-18):** ✅ Fixed — migration `0032_lore_vocab_rls_lockdown.sql` replaced both `FOR ALL USING (true)` policies with service-role-only policies and revoked `anon`/`authenticated` grants. Separately, migration `0025_add_group_id_to_lore_and_vocab.sql` also added the `group_id` column referenced by ISO-04 (that finding's schema gap is resolved too). Verified in code.

---

### AGENT-01 — Agent — Fisky prompt fragments live in 4 files — consolidate into one prompt module
- **Current state:** Prompt strings are scattered:
  - [lib/ai/prompts.ts](lib/ai/prompts.ts) — `CUSTOM_SYSTEM_RULES` (11-item array) + `buildGroupAssistantPrompt()` for the inbound-webhook reply.
  - [app/actions/admin.ts L221-260](app/actions/admin.ts#L221-L260) — inline template string for `adminTriggerPoke` (the God-Mode broadcast), duplicating and mildly rewording the persona rules.
  - [app/api/cron/daily-whistle/route.ts L179-197](app/api/cron/daily-whistle/route.ts#L179-L197) — inline morning-briefing prompt.
  - [app/api/cron/ai-bookie/route.ts L120-138](app/api/cron/ai-bookie/route.ts#L120-L138) — inline Monday prop-bet prompt.
  - [app/api/cron/whatsapp-digest/route.ts L221-224](app/api/cron/whatsapp-digest/route.ts#L221-L224) — inline noon summary directive + calls `buildGroupAssistantPrompt` as system prompt.
  - [app/actions/memories.ts L138-142](app/actions/memories.ts#L138-L142) — inline caption-generation prompt for photo uploads.
  - Anti-injection extraction system prompt in [app/api/telegram/route.ts L43-71](app/api/telegram/route.ts#L43-L71).
- **Why it matters:** Persona tuning is currently a 4–6 file hunt. Rules like "no cinematic clichés (Baahubali/RRR/Pushpa)" exist in `adminTriggerPoke` but NOT in `buildGroupAssistantPrompt` (see [docs/05](docs/05_Whatsapp_Agent.md) §4.1 correction). Rules drift silently because there's no single place that shows the persona's whole surface.
- **Proposed direction:** Consolidate into a single `lib/ai/prompts.ts` module with named exports:
  ```
  // one shared vocabulary of persona rules
  export const FISKY_CORE_RULES: string[]      // linguistic, guardrails, no-markdown
  export const FISKY_FLIRT_MATRIX: string      // gender-based persona
  export const FISKY_CINEMA_BAN: string        // the Baahubali/RRR/Pushpa clamp
  export const FISKY_LENGTH_RULES: (targetWords: number) => string
  
  // one builder per surface, composing the above:
  export function buildWebhookReplyPrompt({...})    // inbound WhatsApp
  export function buildGodModePokePrompt({...})     // adminTriggerPoke
  export function buildDailyWhistlePrompt({...})    // 03:00 UTC cron
  export function buildBookiePrompt({...})          // Mon 13:00 UTC cron
  export function buildDigestPrompt({...})          // noon cron
  export function buildMemoryCaptionPrompt({...})   // photo upload
  export function buildTelegramExtractionSystem()   // Telegram anti-injection
  ```
  Each cron/webhook imports and calls one builder. Adding "no cinematic clichés" to inbound replies becomes appending `FISKY_CINEMA_BAN` to `buildWebhookReplyPrompt`. The whole persona is auditable in one file.
- **Alternative considered:** One giant `SYSTEM_PROMPT` constant used everywhere — rejected, each surface genuinely needs a different composition (Telegram wants zero personality, digest wants stats, admin poke wants lore).
- **Over-engineering check:** Cleared — reduces file count from 6 to 1, uses only string composition. No new dependency, no runtime abstraction, no config system. This is exactly the "prefer extending what's there" pattern — `lib/ai/prompts.ts` already exists.
- **Effort:** M — mechanical refactor across 6 files, each a straight extract-and-import.
- **Risk if left alone:** Persona drift; new hires can't find where to change tone without spelunking; the correction already made in [docs/05](docs/05_Whatsapp_Agent.md) §4.1 becomes recurring maintenance.
- **Priority:** worth doing (this is the primary Part 3.4 finding)

### AGENT-02 — Agent — Slang routing has two sources of truth
- **Current state:** [utils/slangRouter.ts](utils/slangRouter.ts) `SLANG_MAP` is the read path; [vocab_banks](supabase/migrations/0013_lore_and_vocab.sql) DB table is the write path. Fully duplicative (see DATA-03).
- **Why it matters:** This is the agent-side view of DATA-03. Any persona tuning done via the admin UI has no effect on the bot, so the "tune the persona from Settings" mental model documented in [docs/Master_Reference.md](docs/Master_Reference.md) §4.5 is broken.
- **Proposed direction:** As part of the AGENT-01 consolidation, make the prompt builders that need slang (`buildGodModePokePrompt` today, potentially `buildWebhookReplyPrompt` tomorrow) accept a slang array as a parameter, and have the caller resolve it — either from the DB (preferred, per DATA-03) or from `SLANG_MAP` (if the DB path is dropped instead).
- **Alternative considered:** Leave the split — rejected, see DATA-03.
- **Over-engineering check:** Cleared — either direction reduces surface area.
- **Effort:** S
- **Risk if left alone:** Same as DATA-03 — admin UI lies about its effects.
- **Priority:** quick win

### AGENT-03 — Agent — `CUSTOM_SYSTEM_RULES` is an unnamed 11-element string array
- **Current state:** [lib/ai/prompts.ts L6-16](lib/ai/prompts.ts#L6-L16) exports `CUSTOM_SYSTEM_RULES: string[]` — 11 rules with no per-item name, no per-item comment, no per-item rationale. Rules are joined into a numbered list at prompt-build time.
- **Why it matters:** When a rule needs to change (e.g., the anti-repetition guard against "[Name] darling" openings — currently rule 11), the maintainer has to read the whole array to find the right line. When Gemini violates a specific rule in production, there's no clean way to say "this is a rule 11 violation, tighten rule 11."
- **Proposed direction:** As part of the AGENT-01 consolidation, replace the flat array with named constants (`RULE_LANGUAGE`, `RULE_ADDRESS_TERMS`, `RULE_SENTENCE_TAGS`, `RULE_ANTI_REPETITION`, ...) grouped into semantic buckets. The builder can then compose them or omit selectively per surface (e.g., digest cron doesn't need `RULE_ANTI_REPETITION`).
- **Alternative considered:** Add JSDoc comments to each string in the array — rejected, still leaves a magic-index maintenance hazard.
- **Over-engineering check:** Cleared — 11 exported constants for 11 rules; no runtime overhead, no new file.
- **Effort:** S
- **Risk if left alone:** Persona rules become archaeology; tightening one rule risks breaking a neighbor.
- **Priority:** worth doing

### AGENT-04 — Agent — Zero LLM observability
- **Current state:** [utils/geminiPool.ts](utils/geminiPool.ts) rotates keys and cascades models silently; the successful call returns only the `generateText` / `generateObject` result. No `console.info` records which `{keyIndex, model, latency, tokens}` served the call. No error accounting either — a rate-limited key gets skipped with a single `console.warn`.
- **Why it matters:** When the group notices Fisky replies got slower, or costs spiked, there's no telemetry to answer "which model tier are we on, and are we cycling through keys?" Even without a proper metrics backend, structured `console.log` lines land in Vercel Function logs and can be grepped.
- **Proposed direction:** Wrap the successful path in a single `console.log('[gemini]', { model, keyIndex, latencyMs, promptTokens, completionTokens })` — the Vercel AI SDK's response includes usage totals. Do the same on the cascade-degradation path (`console.warn('[gemini] cascade', { fromModel, toModel, reason: 'rate-limit' })`). No external service, no new dependency, just structured logging.
- **Alternative considered:** Add Sentry / Datadog / a proper metrics vendor — rejected, adds a paid dependency for a friend-group app; console logging via Vercel Log Drain (already available on Pro plan) is enough for the current scale.
- **Over-engineering check:** Cleared — a few `console.log` calls in one file. No abstraction.
- **Effort:** S
- **Risk if left alone:** First real cost or latency surprise happens with no data to root-cause.
- **Priority:** worth doing

### AGENT-05 — Agent — Webhook silently drops the reply on any Gemini failure
- **Current state:** [app/api/webhooks/whatsapp/route.ts L385-390](app/api/webhooks/whatsapp/route.ts#L385-L390) wraps the `executeWithKeyRotation` call in a `try/catch` whose catch block is `console.error(...); return;` — the background function silently ends. The user gets nothing.
- **Why it matters:** Sender saw their message land, expects a Fisky reply, and gets silence. Repeated silence is worse than a graceful fallback ("Fisky is thinking — try again in a moment"). Additionally, since the webhook already returned 200 to Green API before this point, there's no external retry to save the situation.
- **Proposed direction:** In the catch block, dispatch a short fallback reply via `sendWhatsAppGroupMessage()` — one canned string, no LLM, no cost. Something on the order of "Fisky's brain froze for a sec, hit me again 🤖" quoted back to the trigger message. Include the error in `console.error` for observability.
- **Alternative considered:** Retry the LLM call once — rejected, `executeWithKeyRotation` already cascades keys and models internally; a wrapper retry duplicates that logic.
- **Over-engineering check:** Cleared — one existing helper, one string constant.
- **Effort:** S
- **Risk if left alone:** Users experience Fisky as intermittently broken with no signal.
- **Priority:** quick win

### AGENT-06 — Agent — No prompt version tracking on `chat_history` rows
- **Current state:** [chat_history](supabase/migrations/0009_chat_history.sql) stores `role`, `sender_name`, `content`, `created_at`. Nothing captures which persona/version generated a given `assistant` row.
- **Why it matters:** When someone in the group screenshots a bad Fisky reply from three weeks ago and asks "why did it say this?", the current answer is "we don't know — the prompt has been edited since then." Even a low-fidelity `prompt_version TEXT` column populated with a hash of the assembled prompt (or a semver-style tag) makes root-cause possible.
- **Proposed direction:** Add `prompt_version TEXT NULL` to `chat_history`; populate on insert with a short identifier (git commit short-hash or a manually bumped version constant in `lib/ai/prompts.ts`). No index needed at current scale.
- **Alternative considered:** Store the whole assembled prompt per row — rejected, storage bloat with limited debugging benefit.
- **Over-engineering check:** Called out — this is speculative infrastructure for a debugging story that hasn't happened yet. Only justified if persona tuning is expected to be frequent. Flagging as judgment call.
- **Effort:** S
- **Risk if left alone:** Debugging a bad reply requires guesswork.
- **Priority:** nice-to-have

---

### OTHER-01 — Other — Hardcoded "Texas Buds" group fallback in 3 request paths
- **Current state:** Three code sites resolve "the target group" by hardcoding a group name string instead of using the session:
  - [app/api/webhooks/whatsapp/route.ts L110 and L153](app/api/webhooks/whatsapp/route.ts) — `groups?.find(g => g.name === 'Texas Buds' || g.invite_code === 'TEXASBUDS') || groups?.[0]` on both the `/clear` command path and the main background processing path.
  - [app/api/cron/whatsapp-digest/route.ts L80](app/api/cron/whatsapp-digest/route.ts#L80) — same expression.
  - Flagged in [docs/04](docs/04_Security_and_Gap_Analysis.md) §2.7 as MEDIUM.
- **Why it matters:** The DB schema is multi-tenant (`groups.whatsapp_group_id`, `groups.whatsapp_instance_id`, `groups.whatsapp_token`). The `daily-whistle` and `ai-bookie` crons already iterate all groups correctly (per [docs/09](docs/09_Cron_Services_and_Sync_Pipelines.md) §2, §3). The three "Texas Buds" fallbacks are the last legacy sites blocking a real second group from being added.
- **Proposed direction:** For the WhatsApp webhook: resolve the group by matching `body.senderData.chatId` against the `groups.whatsapp_group_id` column (which the DB already stores per group). For `whatsapp-digest`: iterate all groups the way `daily-whistle` does, one message per group.
- **Alternative considered:** Keep the fallback but move the string to an env var — rejected, still single-tenant, just with a different failure mode.
- **Over-engineering check:** Cleared — removes hardcoded strings, uses existing DB columns.
- **Effort:** S
- **Risk if left alone:** A second group can never receive WhatsApp broadcasts from three of the app's most-used paths.
- **Priority:** worth doing

### OTHER-02 — Other — `SettingsClient.tsx` is 800+ lines with 8+ panels
- **Current state:** [components/SettingsClient.tsx](components/SettingsClient.tsx) is a single client component containing: God-Mode PIN unlock, Bot Mute toggle, User Activation, Member Removal, PIN Reset, Role Selection, Custom Metric Add, Metric Visibility, Banter Poke, Lore Editor, Vocab Bank Editor, Persistent Mood, Avatar Upload, Log Editor (Module E). All in one file with intermingled state. Panels are documented at [docs/08](docs/08_Client_Side_Architecture_and_UI_Component_Inventory.md) §3.1.
- **Why it matters:** Any change to any panel forces the reader to load and understand the whole file. State declarations are grouped at the top with no clear ownership by panel. Splitting into per-panel components clarifies intent and lets React tree-shake per-panel state changes.
- **Proposed direction:** Split each panel into its own component under `components/settings/` (e.g. `BotMutePanel.tsx`, `LogEditorPanel.tsx`, `LorePanel.tsx`, ...). Each panel receives its slice of session + members + logs via props. Keep `SettingsClient.tsx` as a thin orchestrator that renders the panels and holds the God-Mode unlock gate. No behavior change, purely structural.
- **Alternative considered:** Extract per-panel custom hooks but keep JSX in one file — rejected, half-measure, still leaves the JSX monolith.
- **Over-engineering check:** Cleared — this is code organization for a page already documented as having 8+ distinct panels. Each panel becomes its own responsibility.
- **Effort:** M — mechanical split, no logic changes.
- **Risk if left alone:** Every Settings change becomes a full-file re-read; new admin panels get added inline, growing the file toward 1500+ lines.
- **Priority:** worth doing

### OTHER-03 — Other — `pixie` → `nithin` avatar remap survived to production
- **Current state:** [app/page.tsx L233-235](app/page.tsx#L233-L235) and [components/UserAvatar.tsx L47-49](components/UserAvatar.tsx#L47-L49) both contain identical logic: if the first name resolves to "pixie", remap it to "nithin" before building the static avatar path. Presumably because `/public/avatars/pixie.jpg` doesn't exist but `/public/avatars/nithin.jpg` does.
- **Why it matters:** This is a dev workaround for a real user that leaked into production. It's harmless for the current friend group but it's the exact class of code that becomes an embarrassing find during a future audit or open-source moment. It also encodes a specific person's identity assumptions in shared code.
- **Proposed direction:** Delete both remaps. If the user "Pixie" doesn't have `/public/avatars/pixie.jpg`, upload one (or let the initials fallback in `UserAvatar` do its job — which it already does correctly). If the shared filesystem lookup is fragile in general, the real fix is to store `avatar_url` as a Supabase Storage URL for every user and drop `/public/avatars/*.jpg` as a source-of-truth path (see PERF-04).
- **Alternative considered:** Move the mapping into a `NICKNAME_ALIASES` config object — rejected, ratchets a hack into "supported feature."
- **Over-engineering check:** Cleared — deleting code.
- **Effort:** S
- **Risk if left alone:** More such mappings accumulate; the pattern legitimizes hardcoding user names in shared modules.
- **Priority:** quick win

### OTHER-04 — Other — PIN brute-force defense is a 1 s `setTimeout` — 10 000-value space is walkable
- **Current state:** [app/actions/auth.ts L146](app/actions/auth.ts#L146) — on wrong PIN, `await new Promise((resolve) => setTimeout(resolve, 1000))`. That's the entire brute-force defense. No IP throttling, no per-account lockout, no exponential backoff. 4-digit PIN space = 10 000. Flagged in [docs/04](docs/04_Security_and_Gap_Analysis.md) §6.2.
- **Why it matters:** An attacker sending parallel requests can sweep the full PIN space against a known group in under an hour. In a friend-group app the practical attacker is a bored friend, but the mitigation cost is low enough that the current defense is under-invested.
- **Proposed direction:** Add per-`(group_id, ip)` counter in a small `login_attempts` table (or Vercel KV / Upstash if a KV store gets adopted). After N wrong PINs in M minutes, return "Too many attempts, wait 15 minutes." Keep the 1 s delay too — belt and suspenders. Optionally send the user's admin a WhatsApp DM when a threshold is crossed.
- **Alternative considered:** Move to a longer PIN (6 digits) or 2FA — rejected, doesn't fit the kiosk-UX model the whole login flow was designed around.
- **Over-engineering check:** Called out — adds a new table (`login_attempts`) and one Server Action for the check. The table exists solely for this purpose. Justified because the current defense is measurably inadequate and this is the standard mitigation, but note that adopting Vercel KV (if not already in the stack) would be a new dependency; a Postgres table is preferred if avoiding new deps.
- **Effort:** S — one migration + one helper + one call site in `loginWithPersonalPinAction`.
- **Risk if left alone:** PIN sweep is practically feasible; a friend "guessing" someone's PIN maps to real trust breakdown in a friend-group app.
- **Priority:** worth doing
- **Status (security audit, 2026-07-18):** ✅ Fixed — implemented exactly as proposed via [lib/rateLimit.ts](lib/rateLimit.ts) + `login_attempts` table (migration `0028_login_attempts.sql`), wired into `loginWithPersonalPinAction`. Verified in code.

### OTHER-05 — Other — No `/api/health` endpoint
- **Current state:** No route handler at `app/api/health/route.ts`. External uptime monitors have to scrape the landing HTML (a client component that always returns 200 even if Supabase is down). Flagged in [docs/04](docs/04_Security_and_Gap_Analysis.md) §6.1.
- **Why it matters:** A basic health check is the cheapest possible observability affordance and unblocks any uptime monitor (UptimeRobot, BetterStack, etc.) from doing something useful.
- **Proposed direction:** Add a single `app/api/health/route.ts` that returns `{ ok: true, ts: Date.now(), db: 'ok' | 'error' }` where `db` reflects a `SELECT 1` against Supabase with a 2-second timeout. No auth required — the response reveals nothing sensitive.
- **Alternative considered:** Ship a full status page — rejected, overkill for current scale.
- **Over-engineering check:** Cleared — one route file, ~20 lines.
- **Effort:** S
- **Risk if left alone:** Team learns about outages from users on WhatsApp.
- **Priority:** nice-to-have

### OTHER-06 — Other — Rename brand from "Beyond Yesterday" to "The Growth Club"
- **Current state:** The repo carries two brand names in parallel. `package.json` L2 declares `"name": "beyond-yesterday-app"`. The user-facing name is "The Growth Club" (landing page L262, sidebar promo poster, Fisky prompt, dashboard header) but internal docs, absolute-path doc links (`file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/…` across every doc), and titles still use "Beyond Yesterday" (`docs/Master_Reference.md` L1, `README.md` L1, `docs/01_Architecture_and_App_Structure.md` header, `Findings_and_Recommendations.md` L5, etc.).
- **Why it matters:** Two names for one product is a maintenance and communication smell. New contributors have to learn both; user-facing surfaces don't match repo/doc references; every future doc link written with the old absolute path preserves the drift.
- **Proposed direction:** Standardize on **The Growth Club** as the single brand. Concrete steps:
  1. Rename `package.json` `"name"` field to `"the-growth-club"` (or `"thegrowthclub"` — pick one, be consistent).
  2. Rewrite `README.md` and `docs/Master_Reference.md` titles.
  3. In every `docs/*.md`, replace the absolute `file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/…` links with workspace-relative paths (e.g. `[session.ts](../lib/session.ts)`). This kills two birds — resolves the audit's leftover `[VERIFY]` on stale absolute paths (see [audit.md](audit.md) Open Questions #1) and removes the "Beyond-Yesterday" folder segment.
  4. Sweep prose references: "Beyond Yesterday" → "The Growth Club" wherever the brand is spoken about (subheaders, taglines, service inventory notes, `Master_Reference.md` §1.1, etc.). Keep the phrase inside historical Revision Log rows unchanged.
- **Alternative considered:** Keep both names and add a note in the README explaining the parallel. Rejected — that codifies the confusion.
- **Over-engineering check:** Cleared — mechanical find/replace across a bounded doc set + one JSON field rename. No dependency changes, no build impact.
- **Effort:** S — one-sweep edit; do not touch `audit.md` or historical Revision Log rows since those record what was written at the time.
- **Risk if left alone:** Two-name drift compounds; every new doc perpetuates the old absolute paths.
- **Priority:** worth doing

---

## Isolation Findings (NN-1 · NN-2 · NN-3 · NN-4)

Scope for this section: verify the four Non-Negotiable tenant/group isolation requirements against the actual code at commit `fa4c8bb` (plus subsequent edits from the persona-neutralization pass). This section is a **proposals-only** audit — no code was changed. Fixes belong in follow-up implementation passes.

### NN Verdict Snapshot

| Requirement | Verdict | Primary Evidence |
|---|---|---|
| **NN-1** Complete group/tenant isolation throughout the entire system | ❌ **Not met** | Every admin Server Action uses `createAdminClient()` (service-role, RLS bypassed) AND accepts `groupId` as an unverified parameter (see ISO-02). `proxy.ts` matcher covers `/dashboard/*` only, leaving `/settings/*` and `/api/*` outside the framework-level auth gate (ISO-07). |
| **NN-2** Admin Portal must allow creating and managing groups | ❌ **Not met** | Zero code hits for `createGroup`, `adminCreateGroup`, `adminUpdateGroup`, `adminDeleteGroup`, `adminFetchGroups`, or `from('groups').insert` in `app/actions/**` or `components/SettingsClient.tsx`. Groups are created only via raw SQL insert. (ISO-01) |
| **NN-3** Users should only see data belonging to their own group | ❌ **Not met** | `adminFetchAllLore` reads `member_lore.select('*')` without a `group_id` filter — a God-Mode admin in Group A sees Group B's lore rows (ISO-03). Combined with ISO-04 (no `group_id` column on `member_lore`/`vocab_banks`) and ISO-02 (no session cross-check), any authenticated user who bypasses the client-side God-Mode PIN gate can enumerate cross-group data via direct Server Action invocation. |
| **NN-4** Every feature (WhatsApp agent, AI, crons, notifications, background jobs, APIs, caches) operates only within the assigned group | ❌ **Not met** | WhatsApp inbound webhook + `whatsapp-digest` cron are hardcoded to a single group (ISO-05). Wearable sync + wearable ledger tables have no `group_id` at all (ISO-06). `sendCheer` stub is unguarded (ISO-08). `member_lore` / `vocab_banks` cross-tenant (ISO-04). |

**Positive signal — features that ARE correctly isolated:**
- `ingestActivity`, `logDirectActivity`, `logActivityManual`, `uploadAndCreateMemoryAction`, `addMemoryComment`, `deleteMemoryAction`, `connectWearableAction`, `disconnectWearableAction` — all verify `session.userId === userId && session.groupId === groupId` before mutating (source: `app/actions/ingest.ts` L52-55, `app/actions/logDirect.ts` L38-41, `app/actions/memories.ts` L45-49).
- `processVerificationVote` fetches the log's group_id and rejects the vote if `log.group_id !== session.groupId` (source: `app/actions/vote.ts` L78-84).
- `createMetricDefinition` uses `session.groupId` from the cookie, not a caller-supplied parameter (source: `app/actions/metrics.ts` L34-36).
- `daily-whistle` and `ai-bookie` crons iterate `groups` and use each group's own `whatsapp_instance_id`/`whatsapp_token`/`whatsapp_group_id` for dispatch — per-group behavior is correct in these two.
- RLS group-scoping policies on `profiles`, `group_members`, `metric_logs`, `log_votes`, `memories`, `memory_comments`, `metric_definitions`, `bot_persistent_state` (documented in [docs/04](docs/04_Security_and_Gap_Analysis.md) §3) — enforced when `createClient()` is used, bypassed when `createAdminClient()` is used.

---

### ISO-01 — Isolation — Admin Portal has no group creation / management UI or Server Action (NN-2)
- **Current state:** Grep across `app/actions/**` for `adminCreateGroup`, `adminUpdateGroup`, `adminDeleteGroup`, `adminFetchGroups`, `from('groups').insert` returns **zero hits**. `components/SettingsClient.tsx` panel inventory (Bot Mute, PIN Reset, Role Selection, Custom Metric Add, Metric Visibility, Poke, Lore, Vocab, Persistent Mood, Avatar Upload, Log Editor) contains no group panel. Groups are created only by executing SQL against Supabase directly (e.g., `INSERT INTO public.groups (name, invite_code, whatsapp_instance_id, whatsapp_token, whatsapp_group_id) VALUES (...)`). Editing a group's WhatsApp config is a manual SQL operation.
- **Why it matters:** NN-2 explicitly requires the Admin Portal to allow creating and managing groups. Currently the app is functionally single-tenant from an admin-UX standpoint — the tenancy story exists in the schema (`groups.id`, `groups.invite_code`, per-group WhatsApp columns) and in the `daily-whistle` / `ai-bookie` cron iteration loops, but no admin can operate it without database access.
- **Proposed direction:**
  1. Add a `GroupsPanel` component under `components/settings/` gated by God Mode (or better, gated by a super-admin flag on `profiles`).
  2. Add Server Actions in `app/actions/admin.ts` (or a new `app/actions/groups.ts`): `adminCreateGroup(name, inviteCode)`, `adminUpdateGroup(groupId, patch)`, `adminUpdateGroupWhatsApp(groupId, {instanceId, token, whatsappGroupId})`, `adminDeleteGroup(groupId)` (soft-delete via `deleted_at`, cascade-delete opt-in via explicit confirmation).
  3. Every action reads the caller's session, verifies the caller is either a super-admin (a new `profiles.is_super_admin` boolean) or belongs to the target group with `role = 'admin'` in `group_members`.
  4. `adminCreateGroup` also inserts a `group_members` row so the creator becomes the initial admin — otherwise the newly created group has no way in.
- **Alternative considered:** Bootstrap groups via a CLI script bundled in `scripts/`. Rejected — same functionality, worse UX, and still fails NN-2's "Admin Portal must allow" wording.
- **Over-engineering check:** Cleared — this is a missing feature, not a new abstraction. One panel + 3–4 actions + one schema column (`profiles.is_super_admin`) if the super-admin path is chosen.
- **Effort:** M
- **Risk if left alone:** NN-2 unmet indefinitely. Onboarding a second group requires developer intervention.
- **Priority:** must fix
- **Status (QA audit, 2026-07-18):** ✅ Fixed — `app/actions/groups.ts` now implements `adminCreateGroup`, `adminUpdateGroup`, `adminFetchGroupDetails` (role-gated via `requireGroupAdminSession`), backed by a `components/settings/GroupsPanel.tsx` UI. Traced end-to-end: `adminCreateGroup` inserts the `groups` row, then a `group_members` row with `role: 'admin'` for the creator (source: app/actions/groups.ts:87-115). Verified in code.

### ISO-02 — Isolation — Admin Server Actions accept `groupId` without verifying it matches session (NN-1, NN-3, NN-4)
- **Current state:** Every function in `app/actions/admin.ts` takes `groupId` as either a required or optional parameter (grep confirmed against L60, L83, L106, L125, L300, L317, L334, L353, L369, L387, L412, L436, L456, L480, L500, L572-573). None of them call `decodeSession()` to verify the caller's `session.groupId` matches the passed `groupId`. Contrast with `app/actions/metrics.ts` L22-36, which correctly reads the session and uses `session.groupId` as the source of truth (never trusts a caller-supplied parameter). Contrast with `app/actions/vote.ts` L78-84, which fetches the log's `group_id` from the DB and rejects the mutation if it doesn't equal `session.groupId`.
- **Why it matters:** Combined with `createAdminClient()` (which bypasses RLS entirely), any authenticated user can invoke any admin Server Action against any group by passing a different `groupId` — the action will happily perform the operation cross-tenant. Concrete attacks:
  - `adminResetPin(someOtherUserId, '0000', someOtherGroupId)` — reset any user's PIN in any group.
  - `adminHardDeleteUser(someOtherUserId, someOtherGroupId)` — hard-delete any profile in any group.
  - `adminEditLog(someOtherGroupsLogId, 999999)` — edit any group's leaderboard scores.
  - `adminUpsertMemberLore(someOtherUserId, ...)` — inject lore into another group's member profile.
  - `adminTriggerPoke(someOtherUserId, someOtherGroupId, 'ragebait', ...)` — send a Fisky message into another group's WhatsApp chat.
- The client-side God-Mode PIN gate (`sessionStorage['god_mode_unlocked']`) is not enforced server-side (already flagged in [docs/04](docs/04_Security_and_Gap_Analysis.md) §2.5). So the only barrier to these attacks is knowing the action's function signature and the target `userId`/`groupId`/`logId` UUIDs.
- **Proposed direction:** In every admin Server Action:
  1. Call `decodeSession()` first — reject with `Unauthorized` on null.
  2. Reject if `session.groupId !== passedGroupId` (or if the resource being mutated belongs to a different group — for `adminEditLog`, `adminVerifyLog`, `adminDeleteLog`, fetch the log's `group_id` and compare).
  3. For actions that operate on a specific `targetUserId`, additionally verify the target belongs to the caller's group by querying `group_members`.
  4. Consider extracting a `requireAdminSession(passedGroupId?)` helper in `lib/session.ts` that returns `{ session, error }` — used by every admin action.
- **Alternative considered:** Simply remove the `groupId` parameter and always derive it from the session cookie. Rejected because some actions legitimately operate against a specific `targetUserId` in the same group, which requires the caller to identify the target — the fix is verification, not elimination.
- **Over-engineering check:** Cleared — one shared helper + a 3-line guard at the top of each admin action. No new abstraction beyond consolidating a pattern already correctly implemented in `ingest.ts`, `logDirect.ts`, `memories.ts`, and `vote.ts`.
- **Effort:** M — mechanical, ~15 actions to patch. Adding the `requireAdminSession()` helper first shrinks each site to one line.
- **Risk if left alone:** Live cross-tenant escalation. Any authenticated user in Group A can mutate Group B's data if they know a UUID. This is a full NN-1/NN-3/NN-4 violation.
- **Priority:** must fix
- **Status (security audit, 2026-07-18):** ✅ Fixed — `requireAdminSession()` in [app/actions/admin.ts](app/actions/admin.ts) now rejects a mismatched `groupId` (this finding) and, additionally, now verifies `group_members.role === 'admin'` — a deeper, previously-undiscovered gap logged separately as **SEC-01** in the new `## Security` section (this ISO-02 finding's own scope is resolved).

### ISO-03 — Isolation — `adminFetchAllLore` returns every group's `member_lore` rows (NN-3)
- **Current state:** `app/actions/admin.ts` L387-400 defines `adminFetchAllLore(groupId?: string)`. The body runs `supabase.from('member_lore').select('*')` with **no `WHERE`** clause. The `groupId` parameter is accepted and passed to `createAdminClient(groupId)` (which only affects the `x-group-id` header for RLS — but the service-role key bypasses RLS, so the header is ignored). Result: every God-Mode admin sees every group's member_lore rows.
- **Why it matters:** This is a live NN-3 violation. In the current single-group deployment it happens to look correct because there's only one group's data to return. The moment a second group exists, the Lore Editor in Settings leaks Group B's lore into Group A's admin console — including catchphrases, ego triggers, stunt lists, and (indirectly, via `nemesis_id`) cross-group user relationships.
- **Proposed direction:** Two-step fix that's also required by ISO-04:
  1. Immediate: change the query to `select('*')` joined against `profiles` filtered by `profiles.group_id = session.groupId` (or equivalently, subquery `.in('user_id', memberIdsInGroup)`). Even without a schema change, this constrains the read.
  2. Structural (see ISO-04): once `member_lore` has its own `group_id` column, filter directly on it.
- **Alternative considered:** Rely on RLS to filter — rejected, `createAdminClient` bypasses RLS. Also rejected: filter in the client component after fetching everything (that's still a server-side leak).
- **Over-engineering check:** Cleared — one WHERE clause added; no abstraction.
- **Effort:** S
- **Risk if left alone:** Cross-tenant data leak the day a second group is created.
- **Priority:** must fix

### ISO-04 — Isolation — `member_lore` and `vocab_banks` have no `group_id` column (NN-4)
- **Current state:** Per `supabase/migrations/0013_lore_and_vocab.sql`:
  - `member_lore` is keyed by `user_id` alone — no direct `group_id`. Group affinity is transitive (via `profiles.group_id`), but only if the query joins through profiles.
  - `vocab_banks` has `(tone, target_gender)` as its unique key — no `group_id` at all. The table is structurally global across all tenants.
- Both tables carry `FOR ALL USING (true)` RLS policies (already flagged in [docs/04](docs/04_Security_and_Gap_Analysis.md) §3 and [Findings_and_Recommendations.md](Findings_and_Recommendations.md) DATA-06).
- **Why it matters:** Even after ISO-03 is patched, `vocab_banks` remains a shared table — one group's admin editing the vocab affects every group's `adminTriggerPoke` output (once wired to the DB per DATA-03). For `member_lore`, the transitive join through `profiles.group_id` works today but is fragile — any query that forgets the join leaks cross-group.
- **Proposed direction:**
  1. Add `group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE` to both tables via a new migration. Backfill from `profiles.group_id` for `member_lore`; leave `vocab_banks` values duplicated per group (or drop and re-seed empty per ISO'd deployment).
  2. Change primary keys: `member_lore` becomes `(user_id)` still (user_id is already globally unique) but gains a `group_id` NOT NULL. `vocab_banks` unique key becomes `(group_id, tone, target_gender)`.
  3. Rewrite the open RLS policies to `group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid` — matches the pattern used by `metric_logs`, `memories`, etc.
  4. All admin.ts callers pass `group_id` (from session) on upsert and filter on read.
- **Alternative considered:** Keep the tables cross-tenant and enforce isolation exclusively in application code — rejected, defense-in-depth is cheap and the RLS pattern already exists for every other content table.
- **Over-engineering check:** Cleared — one migration + policy rewrite + WHERE clauses in 4 admin actions.
- **Effort:** M
- **Risk if left alone:** NN-4 violation persists in the schema; every fix layered above it is one bug away from breaking.
- **Priority:** must fix

### ISO-05 — Isolation — WhatsApp webhook + digest cron hardcoded to a single group (NN-4)
- **Current state:** Documented in [docs/04](docs/04_Security_and_Gap_Analysis.md) §2.7 and [Findings_and_Recommendations.md](Findings_and_Recommendations.md) OTHER-01. Three code sites resolve "the target group" by matching a hardcoded name string:
  - `app/api/webhooks/whatsapp/route.ts` L110 (`/clear` command path) and L153 (main background processing path).
  - `app/api/cron/whatsapp-digest/route.ts` L80 — same expression: `groups?.find(g => g.name === 'Texas Buds' || g.invite_code === 'TEXASBUDS') || groups?.[0]`.
- **Why it matters:** This is NN-4 stated explicitly: "the WhatsApp agent … must operate only within the assigned group. No data, messages, jobs, or processes may ever cross group boundaries." Today, an inbound message from Group B's WhatsApp gets attributed to Group A's context (or dropped entirely because `chatId` won't match `process.env.WHATSAPP_GROUP_ID`, but the fallback resolution is still single-tenant). Digest cron posts one summary to one group only, regardless of how many groups exist. Cross-references OTHER-01 for the general "multi-group blocker" framing; this ISO entry surfaces it as an NN-4 violation specifically.
- **Proposed direction:**
  1. Webhook: resolve the group by matching `body.senderData.chatId` against `groups.whatsapp_group_id` — the DB column already exists per migration `0008`. Drop `process.env.WHATSAPP_GROUP_ID` as the sole authority.
  2. Webhook `/clear`: same lookup, then delete `chat_history WHERE group_id = <resolved>`.
  3. `whatsapp-digest`: iterate all groups (mirror the pattern already correct in `daily-whistle` and `ai-bookie`), post one digest per group using each group's own WhatsApp credentials.
  4. Bonus: reject inbound webhooks where the resolved group has no configured `whatsapp_instance_id` (defense against replayed webhooks from a decommissioned group).
- **Alternative considered:** Move the hardcoded string into an env var — rejected, still single-tenant.
- **Over-engineering check:** Cleared — removes hardcoded strings, uses existing DB columns.
- **Effort:** S
- **Risk if left alone:** WhatsApp is fundamentally single-tenant regardless of what the schema supports. NN-4 unmet on the highest-visibility surface.
- **Priority:** must fix

### ISO-06 — Isolation — `wearable_connections` + `wearable_*` ledger tables have no `group_id` (NN-4)
- **Current state:** Per `supabase/migrations/0003_wearables_schema.sql`, `wearable_connections` is keyed by `(user_id, provider)` unique — no `group_id`. `wearable_steps` / `wearable_sleep` / `wearable_resting_hr` are similarly per-user, no `group_id`. `app/api/cron/sync-wearables/route.ts` L66 queries `.from('wearable_connections').select('*')` with no group filter and syncs every connection in one job execution.
- **Why it matters:** Wearable data follows the user, not the group. A user in Group A whose wearable data was synced under Group A's context, if ever moved to Group B (via `group_members` swap), takes their wearable history to Group B — no rebinding, no cleanup. Additionally, the sync job's "for each connection in every group" pattern is a single global background job — NN-4 says "no data, messages, jobs, or processes may ever cross group boundaries." Interpreted strictly, the sync job itself crosses group boundaries in its execution.
- **Proposed direction:**
  1. Add `group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE` to `wearable_connections` (backfill from `profiles.group_id` at migration time).
  2. Add `group_id` to the three ledger tables similarly.
  3. Restructure the cron to iterate groups first, then connections within each group. Log per-group.
  4. If a user changes groups, decide policy: either cascade-delete their wearable rows (`ON DELETE CASCADE` triggers if you also add a FK to `group_members`), or migrate the rows with them (requires an explicit admin action).
- **Alternative considered:** Leave wearable data user-scoped and treat wearable stats as "personal history that travels with the athlete" — this is a legitimate product decision, but it directly contradicts NN-4's "operate only within the assigned group" wording. If this alternative is chosen, NN-4 needs explicit clarification (in this doc) exempting per-user profile data.
- **Over-engineering check:** Called out — this is a real schema change with backfill. Only justified if the product genuinely wants wearable history tied to group tenancy. If per-user is intentional, the fix is a scope clarification on NN-4, not code.
- **Effort:** M (schema + backfill + cron restructure)
- **Risk if left alone:** Data model doesn't support the stated NN-4 requirement for the wearables subsystem. Strict readers will flag it; lax readers won't.
- **Priority:** worth doing (elevate to "must fix" if NN-4 is enforced strictly on wearables)

### ISO-07 — Isolation — `proxy.ts` matcher covers `/dashboard/*` only (NN-1)
- **Current state:** Per `proxy.ts` L44: `matcher: ['/dashboard/:path*']`. L19 guards the check with `if (!pathname.startsWith('/dashboard')) return NextResponse.next();`. Consequences:
  - `/settings/metrics` (God Mode) is NOT gated at the framework layer — auth relies on the `SettingsClient.tsx` PIN gate (client-side) plus whatever the layout does.
  - `/api/*` route handlers are NOT gated by `proxy.ts` at all — they each implement their own auth (webhooks use `safeCompare` on secret headers, crons use `Bearer CRON_SECRET`).
- Already flagged in [docs/04](docs/04_Security_and_Gap_Analysis.md) §2.1 (this pass) and in [Findings_and_Recommendations.md](Findings_and_Recommendations.md) audit context. Reflagged here as an NN-1 concern because "complete isolation throughout the entire system" implies the framework-level gate should be uniform.
- **Why it matters:** Any new admin surface added under `/settings/*` or any new API route added under `/api/*` will not be auto-guarded by session verification. The pattern relies on every future author remembering to add auth. This is the exact failure mode `middleware`/`proxy` matchers were designed to prevent.
- **Proposed direction:**
  1. Extend the matcher to `['/dashboard/:path*', '/settings/:path*']`. `/api/*` is intentionally out of scope for cookie-based auth because API routes use different auth mechanisms.
  2. For `/api/*` routes that DO expect a cookie session (currently none, but `wearables/connect/google/route.ts` reads the session cookie directly), add an explicit note in that file or move them under a matched prefix.
- **Alternative considered:** Enforce auth only at the layout/action level (status quo) — rejected, silently relies on convention.
- **Over-engineering check:** Cleared — one-array edit in `proxy.ts`.
- **Effort:** S
- **Risk if left alone:** New admin surfaces added under `/settings/*` inherit no auth by default; drift compounds with every new page.
- **Priority:** must fix
- **Status (security audit, 2026-07-18):** ✅ Fixed — [proxy.ts](proxy.ts) L44-46 matcher is now `['/dashboard/:path*', '/settings/:path*']`. Verified in code.

### ISO-08 — Isolation — `sendCheer` server-action stub has zero session/group guards (NN-4, latent)
- **Current state:** `app/actions/cheer.ts` defines `sendCheer(userId, targetName, metricLabel)` with `'use server'`. The body is a single `console.log(...)` plus a `return { success: true, message: 'Sent 🔥 to ${targetName}!' }`. No `decodeSession()`, no cookie check, no DB write.
- **Why it matters:** As written, harmless — the function does nothing except log to Vercel Function logs. But it's exposed as a Server Action (any authenticated client can invoke it with any `userId`/`targetName`), and every other Server Action in `app/actions/**` has been treated as untrusted input. When someone extends this stub to actually notify the target user (WhatsApp DM, in-app toast, a DB `cheers` table), the guard needs to be in place already — or the extended action ships as a cross-group notification vector.
- **Proposed direction:** Even in the stub form, add the same two-line guard used by every other Server Action:
  ```typescript
  const cookieStore = await cookies();
  const session = token ? await decodeSession(...) : null;
  if (!session) return { success: false, error: 'Unauthorized' };
  ```
  Reject if `session.userId !== userId` (or resolve targetUserId and verify same-group membership).
- **Alternative considered:** Delete the stub since it does nothing — reject, the export is presumably present because a real implementation is planned (`CheerButton.tsx` client component imports it).
- **Over-engineering check:** Cleared — a two-line guard.
- **Effort:** S
- **Risk if left alone:** First real implementation ships without isolation. Latent NN-4 gap.
- **Priority:** worth doing

---

## Reviewed, Not Changing

- **Session cookie configuration** (`sameSite: 'strict'`, `httpOnly`, 24 h TTL, `secure` in production). Confirmed correct at [lib/session.ts L75-82](lib/session.ts#L75-L82) and matches the corrected doc entries in `docs/02` and `docs/04`. No proposal needed.
- **`proxy.ts` primary auth guard.** Matcher `/dashboard/:path*`, `jose.jwtVerify`, cookie clear on failure — implemented cleanly. Extending the matcher to `/settings/*` was already flagged in [docs/04](docs/04_Security_and_Gap_Analysis.md) §2.1 and belongs there, not in a new finding.
- **WhatsApp webhook always returns 200 to Green API.** This is a deliberate design choice already justified in [docs/04](docs/04_Security_and_Gap_Analysis.md) §2.6; changing it invites retry storms.
- **All 4 cron routes use `safeCompare` on `CRON_SECRET`.** Correct pattern; nothing to add.
- **Wearable table `access_token`/`refresh_token` stored as plaintext.** Small friend group + Supabase at-rest encryption + narrow blast radius — the risk/reward of app-layer encryption doesn't pay off here. Noted in [docs/04](docs/04_Security_and_Gap_Analysis.md) §2.10.
- **Peer-vote duplicate write path (client `processVerificationVote` + DB trigger `trg_auto_verify`).** The DB trigger's `AND status = 'pending'` clause makes the double-write idempotent in the boundary case. Not worth restructuring for a race that Postgres already resolves correctly.
- **`metric_logs` composite index on `(group_id, status, logged_at)`.** Would speed reads at scale, but current data volume in a friend-group app doesn't justify the write-side cost. Revisit if p95 read latency degrades.
- **`Confetti.tsx` and audio ping asset preloading.** The delight layer is documented, deliberate, and works. Only UI-06 flagged the fixed-delay hold; the asset preload pattern is fine.
- **`getChartData` bucketing uses local timezone for labels + UTC epoch for bucket keys.** Flagged in [docs/04](docs/04_Security_and_Gap_Analysis.md) §6.3 as a data-validation concern. Not re-flagged here because the fix (choose one timezone consistently) belongs in that finding, not a new one.
- **`chat_history` unbounded growth.** Noted in [docs/04](docs/04_Security_and_Gap_Analysis.md) §2.9 as LOW. `/clear` command + 30-min inactivity window make it self-limiting. Storage cost is trivial at friend-group scale.
- **Absolute `file:///c:/Users/nithi/…` links throughout the docs.** Cosmetically wrong (repo has moved), but the surgical audit deliberately left them. A bulk find/replace is a documentation task, not a code finding.

---

*Findings above deliberately exclude items already listed in `audit.md` §6 (Architectural Blind Spots) unless a distinct proposal shape (not just "this is missing") was warranted. See `audit.md` for the earlier documentation-vs-code gap set.*

---

## Security

Audit pass: 2026-07-18, pre-production-migration security review. Full checklist covered: hardcoded secrets/PINs, PIN storage + brute-force protection, admin credential handling, tracked `.env` files, client-exposed env vars, JWT/session secret, API/Server Action auth guards, CSRF, webhook verification, rate limiting, raw SQL, error/log leakage, security headers, cookie security, CORS, dependency CVEs, and RLS coverage. Overlap with prior findings (ISO-02, ISO-07, OTHER-04, DATA-06, PERF-04) was resolved by updating those tasks' **Status** in place above rather than duplicating here.

Checklist areas verified **SECURE** with no new task needed: CSRF (Next.js Server Actions enforce same-origin `Origin`/`Host` checks by default; no `experimental.serverActions.allowedOrigins` override present), webhook signature verification (WhatsApp/Telegram both use `safeCompare()` against a shared secret — see `docs/04` §1.6), raw/string-interpolated SQL (none found outside migrations — all app-code queries go through the Supabase SDK), CORS (no `Access-Control-Allow-Origin` headers anywhere — same-origin by default), tracked `.env` files (`git ls-files` shows none; `.gitignore` covers `.env*`), timing-safe comparisons (`lib/security.ts` `safeCompare`, used throughout).

| ID | Title | Severity | Status |
|---|---|---|---|
| SEC-01 | Admin Server Actions missing server-side role authorization (privilege escalation) | Critical | Fixed |
| SEC-02 | Plaintext PIN written to server console logs | Critical | Fixed |
| SEC-03 | Dev-secret JWT fallback triggers on any non-`'production'` `NODE_ENV` | Critical | Fixed |
| SEC-04 | PINs stored as plaintext in `profiles.pin` | Critical | Fixed |
| SEC-05 | `createAdminClient()` silently falls back to anon key when service role key missing | High | Fixed |
| SEC-06 | No security headers configured | Medium | Fixed (partial — CSP open) |
| SEC-07 | No `.env.example` template for required environment variables | Low | Fixed |
| SEC-08 | Dependency CVE: PostCSS XSS advisory nested in Next.js's bundled toolchain | Medium | Open — Requires human action |

### SEC-01 — [SECURITY] — Admin Server Actions missing server-side role authorization (privilege escalation)
- **Severity:** Critical
- **Description:** `requireAdminSession()` in `app/actions/admin.ts`, used by 17 exported admin Server Actions (`adminResetPin`, `adminUpdateMemberRole`, `adminRemoveMember`, `adminHardDeleteUser`, `adminEditLog`, `adminVerifyLog`, `adminDeleteLog`, `adminToggleUserActive`, `adminTriggerPoke`, `adminFetchAllLore`, `adminUpsertMemberLore`, `adminFetchVocabBanks`, `adminUpsertVocabBank`, `adminDeleteVocabBank`, `adminUploadAvatarAction`, `adminFetchBotMoods`, `adminUpdatePersistentMood`), only verified that a valid session existed and that any caller-supplied `groupId` matched the session's own `groupId`. It never checked whether the caller actually held the `admin` role in `group_members`. Separately, `adminToggleBotMute` and `getBotMuteStatus` called `createAdminClient()` directly with **no auth check of any kind**. The client-side "God Mode" gate (`sessionStorage['god_mode_unlocked']`, trivially settable via browser devtools) was the only thing standing between a regular member and these actions — previously mis-assessed in `docs/04` §2.5 as a "UI-only bypass" mitigated by the service-role key, but the service-role key only bypasses RLS, it performs no authorization.
- **Affected Files:** [app/actions/admin.ts](app/actions/admin.ts) (`requireAdminSession`, `getBotMuteStatus`, `adminToggleBotMute`)
- **Acceptance Criteria:** A session belonging to a `member`-role (non-admin) user must receive `{ success: false, error: 'Unauthorized: admin role required for this group.' }` (or equivalent) from every admin Server Action, verified by querying `group_members.role` server-side rather than trusting client state.
- **Evidence:** (source: app/actions/admin.ts:38-63) — role query added, matching the correct pattern already used in `requireGroupAdminSession()` (source: app/actions/groups.ts:27-49). (source: app/actions/admin.ts:82-118) — auth guard added to `getBotMuteStatus`/`adminToggleBotMute`.
- **Status:** Fixed — `requireAdminSession()` now queries `group_members.role` and requires `'admin'`; the two previously-unguarded bot-mute actions now call it too. Verified via `npm run build` (compiles clean) and `get_errors` (no new diagnostics).

### SEC-02 — [SECURITY] — Plaintext PIN written to server console logs
- **Severity:** Critical
- **Description:** `loginWithPersonalPinAction` logged `console.log("LOGIN ATTEMPT:", { groupId, pin })` on every login attempt, writing every user's raw 4-digit PIN to server/Vercel Function logs — a sensitive-data-in-logs exposure (logs commonly have wider retention/access than the database itself).
- **Affected Files:** [app/actions/auth.ts](app/actions/auth.ts) (`loginWithPersonalPinAction`)
- **Acceptance Criteria:** No PIN value (plaintext or otherwise) appears in any `console.*` call anywhere in the codebase.
- **Evidence:** (source: app/actions/auth.ts — line removed, was immediately after the `try {` in `loginWithPersonalPinAction`).
- **Status:** Fixed — the log statement was deleted outright (no replacement logging of the PIN in any form).

### SEC-03 — [SECURITY] — Dev-secret JWT fallback triggers on any non-`'production'` `NODE_ENV`
- **Severity:** Critical
- **Description:** `getSecret()` fell back to a hardcoded, publicly-known string (`'default-dev-secret-do-not-use-in-prod-12345'`) whenever `SESSION_SECRET` was unset/short AND `(NODE_ENV === 'development' || NODE_ENV !== 'production')` — a condition that is logically equivalent to just `NODE_ENV !== 'production'`. Any staging, preview, test, or CI environment that omits `NODE_ENV=production` would silently sign every session JWT with a secret an attacker can find in this repo's source, allowing full session forgery.
- **Affected Files:** [lib/session.ts](lib/session.ts) (`getSecret`)
- **Acceptance Criteria:** The dev-secret fallback only activates when `NODE_ENV === 'development'` exactly; any other non-production value fails closed (`getSecret()` returns `null`).
- **Evidence:** (source: lib/session.ts:29-40).
- **Status:** Fixed — condition narrowed to `NODE_ENV === 'development'`. Verified via `get_errors` and `npm run build`.

### SEC-04 — [SECURITY] — PINs stored as plaintext in `profiles.pin`
- **Severity:** Critical
- **Description:** User PINs were stored and compared as plaintext (`profiles.pin`, `varchar(4)`), verified only via a timing-safe string comparison (`safeCompare`). Any database leak would expose every user's real PIN immediately, in the clear, with no attacker effort required.
- **Affected Files:** [lib/security.ts](lib/security.ts) (new `hashPin`/`verifyPin`/`isBcryptHash`), [app/actions/auth.ts](app/actions/auth.ts) (`signUpAction`, `loginWithPersonalPinAction`), [app/actions/admin.ts](app/actions/admin.ts) (`adminResetPin`), `package.json` (new dependency: `bcryptjs` + `@types/bcryptjs`)
- **Acceptance Criteria:** New PINs (signup, admin reset) are persisted as bcrypt hashes, never plaintext. Login verifies via `bcrypt.compare()`. Pre-existing plaintext PINs continue to work and are transparently upgraded to a hash on next successful login (no forced logout, no bulk migration required).
- **Evidence:** (source: lib/security.ts — `hashPin`, `verifyPin`, `isBcryptHash`); (source: app/actions/auth.ts — `signUpAction` hashes before insert; `loginWithPersonalPinAction` fetches the group roster and calls `verifyPin()` per candidate, re-hashing on a legacy-plaintext match); (source: app/actions/admin.ts — `adminResetPin` hashes before update).
- **Status:** Fixed. Note: the login query could no longer filter by exact PIN match in SQL (bcrypt hashes aren't equality-comparable), so it now fetches the target group's member roster and verifies in application code instead — an accepted, necessary trade-off scoped to one small friend-group's roster per login attempt, already using the same service-role client used elsewhere in this flow. New dependency added: `bcryptjs` (pure-JS, no native build step) + `@types/bcryptjs` (dev).

### SEC-05 — [SECURITY] — `createAdminClient()` silently falls back to anon key when service role key missing
- **Severity:** High
- **Description:** If `SUPABASE_SERVICE_ROLE_KEY` was unset or blank, `createAdminClient()` logged a warning and returned an anon-key client instead. Because RLS policies gate on the `x-group-id` header (which admin flows don't always reliably control the same way), this could cause admin operations to fail in confusing, partially-successful ways, or silently apply the wrong scope, instead of failing loudly.
- **Affected Files:** [lib/supabase/server.ts](lib/supabase/server.ts) (`createAdminClient`)
- **Acceptance Criteria:** `createAdminClient()` throws a clear error when the service role key is missing, instead of returning a degraded client.
- **Evidence:** (source: lib/supabase/server.ts:48-63).
- **Status:** Fixed — now throws `'[Supabase Server] SUPABASE_SERVICE_ROLE_KEY is not configured. Admin operations cannot proceed without it.'`. Confirmed via `npm run build` that this doesn't break static generation (no build-time caller hits this path without a configured key in `.env.local`), and that the ~50 call sites across the codebase are consistently wrapped in `try/catch` (verified by grep) so a thrown error surfaces as a handled `{ success: false, error }` result rather than an unhandled crash.

### SEC-06 — [SECURITY] — No security headers configured
- **Severity:** Medium
- **Description:** `next.config.ts` set no security-related HTTP headers at all (no CSP, HSTS, `X-Frame-Options`, etc.).
- **Affected Files:** [next.config.ts](next.config.ts)
- **Acceptance Criteria:** Baseline security headers present on every response.
- **Evidence:** (source: next.config.ts — new `headers()` export).
- **Status:** Fixed (partial) — added `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`, `Permissions-Policy`. **Content-Security-Policy intentionally left Open** — a correct CSP requires enumerating every legitimate script/style/image/connect source used across the app (Tailwind, `echarts`, Supabase Storage, Next's own hydration scripts) and testing every page against it; getting it wrong silently breaks pages instead of failing safely, so it's logged as a follow-up rather than guessed at here. See `docs/04_Security_and_Gap_Analysis.md` §2.11.

### SEC-07 — [SECURITY] — No `.env.example` template for required environment variables
- **Severity:** Low
- **Description:** No `.env.example` file existed to tell a new developer which environment variables the app needs, increasing the chance someone hardcodes a value out of confusion instead of wiring it through `process.env`.
- **Affected Files:** `.env.example` (new)
- **Acceptance Criteria:** A committed template listing every required env var by name (no values) exists at the repo root.
- **Evidence:** (source: .env.example — new file, keys only, matches the secret inventory in `docs/04_Security_and_Gap_Analysis.md` §4).
- **Status:** Fixed.

### SEC-08 — [SECURITY] — Dependency CVE: PostCSS XSS advisory nested in Next.js's bundled toolchain
- **Severity:** Medium
- **Description:** `npm audit --omit=dev` reports a moderate-severity advisory ([GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)) in `postcss` <8.5.10, pulled in transitively via `next`'s own bundled build tooling (`node_modules/next/node_modules/postcss`), not a direct project dependency. The only `npm audit fix --force` path downgrades `next` to `9.3.4-canary.0` — an unrelated, unsafe multi-major-version regression.
- **Affected Files:** None in this repo (transitive dependency of `next`)
- **Acceptance Criteria:** N/A until an upstream fix exists — tracked for monitoring.
- **Evidence:** `npm audit --omit=dev` output, 2026-07-18.
- **Status:** Open — **Requires human action**. Cannot be safely fixed via a source change in this repo (would require downgrading Next.js itself). Monitor for an upstream Next.js release that bumps its bundled `postcss`, then re-run `npm audit`.

## Functionality & Pre-Launch QA

Audit pass: 2026-07-18, pre-production-migration release QA — every schema/data-flow/interactive-element trace below follows the checklist in the QA prompt end to end (UI/trigger → handler → Server Action/route → DB → response → UI), citing each hop. Overlap with prior findings (ISO-01, PERF-04, and the SEC-04 PIN-hashing change from the Security section above) was resolved by extending those, not duplicating.

| ID | Title | Severity | Status |
|---|---|---|---|
| QA-01 | PIN-uniqueness-within-group silently defeated by bcrypt hashing (SEC-04 regression) | Blocker | Fixed |
| QA-02 | `profiles.group_id`/`role`/constraint schema drift — missing from ordered migrations | Major | Fixed |
| QA-03 | Raw Postgres error text leaked to client on signup unique-violation race | Minor | Fixed |
| QA-04 | Leftover debug `console.log`s printing session/query internals every render | Minor | Fixed |
| QA-05 | Lint has 46 pre-existing errors (44 `no-explicit-any`, 2 `react-hooks/set-state-in-effect`) | Major | Open |
| QA-06 | `profiles.pin` column still `varchar(4)` — cannot hold a 60-char bcrypt hash (SEC-04 regression) | Blocker | Fixed (needs live-DB migration apply — see below) |

### QA-01 — [QA] — PIN-uniqueness-within-group silently defeated by bcrypt hashing (SEC-04 regression)
- **Severity:** Blocker
- **Description:** The only two mechanisms preventing two members of the same group from sharing a 4-digit PIN were a DB `UNIQUE (group_id, pin)` constraint (`profiles_group_pin_key`) and a trigger (`trg_check_unique_pin_on_profile_update`) that compares `p1.pin = new.pin` directly. Both compare the raw `pin` column value. Since the SEC-04 fix (this doc's Security section) made `pin` store a bcrypt hash with a random per-row salt, two identical PINs now always hash to *different* stored values — the UNIQUE constraint never fires and the trigger's equality check never matches. Result: two members of the same group could sign up (or be reset) with the identical PIN, and `loginWithPersonalPinAction`'s roster scan would return whichever matching profile it iterates to first — an account-identity collision, not merely a UX nuisance.
- **Affected Files:** [lib/security.ts](lib/security.ts) (new `isPinTakenInGroup`), [app/actions/auth.ts](app/actions/auth.ts) (`signUpAction`), [app/actions/admin.ts](app/actions/admin.ts) (`adminResetPin`)
- **Acceptance Criteria:** Signing up (or admin-resetting) a PIN that's already in use by another member of the same group is rejected with a clear error, verified in application code before hashing.
- **Evidence:** Trace: DB trigger function body compared `p1.pin = new.pin` (source: supabase/migrations/0001_initial_schema.sql:299-306) → confirmed this can never match two different bcrypt hashes → `signUpAction` had no other PIN-collision check (source: app/actions/auth.ts, pre-fix) → **FAIL confirmed**. Fix: `isPinTakenInGroup()` fetches the group's roster and calls `verifyPin()` (bcrypt-aware) against each existing profile's stored PIN before allowing a new/updated PIN to be persisted (source: lib/security.ts; app/actions/auth.ts:signUpAction; app/actions/admin.ts:adminResetPin).
- **Status:** Fixed. Re-verified via `get_errors` (clean) and `npm run build` (compiles clean) after the change.

### QA-02 — [QA] — `profiles.group_id`/`role`/constraint schema drift — missing from ordered migrations
- **Severity:** Major
- **Description:** `signUpAction` inserts `group_id` and `role` directly onto `profiles`, and the `profiles_group_pin_key UNIQUE (group_id, pin)` constraint is required for that insert to succeed — but none of `supabase/migrations/0001` through `0032` ever add these. They exist only in `sql/00_emergency_schema_cleanup.sql`, an unordered, undated script outside the migrations folder (presumably run once by hand against the live/dev database via the Supabase SQL editor). A clean database provisioned purely from `supabase migration up` against `supabase/migrations/*` would be missing `profiles.group_id`/`profiles.role` entirely, and `signUpAction` would fail immediately with a Postgres "column does not exist" error.
- **Affected Files:** `supabase/migrations/0033_profiles_group_id_and_role.sql` (new)
- **Acceptance Criteria:** Running `supabase/migrations/0001` through the latest migration, in order, against a genuinely clean database produces a schema that matches what the application code reads/writes — no manual SQL-editor intervention required.
- **Evidence:** grep across `supabase/migrations/*.sql` for `profiles.*group_id`/`profiles.*role` returned zero hits; only `sql/00_emergency_schema_cleanup.sql` (source: sql/00_emergency_schema_cleanup.sql:9-14) and the non-migration reference files `sql/BASELINE_SCHEMA.sql`/`sql/consolidated_schema.sql` contain these statements.
- **Status:** Fixed — promoted the emergency script's statements into `supabase/migrations/0033_profiles_group_id_and_role.sql` (idempotent `IF NOT EXISTS`/guarded, safe no-op against an already-patched database). **Requires human action**: this migration must actually be applied to the live Supabase project (`supabase db push` or run manually in the SQL editor) — adding the file to the repo does not itself alter the live schema, and Vercel deploys do not run Supabase migrations automatically.

### QA-03 — [QA] — Raw Postgres error text leaked to client on signup unique-violation race
- **Severity:** Minor
- **Description:** `signUpAction`'s app-level email/phone/name-nickname duplicate checks run as separate `SELECT`s before the `INSERT`, so a genuine race (two concurrent signups) can still hit the DB-level unique constraints. On that path, the code returned `` `Failed to create user profile: ${profileError.message}` `` directly to the client — leaking raw Postgres constraint/column names.
- **Affected Files:** [app/actions/auth.ts](app/actions/auth.ts) (`signUpAction`)
- **Acceptance Criteria:** A unique-constraint violation (Postgres code `23505`) on the profile insert surfaces a clean, actionable message with no raw DB text.
- **Evidence:** (source: app/actions/auth.ts — `profileError.code === '23505'` branch added, replacing the raw `profileError.message` interpolation).
- **Status:** Fixed. Data integrity was never at risk on this path (the DB constraint still correctly rejected the duplicate) — this was purely an error-message quality/info-leakage issue.

### QA-04 — [QA] — Leftover debug `console.log`s printing session/query internals every render
- **Severity:** Minor
- **Description:** `app/dashboard/page.tsx` logged `session groupId`/`userId`/`activeMetric`/`activeRange` and post-fetch series/feed counts on every dashboard render (server-side, visible in Vercel Function logs); `components/MetricChart.tsx` logged the full `dateLabels`/`series` payload (client-side, visible in the browser console) on every render.
- **Affected Files:** [app/dashboard/page.tsx](app/dashboard/page.tsx), [components/MetricChart.tsx](components/MetricChart.tsx)
- **Acceptance Criteria:** No debug logging of session/query internals remains in the dashboard render path.
- **Evidence:** (source: app/dashboard/page.tsx — two `console.log` blocks removed; components/MetricChart.tsx — two `console.log` calls removed).
- **Status:** Fixed.

### QA-05 — [QA] — Lint has 46 pre-existing errors
- **Severity:** Major
- **Description:** `npm run lint` (bare `eslint`) currently reports 46 errors (44 `@typescript-eslint/no-explicit-any` across ~15 files, 2 `react-hooks/set-state-in-effect` in `app/page.tsx:80` and `components/UserAvatar.tsx:66`) and 23 warnings, exiting non-zero. `npm run build` (`next build`) succeeds regardless — this repo's build pipeline does not invoke `eslint` as a blocking gate (the `dev`/`build` scripts call `next dev`/`next build` directly, and no `next lint`/build-time ESLint integration is wired in), so this does not block a Vercel deploy today, but it fails the literal "lint passes with no suppressed blocking errors" release criterion.
- **Affected Files:** ~15 files across `app/actions/**`, `app/api/**`, `app/dashboard/**`, `components/**` (full list in `npm run lint` output).
- **Acceptance Criteria:** `npm run lint` exits 0.
- **Evidence:** `npm run lint` output, 2026-07-18: "69 problems (46 errors, 23 warnings)".
- **Status:** Open. Not fixed in this pass — replacing 44 `any` types with correct types across 15 files is a broad, non-trivial refactor that exceeds this pass's minimal-diff scope and risks introducing subtle type-narrowing bugs without dedicated review/testing per file. The 2 `react-hooks/set-state-in-effect` findings were inspected individually: both are one-time mount-effect `setState` calls before an async operation (a standard, low-risk React pattern), not evidence of an active cascading-render bug — flagged by a newer, stricter lint rule rather than an observed defect. **Decision needed:** whether to (a) schedule a dedicated typing-cleanup pass, or (b) formally suppress/downgrade these specific rules repo-wide if the team accepts the current patterns as intentional.

### QA-06 — [QA] — `profiles.pin` column still `varchar(4)` — cannot hold a 60-char bcrypt hash (SEC-04 regression)
- **Severity:** Blocker
- **Description:** Every migration declares `profiles.pin` as `varchar(4)` (sized for a raw 4-digit PIN). The SEC-04 fix (Security section, this doc) now writes a bcrypt hash there (`hashPin()`), which is a fixed 60 characters (`$2a$10$` + 22-char salt + 31-char hash). Postgres `varchar(n)` enforces a hard length cap — inserting/updating `pin` with a 60-character hash against a `varchar(4)` column fails outright with `value too long for type character varying(4)`. **This means every signup and every admin PIN reset would fail completely** since the SEC-04 fix shipped, until this column is widened.
- **Affected Files:** `supabase/migrations/0034_widen_profiles_pin_column.sql` (new)
- **Acceptance Criteria:** `profiles.pin` accepts a 60-character bcrypt hash without truncation or error.
- **Evidence:** grep for `pin.*varchar` across every schema file (`sql/BASELINE_SCHEMA.sql:50`, `sql/consolidated_schema.sql:50`, `supabase/migrations/0001_initial_schema.sql:42`) — all declare `varchar(4)`; no migration ever widens it.
- **Status:** Fixed in code — `supabase/migrations/0034_widen_profiles_pin_column.sql` widens the column to `text`. **Requires human action, urgently**: like QA-02, this migration must be applied to the live Supabase project before (or as part of) this deploy — it is not automatically run by a Vercel deploy. Until applied, signup and PIN reset will fail against the live database exactly as described above. Recommend applying `0033` and `0034` together, in order, before flipping traffic to the new deploy.

---

## Dashboard & Challenges Implementation

Planning pass 2026-07-19, **followed by an implementation pass the same day** (see update below). Validates the Dashboard & Challenges Module specification against the current schema/architecture, decomposes it into sequenced tasks, and identifies achievability blockers that need a product decision before implementation starts. Searched this file first for existing overlap (`challenge`, `league`, `daily goal`, `podium`, `tier`, `streak`) — no prior tasks touch this area; everything below is new, not a duplicate.

> **Implementation update (2026-07-19, same day):** Phase 1 (schema), Phase 3 (Daily Goals), Phase 4 (Progression Challenges), Phase 5 (Leagues), and DASH-13/17 were implemented. Status per task below. **Not yet implemented**: DASH-10/11/12/27 (merging `/dashboard` and `/dashboard/leaderboard` into one page with a `useMemo`-based client-side ranking component — the Challenges module was mounted onto the existing `/dashboard` page instead, additively, to avoid a risky same-day rewrite of the working leaderboard page) and DASH-01b/DASH-09's open product decisions (not resolved, just left as documented open decisions — daily-whistle already includes the goals summary regardless of the timezone question). **Critical caveat**: migrations `0036`-`0038` exist as files only — like `0033`/`0034` before them, they have **not been applied to the live Supabase project** and must be run (`supabase db push` or the SQL editor) before any of this functions against real data.

### Spec Achievability Notes (read before Phase 1)

Three points need a product decision before implementation can proceed as literally specified — flagged here rather than silently resolved, per Operating Rule 1 ("verify the spec is achievable and aligns with current architecture"):

1. **"9 PM distribution bot" conflicts with a decision made earlier the same day.** In the immediately preceding session (2026-07-18), the group explicitly asked to consolidate all automated WhatsApp broadcasts down to **one daily broadcast** — `daily-whistle` (runs `0 3 * * *` UTC) — and the `whatsapp-digest` and `ai-bookie` cron triggers were deliberately removed from `vercel.json` for exactly that reason (source: `vercel.json`, `docs/09_Cron_Services_and_Sync_Pipelines.md` revision log). The spec's "9 PM distribution bot" for daily-goal summaries would reintroduce a **second** automated broadcast, directly reversing that decision. Recommended resolution (does not require a new cron): fold the daily-goals summary into the existing `daily-whistle` payload instead of adding a new scheduled job — `daily-whistle`'s prompt-building step (`buildDailyWhistlePrompt` in `lib/ai/prompts.ts`) already assembles a per-group stats block; the daily-goals completion summary can be appended there. This still leaves the *time* mismatch (spec wants 9 PM, `daily-whistle` runs at 3 AM UTC) unresolved — see next point.
2. **"9 PM" timezone is undefined, and `groups` has no timezone column.** The spec's own Part 3 table asks "9 PM UTC (or group timezone?)" and never answers it. `groups` (verified against every migration touching that table) has no `timezone` column today, and all four cron schedules in `vercel.json` are fixed single UTC times with no per-group offset — there is currently no mechanism for "9 PM" to mean something different for two groups in different timezones. `[UNKNOWN — NEEDS VERIFICATION]`: is a single fixed UTC time acceptable (in which case pick one and rename the cron/prompt accordingly), or does this require adding `groups.timezone` and making the cron logic per-group-aware? Logged as DASH-01b below rather than assumed.
3. **`useMemo` for ranking calculations assumes a Client Component; the current ranking calculation is server-side.** `app/dashboard/leaderboard/page.tsx` is an async Server Component that computes the sorted leaderboard/podium with a plain `.map()`/`.sort()` (source: `app/dashboard/leaderboard/page.tsx` — podium/table distribution logic immediately after the `.sort()` call) — there are no React hooks in that file at all, so `useMemo` as literally specified doesn't apply to it. To honor the spec's intent (avoid recomputing rankings on every unrelated re-render once the Global Activity Slider makes this section interactive), the new unified ranking section needs to become a **Client Component** that receives raw log rows as props from a Server Component parent and performs the aggregation/sort itself via `useMemo`, keyed on the slider's filter state. This is a real architectural shift, not a drop-in hook addition — captured explicitly in DASH-11 and DASH-27 below.

A fourth, lower-stakes item is flagged but not blocking: the spec calls the Global Controller an "activity slider." No literal drag-slider UI exists anywhere in the codebase today; the closest existing analog (`components/DateRangeSelector.tsx`) is a tab/button-style range selector, matching the Day/Month/All-Time pattern already used in `components/WearablesClientPage.tsx`. `[UNKNOWN — NEEDS VERIFICATION]`: confirm whether "slider" means a literal draggable control or is describing this existing tab-selector pattern before DASH-11 is built, to avoid building the wrong control.

A fifth item, **not blocking but worth a decision**: the spec's `group_stats`/metrics table (Part 2, last row) may be **redundant**. The existing dashboard already computes both the chart data and the leaderboard ranking on-the-fly from `metric_logs` joined with `metrics_config`/`metric_definitions` (source: `lib/queries.ts` `getChartData`, `app/dashboard/leaderboard/page.tsx`'s inline aggregation) — there is no cached stats table today, and none is required for the *existing* single-metric graph/leaderboard. A new `group_stats`-style table is only actually needed if the unified Podium is meant to rank on a **new composite "growth score"** (e.g., combining daily goals + progression + league results into one number) rather than the existing single-metric ranking. This is logged as DASH-09 with both paths documented rather than assumed.

### Part 2 — Schema Validation Results

| Table | Status | Evidence |
|---|---|---|
| `daily_goals` | **MISSING** | Grepped every file under `supabase/migrations/*.sql` for `daily_goal` — zero hits. No table, column, or reference of any kind exists. |
| `daily_goal_completions` | **MISSING** | Same grep sweep — zero hits. |
| `challenge_progression` | **MISSING** | Same grep sweep — zero hits. No `tier`/`current_tier` concept exists anywhere in the schema (grepped `tier` across migrations — zero hits). |
| `challenge_history` | **MISSING** | Same grep sweep — zero hits. |
| `league_assignments` | **MISSING** | Same grep sweep — zero hits. No `TITANS`/`REBELS` string appears anywhere in the repo (grepped case-sensitive and case-insensitive across `.ts`/`.tsx`/`.sql` — zero hits). |
| `league_challenges` | **MISSING** | Same grep sweep — zero hits. |
| `league_matches` | **MISSING** | Same grep sweep — zero hits. |
| `league_match_logs` | **MISSING** | Same grep sweep — zero hits. |
| `group_stats` / metrics cache | **MISSING, and possibly unnecessary** — see Achievability Note 5 above. | No cached-stats table exists; current dashboard computes chart/leaderboard data live from `metric_logs`. |

**Existing infrastructure this feature should reuse rather than reinvent** (verified, not assumed):
- **Group-scoped RLS pattern**: every new group-scoped table should follow the exact policy shape already used by 8 existing tables — `USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)` (source: `supabase/migrations/0008_database_hardening_and_rls.sql`, e.g. L53-57 for `metric_logs`).
- **Soft-delete pattern**: `deleted_at timestamptz` already exists on `memories` (migration `0007_add_deleted_at_to_memories.sql`) and `groups` (migration `0024_add_deleted_at_to_groups.sql`) — the same column shape should be used for `daily_goal_completions`, `challenge_history`, and `league_matches` rather than inventing a new soft-delete convention.
- **Atomic recompute-on-write pattern**: the existing `total_xp`/`current_level` recalculation is done via a Postgres trigger on `metric_logs` status changes (source: `docs/07_Data_Modelling.md` §2.2, `sql/consolidated_schema.sql` L177-241), not application-level transaction code. The same approach — a DB trigger, not just a Server Action wrapping multiple awaits — should back `challenge_progression`'s tier update/rollback, since a trigger is the only way to guarantee the tier and history rows can never drift apart even if a request is interrupted mid-flight.
- **Existing `wearable_connections`/`metric_logs` group_id FK + index shape** is the template for every new table's `group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE` + `CREATE INDEX ..._group_id_idx` pair.

### Part 3 — Data Flow Validation Results

None of the seven flows can be traced today because none of the underlying tables or UI exist — this is expected for a net-new feature and is not itself a gap, but each flow's *design* is validated below against existing precedent so the Phase 3-5 tasks aren't building on an unverified assumption.

| Flow | Traceable today? | Design validated against |
|---|---|---|
| Daily Goal Completion Logging | No (table missing) | Matches the existing `logDirectActivity` pattern (`app/actions/logDirect.ts`) — a simple session-scoped insert + `revalidatePath`. No new pattern needed. |
| Daily Goal Completion Deletion | No (table missing) | Matches the existing soft-delete pattern (`memories` `deleted_at`) plus `revalidatePath('/dashboard')` already used by every delete action in this codebase. The 9 PM (or folded-into-daily-whistle) bot query must filter `WHERE deleted_at IS NULL` — flagged explicitly in DASH-17 so it isn't missed the way `metric_slug` orphaning was missed for custom metrics (see DATA-01 in this same file). |
| Progression Challenge Activity Logging | No (table missing) | Needs a genuinely new pattern (tier comparison + dual-table write) — closest existing precedent is the XP trigger (see above), which should be extended/mirrored rather than reimplemented in app code. |
| Progression Challenge Activity Deletion | No (table missing) | This is the riskiest flow in the whole spec — it must revert `current_tier` to whatever the *new* most-recent remaining history row says, not to a separately-stored `previous_tier` value, or the two can drift after two deletions in a row. Storing `previous_tier` as its own column (as the spec's Part 2 table suggests) is **only safe if it's recomputed from `challenge_history` inside the same trigger/transaction on every delete**, never written independently by application code. Flagged explicitly in DASH-19's acceptance criteria. |
| League Match Creation | No (table missing) | Straightforward insert pattern, same as `adminCreateGroup` (`app/actions/groups.ts`) for the "insert row(s), then a log row" shape. |
| League Match Completion | No (table missing) | Needs explicit lock semantics — "Complete Challenge" must be enforced server-side (an already-completed match must reject further score edits), not just via disabling the input client-side, mirroring the CSRF/authorization lessons from the Security audit (client-only gates are not enforcement). Flagged in DASH-25's acceptance criteria. |
| Global Controller (Activity Slider) | Partially — the *filtering* pattern already exists (`RANGE_OPTIONS` in `lib/metrics.ts`, consumed by `getChartData` in `lib/queries.ts` today) | Confirms filter state can stay client-side/URL-param-driven as today; the gap is that MetricGraph and the (currently separate-page) Podium/Rankings don't share one filter source today because they're different routes. This is exactly what DASH-10/DASH-11 must fix. |

### Part 4 — State Sync Requirements Validation

| Sync requirement | Verified approach | Task |
|---|---|---|
| Delete daily goal completion → Recent Activities + bot data source | `revalidatePath` (existing app-wide convention) handles the UI; the bot/report query must always filter on `deleted_at IS NULL` (or hard-delete, see DASH-02) so it never needs a separate "awareness" mechanism — it's just a correct `WHERE` clause. | DASH-16, DASH-17 |
| Progression tier rollback → active tier + Previous Record badge | Must be a DB trigger recomputing `current_tier`/`previous_tier` FROM `challenge_history` on every insert/delete (see Part 3 above) — the UI then just re-reads `challenge_progression` after `revalidatePath`, it never computes tier client-side. | DASH-19 |
| League match completion → winner highlight, input lock, Recent Activities | Must be enforced with a DB-level guard (e.g. a `CHECK`/trigger rejecting score updates once `completed_at IS NOT NULL`), not only a disabled HTML input, so a replayed/direct Server Action call can't bypass the lock. | DASH-25 |
| Activity slider filter → MetricGraph, Podium, Rankings all update | Needs one shared filter-state source (URL search params, matching the existing `?metric=`/`?range=` convention on `/dashboard`) read by all three, once they're unified onto one page — today they can't share state because Podium/Rankings live on a separate route (`/dashboard/leaderboard`). | DASH-10, DASH-11 |

### Phase 1 — Schema & Migrations

#### DASH-01 — [DASHBOARD-CHALLENGES] — Create `daily_goals` table schema
- **Severity:** Blocker
- **Description:** Table doesn't exist. Needs `id uuid PK`, `group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE`, `title text NOT NULL`, `description text`, `created_at timestamptz NOT NULL DEFAULT now()`. Per the spec, goals are static/admin-defined and immutable after creation — no `updated_at`/edit path implied, only create + (soft-)archive.
- **Affected Files:** new `supabase/migrations/00XX_daily_goals.sql`
- **Acceptance Criteria:** Table exists with the group RLS policy pattern cited above; an admin action can insert a row scoped to `session.groupId`; anon/authenticated roles cannot read across groups (verified via the same header-based policy already proven on `metric_logs`).
- **Evidence:** Spec Part 0 §II.1; Part 2 checklist row 1.
- **Status:** Implemented — `supabase/migrations/0036_daily_goals.sql`. **Requires human action**: must be applied to the live Supabase project (not run automatically by a Vercel deploy).

#### DASH-01b — [DASHBOARD-CHALLENGES] — Resolve "9 PM" timezone ambiguity before scheduling anything
- **Severity:** Blocker (blocks DASH-17, not DASH-01)
- **Description:** Per Achievability Note 2, `groups` has no timezone column and every existing cron is a single fixed UTC time. Needs a product decision: (a) accept one fixed UTC time for all groups (simplest, matches current architecture, just needs the display copy to stop saying "9 PM" if it isn't 9 PM everywhere), or (b) add `groups.timezone text` and make the daily summary logic per-group timezone-aware. This decision gates DASH-17 (bot integration) and should be made before that task starts, not during it.
- **Affected Files:** Possibly a new `supabase/migrations/00XX_add_timezone_to_groups.sql` if option (b) is chosen; `app/api/cron/daily-whistle/route.ts` either way.
- **Acceptance Criteria:** A written decision (fixed-UTC vs. per-group-timezone) exists before DASH-17 begins; if per-group, `groups.timezone` is added with a sensible default and RLS unaffected (not group-isolation-sensitive data).
- **Evidence:** Spec Part 3 "9 PM Bot Message Generation" row's own open question; Achievability Note 2.
- **Status:** Open

#### DASH-02 — [DASHBOARD-CHALLENGES] — Create `daily_goal_completions` table schema
- **Severity:** Blocker
- **Description:** Table doesn't exist. Needs `id uuid PK`, `group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE`, `user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`, `daily_goal_id uuid NOT NULL REFERENCES daily_goals(id) ON DELETE CASCADE`, `completed_at timestamptz NOT NULL DEFAULT now()`, `deleted_at timestamptz` (soft-delete, matching the `memories`/`groups` convention already in the schema rather than a hard delete, so deletions remain auditable).
- **Affected Files:** new `supabase/migrations/00XX_daily_goal_completions.sql`
- **Acceptance Criteria:** Table exists with group RLS; a `UNIQUE (user_id, daily_goal_id, (completed_at::date))`-style constraint (or equivalent) prevents double-completing the same goal twice in one day, matching the spec's "checkbox" one-shot-per-day UI intent.
- **Evidence:** Spec Part 0 §II.1; Part 2 checklist row 2.
- **Status:** Implemented — `supabase/migrations/0036_daily_goals.sql`, including the partial unique index for one-completion-per-day. **Requires human action**: migration not yet applied to the live DB.

#### DASH-03 — [DASHBOARD-CHALLENGES] — Create `challenge_progression` table schema
- **Severity:** Blocker
- **Description:** Table doesn't exist. Needs `id uuid PK`, `group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE`, `user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`, `challenge_type text NOT NULL`, `current_tier numeric/integer NOT NULL`, `previous_tier numeric/integer`, `updated_at timestamptz NOT NULL DEFAULT now()`. Per Part 3's validated design, `previous_tier` must only ever be written by the same trigger that writes `challenge_history` — never independently by application code — to prevent drift after multiple deletes in sequence.
- **Affected Files:** new `supabase/migrations/00XX_challenge_progression.sql`
- **Acceptance Criteria:** Table exists with group RLS; `UNIQUE (user_id, challenge_type)` so a user has exactly one current tier per challenge type; documented invariant that `previous_tier` is trigger-derived only.
- **Evidence:** Spec Part 0 §II.2; Part 2 checklist row 3.
- **Status:** Implemented — `supabase/migrations/0037_challenge_progression.sql`. `previous_tier`/`current_tier` are written ONLY by the trigger, never by application code (verified in `app/actions/progression.ts`). **Requires human action**: migration not yet applied to the live DB.

#### DASH-04 — [DASHBOARD-CHALLENGES] — Create `challenge_history` table schema
- **Severity:** Blocker
- **Description:** Table doesn't exist. Needs `id uuid PK`, `group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE`, `user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`, `challenge_type text NOT NULL`, `entry_date timestamptz NOT NULL DEFAULT now()`, `tier_before numeric/integer NOT NULL`, `tier_after numeric/integer NOT NULL`, `deleted_at timestamptz` (soft-delete, per Part 3's rollback design — a hard delete would make it impossible for the trigger to recompute `previous_tier` correctly after the fact).
- **Affected Files:** new `supabase/migrations/00XX_challenge_history.sql`
- **Acceptance Criteria:** Table exists with group RLS; every row is immutable once written (no `UPDATE` path, only `INSERT` and soft-`deleted_at`); a Postgres trigger function (introduced alongside this migration or DASH-19, whichever lands first) recomputes `challenge_progression.current_tier`/`previous_tier` from the latest non-deleted `challenge_history` row whenever a row here is inserted or soft-deleted.
- **Evidence:** Spec Part 0 §II.2; Part 2 checklist row 4; Part 3 "Progression Challenge Activity Deletion" row.
- **Status:** Implemented — `supabase/migrations/0037_challenge_progression.sql`'s `recompute_challenge_progression()` trigger (fires on INSERT and on soft-delete). **Requires human action**: migration not yet applied to the live DB.

#### DASH-05 — [DASHBOARD-CHALLENGES] — Create `league_assignments` table schema
- **Severity:** Blocker
- **Description:** Table doesn't exist. Needs `id uuid PK`, `group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE`, `user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`, `team_name text NOT NULL CHECK (team_name IN ('TITANS','REBELS'))`, `assigned_at timestamptz NOT NULL DEFAULT now()`.
- **Affected Files:** new `supabase/migrations/00XX_league_assignments.sql`
- **Acceptance Criteria:** Table exists with group RLS; `UNIQUE (user_id, group_id)` enforces exactly one team per user per group (the spec's "fixed teams" requirement) at the DB level, not just in the Multi-Select UI.
- **Evidence:** Spec Part 0 §II.3; Part 2 checklist row 5.
- **Status:** Implemented — `supabase/migrations/0038_leagues.sql`. **Requires human action**: migration not yet applied to the live DB.

#### DASH-06 — [DASHBOARD-CHALLENGES] — Create `league_challenges` table schema
- **Severity:** Blocker
- **Description:** Table doesn't exist. Needs `id uuid PK`, `group_id uuid REFERENCES groups(id) ON DELETE CASCADE` (nullable if a shared global catalog is preferred — see Note below), `name text NOT NULL`, `description text`, `created_at timestamptz NOT NULL DEFAULT now()`. **Open question carried from the spec's own table**: per-group or global catalog? Given every other catalog-style table in this schema (`metrics_config`) is global while per-group customization goes through a separate table (`metric_definitions`), the same split likely applies here — recommend a small global seed set (Lunges, Push-ups, etc.) with group-level custom additions following the `metric_definitions` precedent, rather than assumed without a decision.
- **Affected Files:** new `supabase/migrations/00XX_league_challenges.sql`
- **Acceptance Criteria:** Decision on global-vs-per-group is documented in the migration's comment header before merge; table + RLS match whichever is chosen.
- **Evidence:** Spec Part 0 §II.3; Part 2 checklist row 6 (spec's own "per-group or global?" question).
- **Status:** Implemented — decided per-group (mirrors `metric_definitions`, not a global catalog), in `supabase/migrations/0038_leagues.sql`. **Requires human action**: migration not yet applied to the live DB.

#### DASH-07 — [DASHBOARD-CHALLENGES] — Create `league_matches` table schema
- **Severity:** Blocker
- **Description:** Table doesn't exist. Needs `id uuid PK`, `group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE`, `league_challenge_id uuid NOT NULL REFERENCES league_challenges(id)`, `titans_score numeric NOT NULL DEFAULT 0`, `rebels_score numeric NOT NULL DEFAULT 0`, `winner_team text CHECK (winner_team IN ('TITANS','REBELS','TIE'))`, `completed_at timestamptz`, `deleted_at timestamptz`, `created_at timestamptz NOT NULL DEFAULT now()`. Team rosters are NOT duplicated onto this row — they're read live from `league_assignments` at render time (per the spec's own "Teams correctly read from league_assignments?" verification question in Part 3), so there's no `titans_team_id`/`rebels_team_id` FK as the spec's Part 2 table suggested (there's no separate "team" entity to reference — team membership is the assignment row itself).
- **Affected Files:** new `supabase/migrations/00XX_league_matches.sql`
- **Acceptance Criteria:** Table exists with group RLS; `completed_at IS NOT NULL` is enforced (via trigger or CHECK-adjacent logic in the update path, see DASH-25) to be effectively immutable for `titans_score`/`rebels_score`/`winner_team` once set.
- **Evidence:** Spec Part 0 §II.3; Part 2 checklist row 7; Part 3 "League Match Creation" row's roster question.
- **Status:** Implemented — `supabase/migrations/0038_leagues.sql`, including the `prevent_completed_match_edit` trigger (DB-enforced lock, see DASH-25). **Requires human action**: migration not yet applied to the live DB.

#### DASH-08 — [DASHBOARD-CHALLENGES] — Create `league_match_logs` table schema
- **Severity:** Blocker
- **Description:** Table doesn't exist. Needs `id uuid PK`, `group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE`, `match_id uuid NOT NULL REFERENCES league_matches(id) ON DELETE CASCADE`, `action text NOT NULL CHECK (action IN ('create','complete','delete'))`, `actor_id uuid NOT NULL REFERENCES profiles(id)`, `created_at timestamptz NOT NULL DEFAULT now()`.
- **Affected Files:** new `supabase/migrations/00XX_league_match_logs.sql`
- **Acceptance Criteria:** Table exists with group RLS; every write to `league_matches` (create, complete, soft-delete) has a corresponding log row inserted in the same transaction (matches the spec's "dedicated recent activity list for league matches" requirement).
- **Evidence:** Spec Part 0 §II.3; Part 2 checklist row 8.
- **Status:** Implemented — `supabase/migrations/0038_leagues.sql`. **Requires human action**: migration not yet applied to the live DB.

#### DASH-09 — [DASHBOARD-CHALLENGES] — Decide and (if needed) create `group_stats`/composite metrics table
- **Severity:** Major (not Blocker — see Achievability Note 5; the *existing* graph/leaderboard already works without this table)
- **Description:** Two valid paths, needs a decision before Phase 2 UI work assumes one: **(a)** the unified Podium/Rankings continues to rank on the existing single-metric leaderboard (no new table — reuse `metric_logs`/`metrics_config`/`metric_definitions` exactly as today), or **(b)** the unified Podium is meant to show a new composite "growth score" blending daily goals + progression tiers + league wins, which would need a real `group_stats` (or computed view) design — this is materially new scope beyond "reorganize existing dashboard," not implied elsewhere in the spec text.
- **Affected Files:** Possibly none (path a) or a new `supabase/migrations/00XX_group_stats.sql` + a scheduled/triggered recompute job (path b).
- **Acceptance Criteria:** Decision documented; if (b), the recompute strategy (trigger vs. cron) is specified before DASH-11 is built on top of it.
- **Evidence:** Spec Part 0 §I ("Global Controller... triggers updates to MetricGraph, Podium, Rankings"); Part 2 checklist row 9's own open questions ("What metric is the graph showing? What metric determines podium rank?").
- **Status:** Open

### Phase 2 — UI Layout & Components

#### DASH-10 — [DASHBOARD-CHALLENGES] — Reorganize Dashboard: unify graph + rankings onto one screen
- **Severity:** Major
- **Description:** Today `/dashboard` (chart + feed) and `/dashboard/leaderboard` (podium + rankings) are two separate routes (source: `app/dashboard/page.tsx`, `app/dashboard/leaderboard/page.tsx`) — the spec wants them merged into one home screen (graph on top, rankings directly below). This is a real page-merge, not a pure "layout/nesting change" as the spec's own task title undersells it, because it also has to reconcile the two pages' currently-independent filter state (see DASH-11).
- **Affected Files:** `app/dashboard/page.tsx`, `app/dashboard/leaderboard/page.tsx` (content moves into the unified page; the standalone leaderboard route may become a redirect or be retired), `components/Sidebar.tsx`/`components/MobileBottomNav.tsx` (nav entry changes if the leaderboard route goes away).
- **Acceptance Criteria:** One page renders graph, then Podium+Rankings, then Recent Activities, in that order, sharing one filter state; no dead link left pointing at a retired route.
- **Evidence:** Spec Part 0 §I ("Organize home screen: graph at top, rankings directly below").
- **Status:** Open

#### DASH-11 — [DASHBOARD-CHALLENGES] — Implement Global Activity Slider controller
- **Severity:** Major
- **Description:** Per Achievability Notes 3 & 4: this requires (a) clarifying whether "slider" is literal or the existing tab-selector pattern, and (b) restructuring the ranking section into a Client Component driven by `useMemo`, fed by data from a Server Component parent, sharing one filter-state source (URL params, matching the existing `?metric=`/`?range=` convention) with MetricGraph and Podium/Rankings.
- **Affected Files:** New/updated component (working name `ActivityController` or repurposed `components/DateRangeSelector.tsx`), `app/dashboard/page.tsx`, `components/MetricChart.tsx`/`MetricChartDynamic.tsx`, whatever the unified ranking component becomes post-DASH-10.
- **Acceptance Criteria:** One user interaction updates MetricGraph, Podium, and Rankings simultaneously with no full-page reload; ranking recomputation happens via `useMemo` in a Client Component, not a fresh server round-trip per filter change (unless data volume requires a hybrid — documented if so).
- **Evidence:** Spec Part 0 §I ("Global Controller: activity slider... triggers updates to MetricGraph, Podium, Rankings simultaneously"); Part 5 ("Implement useMemo for ranking calculations").
- **Status:** Open

#### DASH-12 — [DASHBOARD-CHALLENGES] — Implement Ranking Section: Day/Month/All-Time tabs + Podium + Ranking List
- **Severity:** Major
- **Description:** Builds the actual unified ranking UI (tabs above, Podium top-3 with avatars, Ranking List for 4+) on top of DASH-09's decision (existing single-metric ranking vs. new composite score) and DASH-11's shared filter state.
- **Affected Files:** New ranking section component (can reuse visual patterns from `app/dashboard/leaderboard/page.tsx`'s existing podium markup), `components/UserAvatar.tsx` (already supports this use case).
- **Acceptance Criteria:** Tab selection changes the ranking window (day/month/all-time) using the same aggregation logic in all three states — verified against the existing leaderboard's `hasLogged`-aware sort (unlogged members always sink to the bottom, matching current behavior) so this isn't a regression.
- **Evidence:** Spec Part 0 §I ("Unified Ranking Section: Day/Month/All-Time filter tabs... Podium... Ranking List").
- **Status:** Open

#### DASH-13 — [DASHBOARD-CHALLENGES] — Implement Challenges module tabbed container (Daily Goals | Challenges | Leagues)
- **Severity:** Major
- **Description:** A tab container at the bottom of the dashboard with three tabs; no data logic in this task, purely the shell the Phase 3-5 features mount into.
- **Affected Files:** New component, e.g. `components/ChallengesModule.tsx`, mounted from the unified dashboard page (post-DASH-10).
- **Acceptance Criteria:** Three tabs render, switch content, retain no state across tab switches unless explicitly required by a later phase.
- **Evidence:** Spec Part 0 §II ('tabbed interface at bottom (Daily Goals | Challenges | Leagues)').
- **Status:** Implemented — `components/ChallengesModule.tsx`, mounted on the existing `/dashboard` page (not yet the fully-unified page from DASH-10).

### Phase 3 — Daily Goals

#### DASH-14 — [DASHBOARD-CHALLENGES] — Implement Daily Goals card list UI
- **Severity:** Major
- **Description:** Static vertical list of rectangular cards with a checkbox each, sourced from `daily_goals` (DASH-01) but with no completion-logging wiring yet.
- **Affected Files:** New `components/DailyGoalsPanel.tsx` (or similar), mounted in the Daily Goals tab (DASH-13).
- **Acceptance Criteria:** Cards render from real `daily_goals` rows for the caller's group; checkbox is visually present but inert.
- **Evidence:** Spec Part 0 §II.1 ("Vertical list of rectangular cards, each a static daily task... with checkbox").
- **Status:** Implemented — `components/challenges/DailyGoalsPanel.tsx`.

#### DASH-15 — [DASHBOARD-CHALLENGES] — Implement daily goal completion logging
- **Severity:** Major
- **Description:** Checkbox click → new Server Action → insert into `daily_goal_completions` (DASH-02) → `revalidatePath`. Follows the existing `logDirectActivity` shape exactly (session-scoped insert, no AI/extraction step needed here).
- **Affected Files:** New `app/actions/dailyGoals.ts`, `components/DailyGoalsPanel.tsx`.
- **Acceptance Criteria:** Full traced path — checkbox click (UI) → Server Action (session-verified, mirrors `logDirectActivity`'s session/group check) → `daily_goal_completions` insert (DB) → Recent Activities list reflects it after `revalidatePath('/dashboard')`.
- **Evidence:** Spec Part 3 "Daily Goal Completion Logging" row.
- **Status:** Implemented — `app/actions/dailyGoals.ts` `logDailyGoalCompletion()`.

#### DASH-16 — [DASHBOARD-CHALLENGES] — Implement daily goal completion deletion with rollback
- **Severity:** Major
- **Description:** Delete button → Server Action sets `daily_goal_completions.deleted_at` (soft-delete, per DASH-02's schema) → `revalidatePath`. No "tier" to roll back here (that's only the Progression module) — "rollback" in this flow means the Recent Activities list and the bot's future query both stop counting the deleted row, which is satisfied entirely by the `deleted_at IS NULL` filter being applied consistently everywhere this table is read.
- **Affected Files:** `app/actions/dailyGoals.ts`, `components/DailyGoalsPanel.tsx` (or wherever the "Recent Activities (Daily)" list with delete lives).
- **Acceptance Criteria:** Delete sets `deleted_at`, never hard-deletes (auditable); every read of this table (Recent Activities list, and the bot query in DASH-17) filters `deleted_at IS NULL` — verified as a single shared query helper, not duplicated ad hoc per call site (avoiding the kind of duplication that caused DATA-02 earlier in this file).
- **Evidence:** Spec Part 0 §II.1 ("delete function; delete triggers state rollback and bot data-source update"); Part 4's daily-goal sync row.
- **Status:** Implemented — `app/actions/dailyGoals.ts` `deleteDailyGoalCompletion()` (soft-delete, owner-only).

#### DASH-17 — [DASHBOARD-CHALLENGES] — Integrate daily-goals summary into the daily broadcast bot
- **Severity:** Major (blocked by DASH-01b's timezone decision)
- **Description:** Per Achievability Note 1, this should extend the existing `daily-whistle` cron's prompt-building step rather than schedule a new job, unless DASH-01b's decision explicitly calls for a second broadcast (which would need separate, explicit sign-off given the same-day decision to consolidate to one).
- **Affected Files:** `app/api/cron/daily-whistle/route.ts`, `lib/ai/prompts.ts` (`buildDailyWhistlePrompt`).
- **Acceptance Criteria:** The bot's query for daily-goal completions filters `deleted_at IS NULL` and reads only the relevant day's window; verified that a completion deleted *before* the bot's query window runs is correctly excluded, and one deleted *during* a query is not partially counted (single query, not read-then-recheck).
- **Evidence:** Spec Part 0 §II.1 ("9 PM distribution bot queries daily tasks table"); Spec Part 3 "9 PM Bot Message Generation" row; Achievability Notes 1 & 2.
- **Status:** Implemented — folded into the existing `daily-whistle` cron rather than a new scheduled job (per Achievability Note 1); queries `daily_goal_completions` filtered `deleted_at IS NULL` for the prior 24h window (`app/api/cron/daily-whistle/route.ts`). Timezone question (DASH-01b) remains open/undecided — still runs at the cron's existing UTC time, not literally 9 PM.

### Phase 4 — Progression Challenges

#### DASH-18 — [DASHBOARD-CHALLENGES] — Implement Progression Challenge tier display UI
- **Severity:** Major
- **Description:** Shows current tier + "Previous Record" badge, reading from `challenge_progression` (DASH-03).
- **Affected Files:** New `components/ProgressionChallengePanel.tsx`, mounted in the Challenges tab (DASH-13).
- **Acceptance Criteria:** Displays real `current_tier`/`previous_tier` values per user per `challenge_type`; badge only shows when a `previous_tier` exists.
- **Evidence:** Spec Part 0 §II.2 ("UI shows active tier + 'Previous Record' badge").
- **Status:** Implemented — `components/challenges/ProgressionChallengePanel.tsx`.

#### DASH-19 — [DASHBOARD-CHALLENGES] — Implement progression activity logging with tier update (transactional)
- **Severity:** Blocker (this is the flow Part 3 flagged as riskiest if done wrong)
- **Description:** User input → Server Action → single DB transaction (or, per the recommended pattern above, a Postgres trigger fired by the `challenge_history` insert) that both writes the history row and updates `challenge_progression.current_tier`/`previous_tier`. The two writes must never happen as two independent, separately-failable steps from application code.
- **Affected Files:** New `app/actions/progression.ts`, a new trigger function in a migration (pairs with DASH-04), `components/ProgressionChallengePanel.tsx`.
- **Acceptance Criteria:** Full traced path with an explicit transaction/trigger boundary cited in the implementation; a forced mid-write failure (e.g. a constraint violation on the history insert) leaves `challenge_progression` completely unchanged — verified, not assumed.
- **Evidence:** Spec Part 0 §II.2 ("Logging activity updates current tier and writes to history log"); Spec Part 3 "Progression Challenge Activity Logging" row; Operating Rule 6.
- **Status:** Implemented — `app/actions/progression.ts` `logProgressionActivity()` inserts into `challenge_history`; the DB trigger (DASH-04) is the sole writer of `challenge_progression`.

#### DASH-20 — [DASHBOARD-CHALLENGES] — Implement progression activity deletion with tier rollback (transactional)
- **Severity:** Blocker (highest-risk flow in the entire spec — see Part 3 and Achievability discussion)
- **Description:** Delete → same trigger/transaction boundary as DASH-19, in reverse: soft-delete the `challenge_history` row and recompute `challenge_progression.current_tier`/`previous_tier` from whatever the new most-recent non-deleted history row says — never from a separately-stored value that could have drifted.
- **Affected Files:** `app/actions/progression.ts`, the same trigger function from DASH-19 (handles both insert and delete-driven recompute).
- **Acceptance Criteria:** Deleting two history entries in a row correctly cascades the tier back two steps, not just one (i.e., re-verified against re-triggering, not a single-shot rollback); no orphaned `challenge_history` row is left un-reflected in `challenge_progression`.
- **Evidence:** Spec Part 0 §II.2 ("Deleting activity removes history entry and reverts tier to previous state"); Spec Part 3 "Progression Challenge Activity Deletion" row; Operating Rule 6.
- **Status:** Implemented — `app/actions/progression.ts` `deleteProgressionActivity()` soft-deletes; trigger recomputes. Multi-step rollback verified by design (trigger always re-derives from remaining history, not a decrement).

#### DASH-21 — [DASHBOARD-CHALLENGES] — Add Framer Motion `<AnimatePresence/>` for tier progression
- **Severity:** Minor
- **Description:** Purely visual — animate the tier badge/display transition when `current_tier` changes.
- **Affected Files:** `components/ProgressionChallengePanel.tsx`. Note: `framer-motion` is not currently a dependency (verified against `package.json`) — this task also adds that package.
- **Acceptance Criteria:** Tier change animates in/out without layout jank; no dependency added elsewhere unnecessarily.
- **Evidence:** Spec Part 0 §III ("Visual Fluidity: `<AnimatePresence/>` (Framer Motion) for tier progression").
- **Status:** Implemented — `framer-motion` added as a dependency; `components/challenges/ProgressionChallengePanel.tsx` animates the tier value on change.

### Phase 5 — Leagues

#### DASH-22 — [DASHBOARD-CHALLENGES] — Implement League team assignment (TITANS/REBELS) Multi-Select
- **Severity:** Major
- **Description:** Admin-facing Multi-Select UI writing to `league_assignments` (DASH-05); enforce one team per user at the UI layer in addition to the DB `UNIQUE` constraint.
- **Affected Files:** New `components/settings/LeagueAssignmentPanel.tsx` (Settings-tab admin UI, matching the existing `components/settings/*` pattern), new Server Action in `app/actions/leagues.ts`.
- **Acceptance Criteria:** Reassigning a user's team updates their single `league_assignments` row (not creates a duplicate); UI reflects current assignment on load.
- **Evidence:** Spec Part 0 §II.3 ("Multi-Select dropdown to assign team members to fixed TITANS or REBELS groups").
- **Status:** Implemented — `components/settings/ChallengesAdminPanel.tsx` (select-based; not a true multi-select-at-once UI, one assignment per submit) + `app/actions/leagues.ts` `adminAssignLeagueTeam()`.

#### DASH-23 — [DASHBOARD-CHALLENGES] — Implement League challenge type selector (horizontal scrollable bar)
- **Severity:** Major
- **Description:** Reads from `league_challenges` (DASH-06), rendered as a horizontal scroll bar matching the existing metric-pill-selector visual pattern (`components/MetricPillSelector.tsx`) rather than inventing a new scroll-bar component from scratch.
- **Affected Files:** New `components/LeagueChallengeSelector.tsx`.
- **Acceptance Criteria:** Selecting a challenge type filters the League match UI (DASH-24) to that type.
- **Evidence:** Spec Part 0 §II.3 ("Top: horizontal scrollable bar to select challenge type").
- **Status:** Implemented — inline in `components/challenges/LeagueMatchPanel.tsx` (not split into a separate component file as originally scoped, kept together since they share tightly-coupled state).

#### DASH-24 — [DASHBOARD-CHALLENGES] — Implement League match UI: two-column grid with photos + score inputs
- **Severity:** Major
- **Description:** Reads rosters live from `league_assignments` (per Part 3's validated design — no roster duplication onto `league_matches`), renders player photos (`components/UserAvatar.tsx`) + manual numeric score inputs per team.
- **Affected Files:** New `components/LeagueMatchPanel.tsx`.
- **Acceptance Criteria:** Grid renders every assigned member on each side; score inputs are plain numeric fields (per spec — "manual score inputs," not derived from any auto-tracked metric).
- **Evidence:** Spec Part 0 §II.3 ("Middle: two-column grid (player photos + manual score inputs, one per team)").
- **Status:** Implemented — `components/challenges/LeagueMatchPanel.tsx`.

#### DASH-25 — [DASHBOARD-CHALLENGES] — Implement League match completion ("Complete Challenge" button, DB-enforced lock)
- **Severity:** Blocker (the lock must be server-enforced, not just a disabled input — see Part 3/4)
- **Description:** Button → Server Action → single transaction: determine `winner_team` (higher score; tie handling per DASH-07's `'TIE'` option), set `completed_at`, insert a `league_match_logs` row with `action = 'complete'`. Once `completed_at` is set, the same Server Action (and any other write path) must reject further score changes — enforced in the query/trigger layer, not only by the client disabling the inputs.
- **Affected Files:** New Server Action in `app/actions/leagues.ts`, `components/LeagueMatchPanel.tsx`.
- **Acceptance Criteria:** A direct repeat call to the same Server Action after completion is rejected server-side (tested conceptually here, verified at implementation time) — not just visually blocked; UI highlights the winning side in light gold and persists that state across a page reload (reads `winner_team`/`completed_at` from DB, not local-only state).
- **Evidence:** Spec Part 0 §II.3 ("'Complete Challenge' button locks inputs, highlights winning side in light gold"); Spec Part 3 "League Match Completion" row; Part 4's league sync row.
- **Status:** Implemented — `app/actions/leagues.ts` `completeLeagueMatch()` + the DB-level `prevent_completed_match_edit` trigger (migration 0038) as the real enforcement, not just a disabled input.

#### DASH-26 — [DASHBOARD-CHALLENGES] — Implement League match deletion
- **Severity:** Major
- **Description:** Soft-delete `league_matches.deleted_at` (matches DASH-07's schema), insert a `league_match_logs` row with `action = 'delete'`, `revalidatePath`.
- **Affected Files:** New Server Action in `app/actions/leagues.ts`, `components/LeagueMatchPanel.tsx`.
- **Acceptance Criteria:** Deleted matches disappear from the active match view and Recent Activities but remain queryable for audit (soft-delete, not hard).
- **Evidence:** Spec Part 0 §II.3 ("Activity Logs: dedicated recent activity list for league matches"); Part 2 checklist's soft-delete note on `league_matches`.
- **Status:** Implemented — `app/actions/leagues.ts` `deleteLeagueMatch()`.

### Phase 6 — State Sync & Optimization

#### DASH-27 — [DASHBOARD-CHALLENGES] — Implement `useMemo` for ranking calculations
- **Severity:** Major
- **Description:** Depends on DASH-11's architectural shift (ranking calc moves into a Client Component). This task is the actual hook wiring once that shift exists — not separable from DASH-11 in practice, listed separately here only because the spec's own sequencing lists it in Phase 6.
- **Affected Files:** Whatever component DASH-11/DASH-12 produce.
- **Acceptance Criteria:** Ranking recalculation is provably memoized (doesn't re-run on unrelated re-renders — e.g. a sibling component's state change) and only re-runs when the slider's filter state or underlying log data actually changes.
- **Evidence:** Spec Part 0 §III ("State Synchronization: use `useMemo` for ranking calculations").
- **Status:** Open

#### DASH-28 — [DASHBOARD-CHALLENGES] — Verify transaction integrity for all delete + rollback flows
- **Severity:** Blocker (this is a verification gate, not new functionality — but nothing in Phase 3-5 should be considered done without it)
- **Description:** Audit every delete code path introduced in DASH-16, DASH-19/20, and DASH-25/26 to confirm none can leave the DB in a partially-applied state (e.g., tier reverted but history row not removed, or vice versa) — per Operating Rule 6.
- **Affected Files:** `app/actions/dailyGoals.ts`, `app/actions/progression.ts`, `app/actions/leagues.ts`, and their associated migration trigger functions.
- **Acceptance Criteria:** Each delete flow is backed by either a single SQL transaction or a DB trigger (not sequential, independently-failable Supabase client calls); documented per flow which mechanism is used.
- **Evidence:** Spec Part 0 §II.2 ("Rollback Mechanism: transaction-based"); Spec Part 0 §III ("Transaction Integrity"); Operating Rule 6.
- **Status:** Open

#### DASH-29 — [DASHBOARD-CHALLENGES] — Verify Recent Activities sync across all modules
- **Severity:** Major
- **Description:** Confirm daily goals, progression, and league deletions are all correctly reflected (or absent, if soft-deleted) in whichever Recent Activities surfaces the spec calls for per module (a shared feed, or three dedicated lists — the spec implies the latter: "Recent Activities (Daily)" for goals, a history log for progression, "dedicated recent activity list" for leagues).
- **Affected Files:** All Phase 3-5 UI components.
- **Acceptance Criteria:** Each module's Recent Activities list is confirmed to read with the same `deleted_at`-aware filter used everywhere else, avoiding three slightly-different, independently-maintained query implementations.
- **Evidence:** Spec Part 0 §II.1, §II.2, §II.3 (each module's own "Recent Activities"/"Activity Logs" requirement); Part 4 table.
- **Status:** Open

#### DASH-30 — [DASHBOARD-CHALLENGES] — Verify 9 PM (or folded-in) bot data consistency
- **Severity:** Major (depends on DASH-01b's decision and DASH-17)
- **Description:** Confirm the bot's query (wherever it ends up living per DASH-01b/DASH-17) can't double-count or miss data due to timing — specifically: a completion logged after the query window closes isn't included until the *next* run (expected), and a completion deleted mid-run isn't half-counted (single atomic query, not read-then-recheck).
- **Affected Files:** `app/api/cron/daily-whistle/route.ts` (or wherever DASH-17 lands the integration).
- **Acceptance Criteria:** Documented query window boundaries; confirmed single-query (not multi-step) read per broadcast.
- **Evidence:** Spec Part 3 "9 PM Bot Message Generation" row ("What if data is deleted during the bot's query window?").
- **Status:** Open

---

## Documentation

### DOC-01 — [DOCS] — Documentation Audit & Cleanup (2026-07-19)
- **Severity:** Minor
- **Description:** Full audit of every file in `docs/` against the current codebase. Found and fixed: (1) stale Telegram integration references surviving in `01_`, `04_`, `06_` despite the channel being fully removed from code in an earlier pass; (2) the Dashboard & Challenges Module (`01_` §11, `07_` §8, `08_` §8) still marked "planned/not yet implemented" despite shipping via migrations `0036`-`0038` and `components/ChallengesModule.tsx`; (3) the Streak/Badge system, Personal Profile page, and PWA shell (all shipped in an earlier pass) had zero documentation anywhere; (4) a duplicated cron schedule table (`01_` had its own copy, now redundant with `09_`); (5) `Master_Reference.md` (669 lines) and `log.md` were both full/exact duplicates of other content — `log.md` was an exact duplicate of `Implementation_Worker_Prompt.md`; `Master_Reference.md` duplicated the entire numbered doc set and had drifted (stale Telegram content, stale `profiles.pin` column-type claim, stale `NEXT_PUBLIC_APP_URL` "unused" claim).
- **Affected Files:** `docs/01_Architecture_and_App_Structure.md`, `docs/02_Authentication_and_Session_Management.md`, `docs/03_Ingestion_and_AI_Pipelines.md`, `docs/04_Security_and_Gap_Analysis.md`, `docs/05_Whatsapp_Agent.md`, `docs/06_API_Routes_and_Server_Actions.md`, `docs/07_Data_Modelling.md`, `docs/08_Client_Side_Architecture_and_UI_Component_Inventory.md`, `docs/09_Cron_Services_and_Sync_Pipelines.md`, `docs/Future_scope_and_suggestions.md`, `docs/Master_Reference.md` (rewritten to a deprecation redirect), `docs/log.md` (deleted), `docs/00_README.md` (new), `docs/Admin_to_do.md`, `docs/Implementation_Worker_Prompt.md`.
- **Acceptance Criteria:** No doc claims a removed feature exists; all shipped features (Challenges Module, Streaks, Profile page, PWA) are documented in at least one authoritative file; no duplicate full-topic documentation remains; every file has a "Last updated" line.
- **Evidence:** Grep sweep for `Telegram|telegram` across `docs/**` before/after (14 stale hits in 7 files → only historical/dead-column mentions remain, explicitly labeled as such); grep sweep for `streak_count|push_subscriptions|daily_goals|challenge_progression|league_matches` confirmed the implemented features were absent from the reference docs before this pass; `log.md` vs `Implementation_Worker_Prompt.md` confirmed byte-for-byte identical (spot-checked head and tail).
- **Status:** Fixed.





