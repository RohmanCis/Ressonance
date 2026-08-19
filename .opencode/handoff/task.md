# Task: Architecture deepening #1 — GuestSubmissionAuth + shared guest-submission route pipeline

## Context

Architecture review found byte-identical `resolvePhotoAuth`/`resolveVoiceNoteAuth` functions (7-line session SQL + event/limits/expiry checks + discriminated result; differing only by the `kind` string literal). All three guest-submission routes (photos, voice-notes, guest-messages) duplicate the same pipeline: auth resolver → HTTP status/error mapping → multipart/content guards → submission call → usage-response building → rate-limit config, differing only in the I/O adapter (ffprobe vs field name) and limit constant.

**Deletion test:** removing the auth functions would force duplication of session SQL + event-check + expiry-check logic at each route. Removing the pipeline choreography would duplicate the exact status/logging/rate-limit pattern across 3+ routes (and any future submission kind). Both pass the deletion test — keep and deepen.

## Design (decided — implement as specified)

### Part A: GuestSubmissionAuth seam

New module `lib/guest-submission-auth.ts`:

Extract digest from __Host-guest_session cookie, SQL join guest_sessions + events, check session found/event match/expired/ACTIVE status, return discriminated union (ok: sessionId+eventId+eventStatus | !ok: missing/invalid/expired/wrong_event/event_inactive).

Docblock cross-refs: API Contract §6, db_scheme.md guest_sessions/events, TECHNICAL_DESIGN.md §4.1.

Co-located test `lib/guest-submission-auth.test.ts`: covers all 5 result branches with pg Client fixture (pattern: existing submit-photo.test.ts).

### Part B: Shared route pipeline factory

New module `lib/guest-submission-pipeline.ts`:

`createGuestSubmissionHandler<T>(config: { extract, submit, rateLimitConfig })` returns Next.js POST handler. Factory handles: rate-limit → resolveGuestSubmissionAuth → map auth failures to 401/403/409 + logApiError → config.extract(req) → config.submit(publicId, sessionId, eventId, payload) → map submit result (ok: 201+usage | !ok: status+logApiError).

Route becomes ~10 lines: import factory + payload extractor + submitPhoto, export POST = factory call.

Co-located test: verify auth-kind → HTTP mapping, extract/submit failure handling, 201 success.

### Part C: Thin payload-extraction adapters

New modules:
- `lib/photo-payload.ts` — extractPhotoPayload: multipart → MIME/size guards → {ok, payload: {blob, contentType}} | {!ok, kind}. Lifted from photos route :88–141.
- `lib/voice-note-payload.ts` — extractVoiceNotePayload: multipart → ffprobe → {ok, payload: {blob, contentType, durationSeconds}} | error. Lifted from voice-notes route :107–176.
- `lib/guest-message-payload.ts` — extractGuestMessagePayload: multipart → 280-char validation → {ok, payload: {messageText}} | error.

Each with co-located test.

### Part D: Route file updates

Update 3 route files to use factory (~10–15 lines each). Keep route-level tests (*.route.test.ts) — they exercise factory via route; optionally slim if lib tests cover branches.

## Files in scope

New:
- lib/guest-submission-auth.ts + test
- lib/guest-submission-pipeline.ts + test
- lib/photo-payload.ts + test
- lib/voice-note-payload.ts + test
- lib/guest-message-payload.ts + test

Modified:
- app/api/events/[public_id]/photos/route.ts (refactor to factory)
- app/api/events/[public_id]/voice-notes/route.ts (refactor to factory)
- app/api/events/[public_id]/guest-messages/route.ts (refactor to factory)
- lib/submit-photo.ts — delete resolvePhotoAuth, import resolveGuestSubmissionAuth
- lib/submit-voice-note.ts — delete resolveVoiceNoteAuth, import resolveGuestSubmissionAuth
- lib/submit-guest-message.ts — delete resolver if present
- Route tests (*.route.test.ts) — adjust if needed
- lib/rate-limit.ts — export named configs if not already

## Do NOT change

- Any canonical doc, migration, admin code, e2e specs, client components, hooks
- submitPhoto/submitVoiceNote/submitGuestMessage internal logic
- Wire format (same 201 + usage body)
- Existing tx-repo/storage/audio-inspector adapters

## Acceptance criteria

- resolvePhotoAuth/resolveVoiceNoteAuth deleted; all callers use resolveGuestSubmissionAuth
- All 3 guest-submission routes use createGuestSubmissionHandler — route files ≤15 lines
- Duplication deleted: session SQL, auth→HTTP, rate-limit, logging, status selection all in pipeline once
- npx tsc --noEmit 0 errors
- npx vitest run — 378 baseline + new tests (expect ~390+)
- Route behavior unchanged: same status codes, error codes, 201+usage shape

## Report

Write result.md: status, files changed (new + modified with line-count delta), diffs summary, tsc + vitest output, blockers, SSOT conflicts, deviations.
