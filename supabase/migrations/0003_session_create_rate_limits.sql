-- Migration 0003: DB-backed fixed-window rate limits for GuestSession creation
-- (ADR-008). Counters are keyed by client identity per aligned epoch window;
-- the backend increments hit_count atomically (INSERT ... ON CONFLICT
-- DO UPDATE SET hit_count = hit_count + 1) so limits hold across instances.
--
-- Service-role / pg-only table: no FK, no RLS. Guests never read it; the
-- server-side API is the only writer (docs/ARCHITECTURE_DECISIONS.md ADR-008).

CREATE TABLE IF NOT EXISTS session_create_rate_limits (
    identity_key  TEXT        NOT NULL,
    window_start  TIMESTAMPTZ NOT NULL,
    hit_count     INTEGER     NOT NULL,
    PRIMARY KEY (identity_key, window_start)
);
