# Technical Design — QR Guest Photo & Voicebook

UI/design system: see DESIGN.md in project root.

Status: LOCKED  
Scope: MVP  
Sources: `docs/PRD.md` v1.3, `docs/db_scheme.md` v1.0, domain model in PRD §14

## 1. Design stance

Use one same-origin Next.js application with TypeScript, shadcn/ui, Tailwind CSS, Supabase PostgreSQL, Supabase Storage, and Next.js server-side API routes. Keep the browser thin. Keep all limits, authorization, validation, and persistence decisions on the backend.

The approved stack is recorded in docs/ARCHITECTURE_DECISIONS.md and implemented; production deployment on Vercel is the remaining step.

## 2. Recommended stack

- Runtime/language: Node.js LTS + TypeScript.
- Application: Next.js with TypeScript, shadcn/ui, Tailwind CSS, and Next.js server-side API routes.
- Database: Supabase PostgreSQL, using the locked relational model and constraints.
- Relational access: Supabase server-side client or direct PostgreSQL access where transaction/locking control requires it; no ORM.
- Object storage: Supabase Storage private bucket.
- Admin authentication: Supabase Auth. Guest authentication remains a custom GuestSession with an opaque HttpOnly cookie, separate from the database primary key.
- Rate limiting: session creation uses a DB-backed fixed-window limiter (migration 0003) that is authoritative across instances; photo and voice-note submission use per-instance in-memory fixed-window limiters, accepted for Vercel serverless 2026-08-15 (ADR-008). Exact limits and windows remain env-configurable.
- Audio inspection: server-side `ffprobe`/FFmpeg inspection, synchronously before persistence.
- Deployment: Vercel (same-origin); scheduled media-retention cleanup via Vercel Cron with CRON_SECRET bearer authentication.

Why: one language, one deployable application, same-origin cookies, no CORS in production, direct backend-to-storage flow, and no premature service split.

## 3. Architecture

```text
Guest/Admin Browser
        |
        | HTTPS, same origin, HttpOnly cookies
        v
Web application (UI + backend API)
        |             |              |
        |             |              +--> rate-limit state
        |             +-----------------> Supabase PostgreSQL
        +-------------------------------> Supabase Storage (private bucket)
                         |
                         +--> short-lived signed URLs for authorized admin media
```

### Components

1. **Guest UI** — event lookup, optional name, explicit Start, camera/photo flow, recording flow, upload status, errors, remaining limits.
2. **Admin UI** — sign-in, event management, QR URL, chronological media timeline, guest-name search, preview/playback, individual download.
3. **Backend API** — authentication, event ownership, guest session creation/lookup, validation, limits, rate limiting, storage writes, metadata writes, signed URL generation.
4. **Supabase PostgreSQL** — locked relational model and constraints from `db_scheme.md`.
5. **Supabase Storage** — private photo/audio bucket. No public bucket URLs.
6. **Audio inspector** — trusted server-side duration/type inspection.

## 4. Deployment topology

### Recommendation: same-origin production

Deploy the Next.js frontend and server-side API layer from the same origin, for example `https://guestbook.example`.

Benefits:

- Cookie requests are same-origin; no production CORS configuration.
- `HttpOnly`, `Secure`, and appropriate `SameSite` cookies work without cross-site credential complexity.
- One deployable application and one API contract boundary.
- Fewer environment-specific differences.

Local development should also use one application origin. If UI and API ports differ during development, configure an explicit development proxy or explicit CORS origin plus `credentials: true`; never use wildcard CORS with credentials.

### Separate frontend/backend: rejected for MVP default

It is viable, but requires exact allowed origins, credentialed requests, cookie domain/path/SameSite decisions, CSRF consideration, preflight handling, and more local/prod parity work. Revisit only for an approved hosting or scaling requirement.

## 5. Guest session

### Creation

1. Guest opens `/e/{public_id}`. No database session is created.
2. Guest optionally enters a name and presses Start.
3. Backend validates the event lookup and name input, creates `guest_sessions` with a cryptographically random `session_token`, and sets the cookie in the same response.
4. The cookie carries a raw opaque, high-entropy token; store a one-way SHA-256 digest in `guest_sessions.session_token`, preserving its uniqueness constraint while reducing database-read impact. Hash incoming cookie values before lookup. The credential remains separate from `guest_sessions.id` and is never returned as ordinary page data.

