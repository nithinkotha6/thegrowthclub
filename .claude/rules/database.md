# Database & Supabase Rules

## 1. The EAV Schema Pattern
Strictly adhere to the Entity-Attribute-Value (EAV) pattern to allow infinite metric types without schema changes. 
- **`profiles`:** `id` (uuid), `username` (text), `avatar_url` (text), `total_xp` (integer, default 0), `current_level` (integer, default 1).
- **`metrics_config`:** `id` (uuid), `slug` (text), `display_name` (text), `unit` (text), `sort_order` (enum: asc/desc), `xp_reward` (integer).
- **`metric_logs`:** `id` (bigint), `user_id` (uuid, FK), `metric_id` (uuid, FK), `value` (numeric), `logged_at` (timestamptz), `evidence_url` (text), `status` (enum: pending/verified), `approvals` (text array).

## 2. The XP & Leveling Engine
- **Push logic to Postgres:** Do NOT calculate XP or levels on the frontend.
- **Implementation:** Create a PostgreSQL Database Trigger. When a row in `metric_logs` is updated to `status = 'verified'`, automatically fetch the `xp_reward` from the joined `metrics_config` and add it to the user's `total_xp` in `profiles`. 

## 3. Native Data Aggregation (Ponytail Rule)
- Use **PostgreSQL Window Functions** (e.g., `RANK() OVER (ORDER BY value DESC)`) to compute leaderboards directly in the query. 
- Use native SQL aggregates (`MAX()`, `SUM()`) for the PR widgets. Do NOT fetch raw arrays and reduce them in Next.js.

## 4. Security
- Enable Row Level Security (RLS) on all tables. 
- Authenticated users can read all data (public leaderboards), but can only `INSERT` or `UPDATE` logs where `user_id = auth.uid()`.