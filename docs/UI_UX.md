# UI/UX Contract — QR Guest Photo & Voicebook

**Status:** LOCKED — approved for implementation  
**Authority:** Level 6 UI/UX contract under `AGENTS.md` §2. It defines MVP screen behavior and presentation constraints. PRD, schema, architecture, technical design, and API contract remain higher authorities.  
**Scope:** MVP guest and admin experiences only.

## 1. Scope and non-goals

The guest experience supports event access, optional naming, up to five photos per guest session, and one voice note of 5–30 seconds. The admin experience supports sign-in, event creation and closure, event access/QR, chronological media review, guest-name search, photo preview, voice playback, and individual download.

Excluded: AI or moderation, transcription, guest accounts, social login, guest profiles, live gallery, reactions, sharing, analytics, reports, advanced filters, bulk download, bulk media management, multiple QR variants, and other PRD §24 deferrals. No new feature, endpoint, identity, or client-side authority is defined here.

## 2. Global principles

- Guest is mobile-first. Primary actions remain reachable and usable one-handed. Admin screens are desktop-friendly and remain usable on smaller screens.
- Keep the next action clear. Explain permission requests before requesting them.
- Every control has a visible, meaningful label. Instructions do not rely on color, icons, placeholder text, sound, or motion alone.
- Keyboard users can reach every interactive element, operate it without a pointer, and see a clear focus indicator. Focus order follows the reading and task order; focus does not move unexpectedly.
- Text and essential controls meet applicable WCAG contrast requirements. Error, success, limit, and disabled states remain understandable without color alone.
- Loading, upload progress, recording state, completion, and errors are announced to screen readers through an appropriate status or alert mechanism. Focus moves to a newly relevant error or result only when useful and without interrupting active input.
- Disable controls during submission to prevent duplicate actions. A disabled client control is a hint, never the authority for limits, ownership, event status, validation, or authentication.
- Do not expose cookies, session credentials, database IDs, storage keys, or raw signed URLs.
- Show success only after the API confirms required persistence. Do not silently retry uploads.

## 3. Screen map

### Guest

- `/e/{public_id}`: event entry, optional name, explicit Start, post-session photo and voice submission flow, usage, and event status.

### Admin

- Admin sign-in: credentials, authentication feedback, and signed-in transition.
- Event dashboard: event state, create/close actions, submission timeline, search, preview/playback, and individual download.
- Event access/QR: public URL and QR representation with copy/print affordances.

No additional guest or admin screen, route, endpoint, or workflow is defined.

## 4. Guest experience

### 4.1 Pre-session

**Purpose:** Let a guest identify the event and explicitly begin a session.

**Content:** Event title; optional guest-name field; Start action; concise explanation that the name is optional and applies to submissions in this session.

**Actions:** Start is primary. Name entry is optional. No session is created on page load. No photo or voice submission affordance appears before successful Start.

**States:**

- Loading: identify the event; prevent actions until event state is known.
- Ready: show title, optional name, and Start.
- Closed: show the event as viewable; explain that new submissions are not accepted; Start and all submission affordances are disabled.
- Not found: explain that the event cannot be found; provide no submission action.
- Invalid name: identify the name field issue; preserve editable input; allow correction and resubmission.
- Starting: disable Start and name submission; announce progress; do not create another session from repeated activation.
- Rate-limited: explain that starting is temporarily unavailable; use `Retry-After` when available; allow retry after the indicated interval.
- Network failure/offline: explain that Start did not complete; keep entered name; allow a deliberate retry when connected.
- Unexpected failure: explain that the session could not start; allow safe retry.

### 4.2 Post-Start capture screen

**Purpose:** Make camera capture the primary guest experience after Start, while offering voice-note submission as a separate secondary action.

**Content:** Event title; guest name or `Anonymous Guest`; camera viewfinder with shutter; a remaining-photo indicator that reflects a local capture budget; a pending photo strip of captured-but-unsent and server-confirmed items; a Send action to synchronize pending photos; a voice-note action that is separate from the photo capture queue; status and recovery messages.

**Capture budget indicator:** The remaining-photo indicator is a UX hint computed as `5 − (server-confirmed accepted count) − (local pending capture count)`. It may show zero before the server confirms anything. It is never authoritative for the 5-photo limit; backend limit enforcement remains authoritative (§4.3, §7).

**Actions:** Capture photos into a local pending buffer; synchronize pending photos via Send; enter the voice-note flow; review, delete, or retake pending captures before synchronization. Continue until limits or event status prevent it.

