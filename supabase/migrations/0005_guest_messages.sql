-- Migration 0005: guest_messages — standalone guest text message (Opsi B)
--
-- A guest may submit one short text message ("pesan & kesan") per
-- GuestSession, independent of the voice note. The message is NOT attached to
-- voice_notes and is never required; a guest may submit a message without
-- recording audio, and vice versa.
--
-- Constraints mirror the voice_notes one-per-session pattern:
--   * 1–280 characters, enforced by a DB CHECK on char_length
--   * max 1 per GuestSession, enforced by a UNIQUE constraint
--   * ON DELETE RESTRICT, the same as every other FK in this schema
--
-- The RLS / server-only access boundary from migration 0001 is applied to the
-- new table as well: RLS enabled with no policies, default grants revoked.
-- Guest access flows only through the server-side service-role client /
-- direct pg connection.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS guest_messages (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_session_id  UUID        NOT NULL REFERENCES guest_sessions(id) ON DELETE RESTRICT,
    message_text      TEXT        NOT NULL
                                  CHECK (char_length(message_text) BETWEEN 1 AND 280),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_guest_messages_one_per_session
        UNIQUE (guest_session_id)
);

CREATE INDEX IF NOT EXISTS idx_guest_messages_guest_session_id
    ON guest_messages (guest_session_id);

ALTER TABLE guest_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON guest_messages FROM PUBLIC;
REVOKE ALL ON guest_messages FROM anon;
REVOKE ALL ON guest_messages FROM authenticated;
