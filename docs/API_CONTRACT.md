# API Contract — QR Guest Photo & Voicebook

Status: LOCKED  
Version: 1.0 — locked 2026-08-11  
Source: PRD v1.3, `docs/db_scheme.md`, `docs/TECHNICAL_DESIGN.md`, and `docs/ARCHITECTURE_DECISIONS.md`

Amended 2026-08-15: documentation reconciliation — adds §5.9 as implemented; closes resolved decisions. No behavior change.

Amended 2026-08-17: guest message feature (Opsi B).

This contract defines behavior only. Framework, database, and storage implementation details remain outside the API surface.

## 1. Conventions

- Base path: `/api`.
- JSON requests use `Content-Type: application/json`.
- Media requests use `multipart/form-data`.
- JSON responses use UTF-8.
- Timestamps use ISO 8601 UTC strings.
- IDs exposed in URLs are opaque public IDs or media IDs; database primary keys and `session_token` are never exposed.
- Admin authentication uses the Supabase Auth session cookie.
- Guest authentication uses the server-issued HttpOnly guest-session cookie. No guest account exists.
- Unless stated otherwise, successful mutations return the created or updated resource.

## 2. Common errors

```json
{
  "error": {
    "code": "PHOTO_LIMIT_REACHED",
    "message": "Photo limit reached for this guest session."
  }
}
```

`code` is stable and machine-readable. `message` is safe for display. Responses never contain stack traces, SQL details, storage credentials, cookies, or `session_token`.

Common status mapping:

| Status | Meaning | Example codes |
|---:|---|---|
| 400 | Malformed request or missing required field | `INVALID_REQUEST`, `INVALID_JSON` |
| 401 | Missing or invalid authentication/session | `AUTHENTICATION_REQUIRED`, `SESSION_INVALID`, `SESSION_EXPIRED` |
| 403 | Authenticated but not permitted | `FORBIDDEN` |
| 404 | Resource does not exist or is not visible | `NOT_FOUND` |
| 409 | Current state conflicts with the operation | `ACTIVE_EVENT_EXISTS`, `VOICE_NOTE_LIMIT_REACHED`, `GUEST_MESSAGE_LIMIT_REACHED` |
| 422 | Well-formed request fails validation/business rules | `INVALID_INPUT`, `EVENT_CLOSED`, `AUDIO_DURATION_INVALID` |
| 429 | Rate limit exceeded | `RATE_LIMITED` |
| 5xx | Persistence or unexpected server failure | `MEDIA_PERSISTENCE_FAILED`, `INTERNAL_ERROR` |

Validation errors may include field details without changing the envelope:

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "Request validation failed.",
    "fields": {
      "title": "Title is required."
    }
  }
}
```

## 3. Authentication and session behavior

### Admin

Admin endpoints require a valid Supabase Auth session. Missing, expired, or invalid sessions return `401`. Valid sessions do not by themselves authorize every event; event ownership is checked for event and media operations.

### Guest

The server sets an opaque, high-entropy credential in an HttpOnly cookie only when Start succeeds. The cookie value is never returned as a normal response field. It is separate from `GuestSession.id`.

The cookie is same-origin, `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, host-only, `Max-Age=1800` (30 minutes). A GuestSession has a maximum lifetime of 30 minutes from creation, determined by a server-side `expires_at` timestamp. If the server identifies an expired or invalid guest session on any protected guest endpoint, it clears the cookie and returns `401 SESSION_EXPIRED` or `401 SESSION_INVALID`. The client discards only in-memory session/usage state, shows a session-expired message, and requires the guest to press Start again. It must not silently retry a failed upload, create a session on page load, or use localStorage to restore authority. A new Start request creates a new GuestSession and replaces the cookie.

Guest sessions are browser-profile scoped, not person or device identities. Clearing cookies or changing browsers creates a separate session when Start is pressed.

### Closed events

Event lookup remains available for a CLOSED event. Start, photo submission, and voice-note submission for a CLOSED event are rejected with `422 EVENT_CLOSED`. The same rejection applies to any non-ACTIVE submission destination. No endpoint silently reopens an event.

### Rate limits