**States:**

- Loading: retrieve or confirm session usage; announce status.
- Ready (camera available): show viewfinder, shutter, remaining indicator, pending strip, Send, and voice-note action.
- Ready (camera unsupported or denied): show file-selection fallback; pending strip, remaining indicator, Send, and voice-note action remain available.
- Empty: usage of zero submissions is a valid ready state, not an error.
- Limit reached: show the server-confirmed limit; disable the shutter as a hint; explain that the limit applies to this guest session. Voice note remains available if its limit is not reached.
- Closed after Start: retain view access and usage where available; disable all submission actions; explain that the event is closed. Pending captures remain visible but cannot be submitted.
- Session expired/invalid: discard in-memory session authority and usage state. Pending captures remain visible and are marked as not saved. Show an expiry/session-invalid message and require Start again. The expired session is never reused, and no quota is transferred between sessions. If the guest presses Start again, a new independent session and quota are created; any unsent captures from the previous session may be offered for explicit carry-over into the new session, where they count against the new session's budget. Carry-over requires explicit user action — it is never automatic. If the guest declines carry-over or the page is reloaded, pending captures are discarded. Never silently retry or restore authority from localStorage.
- Offline/network failure: preserve unsent in-memory captures where safe; explain that no submission was confirmed; provide deliberate retry where safe.

### 4.3 Photo flow

**Purpose:** Capture multiple photos into a local pending buffer, manage them before synchronization, synchronize them as a batch using existing server endpoints, and report per-item results.

**Batch synchronization:** Synchronization sends pending photos sequentially using the existing single-photo endpoint (`POST /api/events/{public_id}/photos`). No new endpoint, batch endpoint, or API contract change is introduced. Each upload response returns authoritative usage; the client updates from the response, not from optimistic local counters.

**Capture budget:** The local remaining-photo indicator is a UX hint computed as `5 − (server-confirmed accepted count) − (local pending capture count)`. It may reach zero before any upload. It is never authoritative; the backend limit check remains authoritative. When the local indicator reaches zero, the shutter is disabled as a hint. If the server later rejects an item (e.g. `PHOTO_LIMIT_REACHED`), the freed budget is reflected by recalculating from the server-confirmed count.

**Pending item states:** Each photo in the pending buffer is in one of: `pending` (captured, not yet uploaded), `uploading` (in-flight to server), `confirmed` (server accepted, 201), `error` (server rejected or network failed, retry available), or `expired` (session expired before upload).

**States and transitions:**

1. Camera ready: show the viewfinder and shutter. The remaining-photo indicator and pending strip are visible. The guest may capture repeatedly without uploading after each capture. A file-selection fallback is offered when camera capture is unavailable.
2. Permission request: explain camera access before the browser prompt.
3. Permission denied/unsupported: explain the unavailable capability; offer supported file selection when available; do not imply that any photo was submitted. The pending strip and Send action remain available for any captures already taken.
4. Captured: the photo is added to the pending strip as `pending`. The camera remains ready for the next capture. No immediate upload occurs. The remaining-photo indicator decreases by one.
5. Review: tapping a pending thumbnail shows a full-size preview with delete and retake choices. Delete removes the item and frees the local budget. Retake removes the item and returns the camera to ready. Confirmed items cannot be deleted — no delete endpoint exists.
6. Syncing (Send): pending items are uploaded sequentially. Each item transitions to `uploading`, then to `confirmed` on 201 or `error` on failure. Per-item progress is shown. Duplicate Send is disabled while syncing is in progress.
7. Sync complete: show a summary of accepted and rejected items. Update the remaining-photo indicator from the server-confirmed count. Offer continued capture if budget remains.
8. Error: associate the error code with the item; preserve the item when retry is safe; provide correction or retry. A failed upload is not counted as success. A failed item does not block other pending items. On `PHOTO_LIMIT_REACHED` (409), the item is marked `error`; remaining pending items stay `pending` and may be deleted by the guest. On `RATE_LIMITED` (429), pause the sync queue, honor `Retry-After` when present, then resume. On `SESSION_EXPIRED` or `SESSION_INVALID` (401), abort sync, discard session authority, and follow the session-expired behavior in §4.2. On `EVENT_CLOSED` (422), mark the item `error` with no retry.

Client previews, the local capture budget, and pending counters are UX hints. They do not decide file validity, remaining capacity, or submission success. Server-confirmed counts from the upload response are authoritative.

