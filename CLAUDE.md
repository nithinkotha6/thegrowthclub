@AGENTS.md

# Global AI Instructions: The Growth Club Dashboard

## 🚨 Strict Execution Guardrails (OG Senior Dev Mode)
1. **Strict Feature Isolation:** Build ONLY the explicitly requested feature or change in the given way. Do NOT add any additional contexts, speculative features, unrequested files, or defensive boilerplate. 
2. **YAGNI (You Aren't Gonna Need It):** If a feature, component, utility, or database column is not explicitly dictated by the current task or tracking docs, do not write it. 
3. **The Shortest Working Diff:** Write the absolute minimum amount of clean code required to achieve the goal. Prioritize code deletion, native solutions, and simplicity over clever abstractions.
4. **No Placeholders:** Never emit incomplete code containing comments like `// TODO: implement later` or `// ... rest of code`. Write the complete, fully functioning implementation for the requested scope.
5. **Boring Over Clever:** Use simple, predictable logic. Do not build complex state managers or wrappers unless explicitly instructed.

## 🧗 The Ponytail Ladder of Execution
Before writing a single line of new code, you must climb this ladder:
- **Step 1 (Native First):** Can the browser, PostgreSQL, or standard library natively do this? (e.g., HTML date pickers, native CSS, Postgres aggregates over JS math).
- **Step 2 (Reuse):** Does a helper, icon, or component already exist in this repository? Reuse it. Do not rewrite or duplicate logic.
- **Step 3 (Minimal Layering):** If code must be written, what is the cleanest, single-file or single-function path to completion?

## 📂 Project Context Routing
You are blind to the overall system design unless you reference our explicit specifications. Before editing or generating any codebase files, you MUST consult and adhere to these architectural maps:
- **Features Backlog & Scope:** Read `docs/Features.md` (Tracks the Nike-style UI layout, XP engine, and streams).
- **System Architecture & Data Flows:** Read `docs/architecture.md` (Tracks Vercel, Supabase, and Telegram Webhooks).
- **Database & Supabase Constraints:** Read `.claude/rules/database.md` (Tracks EAV patterns, schema definitions, and RLS).
- **Frontend, Tailwind, & ECharts Layouts:** Read `.claude/rules/frontend.md` (Tracks Next.js Server Components and avatar charts).
- **Telegram Hook Ingestion Logic:** Read `.claude/rules/telegram.md` (Tracks serverless webhook processing and Gemini AI extraction parsing).
7. **Minimal Dev Logging:** If the user explicitly asks you to "log progress", you must create or append to a markdown file inside `docs/dev-log/`. The log must be extremely minimal: just the date, the step completed, and 1-2 bullet points of the exact files created/modified. NEVER write long, extensive log files. If not explicitly asked to log, do not write to this directory.
