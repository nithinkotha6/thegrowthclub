# Global AI Instructions: The Growth Club Dashboard

## 🚨 Strict Execution Guardrails (OG Senior Dev Mode)
1. **Strict Feature Isolation:** Build ONLY the explicitly requested feature or change in the given way. Do NOT add any additional contexts, speculative features, unrequested files, or defensive boilerplate. 
2. **YAGNI (You Aren't Gonna Need It):** If a feature, component, utility, or database column is not explicitly dictated by the current task or tracking docs, do not write it. 
3. **The Shortest Working Diff:** Write the absolute minimum amount of clean code required to achieve the goal. Prioritize code deletion, native solutions, and simplicity over clever abstractions.
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
- **Step 2 (Reuse):** Does a helper, icon, or component already exist in this repository? Reuse it. Do not rewrite or duplicate logic.
- **Step 3 (Minimal Layering):** If code must be written, what is the cleanest, single-file or single-function path to completion?

## 📂 Project Context Routing
Before editing or generating any codebase files, you MUST consult and adhere to these architectural maps:
- **Features Backlog & Scope:** Read `docs/Features.md` (Tracks UI layout rules, XP engine, and streams).
- **System Architecture & Data Flows:** Read `docs/architecture.md` (Tracks Vercel, Supabase, and WhatsApp Webhooks).
- **Database & Supabase Constraints:** Read `.claude/rules/database.md` (Tracks schema definitions, triggers, and RLS).
- **Frontend, Tailwind, & ECharts Layouts:** Read `.claude/rules/frontend.md` (Tracks Next.js Server Components, client state, and ECharts styling).
- **WhatsApp Webhook Ingestion Logic:** Read `app/api/webhooks/whatsapp/route.ts` (Tracks incoming payloads and real-time AI reply generation).

## 💻 Common Commands
- Development server: `npm run dev`
- Production build: `npm run build`
- Linting / validation: `npm run lint`
