# PRD — QR Guest Photo & Voicebook

Version: 1.3  
Status: Ready for Implementation  
Scope: MVP

---

## 1. Product Summary

A web-based event guestbook.

Guests scan an event QR code and can:
- Enter their name.
- Take and submit photos.
- Record and submit one voice note.

Admins can:
- Create and manage events.
- Get an event QR code.
- View submitted photos and voice notes.
- Search submissions by guest name.
- View submissions in chronological order.
- Download submitted media.

The MVP intentionally excludes AI, photo curation, AI filtering, transcription, and other advanced features.

---

## 2. Goals

### Primary Goals

1. Make guest participation possible without installing an app.
2. Make photo and voice-note submission simple and fast.
3. Associate every submission with an event and guest session.
4. Limit excessive submissions from a single guest session.
5. Give admins a clear chronological view of submitted media.
6. Allow admins to find submissions by guest name.
7. Keep the MVP technically simple enough to implement and maintain.

### Non-Goals for MVP

- AI photo curation.
- AI photo quality scoring.
- AI content moderation.
- Voice transcription.
- Face recognition.
- Automatic photo filtering.
- Social login for guests.
- Guest accounts.
- Complex recommendation systems.
- Advanced analytics.

---

## 3. Actors

### Admin

The event owner/operator.

Can: Sign in. Create an event. Manage an event. Access the event dashboard. View submitted media. Search by guest name. Download media.

### Guest

A person attending the event.

Guest does not need an account.

Can: Open an event through a QR code. Enter a name. Submit up to 5 photos per guest session. Submit up to 1 voice note per guest session. Record voice notes between 5 and 30 seconds.

---

## 4. Core Business Rules

| Rule | MVP Requirement |
|---|---|
| Guest authentication | Not required |
| Event access | Through event QR code / event URL |
| Guest name | Optional |
| Photos per guest session | Maximum 5 |
| Voice notes per guest session | Maximum 1 |
| Voice note minimum duration | 5 seconds |
| Voice note maximum duration | 30 seconds |
| Admin default sorting | Submission time, newest first |
| Admin search | Guest name |
| Guest session tracking | Backend-controlled session |
| Abuse protection | Backend validation + rate limiting |
| QR code | Represents event access URL, not a separate business entity |
| Media storage | Object/file storage |
| Media metadata | Database |
| Guest account | Not required |
| AI features | Future scope |

### Important Clarification

The limit is defined at the **Guest Session** level, not as a guaranteed physical-device limit.

A browser/device can potentially create another session or clear browser data. Therefore, the MVP should aim to reduce abuse, not claim perfect device-level prevention.

---

## 5. Business Flow

### 5.1 Admin Flow

1. Admin opens the application.
2. Admin signs in.
3. Admin creates an event. System rejects creation if the admin already has an ACTIVE event.
4. Admin enters event information.
5. System creates the event.
6. System provides an event QR code / event URL.
7. Admin shares or prints the QR code.
8. Guests scan the QR code.
9. Guest submissions appear in the admin dashboard.
10. Admin can search by guest name.
11. Admin can view submissions chronologically.
12. Admin can download submitted media.

### 5.2 Guest Flow

1. Guest scans the QR code.
2. Browser opens the event guest page.
3. System identifies the event from the QR/event URL.
4. Guest enters their name optionally, then presses Start.
5. Backend creates the guest session, stores the optional name, and sets a session identifier in an HttpOnly cookie.
6. Guest chooses an action:
   - Take photo.
   - Record voice note.
7. Guest submits the media.
8. Backend validates the request.
9. Backend checks guest-session limits.
10. Media is stored.
11. Media metadata is stored.
12. Guest sees a success/error message.
13. Guest can continue until the session limits are reached.

---

## 6. Guest Session

A Guest Session represents one guest interaction with an event.

It is intentionally different from a real person identity.

### Purpose

The Guest Session is used to:
- Track submitted media.
- Apply photo limits.
- Apply voice-note limits.
- Associate media with the guest's entered name.
- Provide basic abuse protection.

### Behavior

The browser receives a session identifier via an HttpOnly cookie set by the backend.

The backend is the source of truth for limits.

The frontend must never be trusted to enforce limits by itself.

### Session Creation

The Guest Session is created when the guest explicitly presses Start, after entering their optional name.

At session creation:
- Backend creates the Guest Session record.
- Backend stores the optional guest name.
- Backend sets a session identifier in an HttpOnly cookie.
- Subsequent guest requests carry that cookie automatically.
- The frontend does not use localStorage as the authority for session limits.

