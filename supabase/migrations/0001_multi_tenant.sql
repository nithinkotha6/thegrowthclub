-- =============================================================================
-- Migration: 0001_multi_tenant.sql
-- Purpose:   Groups (batches), multi-tenant profiles, strict group-scoped RLS.
-- Applies on top of: 0000_initial_schema.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: groups
-- Each group is an isolated batch (e.g. 'Budbikers', '5monkeys').
-- Members join via invite_code at signup.
-- ---------------------------------------------------------------------------
create table public.groups (
  id          uuid        primary key default uuid_generate_v4(),
  name        text        not null,
  invite_code text        not null unique,
  created_at  timestamptz not null default now()
);

-- All authenticated users may read group names (needed for signup lookup).
alter table public.groups enable row level security;

create policy "groups: authenticated users can read"
  on public.groups for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- ALTER: profiles
-- Add group_id FK, full_name, phone_number.
-- Rename total_xp → xp to match new spec.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column group_id      uuid references public.groups (id),
  add column full_name     text,
  add column phone_number  text unique;

alter table public.profiles
  rename column total_xp to xp;

-- ---------------------------------------------------------------------------
-- UPDATE TRIGGER: award_xp_on_verification
-- Rewrite to reference renamed column `xp` (was `total_xp`).
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
  if (OLD.status <> 'verified' and NEW.status = 'verified') then
    select xp_reward
      into v_xp_reward
      from public.metrics_config
     where id = NEW.metric_id;

    update public.profiles
       set xp            = xp + v_xp_reward,
           current_level = floor(1 + sqrt((xp + v_xp_reward)::float / 500)) + 1
     where id = NEW.user_id;
  end if;
  return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: Replace permissive read-all policies with group-scoped policies
-- ---------------------------------------------------------------------------

-- profiles: drop old read-all, add group-scoped read
drop policy if exists "profiles: authenticated users can read all" on public.profiles;

create policy "profiles: group members can read"
  on public.profiles for select
  to authenticated
  using (
    group_id = (
      select group_id from public.profiles where id = auth.uid()
    )
  );

-- metric_logs: drop old read-all, add group-scoped read
drop policy if exists "metric_logs: authenticated users can read all" on public.metric_logs;

create policy "metric_logs: group members can read"
  on public.metric_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.id = metric_logs.user_id
         and p.group_id = (
           select group_id from public.profiles where id = auth.uid()
         )
    )
  );

-- ---------------------------------------------------------------------------
-- Seed: two starter groups matching the spec examples
-- ---------------------------------------------------------------------------
insert into public.groups (name, invite_code) values
  ('Budbikers', 'BUDBIKE2025'),
  ('5monkeys',  'MONKEY2025');
