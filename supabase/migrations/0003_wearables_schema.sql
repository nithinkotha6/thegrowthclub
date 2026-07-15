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