### Cookie

Recommended baseline:

```text
Name:     __Host-guest_session
HttpOnly: true
Secure:   true in production
SameSite: Lax
Path:     /
Domain:   omitted
Max-Age:  1800 (30 minutes, matching expires_at)
```

Use `Secure: false` only for local HTTP development. `SameSite=Lax` fits same-origin navigation and reduces cross-site request exposure. If the approved topology needs cross-site cookies, stop and explicitly redesign cookie/CORS/CSRF handling; do not silently switch to `SameSite=None`.

### Lookup and authorization

For each guest submission, backend reads the cookie, hashes or safely compares the token according to the selected storage design, loads the GuestSession, verifies its event association, then verifies the event is `ACTIVE`. A cookie alone never grants access to another event.

### Expiration and invalidation

A GuestSession has a maximum lifetime of 30 minutes from creation. The `guest_sessions.expires_at` column (set to `created_at + INTERVAL '30 minutes'` at creation) is the authoritative expiry timestamp. On every protected guest endpoint, the backend checks `expires_at <= NOW()` and rejects expired sessions with `401 SESSION_EXPIRED`, clearing the cookie. An expired session cannot submit photos or voice notes. A new GuestSession (via Start) is required for further submissions; the new session has its own independent quota — no quota is transferred from the expired session. Client-side drafts may remain visible after expiry while the page is alive, but must not be submitted using or resurrecting the expired session. The MVP does not persist expired-session drafts across page reload or navigation. No server-side draft migration, session resurrection, or quota transfer mechanism exists.

Invalidation: clear the cookie and reject the token when expired, revoked, malformed, or absent. Guest sessions have no guest logout requirement; invalidation is primarily expiry or incident response.

Cross-browser behavior: the cookie belongs to one browser profile and is not a person identity. Another browser/device gets another session. Clearing cookies loses the session. This is consistent with the PRD's session-level, not device-level, limit.

## 6. Media upload

```text
Browser --multipart HTTPS--> Next.js server-side API --validated stream--> Supabase Storage
                                               |
                                               +--> PostgreSQL metadata
```

### Validation order

1. Authenticate/identify the guest session.
2. Resolve event and require `ACTIVE`.
3. Apply endpoint rate limit.
4. Enforce request/body and configured file-size limits while receiving data.
5. Inspect bytes, not only a client-provided MIME header; accept only approved image/audio formats.
6. For audio, inspect actual duration server-side.
7. Run the submission in one database transaction using the authoritative order below.
8. Return success only after required persistence succeeds.

### Authoritative submission order (photos)

```text
BEGIN DB transaction
  acquire GuestSession lock
  count photos; reject if count >= 5
  upload object to Supabase Storage
  insert metadata row
COMMIT
success
```

The PostgreSQL transaction begins first and remains open while the object uploads; object storage is not part of the database transaction. Storage failure rolls the database transaction back — no metadata row, no reported success. If the metadata insert or commit fails after the object was created, compensate by deleting the just-written object before reporting failure; if deletion fails, record a structured cleanup failure for operational reconciliation and do not report success.

Concurrent photo submissions for the same GuestSession serialize on the lock: a waiting transaction re-counts after the winner commits, so at most five rows and five accepted responses. This is an accepted MVP trade-off — a database transaction held open across an external upload — not a reservation, queue, or distributed transaction.

### Storage keys

Use opaque generated names, never user filenames or database primary keys as credentials. A recommended shape is `events/{opaque-public-id}/sessions/{random-id}/{media-kind}/{random-object-id}.{approved-extension}`. Resolved (2026-08-15): implemented as `events/{event_id}/sessions/{guest_session_id}/{photos|voice-notes}/{uuid}.{ext}` using internal database UUIDs. This deviates from the opaque-public-id example above; it is acceptable because storage keys are server-only and never exposed in any API response. Avoid putting guest names in keys.

### Failure and consistency

The submission sequence is the authoritative order above: one database transaction holds the GuestSession lock, counts, uploads the object, inserts metadata, and commits. The transaction is not a distributed transaction and does not span object storage; storage and database are coordinated by the sequence and compensation, not atomicity. Do not claim full distributed atomicity between PostgreSQL and object storage. Keep the window small, use unique keys, and provide a bounded orphan cleanup/reconciliation operation when operations are designed. Orphan cleanup is operational tooling, not a guest-facing MVP feature.

