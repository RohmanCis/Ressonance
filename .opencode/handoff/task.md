# T030-R — Implement Retake in photo review overlay

Approved gap: UI_UX §4.3-5 + UI_DESIGN §11 document retake; code has Back+Delete only.

## Behavior spec
1. `ReviewOverlay` gains a "Retake" button, shown only when the photo is unsent
   (status `pending` or `error`). Hidden for `uploading` and `confirmed`.
2. Retake action: revoke the item's `previewUrl`, remove it from `pendingPhotos`,
   close the overlay. The camera-first viewfinder is already the ready state —
   no forced capture state, no auto-upload, no session mutation.
3. Budget invariant: removing a `pending` item frees one local slot; the
   replacement capture consumes one. `localBudgetRemaining` must show no net
   double-decrease (automatic via in-flight count; add a unit test proving it).
4. Delete behavior unchanged (gating `status !== "confirmed"` remains).
5. Button order in overlay: Back | Retake | Delete. Retake styled like the
   existing primary action (`bg-primary`, `min-h-12`, existing focus ring classes).
   Retake aria/label: "Retake".

## Files
- `components/guest-event-entry.tsx` — add `onRetake`/`canRetake` to
  ReviewOverlay (lines ~822-875), add `retakePhoto(index)` handler near
  `deletePhoto` (~240), wire at overlay call site (~558-565).
- `lib/pending-photos.ts` — add pure `canRetakePhoto(status: PendingStatus): boolean`
  (true for `pending`|`error`).
- `lib/pending-photos.test.ts` — unit tests: `canRetakePhoto` truth table;
  budget invariant (remove pending + add pending → `localBudgetRemaining` unchanged).
- `e2e/mobile-media-qa.spec.ts` — two tests, follow existing mock helpers:
  a) picker file → Photo 1 → open review → Retake → dialog closed, strip empty,
     no Send button, counter back to full, zero POST /photos requests.
  b) upload 1 photo (mock 201) → confirmed → open review → Retake button absent.

## Validation (run all, report output)
- `npx tsc --noEmit`
- `npx vitest run`
- `npm run lint` (0 new errors; pre-existing warnings OK)
- `npx playwright test e2e/mobile-media-qa.spec.ts` (14/14 expected)

## Authority
- docs/UI_UX.md §4.2, §4.3; docs/UI_DESIGN.md §11; AGENTS.md §3, §9

## Constraints
No new endpoints, schema, deps, error codes. No unrelated UX changes. No
canonical doc edits. Do not commit/push. Write `.opencode/handoff/result.md`
at completion (status, files, validation, SSOT conflict, drift, next step).
If a real contract conflict appears, STOP and report it in result.md.
