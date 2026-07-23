-- =============================================================================
-- MIGRATION: 0044_create_backup_schema.sql
-- Database Resilience — Create backup schema & duplicate table structures.
-- Exact 1:1 mirror of public/Master schema tables for daily replication.
-- =============================================================================

-- 1. Create backup schema
CREATE SCHEMA IF NOT EXISTS "backup";

-- Grant permissions (same as public/Master)
GRANT USAGE ON SCHEMA "backup" TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA "backup" TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA "backup" TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA "backup" TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "backup"
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "backup"
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "backup"
  GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;

-- 2. Audit Trail Metadata Table
CREATE TABLE IF NOT EXISTS "backup".backup_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL, -- 'completed' | 'failed'
  error_message text,
  total_tables_copied integer,
  total_rows_copied bigint,
  created_at timestamptz DEFAULT now()
);

-- 3. Mirror Tables Creation

-- 3.1 groups
CREATE TABLE IF NOT EXISTS "backup".groups (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text        NOT NULL,
  invite_code text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- 3.2 profiles
CREATE TABLE IF NOT EXISTS "backup".profiles (
  id                uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name         text        NOT NULL,
  nickname          text,
  email             text,
  pin               text,
  avatar_url        text,
  telegram_user_id  text,
  total_xp          integer     NOT NULL DEFAULT 0,
  current_level     integer     NOT NULL DEFAULT 1,
  phone_number      text,
  streak_count      integer     NOT NULL DEFAULT 0,
  last_reset_month  text,
  group_id          uuid        REFERENCES "backup".groups (id) ON DELETE SET NULL,
  role              text        DEFAULT 'member',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 3.3 group_members
CREATE TABLE IF NOT EXISTS "backup".group_members (
  user_id   uuid        NOT NULL REFERENCES "backup".profiles (id) ON DELETE CASCADE,
  group_id  uuid        NOT NULL REFERENCES "backup".groups (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  role      text        NOT NULL DEFAULT 'member',
  PRIMARY KEY (user_id, group_id)
);

-- 3.4 metrics_config
CREATE TABLE IF NOT EXISTS "backup".metrics_config (
  id                    uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                  text        NOT NULL UNIQUE,
  display_name          text        NOT NULL,
  unit                  text        NOT NULL,
  sort_order            text        NOT NULL DEFAULT 'desc',
  xp_reward             integer     NOT NULL DEFAULT 25,
  is_hidden             boolean     DEFAULT false,
  requires_verification boolean     DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- 3.5 metric_definitions
CREATE TABLE IF NOT EXISTS "backup".metric_definitions (
  id                    uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id              uuid        REFERENCES "backup".groups (id) ON DELETE CASCADE,
  name                  text        NOT NULL,
  unit                  text        NOT NULL,
  xp_reward             integer     DEFAULT 25,
  requires_verification boolean     DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- 3.6 metric_logs
CREATE TABLE IF NOT EXISTS "backup".metric_logs (
  id                   uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              uuid        NOT NULL REFERENCES "backup".profiles (id) ON DELETE CASCADE,
  group_id             uuid        NOT NULL REFERENCES "backup".groups (id) ON DELETE CASCADE,
  metric_slug          text        NOT NULL,
  value                numeric     NOT NULL,
  unit                 text        NOT NULL DEFAULT '',
  status               text        NOT NULL DEFAULT 'pending',
  evidence_url         text,
  headline             text,
  metric_definition_id uuid        REFERENCES "backup".metric_definitions (id) ON DELETE SET NULL,
  logged_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

-- 3.7 log_votes
CREATE TABLE IF NOT EXISTS "backup".log_votes (
  id      uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  log_id  uuid        NOT NULL REFERENCES "backup".metric_logs (id) ON DELETE CASCADE,
  user_id uuid        NOT NULL REFERENCES "backup".profiles (id) ON DELETE CASCADE,
  cast_at timestamptz NOT NULL DEFAULT now()
);

-- 3.8 wearable_connections
CREATE TABLE IF NOT EXISTS "backup".wearable_connections (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        uuid        NOT NULL REFERENCES "backup".profiles (id) ON DELETE CASCADE,
  group_id       uuid        REFERENCES "backup".groups (id) ON DELETE CASCADE,
  provider       text        NOT NULL,
  access_token   text,
  refresh_token  text,
  expires_at     timestamptz,
  connected_at   timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz
);

-- 3.9 wearable_steps
CREATE TABLE IF NOT EXISTS "backup".wearable_steps (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid        NOT NULL REFERENCES "backup".profiles (id) ON DELETE CASCADE,
  group_id    uuid        REFERENCES "backup".groups (id) ON DELETE CASCADE,
  logged_date date        NOT NULL,
  step_count  integer     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3.10 wearable_sleep
CREATE TABLE IF NOT EXISTS "backup".wearable_sleep (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid        NOT NULL REFERENCES "backup".profiles (id) ON DELETE CASCADE,
  group_id      uuid        REFERENCES "backup".groups (id) ON DELETE CASCADE,
  logged_date   date        NOT NULL,
  sleep_minutes integer     NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 3.11 wearable_resting_hr
CREATE TABLE IF NOT EXISTS "backup".wearable_resting_hr (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid        NOT NULL REFERENCES "backup".profiles (id) ON DELETE CASCADE,
  group_id    uuid        REFERENCES "backup".groups (id) ON DELETE CASCADE,
  logged_date date        NOT NULL,
  bpm         integer     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3.12 memories
CREATE TABLE IF NOT EXISTS "backup".memories (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id   uuid        NOT NULL REFERENCES "backup".groups (id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES "backup".profiles (id) ON DELETE CASCADE,
  image_url  text        NOT NULL,
  caption    text,
  ai_caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- 3.13 memory_comments
CREATE TABLE IF NOT EXISTS "backup".memory_comments (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  memory_id  uuid        NOT NULL REFERENCES "backup".memories (id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES "backup".profiles (id) ON DELETE CASCADE,
  comment    text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.14 chat_history
CREATE TABLE IF NOT EXISTS "backup".chat_history (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id       uuid        NOT NULL REFERENCES "backup".groups (id) ON DELETE CASCADE,
  sender_id      uuid        REFERENCES "backup".profiles (id) ON DELETE SET NULL,
  role           text        NOT NULL,
  message        text        NOT NULL,
  prompt_version text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 3.15 system_settings
CREATE TABLE IF NOT EXISTS "backup".system_settings (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  key        text        NOT NULL UNIQUE,
  value      text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.16 member_lore
CREATE TABLE IF NOT EXISTS "backup".member_lore (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id   uuid        REFERENCES "backup".groups (id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES "backup".profiles (id) ON DELETE CASCADE,
  title      text        NOT NULL,
  lore       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.17 vocab_banks
CREATE TABLE IF NOT EXISTS "backup".vocab_banks (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id   uuid        REFERENCES "backup".groups (id) ON DELETE CASCADE,
  phrase     text        NOT NULL,
  context    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.18 bot_persistent_state
CREATE TABLE IF NOT EXISTS "backup".bot_persistent_state (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id        uuid        NOT NULL REFERENCES "backup".groups (id) ON DELETE CASCADE,
  persistent_mood text,
  target_user_id  uuid        REFERENCES "backup".profiles (id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 3.19 login_attempts
CREATE TABLE IF NOT EXISTS "backup".login_attempts (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id      uuid        REFERENCES "backup".groups (id) ON DELETE CASCADE,
  ip            text        NOT NULL,
  attempt_count integer     NOT NULL DEFAULT 1,
  last_attempt  timestamptz NOT NULL DEFAULT now()
);

-- 3.20 bot_moods
CREATE TABLE IF NOT EXISTS "backup".bot_moods (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  mood        text        NOT NULL UNIQUE,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3.21 daily_goals
CREATE TABLE IF NOT EXISTS "backup".daily_goals (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    uuid        NOT NULL REFERENCES "backup".groups (id) ON DELETE CASCADE,
  title       text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3.22 daily_goal_completions
CREATE TABLE IF NOT EXISTS "backup".daily_goal_completions (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id      uuid        NOT NULL REFERENCES "backup".groups (id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES "backup".profiles (id) ON DELETE CASCADE,
  daily_goal_id uuid        NOT NULL REFERENCES "backup".daily_goals (id) ON DELETE CASCADE,
  completed_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 3.23 challenge_history
CREATE TABLE IF NOT EXISTS "backup".challenge_history (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id       uuid        NOT NULL REFERENCES "backup".groups (id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES "backup".profiles (id) ON DELETE CASCADE,
  challenge_type text        NOT NULL,
  entry_date     date        NOT NULL,
  tier_after     text        NOT NULL,
  logged_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

-- 3.24 challenge_progression
CREATE TABLE IF NOT EXISTS "backup".challenge_progression (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id       uuid        NOT NULL REFERENCES "backup".groups (id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES "backup".profiles (id) ON DELETE CASCADE,
  challenge_type text        NOT NULL,
  current_tier   text        NOT NULL DEFAULT 'Bronze',
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 3.25 league_assignments
CREATE TABLE IF NOT EXISTS "backup".league_assignments (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    uuid        NOT NULL REFERENCES "backup".groups (id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES "backup".profiles (id) ON DELETE CASCADE,
  team_name   text        NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

-- 3.26 league_challenges
CREATE TABLE IF NOT EXISTS "backup".league_challenges (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    uuid        NOT NULL REFERENCES "backup".groups (id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3.27 league_matches
CREATE TABLE IF NOT EXISTS "backup".league_matches (
  id                  uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id            uuid        NOT NULL REFERENCES "backup".groups (id) ON DELETE CASCADE,
  league_challenge_id uuid        NOT NULL REFERENCES "backup".league_challenges (id) ON DELETE CASCADE,
  titans_score        integer     NOT NULL DEFAULT 0,
  rebels_score        integer     NOT NULL DEFAULT 0,
  winner_team         text,
  completed_at        timestamptz,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 3.28 league_match_logs
CREATE TABLE IF NOT EXISTS "backup".league_match_logs (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id   uuid        NOT NULL REFERENCES "backup".groups (id) ON DELETE CASCADE,
  match_id   uuid        NOT NULL REFERENCES "backup".league_matches (id) ON DELETE CASCADE,
  action     text        NOT NULL,
  actor_id   uuid        REFERENCES "backup".profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.29 push_subscriptions
CREATE TABLE IF NOT EXISTS "backup".push_subscriptions (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid        NOT NULL REFERENCES "backup".profiles (id) ON DELETE CASCADE,
  endpoint   text        NOT NULL,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.30 cron_execution_log
CREATE TABLE IF NOT EXISTS "backup".cron_execution_log (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  cron_name      text        NOT NULL,
  group_id       uuid        REFERENCES "backup".groups (id) ON DELETE CASCADE,
  execution_date date        NOT NULL,
  status         text        NOT NULL DEFAULT 'started',
  started_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz,
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
