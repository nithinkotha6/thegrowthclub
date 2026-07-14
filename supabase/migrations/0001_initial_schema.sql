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
begin
  if OLD.status <> 'verified' and NEW.status = 'verified' then

    select coalesce(xp_reward, 25)
      into v_xp
      from public.metrics_config
     where slug = NEW.metric_slug
     limit 1;

    update public.profiles
       set total_xp      = total_xp + v_xp,
           current_level = floor(1 + sqrt((total_xp + v_xp)::float / 500)) + 1
     where id = NEW.user_id;

  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_award_xp on public.metric_logs;
create trigger trg_award_xp
  after update of status on public.metric_logs
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

-- Server actions need to read group membership to resolve the group for a user.
drop policy if exists "group_members: anon can read" on public.group_members;
create policy "group_members: anon can read"
  on public.group_members for select
  to anon
  using (true);

-- Allow anonymous users to insert group membership during signup
drop policy if exists "group_members: anon can insert" on public.group_members;
create policy "group_members: anon can insert"
  on public.group_members for insert
  to anon
  with check (true);

-- ── profiles ─────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- verifyPinAction reads profiles to show member cards on the landing page.
-- getDashboardData reads profiles to show names on charts and the feed.
drop policy if exists "profiles: anon can read" on public.profiles;
create policy "profiles: anon can read"
  on public.profiles for select
  to anon
  using (true);

-- Allow anonymous users to insert profiles during signup
drop policy if exists "profiles: anon can insert" on public.profiles;
create policy "profiles: anon can insert"
  on public.profiles for insert
  to anon
  with check (true);

-- ── metrics_config ───────────────────────────────────────────────────────────
alter table public.metrics_config enable row level security;

drop policy if exists "metrics_config: anon can read" on public.metrics_config;
create policy "metrics_config: anon can read"
  on public.metrics_config for select
  to anon
  using (true);

-- ── metric_logs ──────────────────────────────────────────────────────────────
alter table public.metric_logs enable row level security;

-- Dashboard reads logs; server actions insert logs via anon key + cookie session.
drop policy if exists "metric_logs: anon can read" on public.metric_logs;
create policy "metric_logs: anon can read"
  on public.metric_logs for select
  to anon
  using (true);

drop policy if exists "metric_logs: anon can insert" on public.metric_logs;
create policy "metric_logs: anon can insert"
  on public.metric_logs for insert
  to anon
  with check (true);

-- ── log_votes ────────────────────────────────────────────────────────────────
alter table public.log_votes enable row level security;

drop policy if exists "log_votes: anon can read" on public.log_votes;
create policy "log_votes: anon can read"
  on public.log_votes for select
  to anon
  using (true);

drop policy if exists "log_votes: anon can insert" on public.log_votes;
create policy "log_votes: anon can insert"
  on public.log_votes for insert
  to anon
  with check (true);

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