This avoids creating database sessions for simple page visits and makes the guest name available to all subsequent submissions in the session.

A GuestSession has a maximum lifetime of 30 minutes from creation. Expiry is determined by a server-side `expires_at` timestamp. Once expired, the session cannot submit photos or voice notes; a new GuestSession (via Start) is required for further submissions. Physical QR rescan is not required if the guest still has the event URL. Client-side drafts may remain visible after expiry while the page is alive, but must not be submitted using or resurrecting the expired session. A new session has its own independent quota; no quota is transferred. The MVP does not persist expired-session drafts across page reload or navigation.

---

## 7. Photo Rules

A guest session can submit 0 to 5 photos.

### Validation

The backend must verify:
- The event exists.
- The event is active.
- The guest session belongs to the event.
- The guest session has not reached 5 photos.
- The uploaded file is an allowed image type.
- The uploaded file is within the configured size limit.
- The request passes rate limiting.

The frontend may disable the photo button after reaching the limit, but the backend must enforce the limit.

---

## 8. Voice Note Rules

A guest session can submit 0 or 1 voice note.

### Duration

- Minimum: 5 seconds.
- Maximum: 30 seconds.

### Validation

The backend must verify:
- The event exists.
- The event is active.
- The guest session belongs to the event.
- The guest session does not already have a voice note.
- The submitted audio is an allowed format.
- The duration is between 5 and 30 seconds.
- The request passes rate limiting.

The frontend should stop recording automatically at 30 seconds. The backend remains the final authority on duration. Audio duration must be verified by the backend through server-side audio inspection — the frontend timer is for UX only and must not be trusted as a duration source.

---

## 9. Guest Name

The guest name is optional.

### Behavior

If the guest enters a name:
- Store the name with the Guest Session.
- Display the name in the admin dashboard.
- Make the name searchable.

If the guest leaves it empty:
- Submission is still allowed.
- The dashboard should use a fallback label such as `Anonymous Guest`.

### MVP Decision

The name belongs to the Guest Session. It is submitted once at session creation and applies to all subsequent submissions in that session.

---

## 10. Admin Dashboard

The dashboard is the main place where the admin views guest submissions.

### Default View

Submissions are displayed chronologically by submission time, newest first.

Each submission should show at least:
- Media type.
- Guest name.
- Submission timestamp.
- Media preview where applicable.

### Search

Admin can search submissions by guest name.

Example: `Search: Fante` returns all submissions associated with that guest session/name.

### Suggested Timeline Example

```
10:15:21  Fante         Photo
10:16:04  Anonymous     Voice Note
10:17:32  Rina          Photo
10:18:09  Fante         Photo
```

The exact UI is to be designed at the frontend stage.

---

## 11. Event Status

An event has a defined lifecycle.

### Statuses

- `ACTIVE` — guests can submit media.
- `CLOSED` — guests can access the event page, but new submissions are rejected by the backend.
- `ARCHIVED` — retained for admin history; no longer a submission destination.

### MVP Recommendation

Implement ACTIVE and CLOSED for MVP. ARCHIVED can be added if storage lifecycle requires it.

Events are created as ACTIVE. Admin can close an event. A closed event remains accessible to guests but all submission attempts are rejected with a clear message.

---

## 12. QR Code

The QR code is an access mechanism pointing to an event URL, for example:

```
https://example.com/e/{event-public-id}
```

### Event Public Identifier

The event URL uses an opaque, non-sequential public identifier. The exact format (UUID, short random ID, or equivalent) is an open technical decision. The public identifier must not expose the internal database primary key.

### Domain Decision

QR Code is not a core business entity. The system does not need a dedicated QR database table for MVP.

---

## 13. Media Model

Two media types in MVP: Photo and Voice Note.

Binary files are not stored in the relational database.

### Database stores metadata:
- Event reference
- Guest Session reference
- Media type
- Storage key/path
- File size
- MIME type
- Duration (audio only)
- Created/uploaded timestamp

### Object storage stores:
- Photo binary data
- Audio binary data

---

## 14. High-Level Domain Model

### Admin

Represents an event administrator.

Relationship:
- One Admin can have many Events.
- An Admin may have at most one ACTIVE event at any time.

### Event

Represents one event.

Relationship:
- Belongs to one Admin.
- Has many Guest Sessions.
- Has many Media Items.

### Guest Session

Represents a guest's interaction with one Event.

Relationship:
- Belongs to one Event.
- Has 0–5 Photos.
- Has 0–1 Voice Note.

### Photo

Represents one submitted photo.

