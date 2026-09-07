# Task: Polish FrameSelection UI & Remove First 3 Frames

**Files:** `lib/frames.ts`, `components/guest/screens/FrameSelection.tsx` (+ test updates forced by frame removal)
**SSOT:** docs/DESIGN.md §3, §5.2
**Status:** implemented by orchestrator (exact-spec mechanical); verification complete; critique dispatched.

## Changes
1. `lib/frames.ts`: removed `royal-gold`, `botanical-romance`, `modern-editorial`. Remaining: `none` (DEFAULT_FRAME_ID), `wedding-crimson`, `flower`.
2. `FrameSelection.tsx`: header helper `<p>` removed; h1 `font-normal` → `font-medium`; `◆` divider → CSS gradient diamond (PreSession pattern); unselected cards `border-border/60 opacity-55` → `border-border/70 opacity-80 scale-95`; footer countdown block → `<p className="text-[11px] text-text-muted text-center pt-1">Tenang, bingkai masih bisa kamu ganti saat foto.</p>`.
3. Test updates (required, frame removal broke them):
   - `lib/frames.test.ts`: EXPECTED_IDS → `["wedding-crimson", "flower"]`; labels updated.
   - `e2e/mobile-media-qa.spec.ts`: card count 5→2; "Pakai Royal Gold Serif" → "Pakai Wedding Crimson"; `/frames/royal-gold.png` → `/frames/wedding-crimson.png`; keyboard-nav indices adjusted for 2-card wrap.

## Validation
- typecheck PASS 0 errors; `vitest lib/frames.test.ts` 6/6; e2e `mobile-media-qa.spec.ts` 19/19.

## Critique
des-1 (#designer) review of both files dispatched (background).
