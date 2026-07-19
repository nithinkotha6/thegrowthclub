# 00 — Documentation Index

> **Last updated:** 2026-07-19

A short tour of the `docs/` folder. Read top to bottom for a full picture, or jump straight to the file you need.

## Reference docs (numbered, read in this order for a full tour)

| # | File | Covers |
|---|---|---|
| 01 | [01_Architecture_and_App_Structure.md](01_Architecture_and_App_Structure.md) | System architecture, directory tree, route table, deployment config, Streaks/Profile/PWA, Challenges module |
| 02 | [02_Authentication_and_Session_Management.md](02_Authentication_and_Session_Management.md) | Kiosk PIN auth, JWT sessions, `proxy.ts` guard |
| 03 | [03_Ingestion_and_AI_Pipelines.md](03_Ingestion_and_AI_Pipelines.md) | Gemini key rotation, NL activity ingestion, Fisky prompt assembly |
| 04 | [04_Security_and_Gap_Analysis.md](04_Security_and_Gap_Analysis.md) | Verified security controls, confirmed gaps, RLS matrix, secret inventory |
| 05 | [05_Whatsapp_Agent.md](05_Whatsapp_Agent.md) | Fisky WhatsApp bot — full inbound/outbound flow diagrams |
| 06 | [06_API_Routes_and_Server_Actions.md](06_API_Routes_and_Server_Actions.md) | Every Server Action and Route Handler, signature + logic |
| 07 | [07_Data_Modelling.md](07_Data_Modelling.md) | Full DB schema, triggers, RLS policies, ERD |
| 08 | [08_Client_Side_Architecture_and_UI_Component_Inventory.md](08_Client_Side_Architecture_and_UI_Component_Inventory.md) | Design tokens, component inventory, screen-by-screen states, interaction traces |
| 09 | [09_Cron_Services_and_Sync_Pipelines.md](09_Cron_Services_and_Sync_Pipelines.md) | **Canonical cron schedule** (§0), wearables sync, service inventory, cost projections |

## Operational / process docs

| File | Purpose |
|---|---|
| [Admin_to_do.md](Admin_to_do.md) | Deployment runbook — every external action needed to ship (migrations, env vars, OAuth setup, GitHub secrets) |
| [Findings_and_Recommendations.md](Findings_and_Recommendations.md) | The living task tracker — security findings, QA findings, feature specs, all with Status fields |
| [Implementation_Worker_Prompt.md](Implementation_Worker_Prompt.md) | Prompt template to hand an agent a single task from the Findings doc |
| [Future_scope_and_suggestions.md](Future_scope_and_suggestions.md) | Brainstorm/roadmap — not a spec, not authoritative |
| [audit.md](audit.md) | Historical record of a prior documentation audit pass (2026-07-18) — read-only, never edited |
| [Master_Reference.md](Master_Reference.md) | **Deprecated** — redirects to the numbered docs above |

## Conventions

- **Ground truth is the codebase.** If a doc and the code disagree, the code wins — file it as a doc bug.
- **No duplicate sources of truth.** The cron schedule lives only in `09_` §0; the design tokens live only in `08_` §1; the RLS policy list lives only in `04_` §3 and `07_`. Other files link to these instead of repeating them.
- **Revision Log tables at the top of each numbered doc are historical** — never rewritten, only appended to.
- Every doc in this folder has a **"Last updated"** line near the top.