### 4.4 Voice-note flow

**Purpose:** Record, review, and submit one voice note.

**States and transitions:**

1. Idle: explain the 5–30 second requirement and offer recording.
2. Permission request: explain microphone access before the browser prompt.
3. Permission denied/unsupported: explain the limitation and provide no false submission state.
4. Recording: show an accessible recording status and elapsed time; make stop available.
5. Auto-stop: stop automatically at 30 seconds; move to review.
6. Under five seconds: show a clear UX hint that the recording is too short; allow continued recording before stopping where possible. The backend remains authoritative.
7. Review: provide playback, duration, submit, and re-record actions. Re-record replaces the unsent in-memory take only.
8. Submitting: disable duplicate submission; announce progress.
9. Success: confirm persistence, update usage, and remove/disable the recording action because the voice-note limit is consumed.
10. Error: explain whether correction, re-recording, or retry is needed; do not claim persistence.

Do not present the browser timer as proof of accepted duration. Do not persist or silently resend an unsent recording after a failed request.

## 5. Admin experience

### 5.1 Sign-in

**Purpose:** Authenticate the event administrator.

**Content:** Clearly labelled email and password fields; sign-in action; authentication status.

**States:** loading; ready; submitting with duplicate activation disabled; authentication failure with correction path; rate-limited with retry guidance; offline/network failure with deliberate retry; authenticated transition. Never expose auth tokens or credential details.

### 5.2 Event dashboard

**Purpose:** Manage the event and inspect submissions.

**Content:** Event title and status; close action while ACTIVE; access/QR action; guest-name search; newest-first submission timeline. Submissions may be clustered by contributor session (`guest_session_ref`) as a presentation grouping; group and item order remain newest-first. Each submission shows media type, guest label, timestamp, and applicable preview/playback control.

**States:**

- Loading: announce event or submission retrieval.
- Ready with submissions: timeline is newest first; search is available.
- Empty event: explain that no submissions exist yet.
- Search results: retain the query and show matching submissions newest first.
- Empty search result: state that no submissions match the guest name; offer clearing or editing the query.
- Closing: disable duplicate close activation; announce progress; update status only after confirmation.
- Closed: retain history and access to existing submissions; remove or disable close; show the closed status clearly.
- Event not found/forbidden: explain that the event is unavailable or not accessible; do not reveal private details.
- Media preview/playback loading: announce retrieval; show a bounded loading state.
- Media failure: identify the affected item; allow safe retry; do not show raw storage links.
- Downloading/download failure: identify the affected item; allow retry; downloads remain individual.
- Offline/network failure: retain search input and current view where possible; state that fresh data or media could not be loaded; allow deliberate retry.

### 5.3 Event creation

**Purpose:** Create one ACTIVE event.

**Content:** Clearly labelled title field; create action; resulting event access/QR affordance.

**States:** ready; invalid input with field guidance; submitting; success with event title, status, public URL, and access/QR action; `ACTIVE_EVENT_EXISTS` with explanation and recovery to the existing event; authentication, rate-limit, network, and unexpected failure states with safe retry where applicable.

### 5.4 Event access and QR

**Purpose:** Let the admin share or print the event access representation.

**Content:** Public URL; QR representation; copy and print affordances; success or failure feedback for each action.

**States:** loading; ready; copy success; print in progress or unavailable; access not found/forbidden; network failure; retryable unexpected failure. The URL may be displayed for sharing, but signed media URLs must never be persisted or shown here.

## 6. Error-state presentation

Message intent is defined below; final wording is not locked. Recovery must not promise an outcome the API has not confirmed.