Rate limiting applies to session creation, photo submission, voice-note submission, and guest-message submission. Session creation uses a DB-backed fixed-window limiter (migration 0003) that is authoritative across instances. Photo, voice-note, and guest-message submission use per-instance in-memory fixed-window limiters — an accepted MVP limitation on serverless (owner decision 2026-08-15): they are defense-in-depth, not cross-instance authoritative. Exact limits and windows remain configurable via environment. A limited response is:

- HTTP `429`
- Error code `RATE_LIMITED`
- `Retry-After` response header when the retry interval is known
- No partial media persistence

## 4. Resource shapes

### Event

```json
{
  "public_id": "opaque-public-id",
  "title": "Summer Party",
  "status": "ACTIVE",
  "created_at": "2026-08-11T12:00:00Z",
  "closed_at": null
}
```

Admin event responses may additionally include the QR/public URL. No database primary key is returned.

### Guest usage

```json
{
  "event": {
    "public_id": "opaque-public-id",
    "title": "Summer Party",
    "status": "ACTIVE"
  },
  "guest_name": "Fante",
  "photos_submitted": 2,
  "photos_remaining": 3,
  "voice_note_submitted": false,
  "voice_note_available": true,
  "guest_message_submitted": false,
  "guest_message_available": true
}
```

The counts are informational. Backend checks remain authoritative.

### Submission

```json
{
  "id": "media-id",
  "type": "PHOTO",
  "guest_name": "Fante",
  "guest_session_ref": "opaque-session-ref",
  "created_at": "2026-08-11T12:15:21Z",
  "mime_type": "image/jpeg",
  "file_size": 123456,
  "duration_seconds": null
}
```

`type` is one of `PHOTO`, `VOICE_NOTE`, or `GUEST_MESSAGE`. For `GUEST_MESSAGE` submissions the shape additionally carries `message_text` (the stored text) instead of media fields. For `type: "GUEST_MESSAGE"`, `mime_type` is always `"text/plain"` and `file_size` is always `0` — intentional no-op placeholders (text messages carry no media file), owner-ratified for MVP.

`guest_session_ref` is an opaque, non-credential identifier for the GuestSession that owns the submission. It is generated at session creation, is separate from the database primary key and `session_token`, and is stable across all submissions from one GuestSession. It enables grouping submissions by contributor session in the admin timeline. Submission listings never contain `storage_key`, the database primary key, `session_token`, or a public storage URL. Access is requested through the media endpoint below.

## 5. Admin endpoints

### 5.1 Sign in

```text
POST /api/admin/auth/sign-in
```

**Authentication:** none.

**Request body:**

```json
{
  "email": "admin@example.com",
  "password": "admin-password"
}
```

The server passes these credentials to Supabase Auth email/password sign-in. The API does not expose Supabase access or refresh tokens in JSON; it establishes the authenticated session through secure cookies.

**Success:** `200`

```json
{
  "admin": {
    "email": "admin@example.com"
  }
}
```

The server establishes the Supabase Auth session through secure cookies. Tokens are not returned as ordinary JSON fields. Sign-in does not create or modify an Admin record outside the approved Supabase Auth/admin identity mapping.

**Errors:** `400 INVALID_REQUEST`, `401 AUTHENTICATION_FAILED`, `429 RATE_LIMITED` if auth throttling is configured.

### 5.2 Current admin/session

```text
GET /api/admin/me
```

**Authentication:** Supabase Auth session required.

**Success:** `200`

```json
{
  "admin": {
    "email": "admin@example.com"
  }
}
```

**Errors:** `401 AUTHENTICATION_REQUIRED` or `401 AUTHENTICATION_FAILED`.

### 5.3 Create event

```text
POST /api/admin/events
```

**Authentication:** Supabase Auth session required.

**Request body:**

```json
{
  "title": "Summer Party"
}
```

`title` is required and validated server-side. The event is created as `ACTIVE`; clients cannot choose status or `closed_at`.

**Success:** `201`

```json
{
  "event": {
    "public_id": "opaque-public-id",
    "title": "Summer Party",
    "status": "ACTIVE",
    "created_at": "2026-08-11T12:00:00Z",
    "closed_at": null
  },
  "public_url": "https://example.com/e/opaque-public-id"
}
```

The server generates the opaque non-sequential `public_id` as `base64url` of 16 random bytes (resolved 2026-08-15).

**Errors:** `400 INVALID_INPUT`, `401 AUTHENTICATION_REQUIRED`, `409 ACTIVE_EVENT_EXISTS`, `429 RATE_LIMITED` if applicable, `500 INTERNAL_ERROR`.

