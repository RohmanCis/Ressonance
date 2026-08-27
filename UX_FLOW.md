# UX_FLOW.md — Guest & Admin Flow Reference

QA companion to DESIGN.md (canonical design system) and docs/TECHNICAL_DESIGN.md (system constraints). Audience: owner doing manual QA on localhost.

## Guest Flow

**Overall sequence:** PRE_SESSION → FRAME_SELECT → CAPTURE → PHOTO_REVIEW → VOICE_NOTE → DONE

### 1. PRE_SESSION (Landing)

- Open `/e/{public_id}`. Event loads; no session is created on page load.
- Shows event title, optional guest-name field ("Namamu"), and the Start action ("Mulai yuk").
- Enter optional name → press **Mulai yuk**. A 30-minute guest session begins (HttpOnly cookie; never reused after expiry).

### 2. FRAME_SELECT

- Horizontal snap carousel of 9:16 frame cards (viewport-locked, no page scroll). Selecting a card highlights it (gold border); exactly one frame — or none — is active.
- Press **Pakai {Frame}** to confirm with a selection, or **Tanpa Frame, lanjut** to proceed unframed.
- "No Frame" is never a grid card — only reachable via skip.
- Session usage is confirmed after this step; then the camera opens.

### 3. CAPTURE (fullscreen camera)

- Viewfinder fills the viewport; the selected frame overlays it unmirrored.
- Photo counter ("N / 5") reflects the local budget hint — the server limit is authoritative.
- Shutter captures into a local pending buffer (thumbnail strip); no upload happens yet.
- **Lanjut** appears once at least one photo is pending; capture auto-advances to review when the local budget hits zero.

### 4. PHOTO_REVIEW

- Grid of captured photos with per-item delete and sync status.
- The primary CTA syncs all pending photos (sequential uploads, per-item spinner → check/error), then advances to VOICE_NOTE. Advance is blocked while items are pending/uploading.
- Retry failed items or delete them; confirmed items cannot be deleted.

### 5. VOICE_NOTE (full-screen voice recording)

- Full-screen dedicated state for optional voice note recording.
- Center stage: gold mic button, DM Mono timer (00:00 / 00:30), recording status.
- Review: playback preview, duration check (<5s warning), re-record option.
- Primary CTA: "Kirim Pesan Suara" (submit) advances to DONE.
- Skip action: "Lewati — Kirim Foto Saja" text link advances to DONE without voice upload.

### 6. DONE

- Quiet thank-you: event title, brief confirmation. No further actions. A new session requires Start again.

## Guest Edge Cases (QA checklist)

| Case | How to reach | Expected |
|---|---|---|
| Camera denied/unsupported | Deny camera permission | File-selection fallback; pending strip, counter, Lanjut remain usable; no photo implied submitted |
| No frame selected | Skip frame selection | Capture proceeds unframed; photos are plain 9:16 |
| Frame asset fails | (Server/asset fault) | Capture continues unframed — never blocked |
| Audio too short | Record < 5s, stop | "Too short" hint; server remains the authority on acceptance |
| Audio over 30s | Keep recording | Auto-stop at 30s; review state |
| Invalid name | Enter an invalid name on Landing | Field error; name preserved; correct and retry |
| Session expired | Wait 30 min (or cookie cleared) | Session authority discarded; unsent photos marked "not saved"; Start prompt; explicit carry-over offered on new Start |
| Event closed (before Start) | Open a CLOSED event link | Event viewable; Start and submissions disabled |
| Event closed (after Start) | Admin closes during session | Submission actions disabled with explanation; pending captures visible but not submittable |
| Rate limited | Rapid retries | Retry-after guidance; deliberate retry only |
| Offline | Disconnect during any submit | No false success; deliberate retry when reconnected |

## Admin Flow

1. **Sign-in** — email/password at `/admin/sign-in`.
2. **Event Index** (`/admin`) — list of own events; ACTIVE event prominent; Open / Access-QR actions; create-new-event action.
3. **Event dashboard** — event title, status, Close action (while ACTIVE), Access/QR, guest-name search, newest-first submission timeline grouped by guest session; photo preview dialog, voice playback, individual downloads.
4. **Event creation** — title field; one ACTIVE event allowed at a time (`ACTIVE_EVENT_EXISTS` points to the existing event).
5. **Access/QR** — public URL + QR block with copy and print.

Constraints (docs/TECHNICAL_DESIGN.md): all limits, validation, and authorization are backend-authoritative; media is private with short-lived signed URLs; closed events stay viewable but reject submissions; 7-day retention after CLOSED with automatic cleanup.
