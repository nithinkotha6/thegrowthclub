-- =============================================================================
-- Migration: 0004_personal_pins.sql
-- Purpose:   Migrate Kiosk Auth from Shared Group PINs to Personal User PINs.
--            Remove invite_code (PIN) from groups table and add personal pin
--            to profiles table.
-- =============================================================================

-- Remove invite_code from groups table
alter table public.groups drop column if exists invite_code;

-- Add 4-character personal pin to profiles table
alter table public.profiles add column if not exists pin varchar(4);

-- Explicitly regrant permissions on altered tables to ensure roles have access
grant all privileges on all tables in schema public to postgres, anon, authenticated, service_role;