The database partial unique index remains authoritative for the one-ACTIVE-event rule; a constraint violation maps to `ACTIVE_EVENT_EXISTS`.

### 5.4 Get event

```text
GET /api/admin/events/{public_id}
```

**Authentication:** Supabase Auth session required.

**Path:** `public_id` is the opaque event public identifier.

**Success:** `200` with the Event shape.

**Authorization:** The authenticated admin must own the event.

**Errors:** `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

### 5.5 Close event

```text
POST /api/admin/events/{public_id}/close
```

**Authentication:** Supabase Auth session required.

**Request body:** none.

**Success:** `200` with the updated Event shape, `status: "CLOSED"`, and non-null `closed_at`.

**Authorization:** The authenticated admin must own the event.

**Errors:** `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 EVENT_ALREADY_CLOSED` or `409 INVALID_EVENT_STATE`.

No endpoint changes an event to `ARCHIVED` in this MVP contract.

### 5.6 Get event QR/public URL

```text
GET /api/admin/events/{public_id}/access
```

**Authentication:** Supabase Auth session required.

**Success:** `200`

```json
{
  "public_id": "opaque-public-id",
  "public_url": "https://example.com/e/opaque-public-id"
}
```

QR is an access representation. This endpoint returns the URL needed to render or share the QR; it does not create a QR database entity or add multiple QR variants.

**Authorization:** The authenticated admin must own the event.

**Errors:** `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

### 5.7 List/search submissions

```text
GET /api/admin/events/{public_id}/submissions
```

**Authentication:** Supabase Auth session required.

**Query:**

```text
?guest_name=Fante
```

`guest_name` is optional. When present, the server searches submissions associated with the GuestSession name. Without it, all submissions for the event are returned.

**Success:** `200`

```json
{
  "submissions": [
    {
      "id": "media-id",
      "type": "PHOTO",
      "guest_name": "Fante",
      "guest_session_ref": "opaque-session-ref",
      "created_at": "2026-08-11T12:15:21Z",
      "mime_type": "image/jpeg",
      "file_size": 123456,
      "duration_seconds": null
    }
  ]
}
```

Results are chronological by submission time, newest first. The admin timeline may cluster submissions by `guest_session_ref` (contributor session) as a presentation grouping; the response order remains newest-first. `GUEST_MESSAGE` items appear in the same list with `type: "GUEST_MESSAGE"` and a `message_text` field; they have no media object, so `mime_type` is `text/plain`, `file_size` is `0`, and `duration_seconds` is `null`. No client sort, pagination, bulk operation, or advanced filter is defined for MVP.

**Authorization:** The authenticated admin must own the event.

**Errors:** `400 INVALID_INPUT` for invalid query, `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

### 5.8 Get media access URL

```text
GET /api/admin/media/{media_id}/access
```

**Authentication:** Supabase Auth session required.

**Success:** `200`

```json
{
  "url": "https://private-storage.example/signed-value",
  "expires_at": "2026-08-11T12:20:00Z"
}
```

The backend verifies admin authentication, resolves the media through GuestSession to Event, verifies event ownership, then creates a short-lived signed URL for the private Supabase Storage object. TTL is 900 seconds (15 minutes) (ratified 2026-08-15). The URL is not permanent and is not a public storage URL.

**Errors:** `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `502 MEDIA_ACCESS_FAILED`.

### 5.9 Download media

```text
GET /api/admin/media/{media_id}/download
```

**Authentication:** Supabase Auth session required.

**Behavior:** verifies admin authentication, resolves the media through GuestSession to Event, verifies event ownership, generates a fresh short-lived signed URL, and responds `302 Found` redirecting to it. The signed URL is never returned as JSON. The backend does not proxy the media. Repeat of the §5.8 ownership check; individual download only (bulk is future scope).

**Success:** `302` redirect to the signed URL.