Relationship:
- Belongs to one Event.
- Belongs to one Guest Session.

### Voice Note

Represents one submitted audio recording.

Relationship:
- Belongs to one Event.
- Belongs to one Guest Session.

---

## 15. High-Level Architecture

MVP components:

1. Frontend
2. Backend API
3. Relational Database
4. Object Storage
5. Admin Authentication
6. Rate Limiting / Abuse Protection

### Frontend

**Guest UI:** Event landing page. Guest name input. Photo capture. Voice recording. Submission status. Usage/limit information.

**Admin UI:** Login. Event management. Event dashboard. Media timeline. Name search. Media download.

### Backend API

Responsible for: Authentication. Event management. Guest session creation. Guest session validation. Photo submission. Voice-note submission. Media metadata. Business rules. Rate limiting. Admin dashboard data. Signed URL generation for media access.

### Database

Stores structured data and relationships.

### Object Storage

Stores photo and audio files. Media is stored in a private bucket. Access requires authorization.

### Authentication

Required for Admin. Not required for Guest.

---

## 16. Security and Abuse Guardrails

The MVP assumes frontend restrictions can be bypassed.

### Required Guardrails

1. Backend validates every submission.
2. Backend enforces the 5-photo limit.
3. Backend enforces the 1-voice-note limit.
4. Backend validates audio duration via server-side audio inspection.
5. Backend validates file type.
6. Backend validates file size.
7. Backend verifies event status.
8. Backend verifies guest-session ownership.
9. Rate limiting is applied to sensitive endpoints.
10. Media is stored in a private bucket; access requires authorization.

### Rate Limiting

Protects: session creation, photo submission, voice-note submission.

Exact rate values are an open technical decision.

### Abuse Expectation

MVP protection reduces casual abuse. It is not a guarantee against sophisticated abuse.

---

## 17. Data Flow

### Photo Submission

```
Guest Browser
  |
  | POST photo + session cookie
  v
Backend API
  |
  | Validate event / session / limit / file type / file size
  |
  +------> Object Storage (private bucket)
  |             |
  |             v
  |         Photo File stored
  |
  +------> Database
                |
                v
          Photo Metadata stored
  |
  v
Success response to browser
```

### Voice Note Submission

```
Guest Browser
  |
  | POST audio + session cookie
  v
Backend API
  |
  | Validate event / session / limit / file type / audio duration
  |
  +------> Object Storage (private bucket)
  |             |
  |             v
  |         Audio File stored
  |
  +------> Database
                |
                v
          Voice Note Metadata stored
  |
  v
Success response to browser
```

---

## 18. Admin Media Flow

### Listing submissions

```
Admin Dashboard
  |
  | Request media list (authenticated)
  v
Backend API
  |
  +------> Database
                |
                v
          Media Metadata list
  |
  v
Dashboard Timeline rendered
```

### Accessing or downloading a media item

```
Admin requests a media item
  |
  v
Backend (verifies admin authentication and event ownership)
  |
  v
Backend generates a short-lived signed URL for the private storage object
  |
  v
Signed URL returned to admin browser
  |
  v
Admin browser fetches file directly from Object Storage using the signed URL
  |
  v
Photo or Audio delivered to browser
```

The backend does not proxy or stream media files in the normal MVP flow.

---

## 19. Functional Requirements

### Admin

- FR-001: Admin can sign in.
- FR-002: Admin can create an event.
- FR-002a: System rejects event creation if the admin already has an ACTIVE event.
- FR-003: Admin can view an event.
- FR-004: Admin can close an event.
- FR-005: Admin can access the event QR code.
- FR-006: Admin can view submitted media.
- FR-007: Admin can view submissions in chronological order.
- FR-008: Admin can search submissions by guest name.
- FR-009: Admin can preview submitted photos.
- FR-010: Admin can access submitted voice notes.
- FR-011: Admin can download individual media items.

### Guest

- FR-020: Guest can access an event through QR code/event URL.
- FR-021: Guest can start a guest session by entering an optional name and pressing Start.
- FR-022: Guest can enter an optional name before starting the session.
- FR-023: Guest can take and submit a photo.
- FR-024: Guest can submit a maximum of 5 photos per session.
- FR-025: Guest can record a voice note.
- FR-026: Guest can submit a maximum of 1 voice note per session.
- FR-027: Voice note must be at least 5 seconds.
- FR-028: Voice note must not exceed 30 seconds.
- FR-029: Guest receives clear success or failure feedback after each submission.

### Backend