| Code | Audience | Message intent | Recovery |
|---|---|---|---|
| `INVALID_REQUEST` | Guest/admin | Request or required input was malformed. | Correct the form or media selection; retry. |
| `INVALID_JSON` | Admin/guest | Request format could not be read. | Retry from the current form; report a network issue if repeated. |
| `INVALID_INPUT` | Guest/admin | One or more values failed validation. | Focus the relevant field; correct and retry. |
| `AUTHENTICATION_REQUIRED` | Admin | Sign-in is required. | Return to sign-in. |
| `AUTHENTICATION_FAILED` | Admin | Sign-in or admin session was not accepted. | Correct credentials or sign in again. |
| `SESSION_REQUIRED` | Guest | Start is required before submitting. | Return to pre-session state; press Start. |
| `SESSION_INVALID` | Guest | Guest session is no longer valid. | Discard in-memory session state; require Start again. |
| `SESSION_EXPIRED` | Guest | Guest session has expired. | Discard in-memory session state; require Start again. |
| `FORBIDDEN` | Admin | The signed-in admin cannot access this event or media. | Return to an owned event; do not retry unchanged access. |
| `NOT_FOUND` | Guest/admin | The event or media item is unavailable. | Check the access URL or return to the event list; do not expose details. |
| `EVENT_CLOSED` | Guest | This event remains viewable but accepts no new submissions. | Disable submission actions; no upload retry. |
| `PHOTO_LIMIT_REACHED` | Guest | The session has reached five accepted photos. | Disable photo submission as a hint; continue with voice only if available. |
| `VOICE_NOTE_LIMIT_REACHED` | Guest | The session already has an accepted voice note. | Disable voice submission; continue with photos if available. |
| `ACTIVE_EVENT_EXISTS` | Admin | Another ACTIVE event already exists for this admin. | Open or manage the existing event; do not repeat creation unchanged. |
| `EVENT_ALREADY_CLOSED` | Admin | The event is already closed. | Refresh status; treat as closed without repeating the action. |
| `INVALID_EVENT_STATE` | Admin | The event cannot be changed in its current state. | Refresh and follow the displayed current state. |
| `UNSUPPORTED_MEDIA` | Guest | The selected file format is not accepted. | Choose a supported image/audio file or re-record. |
| `FILE_TOO_LARGE` | Guest | The selected file exceeds the configured size limit. | Choose a smaller file or a shorter/lower-size recording. |
| `AUDIO_DURATION_INVALID` | Guest | The voice note is outside the accepted 5–30 second range. | Re-record within the range. |
| `AUDIO_UNINSPECTABLE` | Guest | The audio could not be read or verified. | Re-record or choose a valid recording; retry only with a valid file. |
| `RATE_LIMITED` | Guest/admin | Too many requests were made in a short period. | Wait for the indicated retry interval, then retry deliberately. |
| `MEDIA_PERSISTENCE_FAILED` | Guest | The media was not confirmed as saved. | Keep the item if safe; retry once service is available. Never show success. |
| `MEDIA_ACCESS_FAILED` | Admin | The requested private media could not be accessed. | Retry the individual preview, playback, or download. |
| `INTERNAL_ERROR` | Guest/admin | The service could not complete the operation. | Preserve safe input; retry when appropriate; avoid duplicate submission while status is unknown. |

HTTP status, stable error code, and safe server message determine the presentation. Unknown codes use the generic service-failure treatment, not a guessed explanation.

## 7. Feedback and timing

- Announce every async start and completion: event loading, session start, permission result, capture/recording state, upload progress, success, and failure.
- Keep the active control disabled during submission. Re-enable it only after success or a recoverable failure.
- Show success per item only after its `201` response. Update usage from the server response, not from optimistic counters. During batch photo synchronization, show per-item progress and a summary of accepted and rejected items after the batch settles.
- Retry only operations that are safe to repeat. A failed or interrupted media request must not be silently retried.
- Use `Retry-After` when supplied for `RATE_LIMITED`; otherwise give no invented duration.
- Preserve user-entered name, search text, and unsubmitted media when safe. On session invalidation or expiry, discard in-memory session authority and usage state. Unsent in-memory captures may remain visible and are marked as not saved. The expired session is never reused and no quota is transferred between sessions. Unsent captures must not be submitted using or resurrecting the expired session. If the guest presses Start again, a new independent session and quota are created; any unsent captures from the previous session may be offered for explicit carry-over into the new session, where they count against the new session's budget. Carry-over requires explicit user action — it is never automatic. If the guest declines carry-over or the page is reloaded, pending captures are discarded.

## 8. Guest-name fallback

When no name was supplied, show `Anonymous Guest` in guest-facing session context where a label is needed and in every admin submission context. The fallback remains searchable only according to the approved guest-name search behavior; no new search semantics are added here.

## 9. Open UI questions

- Exact user-facing copy and terminology.
- Visual style, theme, typography, spacing, and imagery.
- QR rendering library or equivalent rendering implementation.
- Camera and recorder implementation details, supported browser matrix, and permission-denial fallback details.
- How session expiry is surfaced in timing and wording; the expiry policy (30-minute session lifetime) is now resolved in canonical documents.
- Whether and how to communicate media retention; retention policy remains open.
