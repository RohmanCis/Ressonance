-- =============================================================================
-- QR GUEST PHOTO & VOICEBOOK — DATABASE SCHEMA (T004-R1)
-- Source of truth: docs/db_scheme.md v1.0 (approved).
-- This migration creates the relational schema exactly as documented and then
-- establishes the intended RLS / server-only access boundary:
--   * ROW LEVEL SECURITY is ENABLED on every table.
--   * No policies grant guest data to anon/authenticated roles.
--   * No public grants exist; guest access flows only through the server-side
--     service-role client (docs/ARCHITECTURE_DECISIONS.md ADR-003/004/011).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- -----------------------------------------------------------------------------
-- 1. admins
-- -----------------------------------------------------------------------------

CREATE TABLE admins (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT        NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- -----------------------------------------------------------------------------
-- 2. events
-- -----------------------------------------------------------------------------

CREATE TABLE events (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id   TEXT        NOT NULL,
    admin_id    UUID        NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
    title       TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE', 'CLOSED', 'ARCHIVED')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at   TIMESTAMPTZ,

    CONSTRAINT uq_events_public_id
        UNIQUE (public_id),

    CONSTRAINT ck_events_closed_at_consistency CHECK (
        (status = 'ACTIVE'   AND closed_at IS NULL)
        OR
        (status IN ('CLOSED', 'ARCHIVED') AND closed_at IS NOT NULL)
    )
);

CREATE INDEX idx_events_admin_id
    ON events (admin_id);

CREATE UNIQUE INDEX uq_events_one_active_per_admin
    ON events (admin_id)
    WHERE status = 'ACTIVE';


-- -----------------------------------------------------------------------------
-- 3. guest_sessions
-- -----------------------------------------------------------------------------

CREATE TABLE guest_sessions (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id       UUID        NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    session_token  TEXT        NOT NULL,
    guest_name     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_guest_sessions_token
        UNIQUE (session_token)
);

CREATE INDEX idx_guest_sessions_event_id
    ON guest_sessions (event_id);


-- -----------------------------------------------------------------------------
-- 4. photos
-- -----------------------------------------------------------------------------

CREATE TABLE photos (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_session_id  UUID        NOT NULL REFERENCES guest_sessions(id) ON DELETE RESTRICT,
    storage_key       TEXT        NOT NULL,
    file_size         INT         NOT NULL CHECK (file_size > 0),
    mime_type         TEXT        NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_photos_guest_session_id
    ON photos (guest_session_id);


-- -----------------------------------------------------------------------------
-- 5. voice_notes
-- -----------------------------------------------------------------------------

CREATE TABLE voice_notes (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_session_id  UUID        NOT NULL REFERENCES guest_sessions(id) ON DELETE RESTRICT,
    storage_key       TEXT        NOT NULL,
    file_size         INT         NOT NULL CHECK (file_size > 0),
    mime_type         TEXT        NOT NULL,
    duration_seconds  INT         NOT NULL CHECK (duration_seconds BETWEEN 5 AND 30),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_voice_notes_one_per_session
        UNIQUE (guest_session_id)
);


-- =============================================================================
-- RLS / SERVER-ONLY ACCESS BOUNDARY
-- Guests and admins never read guest data directly; all access is mediated by
-- the server-side API. Enable RLS with no grantable policies so the boundary
-- is enforced at the database even if a client key is ever misused.
-- =============================================================================

ALTER TABLE admins           ENABLE ROW LEVEL SECURITY;
ALTER TABLE events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_notes      ENABLE ROW LEVEL SECURITY;

-- Revoke any default grants on these tables from PUBLIC; the service-role
-- client (server-only) retains access via the postgres superuser bypass of RLS.
REVOKE ALL ON admins, events, guest_sessions, photos, voice_notes FROM PUBLIC;
REVOKE ALL ON admins, events, guest_sessions, photos, voice_notes FROM anon;
REVOKE ALL ON admins, events, guest_sessions, photos, voice_notes FROM authenticated;