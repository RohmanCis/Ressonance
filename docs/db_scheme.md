# Database Schema — QR Guest Photo & Voicebook

Version: 1.0  
Status: Approved schema design  
Source of Truth: PRD v1.3 + Domain Model + ERD (all locked)

---

## Design Decisions Captured Here

| Decision | Value |
|---|---|
| PK type | UUID |
| Timestamp type | TIMESTAMPTZ |
| Event status type | TEXT + CHECK constraint |
| Cascade behavior | ON DELETE RESTRICT (all FK) |
| Max 1 ACTIVE per admin | Partial unique index |
| Max 1 voice note per session | UNIQUE constraint on guest_session_id |
| Max 5 photos per session | Backend logic + transaction (not DB-enforced) |
| closed_at consistency | CHECK constraint: NULL when ACTIVE, NOT NULL when CLOSED/ARCHIVED |
| Media event_id | Not stored — accessed via GuestSession (no denormalization) |
| session_token | Separate from PK — credential vs identity separation |
| public_ref | Opaque non-credential GuestSession grouping identifier; separate from PK and `session_token`; exposed in admin submission listings |
| Session expiration | `expires_at` column on `guest_sessions`; 30-minute lifetime from creation |
| original_filename | Dropped — no business value for browser-captured media |

---

## DDL

```sql
-- =============================================================================
-- QR GUEST PHOTO & VOICEBOOK — DATABASE SCHEMA
-- Version: 1.0
-- =============================================================================

-- Enable UUID generation
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

    -- closed_at must be NULL when ACTIVE, NOT NULL when CLOSED or ARCHIVED
    CONSTRAINT ck_events_closed_at_consistency CHECK (
        (status = 'ACTIVE'   AND closed_at IS NULL)
        OR
        (status IN ('CLOSED', 'ARCHIVED') AND closed_at IS NOT NULL)
    )
);

-- Public URL lookup: served by the uq_events_public_id UNIQUE constraint
-- (no standalone index needed — the constraint creates one on public_id)

-- Admin event list
CREATE INDEX idx_events_admin_id
    ON events (admin_id);

-- Enforce max 1 ACTIVE event per admin at the DB level
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
    public_ref     TEXT        NOT NULL,
    guest_name     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),

    CONSTRAINT uq_guest_sessions_token
        UNIQUE (session_token),
    CONSTRAINT uq_guest_sessions_public_ref
        UNIQUE (public_ref)
);

-- Cookie credential lookup (hot path — must be fast): served by the
-- uq_guest_sessions_token UNIQUE constraint, which creates an index on
-- session_token. It stores the SHA-256 digest of the HttpOnly cookie
-- credential (ADR-004 / Technical Design §5); the raw credential stays
-- separate from the PK and is never stored or exposed.

-- public_ref: opaque, non-credential grouping identifier generated at session
-- creation. Exposed in admin submission listings (API Contract §4 Submission)
-- so media can be grouped by GuestSession without leaking the DB PK or the
-- session credential. Mirrors the events.public_id / events.id split.

-- Session expiration: expires_at is set to created_at + 30 minutes at
-- session creation. The backend rejects all submissions from an expired
-- session (expires_at <= NOW()) and returns 401 SESSION_EXPIRED.

-- Dashboard queries: event → sessions
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

-- Count photos per session (used in max-5 enforcement query)
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

    -- Enforce max 1 voice note per session at the DB level
    CONSTRAINT uq_voice_notes_one_per_session
        UNIQUE (guest_session_id)
);
```

---

## Constraint Summary

| Table | Constraint | Type | Enforced By |
|---|---|---|---|
| `admins` | email unique | UNIQUE | DB |
| `events` | public_id unique | UNIQUE | DB |
| `events` | max 1 ACTIVE per admin | Partial UNIQUE index | DB |
| `events` | status values | CHECK | DB |
| `events` | closed_at consistency | CHECK | DB |
| `guest_sessions` | session_token unique | UNIQUE | DB |
| `guest_sessions` | public_ref unique | UNIQUE | DB |
| `voice_notes` | max 1 per session | UNIQUE | DB |
| `photos` | max 5 per session | Count check in transaction | Backend |
| All FK | no cascade delete | ON DELETE RESTRICT | DB |
| `photos.file_size` | positive | CHECK | DB |
| `voice_notes.file_size` | positive | CHECK | DB |
| `voice_notes.duration_seconds` | 5–30 | CHECK | DB |

---

## Index Summary

