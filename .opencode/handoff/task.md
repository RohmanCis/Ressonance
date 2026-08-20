# Task: Fix Photo-Review Advance Race Condition

## Context

E2E spec discovered a race in `components/guest-event-entry.tsx` `handleReviewNext()`: after `await syncPhotos()`, the function checks `pendingPhotosRef.current.every(p => p.status === "confirmed")` before React flushes the final "confirmed" state updates from the sync loop.

**Current behavior:** First CTA click syncs photos successfully but doesn't advance (predicate fails on stale ref); second click advances (ref now reflects committed state).

**Expected behavior:** Single CTA click syncs → state commits → predicate passes → advances to voice screen.

## Root Cause

`handleReviewNext` checks the ref immediately after `syncPhotos()` resolves, but `syncPhotos()` updates `pendingPhotos` state via `setPendingPhotos` inside a loop — those state updates are batched and don't commit until after the function returns. The ref sees stale "uploading" status.

## Fix

Re-check the advance predicate after the state flush using an effect-based approach:

**Option D (preferred):** Track `advancePendingAfterSync` boolean ref; `handleReviewNext` sets it true before sync, effect fires when `!syncing` + flag true + all confirmed, then clears flag and advances.

## Implementation

**File:** `components/guest-event-entry.tsx`

1. Add `const advancePendingRef = useRef(false);` near other refs
2. In `handleReviewNext()`:
   - Set `advancePendingRef.current = true` before `await syncPhotos()`
   - Remove the immediate `if (pendingPhotosRef.current.every(...)) setViewState("voice")` check after sync
3. Add `useEffect`:
   ```tsx
   useEffect(() => {
     if (
       advancePendingRef.current &&
       !syncing &&
       pendingPhotosRef.current.every(p => p.status === "confirmed")
     ) {
       advancePendingRef.current = false;
       setViewState("voice");
     }
   }, [syncing, pendingPhotos]);
   ```

This defers the advance check until React commits the final state updates from `syncPhotos()`.

## Acceptance Criteria

- First "Lanjut ke pesan suara" click syncs AND advances (no second click needed)
- `npx vitest run` — all tests pass (no behavior change for existing unit tests)
- `npm run e2e` — 38/38 pass (e2e spec's two-click workaround becomes redundant but still passes)
- No new lint/typecheck errors

## Files in Scope

**Modified:** `components/guest-event-entry.tsx` (add ref + effect, remove immediate advance check)

**Do NOT change:** e2e spec (the two-click helper becomes redundant but remains valid), canonical docs, routes, hooks, other components.

## Report

Write `result.md`: status, code changes (ref + effect + removed check), tsc + vitest + e2e output, whether single-click advance now works (manual verification or e2e observation), blockers.
