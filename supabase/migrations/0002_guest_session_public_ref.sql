-- Migration 0002: add guest_sessions.public_ref — opaque, non-credential
-- grouping identifier for admin submission review (API Contract §4 Submission).
--
-- public_ref is separate from the PK (id) and the credential (session_token).
-- It is generated at session creation and exposed in admin submission listings
-- so the dashboard can group media by GuestSession without leaking the DB PK
-- or the session credential. Mirrors the events.public_id / events.id split.

-- Supabase installs pgcrypto in the `extensions` schema, so the unqualified
-- gen_random_bytes(integer) call fails with SQLSTATE 42883 when this migration
-- is replayed through the CLI/pooler (search_path does not include extensions).
-- Listing public first keeps plain-Postgres layouts (pgcrypto in public) working.
SET search_path = public, extensions;

ALTER TABLE guest_sessions
    ADD COLUMN IF NOT EXISTS public_ref TEXT;

-- Backfill existing rows with a generated opaque value.
UPDATE guest_sessions
   SET public_ref = encode(gen_random_bytes(16), 'base64')
 WHERE public_ref IS NULL;

ALTER TABLE guest_sessions
    ALTER COLUMN public_ref SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_guest_sessions_public_ref
    ON guest_sessions (public_ref);

-- Restore the session default so later migrations on the same connection
-- are unaffected by this file's search_path override.
RESET search_path;
