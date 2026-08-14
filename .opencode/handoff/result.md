# Result: R2 — Structured error logging (API layer)

## Status
COMPLETE. All changes implemented; validation green.

## Files changed
- `lib/api-log.ts` (new): `correlationIdFrom(headers)` — `x-request-id` ?? `x-vercel-id` ?? `crypto.randomUUID()` (node:crypto stdlib, no new dep). `logApiError({ event, request?, code?, error, context? })` — emits ONE `console.error(JSON.stringify(...))` line: `{ timestamp, level: "error", event, correlationId, method, path, code, message, stack?, ...context }`. `message = error instanceof Error ? error.message : String(error)`; `stack` only for Error; `path` = pathname only (query stripped); `request` optional — absent → method/path omitted, correlationId still generated. Never reads headers/cookies/body. No "server-only" import.
- 12 route files edited (13 exist; `admin/me/route.ts` untouched — has no catch): every bare `catch` now `catch (err)` + `logApiError(...)` before the byte-identical response. 21 pre-existing catches + 1 new = 22 logged.
  - Event names: `event_lookup_failed` (events GET), `rate_limit_check_failed` (session limiter fail-closed), `session_create_failed` / `session_lookup_failed` (session POST/GET outer), `photo_submit_failed`, `voice_note_submit_failed`, `request_body_parse_failed` (session×2, photos, voice-notes, sign-in×2, admin/events POST — codes INVALID_REQUEST/INVALID_INPUT preserved), `admin_create_event_failed`, `admin_list_events_failed`, `admin_event_detail_failed`, `admin_access_failed`, `admin_close_event_failed`, `admin_submissions_failed`, `admin_media_access_failed`, `admin_media_download_failed`.
  - `admin/auth/sign-in/route.ts`: existing supabase auth call had NO catch — added try/catch (`admin_sign_in_failed`, 500 INTERNAL_ERROR) per task event list. Success/401 paths byte-identical; previously an unhandled throw fell through to Next default 500, now standard JSON INTERNAL_ERROR (see note below).
  - `admin/events/route.ts` GET: added optional `request?: NextRequest` param for logging (tests call `GET()` bare; TS enforces arity → optional; logApiError tolerates undefined request).
- `lib/submit-photo.ts` / `lib/submit-voice-note.ts`: cleanup logs migrated to `logApiError({ event: "photo_cleanup_failed"|"voice_note_cleanup_failed", error: err, context: { storageKey: key } })` — request omitted (smaller diff, no signature/caller changes), same event names, same storageKey field.
- `lib/api-log.test.ts` (new, 5 tests): single JSON line shape (timestamp/level/event/method/pathname-only/code/message/stack); correlationId precedence x-request-id > x-vercel-id > UUID; redaction (cookie value + query string never in output, path pathname-only); non-Error value → String(value), no stack, no throw on undefined; no-request call → correlationId still present, method/path omitted.
- `app/api/events/[public_id]/session/route.test.ts`: mock factory now `vi.fn(...)`; new test — `vi.mocked(checkSessionCreateRateLimit).mockRejectedValueOnce(...)` → response is EXACT `{ error: { code: "INTERNAL_ERROR", message: "Internal server error." } }` 500, one parsable console.error line with `rate_limit_check_failed` + correlationId + pathname + message; console.error spy restored (`mockRestore`). All existing assertions green.

## Validation
- `npx tsc --noEmit`: PASS (exit 0).
- `npx vitest run`: 279/279 PASS, 31/31 files (baseline 273 → +6: 5 api-log unit + 1 session route test; task expected ~+5). DB integration tests RAN against local Postgres (not skipped): `session-create-rate-limit.db.test.ts` 7/7, `schema.integration.test.ts` 10/10, `submit-photo.concurrency` 2/2, `submit-voice-note.concurrency` 2/2. Note: existing tests that trigger 400 malformed-JSON/500 paths now emit structured stderr log lines during the run — expected (those paths now log); no assertion changes, all green.
- `npm run lint`: 1 error + 7 warnings — EXACT baseline (`e2e/print-qa.spec.ts:34` pre-existing `any`, 7 pre-existing warnings). 0 new.
- `git diff --check`: clean (CRLF warnings only).

## Blockers
None.

## SSOT / drift notes
- No canonical doc edits, no migrations, no new deps, no middleware/instrumentation, no commits. Response bodies/statuses/headers/check order unchanged on every tested path.
- Deliberate deviation (report-only): sign-in route's Supabase auth call previously had no catch → unhandled throw produced Next's default 500. Added catch per task's `admin_sign_in_failed` event → standard JSON `INTERNAL_ERROR` 500. This makes the throw path contract-consistent with all other routes; success/401 unchanged.
- `admin/events` GET request param optional — only to keep existing `GET()` test calls valid; production Next.js always supplies the request.
- R1 changes remain uncommitted in the working tree (R1 + R2 combined for later commit by orchestrator).
- TD:219 requirement ("errors logged with correlation IDs, without cookies, raw media, or secrets") now satisfied by the API layer.

## Next step
Orchestrator: reconcile R1+R2; consider QA pass on 400-path log noise in test output; R3 (deploy/log routing) when scheduled.