**Errors:** `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `502 MEDIA_ACCESS_FAILED`, `500 INTERNAL_ERROR`.

### 5.10 List admin events

```text
GET /api/admin/events
```

**Authentication:** Supabase Auth session required.

**Success:** `200`

```json
{
  "events": [
    {
      "public_id": "opaque-public-id",
      "title": "Summer Party",
      "status": "ACTIVE",
      "created_at": "2026-08-11T12:00:00Z",
      "closed_at": null
    }
  ]
}
```

Returns only events owned by the authenticated admin, newest first (by `created_at` descending). Each item uses the Event shape (§4). No pagination, filtering, or search parameters are defined for MVP; the endpoint returns the admin's full event set. No database primary key is returned.

**Errors:** `401 AUTHENTICATION_REQUIRED`, `500 INTERNAL_ERROR`.

## 6. Guest endpoints

### 6.1 Get event by public ID

```text
GET /api/events/{public_id}
```

**Authentication:** none. Existing guest cookie is ignored for event discovery.

**Success:** `200`

```json
{
  "event": {
    "public_id": "opaque-public-id",
    "title": "Summer Party",
    "status": "ACTIVE"
  }
}
```

CLOSED events are returned so guests can view the event page. `ARCHIVED` behavior is not expanded beyond the schema; if not guest-accessible, return `404 NOT_FOUND`.

**Errors:** `404 NOT_FOUND`.

### 6.2 Start GuestSession

```text
POST /api/events/{public_id}/session
```

**Authentication:** none before session creation. Existing guest cookie does not authorize a different event.

**Request body:**

```json
{
  "guest_name": "Fante"
}
```

`guest_name` is optional. Empty input is treated as no name. Name validation and any length/character limits remain implementation validation details; invalid values return `422 INVALID_INPUT`.

**Business rules:** The event must exist. Session creation occurs only after this request, representing the guest pressing Start. No page visit creates a session. A CLOSED event is viewable but cannot start a submission session and returns `422 EVENT_CLOSED`.

**Success:** `201`

```json
{
  "session": {
    "event_public_id": "opaque-public-id",
    "guest_name": "Fante",
    "photos_submitted": 0,
    "photos_remaining": 5,
    "voice_note_submitted": false,
    "voice_note_available": true,
    "guest_message_submitted": false,
    "guest_message_available": true
  }
}
```

The response includes no session token or database primary key. The server sets the HttpOnly cookie in the response.

**Errors:** `400 INVALID_REQUEST`, `404 NOT_FOUND`, `422 INVALID_INPUT`, `422 EVENT_CLOSED`, `429 RATE_LIMITED`.

### 6.3 Get session/usage state

```text
GET /api/events/{public_id}/session
```

**Authentication:** valid guest-session cookie required.

**Success:** `200` with the Guest usage shape (§4).

The server verifies that the cookie's GuestSession belongs to `{public_id}`. Counts are informational and never replace backend limit enforcement. As of the 2026-08-17 amendment the usage shape also carries `guest_message_submitted` and `guest_message_available`.

**Errors:** `401 SESSION_REQUIRED`, `401 SESSION_INVALID`, `401 SESSION_EXPIRED`, `404 NOT_FOUND`, `422 EVENT_CLOSED` is not returned for read-only usage state; CLOSED event state is included when the event remains viewable.

### 6.4 Submit photo

```text
POST /api/events/{public_id}/photos
```

**Authentication:** valid guest-session cookie required. The session must belong to `{public_id}`.

**Request:** `multipart/form-data` with one required field:

```text
photo=<binary image file>
```

No filename, MIME type, duration, limit counter, event ID, or session token from the client is trusted as authority.

**Server validation:**

- Event exists and is `ACTIVE`.
- GuestSession belongs to the event.
- Rate limit passes.
- File is present, non-empty, within the configured size limit, and an approved image format.
- Bytes are inspected server-side; the client MIME header is not sufficient.
- GuestSession has fewer than 5 accepted photos.
- The backend executes this exact choreography:

  ```text
  BEGIN DB transaction
  → acquire GuestSession lock
  → count photos
  → reject if count >= 5
  → upload object
  → insert photo metadata
  → commit
  → return success
  ```

- The lock, count, object upload, metadata insert, and commit belong to the same acceptance flow. Concurrent requests for the same GuestSession serialize, so no more than 5 rows can be accepted.
- If object upload fails: rollback the transaction, commit no metadata, and return `502 MEDIA_PERSISTENCE_FAILED`.
- If metadata insert or commit fails after object upload succeeds: rollback the transaction, attempt deletion of the newly uploaded object, and return `502 MEDIA_PERSISTENCE_FAILED`. Never return success for an uncommitted metadata row.

**Success:** `201`

```json
{
  "submission": {
    "id": "media-id",
    "type": "PHOTO",
    "created_at": "2026-08-11T12:15:21Z",
    "mime_type": "image/jpeg",
    "file_size": 123456
  },
  "usage": {
    "photos_submitted": 1,
    "photos_remaining": 4,
    "voice_note_submitted": false,
    "voice_note_available": true
  }
}
```

Storage is private and backend-mediated. The response contains no storage URL or storage key.

**Errors:** `400 INVALID_REQUEST`, `401 SESSION_REQUIRED|SESSION_INVALID|SESSION_EXPIRED`, `404 NOT_FOUND`, `409 PHOTO_LIMIT_REACHED`, `422 EVENT_CLOSED`, `422 UNSUPPORTED_MEDIA`, `422 FILE_TOO_LARGE`, `429 RATE_LIMITED`, `502 MEDIA_PERSISTENCE_FAILED`.

### 6.5 Submit voice note

```text
POST /api/events/{public_id}/voice-notes
```

**Authentication:** valid guest-session cookie required. The session must belong to `{public_id}`.

**Request:** `multipart/form-data` with one required field:

```text
voice_note=<binary audio file>
```

The client timer and any client duration field are UX-only and are not trusted.

**Server validation:**

- Event exists and is `ACTIVE`.
- GuestSession belongs to the event.
- Rate limit passes.
- File is present, non-empty, within the configured size limit, and an approved audio format.
- Server-side `ffprobe`/FFmpeg inspection confirms the actual duration is between 5 and 30 seconds inclusive.
- GuestSession has no existing voice note.
- The database unique constraint remains the final concurrency guard.

Invalid, corrupt, unsupported, or uninspectable audio is rejected before successful persistence. Storage/database failure never returns success.

**Success:** `201`

```json
{
  "submission": {
    "id": "media-id",
    "type": "VOICE_NOTE",
    "created_at": "2026-08-11T12:16:04Z",
    "mime_type": "audio/webm",
    "file_size": 45678,
    "duration_seconds": 12
  },
  "usage": {
    "photos_submitted": 1,
    "photos_remaining": 4,
    "voice_note_submitted": true,
    "voice_note_available": false
  }
}
```

**Errors:** `400 INVALID_REQUEST`, `401 SESSION_REQUIRED|SESSION_INVALID|SESSION_EXPIRED`, `404 NOT_FOUND`, `409 VOICE_NOTE_LIMIT_REACHED`, `422 EVENT_CLOSED`, `422 UNSUPPORTED_MEDIA`, `422 FILE_TOO_LARGE`, `422 AUDIO_DURATION_INVALID`, `422 AUDIO_UNINSPECTABLE`, `429 RATE_LIMITED`, `502 MEDIA_PERSISTENCE_FAILED`.

### 6.6 Submit guest message

```text
POST /api/events/{public_id}/guest-messages
```

**Authentication:** valid guest-session cookie required. The session must belong to `{public_id}`.

**Request:** `application/json` with one required field:

```json
{
  "message_text": "string"
}
```

`message_text` is required, must be a string, and must be 1–280 characters after trim. The message is a standalone submission — it is not attached to the voice note, is never required, and may be submitted with or without photos or a voice note.

**Server validation:**

- Content-Type is `application/json`.
- Event exists and is `ACTIVE`.
- GuestSession belongs to the event.
- Rate limit passes.
- The body is read with a bounded cap (4 KB); `message_text` is present, a string, and 1–280 characters after trim.
- GuestSession has no existing guest message; the database unique constraint remains the final concurrency guard.

**Success:** `201`

```json
{
  "submission": {
    "id": "message-id",
    "type": "GUEST_MESSAGE",
    "created_at": "2026-08-11T12:17:00Z",
    "message_text": "trimmed text"
  },
  "usage": {
    "photos_submitted": 0,
    "photos_remaining": 5,
    "voice_note_submitted": false,
    "voice_note_available": true,
    "guest_message_submitted": true,
    "guest_message_available": false
  }
}
```

No file upload, multipart body, or storage object is involved. The response contains no storage URL or storage key.

**Errors:** `400 INVALID_REQUEST`, `401 SESSION_REQUIRED|SESSION_INVALID|SESSION_EXPIRED`, `404 NOT_FOUND`, `409 GUEST_MESSAGE_LIMIT_REACHED`, `422 EVENT_CLOSED`, `422 INVALID_INPUT` (with `fields.message_text`), `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

