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
