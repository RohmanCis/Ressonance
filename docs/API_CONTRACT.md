# API Contract — QR Guest Photo & Voicebook

Status: LOCKED  
Version: 1.0 — locked 2026-08-11  
Source: PRD v1.3, `docs/db_scheme.md`, `docs/TECHNICAL_DESIGN.md`, and `docs/ARCHITECTURE_DECISIONS.md`

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
| 409 | Current state conflicts with the operation | `ACTIVE_EVENT_EXISTS`, `VOICE_NOTE_LIMIT_REACHED` |
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

Rate limiting applies to session creation, photo submission, and voice-note submission. Exact limits and windows remain open. A limited response is:

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
  "voice_note_available": true
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

The server generates the opaque non-sequential `public_id`. Exact format remains open.

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

Results are chronological by submission time, newest first. The admin timeline may cluster submissions by `guest_session_ref` (contributor session) as a presentation grouping; the response order remains newest-first. No client sort, pagination, bulk operation, or advanced filter is defined for MVP.

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

The backend verifies admin authentication, resolves the media through GuestSession to Event, verifies event ownership, then creates a short-lived signed URL for the private Supabase Storage object. Exact TTL remains open. The URL is not permanent and is not a public storage URL.

**Errors:** `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `502 MEDIA_ACCESS_FAILED`.

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
    "voice_note_available": true
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

**Success:** `200` with the Guest usage shape.

The server verifies that the cookie's GuestSession belongs to `{public_id}`. Counts are informational and never replace backend limit enforcement.

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

## 7. Media and storage contract

- Guest uploads always use `multipart/form-data` to the backend API.
- Backend validates actual bytes, media type, file size, and audio duration before accepting metadata.
- Exact supported image/audio formats and size limits remain open.
- Supabase Storage uses a private bucket. Guests never receive storage URLs, signed URLs, or storage keys.
- The backend writes the object, persists metadata, and reports success only after required persistence succeeds. Failed metadata persistence triggers cleanup of the newly written object where possible.
- Admin preview and download both require authentication and event ownership, then use short-lived signed URLs.
- Signed URL TTL remains open. URLs are temporary capabilities and must not be persisted or exposed in submission listings.

## 8. Unresolved API decisions

1. Exact rate-limit windows, quotas, and identity keys.
2. Image/audio file-size limits and supported formats.
3. `public_id` format.
4. `storage_key` format.
5. Signed URL TTL.
6. Hosting-specific same-origin base URL and local development proxy details.
7. Monitoring, backups, and media-retention policy.
8. Schema constraint/index naming cleanup before migrations.

## 9. Next step

Approve this contract. Then scaffold the minimal Next.js server-side API boundary and Supabase integration, beginning with authentication/session plumbing and focused contract tests; do not add endpoints outside this contract without an approved requirement.