## 7. Media and storage contract

- Guest uploads always use `multipart/form-data` to the backend API.
- Backend validates actual bytes, media type, file size, and audio duration before accepting metadata.
- File-size limits: photo and voice-note uploads are each capped at 4 MB by default (`PHOTO_MAX_SIZE_BYTES` / `VOICE_NOTE_MAX_SIZE_BYTES`), sized to fit the hosting platform's request-body limit (owner decision 2026-08-15). Supported formats: JPEG/PNG/WebP/GIF (photo); WebM/OGG/MP4 audio (voice note).
- Supabase Storage uses a private bucket. Guests never receive storage URLs, signed URLs, or storage keys.
- The backend writes the object, persists metadata, and reports success only after required persistence succeeds. Failed metadata persistence triggers cleanup of the newly written object where possible.
- Admin preview and download both require authentication and event ownership, then use short-lived signed URLs.
- Signed URL TTL is 900 seconds (15 minutes) (ratified 2026-08-15). URLs are temporary capabilities and must not be persisted or exposed in submission listings.

### 7.1 Internal media cleanup (operational)

```text
GET /api/cron/media-cleanup
```

Internal operational endpoint, not a guest/admin product feature. Invoked daily by the hosting platform's cron scheduler (Vercel Cron). Never called by browsers or the product UI.

