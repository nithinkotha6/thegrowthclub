-- =============================================================================
-- MIGRATION: 0034_widen_profiles_pin_column.sql
-- QA-06 (Blocker): `profiles.pin` is declared `varchar(4)` in every migration
-- (0001_initial_schema.sql L42), sized for a raw 4-digit PIN. The SEC-04
-- security fix (see Findings_and_Recommendations.md) now stores a bcrypt
-- hash there instead (`hashPin()` in lib/security.ts) — bcrypt hashes are a
-- fixed 60 characters (`$2a$10$` + 22-char salt + 31-char hash). Inserting
-- or updating `pin` with a bcrypt hash against a `varchar(4)` column fails
-- outright with "value too long for type character varying(4)", breaking
-- signup (`signUpAction`) and admin PIN reset (`adminResetPin`) completely.
--
-- Widen the column to `text` (no length cap) so it can hold either a bcrypt
-- hash (current format) or a legacy plaintext 4-digit PIN (pre-SEC-04 rows
-- pending their lazy-migration rehash on next login).
-- =============================================================================

ALTER TABLE public.profiles ALTER COLUMN pin TYPE text;
