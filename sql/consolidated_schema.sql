-- =============================================================================
-- CONSOLIDATED SCHEMA — The Growth Club Dashboard
-- Consolidated state of all schema tables, triggers, and RLS policies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- MIGRATION: 0001_initial_schema.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- CONSOLIDATED INITIAL SCHEMA — The Growth Club Dashboard
-- Consolidated state of all schema tables, triggers, and RLS policies.
-- =============================================================================

-- Ensure correct schema permissions (crucial if public schema was dropped/recreated)
grant usage on schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- TABLE: groups
-- Each group is an isolated batch (e.g. 'Texasbuds', 'Budbikers').
-- invite_code is used by signups to join the group.
-- ---------------------------------------------------------------------------
create table if not exists public.groups (
  id          uuid        primary key default uuid_generate_v4(),
  name        text        not null,
  invite_code text        unique,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- TABLE: profiles
-- One row per group member. id is a plain UUID — NOT tied to auth.users.
-- The kiosk model does NOT use Supabase Auth. Members are created by an admin
-- or via the self-signup flow on the landing page.
-- telegram_user_id links this profile to a Telegram account for bot ingestion.
-- total_xp and current_level are managed automatically by the XP trigger.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid        primary key default uuid_generate_v4(),
  full_name         text        not null,
  nickname          text,        -- User nickname for dashboard display
  email             text,        -- User email
  pin               varchar(4),  -- 4-character personal PIN for 1-step login
  avatar_url        text,
  telegram_user_id  text        unique,
  total_xp          integer     not null default 0,
  current_level     integer     not null default 1,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- TABLE: group_members
-- Many-to-many: one user can belong to multiple groups.
-- Composite PK prevents duplicate memberships.
-- ---------------------------------------------------------------------------
create table if not exists public.group_members (
  user_id   uuid        not null references public.profiles (id) on delete cascade,
  group_id  uuid        not null references public.groups   (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

create index if not exists group_members_group_id_idx on public.group_members (group_id);

-- ---------------------------------------------------------------------------
-- TABLE: metrics_config
-- Catalogue of all metric types. Adding a new metric = one INSERT here.
-- xp_reward is the XP awarded when a log of this type gets verified.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sort_order_enum') then
    create type sort_order_enum as enum ('asc', 'desc');
  end if;
end
$$;

create table if not exists public.metrics_config (
  id           uuid            primary key default uuid_generate_v4(),
  slug         text            not null unique,
  display_name text            not null,
  unit         text            not null,
  sort_order   sort_order_enum not null default 'desc',
  xp_reward    integer         not null default 25,
  created_at   timestamptz     not null default now()
);

-- ---------------------------------------------------------------------------
-- TABLE: metric_logs (v2 — slug-based, no metric_id FK)
-- Each row = one user logging one value for one metric in one group.
-- metric_slug is stored directly (no join required to insert).
-- status lifecycle: pending → verified (via 3 votes) or rejected.
-- ---------------------------------------------------------------------------
create table if not exists public.metric_logs (
  id           uuid        primary key default uuid_generate_v4(),
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  group_id     uuid        not null references public.groups   (id) on delete cascade,
  metric_slug  text        not null,
  value        numeric     not null,
  unit         text        not null default '',
  status       text        not null default 'pending'
                           check (status in ('pending', 'verified', 'rejected')),
  evidence_url text,
  logged_at    timestamptz not null default now()
);

create index if not exists metric_logs_group_id_idx    on public.metric_logs (group_id);
create index if not exists metric_logs_user_id_idx     on public.metric_logs (user_id);
create index if not exists metric_logs_metric_slug_idx on public.metric_logs (metric_slug);
create index if not exists metric_logs_status_idx      on public.metric_logs (status);
create index if not exists metric_logs_logged_at_idx   on public.metric_logs (logged_at desc);

-- ---------------------------------------------------------------------------
-- TABLE: log_votes — peer-review voting engine
-- UNIQUE(log_id, user_id) prevents double-voting at the DB level.
-- ---------------------------------------------------------------------------
create table if not exists public.log_votes (
  id      uuid        primary key default uuid_generate_v4(),
  log_id  uuid        not null references public.metric_logs (id) on delete cascade,
  user_id uuid        not null references public.profiles    (id) on delete cascade,
  cast_at timestamptz not null default now(),
  unique (log_id, user_id)
);

create index if not exists log_votes_log_id_idx on public.log_votes (log_id);

-- ---------------------------------------------------------------------------
-- TRIGGER: Auto-verify on 3 votes
-- Fires AFTER INSERT on log_votes.
-- When a log reaches 3 unique peer votes → flip status to 'verified'.
-- This then fires the XP trigger below.
-- ---------------------------------------------------------------------------
create or replace function public.auto_verify_on_votes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vote_count integer;
begin
  select count(*)
    into v_vote_count
    from public.log_votes
   where log_id = NEW.log_id;

  if v_vote_count >= 3 then
    update public.metric_logs
       set status = 'verified'
     where id = NEW.log_id
       and status = 'pending';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_auto_verify on public.log_votes;
create trigger trg_auto_verify
  after insert on public.log_votes
  for each row
  execute function public.auto_verify_on_votes();

-- ---------------------------------------------------------------------------
-- TRIGGER: Award XP when a log is verified
-- Fires AFTER UPDATE OF status on metric_logs.
-- Looks up xp_reward from metrics_config by slug; falls back to 25 XP.
-- Level formula: floor(1 + sqrt(total_xp / 500)) + 1
-- ---------------------------------------------------------------------------
create or replace function public.award_xp_on_verify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_xp integer := 25;
  v_should_award boolean := false;
  v_should_deduct boolean := false;
begin
  if TG_OP = 'INSERT' then
    if NEW.status = 'verified' then
      v_should_award := true;
    end if;
  elsif TG_OP = 'UPDATE' then
    if OLD.status <> 'verified' and NEW.status = 'verified' then
      v_should_award := true;
    elsif OLD.status = 'verified' and NEW.status <> 'verified' then
      v_should_deduct := true;
    end if;
  elsif TG_OP = 'DELETE' then
    if OLD.status = 'verified' then
      v_should_deduct := true;
    end if;
  end if;

  if v_should_award then
    v_xp := 25;
    select xp_reward
      into v_xp
      from public.metrics_config
     where slug = NEW.metric_slug
     limit 1;
    if v_xp is null then
      v_xp := 25;
    end if;
 
    update public.profiles
       set total_xp      = total_xp + v_xp,
           current_level = floor(1 + sqrt(greatest(0, total_xp + v_xp)::float / 500)) + 1
     where id = NEW.user_id;
  elsif v_should_deduct then
    v_xp := 25;
    select xp_reward
      into v_xp
      from public.metrics_config
     where slug = OLD.metric_slug
     limit 1;
    if v_xp is null then
      v_xp := 25;
    end if;
 
    update public.profiles
       set total_xp      = greatest(0, total_xp - v_xp),
           current_level = floor(1 + sqrt(greatest(0, total_xp - v_xp)::float / 500)) + 1
     where id = OLD.user_id;
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_award_xp on public.metric_logs;
create trigger trg_award_xp
  after insert or update or delete on public.metric_logs
  for each row
  execute function public.award_xp_on_verify();

-- ---------------------------------------------------------------------------
-- HELPER FUNCTION: shares_group_with_caller(target_user_id)
-- Returns true if the caller and target share at least one group.
-- Used as the core RLS isolation predicate.
-- ---------------------------------------------------------------------------
create or replace function public.shares_group_with_caller(target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.group_members a
      join public.group_members b on a.group_id = b.group_id
     where a.user_id = auth.uid()
       and b.user_id = target_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- UNIQUE CONSTRAINTS & VAL TRIGGER: enforce pin uniqueness per group_id
-- ---------------------------------------------------------------------------
-- Drop pin unique constraint if it exists on profiles
alter table public.profiles drop constraint if exists profiles_pin_key;

-- Add unique constraint on profiles email
alter table public.profiles drop constraint if exists profiles_email_key;
alter table public.profiles add constraint profiles_email_key unique (email);

-- Trigger function checking that a PIN is unique per group_id on group_members update/insert
create or replace function public.check_unique_pin_per_group()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
      from public.group_members gm1
      join public.profiles p1 on gm1.user_id = p1.id
      join public.group_members gm2 on gm1.group_id = gm2.group_id
     where gm2.user_id = new.user_id
       and p1.pin = (select pin from public.profiles where id = new.user_id)
       and p1.id <> new.user_id
  ) then
    raise exception 'This PIN is already taken in this group.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_unique_pin_per_group on public.group_members;
create trigger trg_check_unique_pin_per_group
  after insert or update on public.group_members
  for each row
  execute function public.check_unique_pin_per_group();

-- Trigger function checking that a PIN is unique per group_id when profiles.pin is changed
create or replace function public.check_unique_pin_on_profile_update()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
      from public.group_members gm1
      join public.profiles p1 on gm1.user_id = p1.id
      join public.group_members gm2 on gm1.group_id = gm2.group_id
     where gm1.user_id = new.id
       and p1.pin = new.pin
       and p1.id <> new.id
  ) then
    raise exception 'This PIN is already taken in this group.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_unique_pin_on_profile_update on public.profiles;
create trigger trg_check_unique_pin_on_profile_update
  after insert or update of pin on public.profiles
  for each row
  execute function public.check_unique_pin_on_profile_update();

-- ===========================================================================
-- ROW LEVEL SECURITY — Kiosk Model
-- ===========================================================================
-- Architecture: There is NO Supabase Auth session in this app.
-- The kiosk cookie contains { userId, groupId } — identity is enforced at
-- the application layer (Next.js Server Actions + middleware).
-- RLS here provides a secondary defence layer.
--
-- Read  → anon role (the Supabase anon key used by all server actions)
-- Write → anon role (server actions pass explicit user/group IDs from cookie)
-- Admin → service_role bypasses RLS for admin SQL operations
-- ===========================================================================

-- ── groups ──────────────────────────────────────────────────────────────────
alter table public.groups enable row level security;

-- Landing page needs to list all groups for the dropdown (no session exists).
drop policy if exists "groups: anon can read" on public.groups;
create policy "groups: anon can read"
  on public.groups for select
  to anon
  using (true);

-- ── group_members ────────────────────────────────────────────────────────────
alter table public.group_members enable row level security;
drop policy if exists "group_members: anon can read" on public.group_members;
drop policy if exists "group_members: anon can insert" on public.group_members;

-- ── profiles ─────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
drop policy if exists "profiles: anon can read" on public.profiles;
drop policy if exists "profiles: anon can insert" on public.profiles;

-- ── metrics_config ───────────────────────────────────────────────────────────
alter table public.metrics_config enable row level security;
drop policy if exists "metrics_config: anon can read" on public.metrics_config;
create policy "metrics_config: anon can read"
  on public.metrics_config for select
  to anon
  using (true);

-- ── metric_logs ──────────────────────────────────────────────────────────────
alter table public.metric_logs enable row level security;
drop policy if exists "metric_logs: anon can read" on public.metric_logs;
drop policy if exists "metric_logs: anon can insert" on public.metric_logs;

-- ── log_votes ────────────────────────────────────────────────────────────────
alter table public.log_votes enable row level security;
drop policy if exists "log_votes: anon can read" on public.log_votes;
drop policy if exists "log_votes: anon can insert" on public.log_votes;

-- ===========================================================================
-- SEED DATA — metrics catalogue
-- ===========================================================================
insert into public.metrics_config (slug, display_name, unit, sort_order, xp_reward) values
  ('top_golf',          'Top Golf Shot',     'Yards',   'desc', 50),
  ('deadlift',          'Deadlift',          'lbs',     'desc', 75),
  ('top_speed',         'Top Speed',         'mph',     'desc', 60),
  ('weight',            'Weight',            'lbs',     'asc',  40),
  ('calories',          'Calories',          'kcal',    'desc', 30),
  ('beers',             'Beers',             'cans',    'desc', 10),
  ('squat',             'Squat',             'lbs',     'desc', 60),
  ('bench_press',       'Bench Press',       'lbs',     'desc', 60),
  ('push_ups',          'Push-ups',          'reps',    'desc', 20),
  ('pull_ups',          'Pull-ups',          'reps',    'desc', 25),
  ('cycling_distance',  'Cycling Distance',  'mi',      'desc', 40),
  ('longest_swim',      'Longest Swim',      'm',       'desc', 45),
  ('sleep',             'Sleep',             'hrs',     'desc', 15),
  ('5k_time',           '5K Time',           'min',     'asc',  55)
on conflict (slug) do update set
  display_name = excluded.display_name,
  unit = excluded.unit,
  sort_order = excluded.sort_order,
  xp_reward = excluded.xp_reward;

-- Explicitly grant privileges to avoid RLS/permission issues on newly created tables
grant all privileges on all tables in schema public to postgres, anon, authenticated, service_role;
grant all privileges on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all privileges on all functions in schema public to postgres, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- MIGRATION: 0002_dynamic_metrics.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- DYNAMIC METRICS DEFINITIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.metric_definitions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  unit text NOT NULL,
  sort_direction text NOT NULL CHECK (sort_direction IN ('asc', 'desc')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.metric_definitions ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- MIGRATION: 0003_wearables_schema.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- WEARABLES SCHEMA & MULTI-TENANT CONSTRAINTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.wearable_connections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  provider text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS wearable_connections_user_id_idx ON public.wearable_connections (user_id);

CREATE TABLE IF NOT EXISTS public.wearable_steps (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id uuid NOT NULL REFERENCES public.wearable_connections (id) ON DELETE CASCADE,
  logged_date date NOT NULL,
  value integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, logged_date)
);

CREATE TABLE IF NOT EXISTS public.wearable_sleep (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id uuid NOT NULL REFERENCES public.wearable_connections (id) ON DELETE CASCADE,
  logged_date date NOT NULL,
  value numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, logged_date)
);

CREATE TABLE IF NOT EXISTS public.wearable_resting_hr (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id uuid NOT NULL REFERENCES public.wearable_connections (id) ON DELETE CASCADE,
  logged_date date NOT NULL,
  value integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, logged_date)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.wearable_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wearable_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wearable_sleep ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wearable_resting_hr ENABLE ROW LEVEL SECURITY;

-- Grant privileges to service_role and postgres roles
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role;


-- ---------------------------------------------------------------------------
-- MIGRATION: 0004_memories_and_caption_schema.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- MEMORIES, MEMORY COMMENTS, AND LOG CAPTIONS MIGRATION
-- =============================================================================

-- 1. Add caption and duration_seconds columns to metric_logs if they do not exist
ALTER TABLE public.metric_logs ADD COLUMN IF NOT EXISTS caption text;
ALTER TABLE public.metric_logs ADD COLUMN IF NOT EXISTS duration_seconds integer;

-- 2. Create memories table
CREATE TABLE IF NOT EXISTS public.memories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id uuid NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memories_group_id_idx ON public.memories (group_id);
CREATE INDEX IF NOT EXISTS memories_user_id_idx ON public.memories (user_id);

-- 3. Create memory_comments table
CREATE TABLE IF NOT EXISTS public.memory_comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  memory_id uuid NOT NULL REFERENCES public.memories (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_comments_memory_id_idx ON public.memory_comments (memory_id);
CREATE INDEX IF NOT EXISTS memory_comments_user_id_idx ON public.memory_comments (user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_comments ENABLE ROW LEVEL SECURITY;

-- Grant privileges to postgres and service_role
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role;


-- ---------------------------------------------------------------------------
-- MIGRATION: 0005_fix_trigger_null_xp.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- FIX TRIGGER NULL XP ASSIGNMENT ON DYNAMIC CUSTOM METRICS
-- =============================================================================

-- Correct award_xp_on_verify function logic to handle cases where slug does not exist in metrics_config
CREATE OR REPLACE FUNCTION public.award_xp_on_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_xp integer := 25;
  v_should_award boolean := false;
  v_should_deduct boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'verified' THEN
      v_should_award := true;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'verified' AND NEW.status = 'verified' THEN
      v_should_award := true;
    ELSIF OLD.status = 'verified' AND NEW.status <> 'verified' THEN
      v_should_deduct := true;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'verified' THEN
      v_should_deduct := true;
    END IF;
  END IF;

  IF v_should_award THEN
    v_xp := 25;
    SELECT xp_reward
      INTO v_xp
      FROM public.metrics_config
     WHERE slug = NEW.metric_slug
     LIMIT 1;
    IF v_xp IS NULL THEN
      v_xp := 25;
    END IF;

    UPDATE public.profiles
       SET total_xp      = total_xp + v_xp,
           current_level = floor(1 + sqrt(greatest(0, total_xp + v_xp)::float / 500)) + 1
     WHERE id = NEW.user_id;
  ELSIF v_should_deduct THEN
    v_xp := 25;
    SELECT xp_reward
      INTO v_xp
      FROM public.metrics_config
     WHERE slug = OLD.metric_slug
     LIMIT 1;
    IF v_xp IS NULL THEN
      v_xp := 25;
    END IF;

    UPDATE public.profiles
       SET total_xp      = greatest(0, total_xp - v_xp),
           current_level = floor(1 + sqrt(greatest(0, total_xp - v_xp)::float / 500)) + 1
     WHERE id = OLD.user_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- MIGRATION: 0006_add_headline_to_metric_logs.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- ADD HEADLINE COLUMN TO METRIC LOGS TABLE
-- =============================================================================

ALTER TABLE public.metric_logs ADD COLUMN IF NOT EXISTS headline text;


-- ---------------------------------------------------------------------------
-- MIGRATION: 0007_add_deleted_at_to_memories.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- ADD DELETED_AT COLUMN TO MEMORIES TABLE FOR SOFT-DELETE SUPPORT
-- =============================================================================

ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;


-- ---------------------------------------------------------------------------
-- MIGRATION: 0008_database_hardening_and_rls.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- DATABASE HARDENING, INDEX OPTIMIZATIONS, & GROUP-SCOPED RLS POLICIES
-- =============================================================================

-- 1. Add whatsapp configuration columns to public.groups table
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS whatsapp_instance_id text DEFAULT NULL;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS whatsapp_token text DEFAULT NULL;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS whatsapp_group_id text DEFAULT NULL;

-- 2. Add group_id to metric_definitions table
ALTER TABLE public.metric_definitions ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS metric_definitions_group_id_idx ON public.metric_definitions (group_id);

-- 3. Create helper index on memories for optimization
CREATE INDEX IF NOT EXISTS memories_created_at_idx ON public.memories (created_at DESC);
CREATE INDEX IF NOT EXISTS memories_deleted_at_idx ON public.memories (deleted_at);

-- 4. Enable Row Level Security (RLS) on all dynamic tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_definitions ENABLE ROW LEVEL SECURITY;

-- 5. Drop any existing policies to avoid duplicates
DROP POLICY IF EXISTS profiles_group_isolation ON public.profiles;
DROP POLICY IF EXISTS group_members_group_isolation ON public.group_members;
DROP POLICY IF EXISTS metric_logs_group_isolation ON public.metric_logs;
DROP POLICY IF EXISTS log_votes_group_isolation ON public.log_votes;
DROP POLICY IF EXISTS memories_group_isolation ON public.memories;
DROP POLICY IF EXISTS memory_comments_group_isolation ON public.memory_comments;
DROP POLICY IF EXISTS metric_definitions_group_isolation ON public.metric_definitions;

-- 6. Re-create secure Group-Scoped RLS Policies using PostgREST Request Headers
CREATE POLICY profiles_group_isolation ON public.profiles
  FOR ALL
  TO anon, authenticated
  USING (
    id IN (
      SELECT user_id FROM public.group_members
      WHERE group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid
    )
  );

CREATE POLICY group_members_group_isolation ON public.group_members
  FOR ALL
  TO anon, authenticated
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);

CREATE POLICY metric_logs_group_isolation ON public.metric_logs
  FOR ALL
  TO anon, authenticated
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);

CREATE POLICY log_votes_group_isolation ON public.log_votes
  FOR ALL
  TO anon, authenticated
  USING (
    log_id IN (
      SELECT id FROM public.metric_logs
      WHERE group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid
    )
  )
  WITH CHECK (
    log_id IN (
      SELECT id FROM public.metric_logs
      WHERE group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid
    )
  );

CREATE POLICY memories_group_isolation ON public.memories
  FOR ALL
  TO anon, authenticated
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);

