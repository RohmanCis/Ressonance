# Result — Item 5: Admin download failure handling

## Status
DONE. No owner decision required.

## Files changed
- `lib/admin-download.ts` (new): pure, side-effect-free mapping module.
  - `describeDownloadResponse(status): "ok" | "error"` (2xx ok, else error).
  - `downloadErrorMessage(code?)`: AUTHENTICATION_REQUIRED/AUTHENTICATION_FAILED → "Your session may have expired. Sign in again."; FORBIDDEN/NOT_FOUND → "This media is no longer available."; default (MEDIA_ACCESS_FAILED/INTERNAL_ERROR/unknown/missing) → "Download failed. Try again."
  - `downloadErrorCode(status, body)`: reads `body.error.code` safely; malformed body → INTERNAL_ERROR (401 without parseable code → AUTHENTICATION_REQUIRED).
  - `downloadErrorCodeFromResponse(response)`: async, tolerant `.json()`; non-JSON body → INTERNAL_ERROR (never surfaces raw envelope text).
- `lib/admin-download.test.ts` (new): 11 tests — every code mapping, unknown/missing default, ok/error status classification, envelope parse safety (non-JSON body → default message), code extraction.
- `components/admin/admin-dashboard.tsx`: both download sites (DownloadButton, PreviewDialog header button) replaced `window.location.href = /download` with shared `useDownload(item, name)` hook: `fetch(url, { redirect: "follow" })` (302 signed-URL redirect preserved; endpoint untouched); non-ok → parse envelope → per-item error with `{typeLabel} from {name}` identification + Retry (UI_UX §5.2:153); ok → blob → object URL → anchor click → revoke. `inFlight` ref + `disabled` while in flight (duplicate-activation prevention, UI_UX §2). Network throw → same per-item error treatment. Dialog shows `Status error` (existing admin-ui pattern) with Retry.

## Validation
- `npx vitest run lib/admin-download.test.ts` — 11/11 PASS.
- `npm run typecheck` — PASS (no output).
- `npx vitest run` full suite — 35 files, 315/315 PASS.

## Risks
- Filename derived client-side from mime_type (signed-URL Content-Disposition filename lost through fetch→blob). Minor; no contract impact.
- Signed-URL response served with non-2xx at final hop (e.g. expired TTL) falls into the generic error mapping — already covered by contract codes (403 FORBIDDEN → "This media is no longer available.").
- Blob download keeps full media in memory until revoke; single-item downloads only, acceptable for MVP volumes.
- No test added for the hook/component itself (browser DOM behavior); mapping logic fully covered via pure module.

## SSOT / drift
None. No API/route changes, no TTL changes, no new deps, no other files touched.