## 7. Audio validation

The backend performs synchronous inspection before accepting the voice note. It determines duration from decoded/container metadata using a trusted server-side audio inspection tool, not the browser timer and not a request field.

Resolved (2026-08-15): approved formats are JPEG/PNG/WebP/GIF (photo) and WebM/OGG/MP4 audio (voice note) — API Contract §7; the inspector is server-side `ffprobe`, bundled for the Vercel Node runtime (T028). Recommended initial strategy: support the smallest browser-compatible format set that the chosen MediaRecorder/browser matrix can produce, then validate container/codec and duration with `ffprobe`. Reject unsupported, corrupt, uninspectable, shorter-than-5-second, or longer-than-30-second files with a validation error. Do not persist metadata or report success for rejected audio.

Synchronous inspection keeps the acceptance decision atomic from the guest's perspective and avoids an accepted-but-not-yet-valid media state. Enforce upload size and execution time limits to prevent resource exhaustion.

## 8. Photo limit and concurrency

Photo submissions follow the authoritative sequence in §6: start one Supabase PostgreSQL transaction, acquire the per-session transaction-scoped lock (advisory lock or the GuestSession row), count photos, reject at count >= 5, upload the object, insert the new metadata row, then commit. Do not copy the schema document's `SELECT COUNT(*) ... FOR UPDATE` pseudocode: PostgreSQL does not allow row locking on an aggregate query. The lock is held for the whole sequence, which serializes concurrent photo submissions for the same GuestSession; an implementation must not reserve a sixth slot outside the transaction. No reservations, queues, or distributed transactions.

The exact storage/transaction choreography must prevent two concurrent requests from both observing the same count and committing beyond five. A focused integration test must run concurrent submissions and assert at most five rows and at most five accepted responses.

## 9. Voice-note limit

After validation, insert the voice-note metadata within the normal persistence transaction. `UNIQUE(guest_session_id)` is the final race-safe guard, so no per-session advisory lock is needed: the database constraint serializes concurrent submissions for the same GuestSession. If PostgreSQL returns a unique-constraint violation for that constraint, map it to the normal business-rule response (voice-note limit reached), delete any object written for the losing request (same compensation principle as §6), roll back, and do not expose a raw SQL error.

The application may pre-check for a better UX, but the database constraint remains authoritative under concurrency.

## 10. Admin media access

```text
Admin browser
     |
     v
Backend: authenticate admin + verify event ownership + locate media via GuestSession
     |
     v
Short-lived signed URL for private object
     |
     v
Admin browser --> private object storage
```

The listing endpoint returns metadata, not public storage URLs. A media-access endpoint verifies admin authentication, event ownership, and the media's event association through GuestSession before generating a short-lived signed URL. The backend does not proxy media in the normal MVP flow. Signed URL lifetime resolved 2026-08-15 (owner): 900 seconds (15 minutes), as implemented.

## 11. Admin event constraint

Create the Event as `ACTIVE` in a transaction. The partial unique index on `(admin_id) WHERE status = 'ACTIVE'` is authoritative. If the database reports that constraint violation, return the predictable event business-rule error: the admin already has an ACTIVE event. Do not rely on a preceding count query; it is only a UX optimization and is race-prone by itself.

Closing an event updates status and `closed_at` consistently. Guest writes re-check `ACTIVE` at request time. CLOSED remains viewable but rejects submissions.

## 12. API error strategy

Use one small JSON envelope:

```json
{
  "error": {
    "code": "PHOTO_LIMIT_REACHED",
    "message": "Photo limit reached for this guest session."
  }
}
```

Use stable machine-readable codes, safe human messages, and no stack traces or storage/database details. Suggested mappings:

| Case | HTTP | Example code |
|---|---:|---|
| Validation | 400/422 | `INVALID_INPUT`, `UNSUPPORTED_MEDIA`, `AUDIO_DURATION_INVALID` |
| Authentication | 401 | `AUTHENTICATION_REQUIRED`, `AUTHENTICATION_FAILED` |
| Authorization | 403 | `FORBIDDEN` |
| Business rule | 409/422 | `EVENT_CLOSED`, `PHOTO_LIMIT_REACHED`, `VOICE_NOTE_LIMIT_REACHED`, `ACTIVE_EVENT_EXISTS` |
| Not found | 404 | `NOT_FOUND` |
| Rate limit | 429 | `RATE_LIMITED` |
| Storage/upload | 502/503 | `MEDIA_PERSISTENCE_FAILED` |
| Unexpected | 500 | `INTERNAL_ERROR` |