**Authentication:** `Authorization: Bearer ${CRON_SECRET}`. The secret is a server-only environment variable; when it is not configured the endpoint fails closed with `500 INTERNAL_ERROR` and performs no work.

**Behavior:** enforces the approved retention policy — for CLOSED events with `closed_at` older than 7 days, delete private Storage objects by `storage_key` first, then delete `photos`/`voice_notes` metadata rows. Missing/already-deleted objects are treated as success (idempotent). ACTIVE events, guest sessions, and event records are never modified. One invocation is bounded to a fixed maximum number of events per run.

**Success:** `200` with a cleanup summary (`eventsScanned`, `objectsDeleted`, `photosMetadataDeleted`, `voiceNotesMetadataDeleted`).

**Errors:** `401 AUTHENTICATION_REQUIRED` (bad/missing secret), `500 INTERNAL_ERROR` (any failure, including partial — partial success is never reported as full success; the next scheduled run retries). Failures are logged via structured error logging without secrets.

## 8. Unresolved API decisions

1. ~~Exact rate-limit windows, quotas, and identity keys.~~ Resolved 2026-08-15: session-create is DB-backed (identity = client IP; forwarded headers trusted only behind a trusted proxy); photo/voice per-instance in-memory; windows/quotas env-configurable (ADR-008).
2. ~~Image/audio file-size limits and supported formats.~~ Resolved 2026-08-15: 4 MB caps, JPEG/PNG/WebP/GIF + WebM/OGG/MP4 (§7).
3. ~~`public_id` format.~~ Resolved 2026-08-15: `base64url` of 16 random bytes.
4. ~~`storage_key` format.~~ Resolved 2026-08-15: `events/{event_id}/sessions/{guest_session_id}/{photos|voice-notes}/{uuid}.{ext}` (server-only).
5. ~~Signed URL TTL.~~ Resolved 2026-08-15: 900 seconds (15 minutes), as implemented.
6. ~~Hosting-specific same-origin base URL and local development proxy details.~~ Resolved 2026-08-15: Vercel same-origin deployment; base URL via `NEXT_PUBLIC_APP_URL`.
7. Monitoring, backups, and media-retention policy. Retention resolved 2026-08-15 (owner): retain media 7 days after event CLOSED, private during retention, automatic cleanup after. Mechanism: internal cron endpoint §7.1 (owner-approved, implemented). Monitoring and backups resolved 2026-08-15 (owner): structured API logs + Vercel logs, no Sentry/OTel/custom alerting; Supabase managed backups, no custom backup/restore system for MVP.
8. ~~Schema constraint/index naming cleanup before migrations.~~ Resolved 2026-08: migrations 0001–0008 applied live; no duplicate names.

## 9. Next step

This contract is implemented. Endpoint or behavior changes require an approved contract amendment.