CREATE POLICY memory_comments_group_isolation ON public.memory_comments
  FOR ALL
  TO anon, authenticated
  USING (
    memory_id IN (
      SELECT id FROM public.memories
      WHERE group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid
    )
  )
  WITH CHECK (
    memory_id IN (
      SELECT id FROM public.memories
      WHERE group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid
    )
  );

CREATE POLICY metric_definitions_group_isolation ON public.metric_definitions
  FOR ALL
  TO anon, authenticated
  USING (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid)
  WITH CHECK (group_id = nullif(current_setting('request.headers', true)::json->>'x-group-id', '')::uuid);

-- Ensure all privileges are granted to postgres, authenticated, anon, and service_role
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- MIGRATION: 0009_chat_history.sql
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- TABLE: chat_history
-- Multi-turn conversational memory for the WhatsApp bot (Fisky).
-- Scoped per group to prevent cross-group chat leakage.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_history (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    uuid        NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  sender_name text,
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS and add basic select policy
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access on chat_history"
  ON public.chat_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create performance indexes
CREATE INDEX IF NOT EXISTS chat_history_group_id_idx ON public.chat_history (group_id);
CREATE INDEX IF NOT EXISTS chat_history_created_idx ON public.chat_history (created_at desc);


-- ---------------------------------------------------------------------------
-- MIGRATION: 0010_profiles_phone_number.sql
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- ALTER TABLE: profiles
-- Add phone_number and gender fields.
-- Enforce phone_number as the unique natural key across the platform.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text;

-- Backfill existing rows with dummy phone numbers based on ID to satisfy NOT NULL & UNIQUE
UPDATE public.profiles 
   SET phone_number = '+1999555' || substring(id::text from 1 for 8)
 WHERE phone_number IS NULL;

-- Enforce constraints
ALTER TABLE public.profiles ALTER COLUMN phone_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_phone_number_unique'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_number_unique UNIQUE (phone_number);
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- MIGRATION: 0011_admin_features.sql
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- ALTER TABLE: group_members
-- Add role column to group_members table to support admin controls.
-- ---------------------------------------------------------------------------
ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS role text DEFAULT 'member';

-- ---------------------------------------------------------------------------
-- TABLE: system_settings
-- Global configuration parameters (e.g. AI bot kill switch).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Enable RLS and grant access
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access on system_settings"
  ON public.system_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow select to anonymous users
CREATE POLICY "Allow select on system_settings to anonymous"
  ON public.system_settings
  FOR SELECT
  TO anon
  USING (true);


-- ---------------------------------------------------------------------------
-- MIGRATION: 0012_system_settings_fix.sql
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- TABLE: system_settings RLS Isolation & Access
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Drop existings to prevent duplication errors
DROP POLICY IF EXISTS "Allow read/write for authenticated users" ON public.system_settings;
DROP POLICY IF EXISTS "Allow select on system_settings to anonymous" ON public.system_settings;
DROP POLICY IF EXISTS "Allow service role full access on system_settings" ON public.system_settings;

-- Create policies
CREATE POLICY "Allow service role full access on system_settings"
  ON public.system_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow select on system_settings to anonymous"
  ON public.system_settings
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow read/write for authenticated users"
  ON public.system_settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ---------------------------------------------------------------------------
-- EMERGENCY SCHEMA CLEANUP & SYNCHRONIZATION
-- ---------------------------------------------------------------------------
-- 1. Drop the excised phone_number column completely so INSERTs stop failing
ALTER TABLE public.profiles DROP COLUMN IF EXISTS phone_number;

-- 2. Ensure PINs are only unique WITHIN a group, not globally across the entire database
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pin_key;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_group_pin_key;

-- Ensure group_id column exists on profiles before adding the unique constraint
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_group_pin_key UNIQUE (group_id, pin);

-- 3. Verify standard required columns have correct defaults
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'member';

