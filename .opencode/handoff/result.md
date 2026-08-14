# T030-R — Result (Retake in photo review overlay)

## Status: COMPLETE

## Files changed
- `lib/pending-photos.ts` — added pure `canRetakePhoto(status: PendingStatus): boolean`; true only for `pending`|`error`.
- `lib/pending-photos.test.ts` — added "pending-photos retake logic" describe: `canRetakePhoto` truth table (all 5 statuses); budget invariant (remove one pending frees a slot, replacement capture consumes it, net `localBudgetRemaining` unchanged).
- `components/guest-event-entry.tsx` — added `retakePhoto(index)` handler (revoke `previewUrl`, remove item, close overlay; no auto-upload, no session mutation); wired `canRetake={canRetakePhoto(...)}` + `onRetake` at overlay call site; `ReviewOverlay` gains `canRetake`/`onRetake` props; Retake button rendered between Back and Delete, styled as primary (`min-h-12`, `bg-primary`, `rounded-md`, `font-semibold`, `text-primary-foreground`, same focus-visible ring classes), visible only when `canRetake`. Delete gating (`status !== "confirmed"`) untouched.
- `e2e/mobile-media-qa.spec.ts` — added tests #13 (retake: dialog closed, strip empty, no Send, "5 photos remaining" restored, zero POST `/photos`) and #14 (confirmed: Back present, Retake and Delete absent).

## Validation
- `npx tsc --noEmit` — PASS (no output).
- `npx vitest run` — 258/258 PASS (256 pre-existing + 2 new).
- `npm run lint` — 0 new errors; 1 error in `e2e/print-qa.spec.ts:34` (`no-explicit-any`) is PRE-EXISTING (file untouched, not in diff). Warnings pre-existing.
- `npx playwright test e2e/mobile-media-qa.spec.ts` — 14/14 PASS.

## SSOT conflict
None. Behavior matches UI_UX §4.3-5 and UI_DESIGN §11. Prior Point #1 report-only gaps (Send always-shown wording, etc.) remain open, out of T030-R scope.

## Architecture drift
None. No new endpoints, schema, deps, or error codes. Retake reuses existing local-buffer removal; camera viewfinder is already the ready state.

## Assumptions
- `retakePhoto` shares the same removal semantics as `deletePhoto` (revoke + remove + close overlay); spec allows, Delete kept separate and unchanged.
- Retake button labeled by visible text "Retake" (accessible name matches).
- `expired` items not retakeable (`canRetakePhoto` false) — spec lists only `pending`/`error`.

## Next step
Orchestrator reconcile: DONE — T030-R marked complete after independent re-verification (tsc PASS, vitest 258/258, lint 0 new, Playwright 14/14). CURRENT.md updated. Uncommitted by owner instruction.
