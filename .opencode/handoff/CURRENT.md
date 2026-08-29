# Current Task Status

**Status:** IDLE — T041 complete 2026-08-29, commits `dc12c73` + `7fa31f0`.

## T041 summary (fixes 1–5 + DESIGN.md §5.6 sync)

- Fix 1 (HIGH): unmount cleanup stops voice timer/recorder + aborts voice XHR
  (guest-event-entry.tsx).
- Fix 2: `syncingRef` mutex on syncPhotos double-invocation.
- Fix 3: `startingRef` synchronous double-submit guard on start().
- Fix 4: handleCapture try/catch fail-soft; use-camera capture() teardown on
  play() rejection (null srcObject, return null).
- Fix 5: object-URL revocation on session-expiry/carry-over-decline; voice XHR
  abort + `status === 0` post-abort guard.
- DESIGN.md §5.6 rewritten to match thermal-print Done implementation
  (librarian-drafted, orchestrator-verified against Done.tsx); §7 Done
  inventory row synced.
- Validation: typecheck PASS; `npx vitest run` 46 files / 374 tests PASS
  (374 vs 373 baseline — one upstream test, all pass). E2E not run (per task).
- Not committed by design: none — working tree clean.

## Remaining from previous session's list

- Fix 6 (LOW): Done loading text `role="status"`; shutter double-fire guard
  (Capture.tsx:85–91); review Radix-vs-manual focus-restore conflict
  (Capture.tsx:572–577 — re-verify before acting).
- Fix 7 (Deferred LOW, owner): signed-URL clock drift, isConstraintViolation
  hardening, unguarded smooth scrollIntoView, guest/admin error-color
  inconsistency.
- Validation debt: full e2e not run since T035–T040 (37 pass / 1 skip at
  2026-08-28). Run at next QA window.
- Live-DB re-verification of ILIKE at next `npm run test:postgres` window.
- Pre-deploy blockers: `TRUSTED_PROXY=1` + `CRON_SECRET` in Vercel.
- Owner visual QA: ~7px gap below camera SVG slot (viewBox 110 vs slot end
  y=102) — photo not hard-flush against slot.

## Next task

Fix 6 LOW batch or QA window (full e2e + test:postgres).
