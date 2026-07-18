# 07 — Data Modelling & Database Schema

> **Database**: Supabase (PostgreSQL 15+)
> **Schema Source**: [sql/consolidated_schema.sql](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/sql/consolidated_schema.sql)
> **Active Tables**: 14 distinct tables
> **Isolation Pattern**: Header-based Row Level Security (RLS)

---

## 1. Table Specifications & Fields

All tables reside within the `public` schema. All IDs are UUIDs.

### 1.1 Table: `groups`
Stores training group contexts.
- **PK**: `id` (uuid, default `uuid_generate_v4()`)
- **Constraints**: `invite_code` UNIQUE
- **Columns**:
  - `id` (uuid, PK)
  - `name` (text, NOT NULL)
  - `invite_code` (text, UNIQUE)
  - `whatsapp_instance_id` (text, NULL)
  - `whatsapp_token` (text, NULL)
  - `whatsapp_group_id` (text, NULL)
  - `created_at` (timestamptz, NOT NULL, default `now()`)

### 1.2 Table: `profiles`
Athlete profile records. Does NOT relate to `auth.users`.
- **PK**: `id` (uuid, default `uuid_generate_v4()`)
- **Constraints**:
  - `email` UNIQUE (`profiles_email_key`)
  - `(group_id, pin)` UNIQUE (`profiles_group_pin_key`)
- **Columns**:
  - `id` (uuid, PK)
  - `full_name` (text, NOT NULL) - must contain no spaces (validated by signup action)
  - `nickname` (text, NULL)
  - `email` (text, UNIQUE)
  - `pin` (varchar(4), NULL) - stored as plain text
  - `avatar_url` (text, NULL)
  - `telegram_user_id` (text, UNIQUE)
  - `total_xp` (integer, NOT NULL, default `0`)
  - `current_level` (integer, NOT NULL, default `1`)
  - `gender` (text, NULL)
  - `role` (text, default `'member'`)
  - `group_id` (uuid, FK → groups(id) ON DELETE CASCADE)
  - `is_active` (boolean, default `true`)
  - `created_at` (timestamptz, NOT NULL, default `now()`)

### 1.3 Table: `group_members`
Links profiles to groups.
- **PK**: Composite key `(user_id, group_id)`
- **Columns**:
  - `user_id` (uuid, FK → profiles(id) ON DELETE CASCADE)
  - `group_id` (uuid, FK → groups(id) ON DELETE CASCADE)
  - `role` (text, default `'member'`)
  - `joined_at` (timestamptz, NOT NULL, default `now()`)
- **Indexes**: `group_members_group_id_idx`

### 1.4 Table: `metrics_config`
System-wide metrics catalogue.
- **PK**: `id` (uuid, default `uuid_generate_v4()`)
- **Constraints**: `slug` UNIQUE
- **Columns**:
  - `id` (uuid, PK)
  - `slug` (text, UNIQUE, NOT NULL)
  - `display_name` (text, NOT NULL)
  - `unit` (text, NOT NULL)
  - `sort_order` (sort_order_enum, NOT NULL, default `'desc'`) - enum has values `'asc'`, `'desc'`
  - `xp_reward` (integer, NOT NULL, default `25`)
  - `created_at` (timestamptz, NOT NULL, default `now()`)

### 1.5 Table: `metric_definitions`
Group-scoped dynamic custom metrics.
- **PK**: `id` (uuid, default `uuid_generate_v4()`)
- **Columns**:
  - `id` (uuid, PK)
  - `name` (text, NOT NULL)
  - `unit` (text, NOT NULL)
  - `sort_direction` (text, CHECK `IN ('asc','desc')`)
  - `group_id` (uuid, FK → groups(id) ON DELETE CASCADE)
  - `is_hidden` (boolean, default `false`)
  - `created_at` (timestamptz, NOT NULL, default `now()`)
- **Indexes**: `metric_definitions_group_id_idx`

