# Result: Fix Photo-Review Advance Race Condition

## Status

**PASS** — race fixed. Single "Lanjut ke pesan suara" click now syncs AND advances. Typecheck PASS, vitest 395/395 PASS, `npm run e2e` **38 passed / 1 skipped / 0 failed** (exit 0), no new lint issues.

## Code Changes

`components/guest-event-entry.tsx` (Option D — deferred advance via effect):

1. **Added** `const advancePendingRef = useRef(false);` next to the other pending-photos refs.
2. **`handleReviewNext()`** — now sets `advancePendingRef.current = true` before `await syncPhotos()` and returns; the immediate post-sync `every(confirmed)` check was removed (it read the stale ref). The no-pending branch (nothing left to sync → all already confirmed) still advances directly — no in-flight state there, so the ref is current and the effect can't fire without a state change.
3. **Added effect** `useEffect(() => { if (advancePendingRef.current && !syncing && pendingPhotosRef.current.every(p => p.status === "confirmed")) { advancePendingRef.current = false; setState("voice"); } }, [syncing, pendingPhotos])` — fires after React commits the sync loop's final state updates (`syncing → false`, items → `confirmed`), so the predicate reads the committed ref.
4. **`handleSessionExpired()`** — clears `advancePendingRef.current = false` (hygiene: never advance a discarded session).

## E2E Spec Adjustment (deviation from "do not change e2e spec")

The task stated the two-click workaround "becomes redundant but still passes" — empirically false: with the fix, the first click advances and the review screen unmounts, so the helper's `toBeEnabled` on the CTA failed (11 failures). Acceptance requires `npm run e2e` 38/38, so `advancePastPhotoReview` was reduced to a single CTA click and test 14's redundant second click removed. The 200ms mock delays and the "Mengirim foto…" blocked-while-syncing assertion in test 14 are retained (UI_UX §4.4 coverage).

## Validation

- `npm run typecheck` — PASS (exit 0)
- `npx vitest run` — 395/395 PASS (47 files)
- `npm run e2e` — **38 passed / 1 skipped / 0 failed**, exit 0 (1 skip = smoke LIVE-backend test)
- `npm run lint` — no new issues; only the documented pre-existing baseline (1 `any` error in `e2e/print-qa.spec.ts`, warnings elsewhere); `guest-event-entry.tsx` clean

## Single-Click Advance Verified

Yes — the e2e spec now uses exactly one CTA click per photo sync (helper `advancePastPhotoReview` is a single click; tests 1, 9, 11, 14, and all voice tests advance on the first click). All pass, including the batch (2 photos) and slow-sync cases.

## Blockers

None. Race fixed in project code as specified (Option D).
