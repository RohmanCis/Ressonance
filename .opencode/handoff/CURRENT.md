# Current Task Status

**Status:** IDLE — T042 complete 2026-08-29, commit `0174aae`. E2E green again.

## T042 summary (e2e diagnostic + fix)

- Owner reported many e2e failures. Diagnostic run: 6 failures, all in
  `mobile-media-qa.spec.ts`, all asserting Done arrival via
  `heading "QA Media Event"`.
- Root cause: T035–T038 Done redesign — h1 now sr-only and gated behind
  thermal-print phase 4 (~8.5s). Tests asserted visible heading within 5s.
  Copy-obsolete assertions, not functional breaks. Auth gate, code-split,
  start() guard all exonerated.
- Fix: `doneHeading` helper now targets receipt copy "Terima kasih — …"
  (visible at phase 4), call-site timeouts 5000→12000ms.
- Validation: mobile-media-qa 19/19 PASS; full `npm run e2e` 37 passed /
  1 skipped (live-backend skip, expected). Working tree clean, not pushed.
- Lesson: never use PS 5.1 Get-Content/Set-Content on UTF-8 source with
  non-ASCII literals (first attempt corrupted em-dashes, 12 false failures).

## Next task (owner intent)

Owner plans redesign/polish of many pages + components (text, CTAs, buttons).
Sequence agreed: e2e green first (done), now redesign. DESIGN.md is SSOT —
spec changes must precede/ride with implementation; e2e string assertions
updated in-commit per repo convention.

## Also outstanding

- Fix 6 (LOW): Done loading text `role="status"`; shutter double-fire guard;
  Capture.tsx focus-restore re-verify.
- Fix 7 (Deferred LOW, owner).
- Live-DB re-verification of ILIKE at next `npm run test:postgres` window.
- Pre-deploy blockers: `TRUSTED_PROXY=1` + `CRON_SECRET` in Vercel.
- Owner visual QA: ~7px gap below camera SVG slot.
