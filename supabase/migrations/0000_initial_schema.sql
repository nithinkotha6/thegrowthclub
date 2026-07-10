-- =============================================================================
-- Migration: 0000_initial_schema.sql
-- Project:   The Growth Club Dashboard
-- Purpose:   EAV tables, RLS policies, and the XP leveling trigger.
--            Spec: .claude/rules/database.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
create type sort_order_enum as enum ('asc', 'desc');
create type log_status_enum  as enum ('pending', 'verified');

-- ---------------------------------------------------------------------------
-- TABLE: profiles
-- One row per authenticated user. XP and level are maintained by the trigger.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid        primary key references auth.users (id) on delete cascade,
  username     text        not null,
  avatar_url   text,
  total_xp     integer     not null default 0,
  current_level integer    not null default 1,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- TABLE: metrics_config
-- Catalogue of all metric types (Long Run, Deadlift, Top Speed, Weight, ...).
-- Adding a new metric = one INSERT here; no schema migration needed.
-- ---------------------------------------------------------------------------
create table public.metrics_config (
  id           uuid           primary key default uuid_generate_v4(),
  slug         text           not null unique,
  display_name text           not null,
  unit         text           not null,
  sort_order   sort_order_enum not null default 'desc',
  xp_reward    integer        not null default 0,
  created_at   timestamptz    not null default now()
);

-- ---------------------------------------------------------------------------
-- TABLE: metric_logs
-- The core EAV log. Each row = one user logging one value for one metric.
-- Leaderboards and PRs are computed with SQL window functions at query time.
-- ---------------------------------------------------------------------------
create table public.metric_logs (
  id           bigint         generated always as identity primary key,
  user_id      uuid           not null references public.profiles (id) on delete cascade,
  metric_id    uuid           not null references public.metrics_config (id) on delete cascade,
  value        numeric        not null,
  logged_at    timestamptz    not null default now(),
  evidence_url text,
  status       log_status_enum not null default 'pending',
  approvals    text[]         not null default '{}'
);

create index on public.metric_logs (user_id);
create index on public.metric_logs (metric_id);
create index on public.metric_logs (status);

-- ---------------------------------------------------------------------------
-- TRIGGER: XP Leveling Engine
-- Fires AFTER UPDATE on metric_logs.
-- When status transitions to 'verified', fetches xp_reward from metrics_config
-- and adds it to the owning user's total_xp, then recomputes current_level.
--
-- Level formula (cumulative XP):
--   current_level = floor(1 + sqrt(total_xp / 500)) + 1
-- ---------------------------------------------------------------------------
create or replace function public.award_xp_on_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_xp_reward integer;
begin
  -- Only act when status flips TO 'verified'
  if (OLD.status <> 'verified' and NEW.status = 'verified') then

    -- 1. Fetch XP reward for this metric
    select xp_reward
      into v_xp_reward
      from public.metrics_config
     where id = NEW.metric_id;

    -- 2. Add XP and recompute level atomically
    update public.profiles
       set total_xp      = total_xp + v_xp_reward,
           current_level = floor(1 + sqrt((total_xp + v_xp_reward)::float / 500)) + 1
     where id = NEW.user_id;

  end if;

  return NEW;
end;
$$;

create trigger trg_award_xp
  after update of status on public.metric_logs
  for each row
  execute function public.award_xp_on_verification();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

-- profiles ------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Any authenticated user may read all profiles (public leaderboard).
create policy "profiles: authenticated users can read all"
  on public.profiles for select
  to authenticated
  using (true);

-- A user may only insert their own profile row.
create policy "profiles: users can insert own row"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- A user may only update their own profile.
create policy "profiles: users can update own row"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());

-- metrics_config ------------------------------------------------------------
alter table public.metrics_config enable row level security;

-- All authenticated users can read metric definitions.
create policy "metrics_config: authenticated users can read all"
  on public.metrics_config for select
  to authenticated
  using (true);

-- metric_logs ---------------------------------------------------------------
alter table public.metric_logs enable row level security;

-- Any authenticated user may read all logs (chart data, leaderboards).
create policy "metric_logs: authenticated users can read all"
  on public.metric_logs for select
  to authenticated
  using (true);

-- A user may only insert their own log entries.
create policy "metric_logs: users can insert own logs"
  on public.metric_logs for insert
  to authenticated
  with check (user_id = auth.uid());

-- A user may only update their own log entries.
create policy "metric_logs: users can update own logs"
  on public.metric_logs for update
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Seed: initial metrics catalogue (matches Features.md sections 3 and 5)
-- ---------------------------------------------------------------------------
insert into public.metrics_config (slug, display_name, unit, sort_order, xp_reward) values
  ('long_run',  'Long Run',  'mi',   'desc', 50),
  ('deadlift',  'Deadlift',  'lbs',  'desc', 75),
  ('top_speed', 'Top Speed', 'mph',  'desc', 60),
  ('weight',    'Weight',    'lbs',  'asc',  40),
  ('calories',  'Calories',  'kcal', 'desc', 30);