### 1.6 Table: `metric_logs`
Chronological training performance logs.
- **PK**: `id` (uuid, default `uuid_generate_v4()`)
- **Columns**:
  - `id` (uuid, PK)
  - `user_id` (uuid, FK → profiles(id) ON DELETE CASCADE)
  - `group_id` (uuid, FK → groups(id) ON DELETE CASCADE)
  - `metric_slug` (text, NOT NULL) - matches standard slug OR custom definition UUID
  - `value` (numeric, NOT NULL)
  - `unit` (text, NOT NULL, default `''`)
  - `status` (text, NOT NULL, default `'pending'`, CHECK `status IN ('pending','verified','rejected')`)
  - `evidence_url` (text, NULL)
  - `caption` (text, NULL)
  - `duration_seconds` (integer, NULL)
  - `headline` (text, NULL)
  - `logged_at` (timestamptz, NOT NULL, default `now()`)

### 1.7 Table: `log_votes`
Peer approvals for verification of pending logs.
- **PK**: `id` (uuid, default `uuid_generate_v4()`)
- **Constraints**: UNIQUE `(log_id, user_id)`
- **Columns**:
  - `id` (uuid, PK)
  - `log_id` (uuid, FK → metric_logs(id) ON DELETE CASCADE)
  - `user_id` (uuid, FK → profiles(id) ON DELETE CASCADE)
  - `cast_at` (timestamptz, default `now()`)
- **Indexes**: `log_votes_log_id_idx`

### 1.8 Table: `memories`
Shared community photo records.
- **PK**: `id` (uuid, default `uuid_generate_v4()`)
- **Columns**:
  - `id` (uuid, PK)
  - `group_id` (uuid, FK → groups(id) ON DELETE CASCADE)
  - `user_id` (uuid, FK → profiles(id) ON DELETE CASCADE)
  - `image_url` (text, NOT NULL)
  - `caption` (text, NULL)
  - `created_at` (timestamptz, default `now()`)
  - `deleted_at` (timestamptz, NULL) - soft delete support

### 1.9 Table: `memory_comments`
Comments on shared memories.
- **PK**: `id` (uuid, default `uuid_generate_v4()`)
- **Columns**:
  - `id` (uuid, PK)
  - `memory_id` (uuid, FK → memories(id) ON DELETE CASCADE)
  - `user_id` (uuid, FK → profiles(id) ON DELETE CASCADE)
  - `content` (text, NOT NULL)
  - `created_at` (timestamptz, default `now()`)

### 1.10 Table: `chat_history`
Fisky WhatsApp conversation window.
- **PK**: `id` (uuid, default `uuid_generate_v4()`)
- **Columns**:
  - `id` (uuid, PK)
  - `group_id` (uuid, FK → groups(id) ON DELETE CASCADE)
  - `role` (text, CHECK `role IN ('user', 'assistant', 'system')`)
  - `sender_name` (text, NULL)
  - `content` (text, NOT NULL)
  - `created_at` (timestamptz, default `now()`)

### 1.11 Table: `member_lore`
Athlete specific features for LLM generation context.
- **PK**: `user_id` (uuid, FK → profiles(id) ON DELETE CASCADE)
- **Columns**:
  - `user_id` (uuid, PK)
  - `stunts` (text[], default `'{}'`)
  - `good_habits` (text[], default `'{}'`)
  - `bad_habits` (text[], default `'{}'`)
  - `ego_trigger` (text, NULL)
  - `catchphrase` (text, NULL)
  - `nemesis_id` (uuid, FK → profiles(id) ON DELETE SET NULL)

### 1.12 Table: `vocab_banks`
Slang routing vocabulary database.
- **PK**: `id` (uuid, default `gen_random_uuid()`)
- **Constraints**: UNIQUE `(tone, target_gender)`
- **Columns**:
  - `id` (uuid, PK)
  - `tone` (text, NOT NULL)
  - `target_gender` (text, NOT NULL)
  - `words` (text[], NOT NULL)

### 1.13 Table: `wearable_connections`
Tokens authorizing fitbit/whoop/google API updates.
- **PK**: `id` (uuid, default `uuid_generate_v4()`)
- **Constraints**: UNIQUE `(user_id, provider)`
- **Columns**:
  - `id` (uuid, PK)
  - `user_id` (uuid, FK → profiles(id) ON DELETE CASCADE)
  - `provider` (text, NOT NULL)
  - `access_token` (text, NOT NULL)
  - `refresh_token` (text, NOT NULL)
  - `expires_at` (timestamptz, NOT NULL)
  - `last_synced_at` (timestamptz, NULL)
  - `backfill_completed` (boolean, default `false`)
  - `created_at` (timestamptz, default `now()`)

