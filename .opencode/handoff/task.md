# Task: Phase A1 Lane 2 — Object-URL Cleanup + E2E Locator Fix

Objective: (a) fix the stale-closure object-URL leak on unmount in
`components/guest-event-entry.tsx`; (b) fix the pre-existing strict-mode e2e
failure at `e2e/mobile-media-qa.spec.ts:203`; (c) fix two stale canonical-doc
section references in comments.

## 1. Object-URL cleanup stale closure (verified bug)

`components/guest-event-entry.tsx:486-493` — unmount cleanup effect has empty
deps and closes over the FIRST render's `pendingPhotos`, `expiredPending`,
`voiceUrl` (all initially empty). Photos deleted mid-flow or voice blobs
discarded via state resets are revoked correctly elsewhere (lines 281, 292,
436), but anything still live at unmount leaks.

Fix pattern (repo already uses it for `pendingPhotosRef`, lines 59-60):
- Mirror `pendingPhotosRef` usage — add refs synced on each render for
  `expiredPending` and `voiceUrl` (and use the existing `pendingPhotosRef`).
- Cleanup effect reads the refs; keep the empty deps + eslint-disable as-is
  (it is intentionally unmount-only).
- Minimal diff; no behavior change other than actually revoking.

## 2. E2E strict-mode violation (pre-existing, proven by stash-rerun)

`e2e/mobile-media-qa.spec.ts:203`:
`page.locator("img[src='/frames/royal-gold.png']")` resolves to 2 elements on
the capture screen — the ambient blurred backdrop img (Capture.tsx ~line 105)
and the viewfinder overlay img (CameraViewfinder, ~line 333). Playwright
strict mode fails.

Fix: scope the locator to the isolated 9:16 viewport box so it matches only
the overlay, e.g. `page.locator("div.aspect-\\[9\\/16\\] img[src='/frames/royal-gold.png']")`
(the same `div.aspect-\\[9\\/16\\]` escape is already used at line 181; the
backdrop img is NOT inside that box). Verify exactly one match before/while
running. Keep the assertion intent (overlay visible on capture screen).

## 3. Stale comment references

- `components/guest/screens/Done.tsx:10`: comment says "(DESIGN.md §5.4)" —
  Done is §5.6. Change to §5.6.
- `components/guest-event-entry.tsx:599`: "still in client memory (§5.4)" —
  refers to the keepsake from the last confirmed capture; leave the code and
  this comment UNCHANGED (the keepsake feature itself is a pending owner
  decision — out of scope).

## Constraints

- Modify ONLY: `components/guest-event-entry.tsx`,
  `e2e/mobile-media-qa.spec.ts`, `components/guest/screens/Done.tsx` (comment
  only).
- Do NOT touch DESIGN.md, UX_FLOW.md, docs/, the Done.tsx keepsake/wax-seal
  markup, or any screen component (touch-target fixes from lane 1 are already
  applied — do not disturb them).
- No new dependencies, no refactors beyond the minimal fix.

## Validation

- `npm run typecheck` clean.
- `npx vitest run` — full suite green (354+ tests; serialized, single run).
- `npx playwright test e2e/mobile-media-qa.spec.ts` — 19/19 PASS (dev server
  handled by the shared Playwright config; do not run concurrently with
  anything else).
- Write `.opencode/handoff/result.md`: status, files changed, validation
  output summary, risks.
