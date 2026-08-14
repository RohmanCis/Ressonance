# Task: R2 — Structured error logging (API layer)

Satisfy TECHNICAL_DESIGN.md:219 — "Errors must be logged with correlation IDs, without cookies, raw media, or secrets." NO migrations. NO response-body/header/status changes. NO new deps. NO middleware.ts/instrumentation.ts.

## Context (recon)
- ~21 route catch blocks are bare `catch {` — error discarded, nothing logged, all return `{ error: { code: "INTERNAL_ERROR", message: "Internal server error." } }` 500. 13 route files (4 guest + 9 admin), all `runtime = "nodejs"`, Next 15.
- Only existing logs: `lib/submit-photo.ts:127-133` and `lib/submit-voice-note.ts:139-145` (`console.error(JSON.stringify({ event: "photo_cleanup_failed"|"voice_note_cleanup_failed", storageKey, error: String(err) }))`).
- No logger util, no request-id usage, no log-assertion tests anywhere.

## Changes

### 1. New `lib/api-log.ts`
```ts
export function correlationIdFrom(headers: Headers): string  // x-request-id ?? x-vercel-id ?? crypto.randomUUID()
export function logApiError(entry: {
  event: string;            // stable snake_case event name
  request: Request | NextRequest;
  code?: string;            // response error code, e.g. "INTERNAL_ERROR"
  error: unknown;           // message + stack extracted safely
  context?: Record<string, unknown>;  // extra safe scalars (e.g. storageKey)
}): void
```
- Emits ONE line: `console.error(JSON.stringify({ timestamp: ISO, level: "error", event, correlationId, method, path, code, message, stack?, ...context }))`.
- message = `error instanceof Error ? error.message : String(error)`; stack only for `Error` instances.
- path = `request.url` parsed to pathname only. NEVER log headers, cookies, body, tokens, media. Keep module dependency-free (server-side; no "server-only" import needed unless types require — plain `Request` typing suffices).

### 2. Routes — all 13 files, every `catch` that returns 500 INTERNAL_ERROR
- Change bare `catch {` → `catch (err) {` + `logApiError({ event: "<descriptive_snake_case>", request, code: "INTERNAL_ERROR", error: err })` immediately before the unchanged 500 response.
- Event names: route+action specific, e.g. `session_create_failed`, `session_lookup_failed`, `photo_submit_failed`, `voice_note_submit_failed`, `event_lookup_failed`, `admin_sign_in_failed`, `admin_list_events_failed`, `admin_create_event_failed`, `admin_event_detail_failed`, `admin_close_event_failed`, `admin_access_failed`, `admin_submissions_failed`, `admin_media_access_failed`, `admin_media_download_failed`, `rate_limit_check_failed` (session route DB limiter catch), `request_body_parse_failed` (body-parse catches photos/voice/sign-in — these may return 400; still log with their actual code).
- Response bodies, statuses, headers, check order: UNCHANGED. Guest + admin behavior contract-identical.
- Include `lib/session-create-rate-limit.ts` fail-closed path caller (session route catch at ~line 62) — event `rate_limit_check_failed`.

### 3. Migrate cleanup logs
`lib/submit-photo.ts` + `lib/submit-voice-note.ts`: replace raw console.error with `logApiError({ event: "photo_cleanup_failed"|"voice_note_cleanup_failed", request, error: err, context: { storageKey } })` — keep event names. If those lib functions lack a request reference, pass request from their route callers OR keep minimal context without method/path (make `request` optional in the entry type; omit method/path when absent). Choose the smaller diff.

### 4. Tests
A) `lib/api-log.test.ts` (unit, spy `console.error`):
1. Emits single JSON line with timestamp, level "error", event, method, pathname-only path, code, message, stack for Error.
2. correlationId precedence: x-request-id > x-vercel-id > generated UUID.
3. Redaction: cookie header value and query string never appear in output.
4. Non-Error thrown value → message = String(value), no stack field; no throw on `undefined`.
B) Route test additions (extend ONE existing suite — session route test): mock limiter/DB to throw → assert response still exact 500 INTERNAL_ERROR body AND console.error spy captured one parsable JSON line containing `rate_limit_check_failed` + correlationId. Restore spies.

## Out of scope (hard)
- Migrations/DB, R3/deploy, 4xx logging (expected client outcomes), pino/winston/otel, response headers (incl. exposing correlation id to clients), middleware, canonical doc edits, commits.

## Validation (run + report)
- `npx tsc --noEmit`
- `npx vitest run` (expect 273 + ~5 new, all PASS)
- `npm run lint` (baseline 1 error + 7 warnings; 0 new)
- `git diff --check`

## Handoff
Write `.opencode/handoff/result.md`: status, files changed, validation, blockers, SSOT notes, next step.