### 1.14 Tables: `wearable_steps`, `wearable_sleep`, `wearable_resting_hr`
Wearable metrics ledger tables. Share the same schema format:
- **PK**: `id` (uuid, default `uuid_generate_v4()`)
- **Constraints**:
  - UNIQUE `(connection_id, logged_date)`
  - UNIQUE `(user_id, logged_date)`
- **Columns**:
  - `id` (uuid, PK)
  - `connection_id` (uuid, FK → wearable_connections(id) ON DELETE CASCADE)
  - `user_id` (uuid, FK → profiles(id) ON DELETE CASCADE)
  - `logged_date` (date, NOT NULL)
  - `value` (integer for steps/hr, numeric for sleep, NOT NULL)
  - `source` (text, NULL)
  - `updated_at` (timestamptz, default `now()`)

---

## 2. Trigger Logic

### 2.1 Auto-Verify Trigger (`trg_auto_verify`)
- **Source**: AFTER INSERT on `log_votes`
- **Function**: `auto_verify_on_votes()`
- **Logic**:
  ```sql
  select count(*) into v_vote_count from public.log_votes where log_id = NEW.log_id;
  if v_vote_count >= 3 then
    update public.metric_logs set status = 'verified' where id = NEW.log_id and status = 'pending';
  end if;
  ```

(source: [sql/consolidated_schema.sql L140-163](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/sql/consolidated_schema.sql#L140-L163))

### 2.2 Award/Deduct XP Trigger (`trg_award_xp`)
- **Source**: AFTER INSERT OR UPDATE OR DELETE on `metric_logs`
- **Function**: `award_xp_on_verify()`
- **Logic**:
  - Awards XP if status changes from non-verified to `'verified'`.
  - Deducts XP if status changes from `'verified'` to non-verified.
  - XP amount is loaded from `metrics_config.xp_reward` based on matching `metric_slug`. Falls back to `25` XP if NULL (e.g. for custom metrics).
  - Updates target user's `total_xp` in `profiles`.
  - Updates target user's `current_level` using formula:
    `current_level = floor(1 + sqrt(greatest(0, total_xp + v_xp)::float / 500)) + 1`

(source: [sql/consolidated_schema.sql L177-241](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/sql/consolidated_schema.sql#L177-L241))

### 2.3 Unique PIN per Group Checks
- **Triggers**:
  - `trg_check_unique_pin_per_group` (AFTER INSERT OR UPDATE on `group_members`)
  - `trg_check_unique_pin_on_profile_update` (AFTER INSERT OR UPDATE OF pin on `profiles`)
- **Logic**: Throws SQL exception `This PIN is already taken in this group` if another member in the target group has a matching PIN value.

(source: [sql/consolidated_schema.sql L281-332](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/sql/consolidated_schema.sql#L281-L332))

---

## 3. Seed Catalog (`metrics_config`)

System standard metrics configured in database bootstrap:

| Slug | Display Name | Unit | Sort Order | XP Reward |
|---|---|---|---|---|
| `top_golf` | Top Golf Shot | Yards | `desc` | 50 |
| `deadlift` | Deadlift | lbs | `desc` | 75 |
| `top_speed` | Top Speed | mph | `desc` | 60 |
| `weight` | Weight | lbs | `asc` | 40 |
| `calories` | Calories | kcal | `desc` | 30 |
| `beers` | Beers | cans | `desc` | 10 |
| `squat` | Squat | lbs | `desc` | 60 |
| `bench_press` | Bench Press | lbs | `desc` | 60 |
| `push_ups` | Push-ups | reps | `desc` | 20 |
| `pull_ups` | Pull-ups | reps | `desc` | 25 |
| `cycling_distance` | Cycling Distance | mi | `desc` | 40 |
| `longest_swim` | Longest Swim | m | `desc` | 45 |
| `sleep` | Sleep | hrs | `desc` | 15 |
| `5k_time` | 5K Time | min | `asc` | 55 |

(source: [sql/consolidated_schema.sql L388-407](file:///c:/Users/nithi/Downloads/Beyond-Yesterday/beyond-yesterday-app/sql/consolidated_schema.sql#L388-L407))
