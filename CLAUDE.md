# Global AI Instructions: The Growth Club Dashboard

## 🤖 Agent Operating Rules
Apply these to every task in this repo, before the project-specific guidance below.

- **Token minimization:** No implementation plans, progress updates, status messages, debug logs, or completion reports mid-task. Do not create markdown files (scratch notes, task summaries, change logs) unless the user explicitly asks for one.
- **Final reply format:** After finishing a task, respond with a concise 50–120 word summary of what was implemented and which files were modified. description and bulletpoints.
- **Ambiguity handling:** When a task is underspecified, make the smallest reasonable assumption consistent with existing patterns and proceed; state the assumption in the final summary. Only stop to ask if the ambiguity is genuinely blocking.
- **Verify before declaring done:** Silently run the repo's own build / lint / test process (see "Common Commands" below) before considering a task complete. Do not narrate the runs.

## 🚨 Strict Execution Guardrails (OG Senior Dev Mode)
1. **Strict Feature Isolation:** Build ONLY the explicitly requested feature or change in the given way. Do NOT add any additional contexts, speculative features, unrequested files, or defensive boilerplate. No drive-by refactors, no unrelated fixes, no architecture or design changes unless explicitly requested.
2. **YAGNI (You Aren't Gonna Need It):** If a feature, component, utility, or database column is not explicitly dictated by the current task or tracking docs, do not write it. 
3. **The Shortest Working Diff:** Write the absolute minimum amount of clean code required to achieve the goal. Prioritize code deletion, native solutions, and simplicity over clever abstractions. Touch the fewest files necessary; do not reformat, rename, or restyle code outside the task's scope.
4. **No Placeholders:** Never emit incomplete code containing comments like `// TODO: implement later` or `// ... rest of code`. Write the complete, fully functioning implementation for the requested scope.
5. **Boring Over Clever:** Use simple, predictable logic. Do not build complex state managers or wrappers unless explicitly instructed.

## 🎨 UI/UX Theme Alignment Guardrails
- **Theme Color Palette:** Eradicate all dark-mode card containers and pastel-colored components. Strictly clone the Wearables tab theme structure.
- **Canvas Colors:** Use `#F7F8FA` or `#FBFBFB` for main viewport backgrounds.
- **Module Cards:** Always wrap dashboard widgets and settings modules in pure white card templates: `bg-white border border-slate-200 shadow-sm rounded-xl`.
- **Primary Highlights:** Use Neon Yellow/Green (`#CEFF00`) for active tabs, SVG divider shapes, and primary buttons. Active states on buttons should be matched with bold, dark slate text.
- **Header Elements:** Headers must use high contrast dark slate (`text-slate-900 font-extrabold`) and descriptions must use muted gray (`text-slate-500`).

## 🧗 The Ponytail Ladder of Execution
Before writing a single line of new code, you must climb this ladder:
- **Step 1 (Native First):** Can the browser, PostgreSQL, or standard library natively do this? (e.g., HTML date pickers, native CSS, Postgres aggregates over JS math).
- **Step 2 (Reuse):** Does a helper, icon, or component already exist in this repository? Reuse it. Do not rewrite or duplicate logic. Follow the repository's established architecture and naming/coding conventions rather than introducing new ones.
- **Step 3 (Minimal Layering):** If code must be written, what is the cleanest, single-file or single-function path to completion?

## 📂 Project Context Routing
Before editing or generating any codebase files, consult the relevant architectural map. These are the docs that exist and are current:
- **System architecture, routing, session model, core types:** `docs/01_Architecture_and_App_Structure.md`
- **Kiosk PIN auth, JWT / `app_session` cookie, `proxy.ts` guard:** `docs/02_Authentication_and_Session_Management.md`
- **AI ingestion, Gemini pool, prompt structure, slang router:** `docs/03_Ingestion_and_AI_Pipelines.md`
- **Security controls, RLS matrix, known gaps:** `docs/04_Security_and_Gap_Analysis.md`
- **WhatsApp / Fisky agent — webhooks, prompt assembly, dispatch:** `docs/05_Whatsapp_Agent.md`
- **Server Actions + Route Handlers reference:** `docs/06_API_Routes_and_Server_Actions.md`
- **Database schema, DDL, RLS, sample data, ERD:** `docs/07_Data_Modelling.md`
- **UI/UX system, components, screen inventory, edge cases:** `docs/08_Client_Side_Architecture_and_UI_Component_Inventory.md`
- **Cron jobs, wearable sync, service inventory, deployment pipeline:** `docs/09_Cron_Services_and_Sync_Pipelines.md`
- **Consolidated encyclopedia (older, may be less current than the 01–09 set):** `docs/Master_Reference.md`
- **Open findings & implementation backlog:** `Findings_and_Recommendations.md`
- **Documentation audit history:** `audit.md`
- **Database / Supabase working rules:** `.claude/rules/database.md`
- **Frontend / Tailwind / ECharts working rules:** `.claude/rules/frontend.md`
- **WhatsApp webhook ingestion logic (code):** `app/api/webhooks/whatsapp/route.ts`

## 💻 Common Commands
- Development server: `npm run dev`
- Production build: `npm run build`
- Linting / validation: `npm run lint`