Exact codes, status choices, and API shapes belong in the next API Contract. Errors must be logged with correlation IDs, without cookies, raw media, or secrets.

## 13. Testing strategy

- **Unit:** token generation/validation, cookie construction, input validation, MIME/type policy, error mapping, storage-key generation.
- **Database integration:** schema constraints, `ACTIVE` partial unique index, `closed_at` check, unique session token, one voice note, FK `RESTRICT`, file/duration checks.
- **API integration:** Start creates a session and cookie; page visit does not; event status and ownership; admin authentication/ownership; signed URL authorization; rate limits; storage failure cleanup.
- **Concurrency:** concurrent photo submissions for one GuestSession; assert no more than five accepted rows. Concurrent voice submissions; assert one row and one mapped business error.
- **Audio:** valid 5–30 second files; under/over duration; corrupt/uninspectable audio; unsupported format; misleading client duration rejected.
- **Guest flow:** event access, optional name, Start, photo/voice feedback, closed-event rejection, expired/invalid cookie behavior.
- **Admin flow:** sign-in, one-active-event rejection, close event, chronological listing, name search, preview/playback, individual download.
- **Browser smoke:** camera/microphone permission denial, MediaRecorder unsupported case, mobile upload/recording states.

## 14. Risks and mitigations

- **Schema/PRD staging mismatch:** require approval before scaffolding; do not alter source docs silently.
- **Supabase PostgreSQL operational setup:** preserve the schema's PostgreSQL constraints; resolve duplicate constraint/index names before migrations.
- **Object storage is not transactional with DB:** write with unique keys, compensate on metadata failure, add reconciliation visibility.
- **Audio formats vary by browser:** define a supported matrix and inspect server-side; reject unsupported formats clearly.
- **Cookie deployment mistakes:** same-origin default, secure attributes, explicit local/prod config, integration tests.
- **Rate-limit state in one DB:** adequate for modest MVP; revisit only for approved multi-instance topology.
- **Private media leakage:** private bucket, authorization before signing, short expiry, no storage URLs in listings.

## 15. Open decisions requiring human approval

1. Hosting platform resolved (2026-08): Vercel, same-origin. Supabase project/region ratified 2026-08-15 (owner): existing APAC production project in use.
2. Exact rate limits. Resolved 2026-08-15 (owner): session-create DB-backed; photo/voice per-instance in-memory accepted on serverless (ADR-008); exact values are env-configurable defaults.
3. Set image/audio file-size limits and supported formats. Resolved 2026-08-15 (owner): 4 MB caps (photo and voice) sized to the hosting request-body limit; formats JPEG/PNG/WebP/GIF, WebM/OGG/MP4 audio.
4. Confirm server-side `ffprobe`/FFmpeg availability in the hosting runtime. Resolved by T028 (bundled `@ffprobe-installer/ffprobe`); live deployed-runtime verification is an R3 smoke item, not a design decision.
5. Decide `public_id` format and `storage_key` format. Resolved (2026-08-15): formats per API §7; `public_id` and `storage_key` formats implemented — see §6 and API Contract.
6. Approve API contract/error-code details, monitoring, backups, and retention policy. API contract/error-code details resolved 2026-08: implemented. Retention resolved 2026-08-15 (owner): 7 days after event CLOSED, private during retention, automatic cleanup after. Mechanism approved and implemented: Vercel Cron daily → `GET /api/cron/media-cleanup` (Node runtime, `CRON_SECRET` bearer auth; API Contract §7.1); objects deleted before metadata; bounded and idempotent. Monitoring and backups resolved 2026-08-15 (owner): structured API logs + Vercel logs, no Sentry/OTel/custom alerting; Supabase managed backups, no custom backup/restore system for MVP.

## 16. Exact next implementation step

Implemented. Production release (R3: Vercel deploy, env vars, live verification) is the remaining step, pending owner go-ahead.