| Index | Table | Columns | Type | Purpose |
|---|---|---|---|---|
| PK | all | `id` | UNIQUE | Default |
| `uq_events_public_id` | `events` | `public_id` | UNIQUE (via constraint) | URL/QR lookup |
| `uq_events_one_active_per_admin` | `events` | `admin_id` WHERE `status = 'ACTIVE'` | Partial UNIQUE | 1-active constraint |
| `idx_events_admin_id` | `events` | `admin_id` | INDEX | List admin's events |
| `uq_guest_sessions_token` | `guest_sessions` | `session_token` | UNIQUE (via constraint) | Cookie lookup (hot path) |
| `uq_guest_sessions_public_ref` | `guest_sessions` | `public_ref` | UNIQUE (via constraint) | Admin grouping key (opaque, non-credential) |
| `idx_guest_sessions_event_id` | `guest_sessions` | `event_id` | INDEX | Dashboard: event → sessions |
| `idx_photos_guest_session_id` | `photos` | `guest_session_id` | INDEX | Photo count per session |
| `uq_voice_notes_one_per_session` | `voice_notes` | `guest_session_id` | UNIQUE | Max 1 voice note |

---

## Transaction Boundary: Max 5 Photos

`UNIQUE` constraint tidak bisa mengekspresikan "maksimal N rows". Enforcement dilakukan di backend dalam satu transaksi. Urutan di bawah mengambil lock pada baris `GuestSession` (bukan aggregate — PostgreSQL tidak mengizinkan row lock pada `SELECT COUNT(*)`), bukan seluruh tabel.

```sql
-- Pseudocode — diimplementasikan di backend layer
BEGIN;
  -- 1. Kunci baris GuestSession (session lock) untuk serialisasi request
  SELECT id FROM guest_sessions
  WHERE id = $session_id
  FOR UPDATE;

  -- 2. Hitung foto yang sudah diterima untuk session ini
  SELECT COUNT(*)
  FROM photos
  WHERE guest_session_id = $session_id;

  -- 3. Jika count >= 5: ROLLBACK, return 409 PHOTO_LIMIT_REACHED
  -- 4. Jika count < 5: upload object ke object storage (backend-mediated)

  -- 5. INSERT metadata foto (hanya setelah upload object berhasil)
  INSERT INTO photos (guest_session_id, storage_key, file_size, mime_type)
  VALUES ($session_id, $key, $size, $mime);

COMMIT;
```

Object storage bukan bagian dari transaksi database; backend meng-upload object (Supabase Storage privat) lalu insert metadata di dalam transaksi yang sama. Jika upload gagal: rollback, tidak ada metadata, return `502 MEDIA_PERSISTENCE_FAILED`. Jika insert/commit gagal setelah upload sukses: rollback lalu hapus object baru, return `502 MEDIA_PERSISTENCE_FAILED`. Periode transaksi DB menahan lock selama upload berlangsung — ini trade-off MVP yang disetujui (Technical Design §6, §8), bukan reservation, queue, atau distributed transaction.

`FOR UPDATE` pada baris GuestSession mencegah dua request dari session yang sama menghasilkan count yang sama lalu commit melebihi 5.

---

## Event Lifecycle: closed_at Behavior

```
CREATE → status = 'ACTIVE',   closed_at = NULL
CLOSE  → status = 'CLOSED',   closed_at = NOW()
ARCHIVE→ status = 'ARCHIVED', closed_at = (tetap timestamp dari CLOSE)
```

`ARCHIVED` tidak punya `archived_at` tersendiri untuk MVP — state ini hanya historical marker, tidak punya behavior aktif.

---

## What Is Not in This Schema

| Item | Reason |
|---|---|
| `event_id` di `photos` / `voice_notes` | Tidak denormalisasi — akses via `guest_sessions.event_id` |
| `original_filename` | Tidak ada business value untuk media dari kamera browser |
| `archived_at` | `ARCHIVED` belum punya behavior aktif di MVP |
| Media retention / media `expires_at` | Out of MVP scope |
| Soft delete (`deleted_at`) | Tidak ada FR delete di MVP |

---

## Open Technical Decisions Affecting This Schema

Item berikut akan mempengaruhi schema tapi belum dapat dikunci sampai technical design selesai:

- **storage_key format** — konvensi path di object storage (contoh: `events/{event_id}/photos/{uuid}.jpg`) ditentukan saat API design
- **public_id format** — UUID, nanoid, atau short random string; panjang dan charset ditentukan saat technical design

---

## Next Step

```
Database Schema v1.0 (this document) — Approved
API Contract — LOCKED (docs/API_CONTRACT.md)
   |
   v
Scaffold minimal Next.js server-side API boundary + Supabase
integration, implementasi dapat dimulai (approval staging telah diberikan)
```

API Contract (status: LOCKED) mendefinisikan endpoint, request/response shape, HTTP status codes, dan error format — semuanya implementasi dari PRD v1.3, bukan interpretasi baru. Approval staging telah diberikan; implementasi dapat dimulai.