- FR-040: Backend validates all guest submissions.
- FR-041: Backend enforces submission limits per guest session.
- FR-042: Backend validates media file type.
- FR-043: Backend validates media file size.
- FR-044: Backend validates voice note duration via server-side audio inspection.
- FR-045: Backend stores media metadata in the database.
- FR-046: Backend stores media files in private object storage.
- FR-047: Backend applies rate limiting to sensitive endpoints.
- FR-048: Backend rejects submissions for closed or non-existent events.
- FR-049: Backend generates short-lived signed URLs for authorized admin media access.

---

## 20. Non-Functional Requirements

### Simplicity

Prefer simple, understandable architecture over premature optimization.

### Reliability

A successful submission must not be reported to the guest unless the system has successfully persisted the required data.

### Security

- Admin endpoints require authentication.
- Guest sessions cannot access other guest sessions' data.
- Media is stored privately and accessed only through authorized signed URLs.
- Input and file validation must happen server-side.

### Performance

The guest flow should feel fast on a typical mobile connection. Large media processing must not block the user unnecessarily. Exact performance targets are defined at the technical design stage.

### Mobile First

The guest experience is primarily mobile.

---

## 21. UX Principles

### Guest

1. Minimal steps.
2. Clear permissions requests.
3. Clear recording state.
4. Clear upload state.
5. Clear success/error feedback.
6. Show remaining limits when useful.

```
Photos remaining: 3/5
Voice note: Available
```

### Admin

1. Timeline first.
2. Guest name clearly visible.
3. Search easily accessible.
4. Simple media preview.
5. Avoid unnecessary complexity.

---

## 22. Error Cases

### Guest

- Event does not exist.
- Event is closed.
- Camera permission denied.
- Microphone permission denied.
- Unsupported browser.
- Photo limit reached.
- Voice-note limit reached.
- Voice note shorter than 5 seconds.
- Voice note longer than 30 seconds.
- File too large.
- Unsupported file type.
- Upload failed.
- Network interruption.
- Session expired/invalid.

### Admin

- Authentication failed.
- Event creation failed (including: already has an ACTIVE event).
- Event not found.
- Media failed to load.
- Download failed.

---

## 23. MVP Acceptance Criteria

### Event

- [ ] Admin can create an event.
- [ ] System generates an event access URL with an opaque public identifier.
- [ ] System displays a QR code for the event.
- [ ] Admin can close an event.
- [ ] System rejects creation of a new event if the admin already has an ACTIVE event.

### Guest

- [ ] Guest can open the event URL from a QR code.
- [ ] Guest does not need an account.
- [ ] Guest can optionally enter a name before starting the session.
- [ ] Guest session is created only after the guest presses Start — not on page visit.
- [ ] Backend sets a session identifier in an HttpOnly cookie at session creation.
- [ ] Guest can submit up to 5 photos.
- [ ] A 6th photo submission is rejected by the backend.
- [ ] Guest can submit 1 voice note.
- [ ] A second voice note submission is rejected by the backend.
- [ ] Voice notes under 5 seconds are rejected by the backend.
- [ ] Voice notes over 30 seconds are rejected by the backend.
- [ ] Guest receives clear feedback after each submission.
- [ ] A guest accessing a CLOSED event can view the event page but cannot submit media.

### Admin

- [ ] Admin can see submitted media in chronological order.
- [ ] Guest name is displayed for each submission.
- [ ] Admin can search submissions by guest name.
- [ ] Admin can preview submitted photos.
- [ ] Admin can access and play submitted voice notes.
- [ ] Admin can download individual media items.
- [ ] Media access uses short-lived signed URLs; direct storage links are not exposed.

### Security

- [ ] Guest cannot bypass backend submission limits through frontend changes alone.
- [ ] Rate limiting exists on session creation, photo submission, and voice-note submission endpoints.
- [ ] Admin-only data and endpoints require authentication.

---

## 24. Future Scope

Features explicitly deferred — must not increase MVP complexity.

### AI / Intelligent Features

- AI photo quality scoring.
- AI duplicate detection.
- AI photo curation.
- AI content moderation.
- Voice transcription.
- AI-generated event highlights.

### Advanced Guest Features

- Multiple guest identities.
- Guest profiles.
- Social login.
- Guest reactions/comments.
- Live gallery.
- Sharing individual submissions.

### Advanced Admin Features

- Advanced analytics.
- Export reports.
- Bulk ZIP download.
- Multiple QR codes per event.
- QR scan analytics.
- Advanced filters.
- Bulk media management.

---

## 25. Decisions Already Made

