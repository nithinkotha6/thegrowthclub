# Dev Log — Manual Ingestion Flow

## 2026-07-10 | Step 5: AI-Powered Activity Ingestion

**Pre-flight fixes:**
- Created `beyond-yesterday-app/.env.local` (was in wrong parent dir; Supabase URL stripped of `/rest/v1/` suffix)

**New packages:** `ai`, `@ai-sdk/google` (zod already available as transitive dep)

**Files created/modified:**
- `app/actions/ingest.ts` — Server Action: Gemini `generateObject` with Zod schema → `metrics_config` slug lookup → `metric_logs` INSERT
- `components/AddActivityModal.tsx` — Client Dialog (shadcn): text area, useTransition spinner, success/error feedback, auto-close on success
- `components/ui/dialog.tsx` — added via `npx shadcn add dialog`
- Modified `app/dashboard/page.tsx` — static button replaced with `<AddActivityModal />`