1. MVP is a web application.
2. Guest enters through QR code.
3. Guest does not need an account.
4. Guest name is optional.
5. Guest session is the unit used for submission limits.
6. Maximum 5 photos per guest session.
7. Maximum 1 voice note per guest session.
8. Voice note minimum is 5 seconds.
9. Voice note maximum is 30 seconds.
10. Admin view is primarily chronological.
11. Admin can search by guest name.
12. Media files are stored separately from structured database metadata.
13. Backend is the authority for business rules and limits.
14. Basic rate limiting is required.
15. AI and advanced media processing are future scope.
16. QR code is an access representation, not a core domain entity.
17. MVP prioritizes simplicity and understandability.
18. An admin may have historical events, but at most one event may be ACTIVE at a time.
19. Guest sessions are created explicitly when the guest presses Start, after optional name entry.
20. Guest session identity is carried by a server-issued HttpOnly cookie.
21. Guest media is private; admins access it through authorized short-lived signed URLs.
22. Individual media download is MVP; bulk ZIP download is future scope.
23. Backend validates audio duration via server-side audio inspection. Frontend timer is UX only.
24. Upload pattern is Browser → Backend API → Object Storage (pattern A). Direct client uploads are not used in MVP.
25. Event public identifier is opaque and non-sequential.

---

## 26. Open Technical Decisions

To be decided at the technical design stage, after ERD and architecture are defined.

- ~~Frontend framework.~~ Resolved 2026-08-11: one Next.js same-origin application (TypeScript) — ARCHITECTURE_DECISIONS ADR-001.
- ~~Backend framework.~~ Resolved 2026-08-11: one Next.js same-origin application (TypeScript) — ARCHITECTURE_DECISIONS ADR-001.
- ~~Database technology.~~ Resolved 2026-08-11: Supabase PostgreSQL — ADR-002.
- ~~Object storage provider.~~ Resolved 2026-08-11: Supabase Storage private bucket — ADR-011.
- ~~Authentication provider.~~ Resolved 2026-08-11: Supabase Auth (admin) — ADR-010.
- ~~Hosting/deployment platform.~~ Resolved 2026-08: Vercel (owner).
- ~~Deployment topology (single domain vs separate frontend/backend) and resulting CORS/cookie configuration.~~ Resolved 2026-08-11: same-origin single application — ADR-001.
- ~~Exact API design.~~ Resolved 2026-08-11: API Contract LOCKED and implemented.
- ~~Exact database schema.~~ Resolved: db_scheme approved; migrations 0001–0008 applied.
- ~~Exact rate-limit values.~~ Resolved 2026-08-15: env-configurable defaults; topology per ADR-008.
- ~~Exact file-size limits.~~ Resolved 2026-08-15 (owner): 4 MB per upload (photo and voice), sized to the hosting platform's request-body limit.
- ~~Supported image formats.~~ Resolved: JPEG/PNG/WebP/GIF.
- ~~Supported audio formats.~~ Resolved: WebM/OGG/MP4 audio.
- ~~Audio inspection tool/library for server-side duration validation.~~ Resolved 2026-08: server-side ffprobe (T028).
- ~~Media retention policy.~~ Resolved 2026-08-15 (owner): retain media 7 days after event CLOSED, private during retention, automatic cleanup after.
- ~~Backup strategy.~~ Resolved 2026-08-15 (owner): MVP relies on Supabase managed backups; no custom backup/restore system.
- Monitoring and logging — split: structured API error logging implemented 2026-08; monitoring/alerting scope resolved 2026-08-15 (owner): structured API logs + Vercel logs; no Sentry/OTel/custom alerting for MVP.
- ~~Exact QR-code library.~~ Resolved 2026-08: QRCodeSVG (T021).
- ~~Exact camera/recording implementation.~~ Resolved 2026-08: getUserMedia + MediaRecorder with file-selection fallback (T030).
- ~~Event public identifier format (UUID, short random ID, or equivalent).~~ Resolved 2026-08-15: base64url of 16 random bytes.

---

## 27. Next Design Stage

Status (2026-08-15): this sequence is complete through testing and implementation; production deployment on Vercel (R3) is the remaining step, pending owner go-ahead.

Recommended sequence:

```
PRD v1.3 (this document)
   |
   v
Domain Model
   |
   v
ERD
   |
   v
Database Schema
   |
   v
API Design
   |
   v
Technical Architecture
   |
   v
Frontend UX / UI
   |
   v
Backend Implementation
   |
   v
Frontend Implementation
   |
   v
Testing
   |
   v
Deployment
```

The PRD is the business source of truth. Technical decisions must implement the requirements in this document and must not silently change them.
