# Task: Tech debt C11–C14 — cosmetic cleanups, zero design change

Read `AGENTS.md` §6 first. These are small mechanical cleanups. Do NOT change any visual design, copy, layout, or behavior. No new dependencies, no canonical doc edits, no migration edits.

## C11 — Capture counter aria-label sync (`components/guest/screens/Capture.tsx:160-167`)

The visual counter reads `FOTO {budgetRemaining} / {totalBudget}` but the `aria-label` says "Sisa {budgetRemaining} dari {totalBudget} foto" — direction mismatch (visual shows "FOTO" prefix first). Fix: make the accessible name mirror the visual exactly: `aria-label={`Foto ${budgetRemaining} dari ${totalBudget}`}` (keep `aria-live="polite"` and the visual markup unchanged). Leave `canAdvance` logic (Capture.tsx:92) and `localBudgetRemaining` (lib/pending-photos.ts) untouched — both correct and tested.

## C12 — NO-OP (verified)

`--font-mono` in app/globals.css:44 already resolves to DM Mono (`var(--font-dm-mono), DM Mono, ...`), so `font-mono` classes in PhotoReview.tsx and Capture.tsx already render DM Mono per DESIGN.md §3. Do nothing. Record this in result.md.

## C13 — Remove unused keyframes (`app/globals.css`)

Delete the two unused custom animations and their keyframes (verified unused — grep the whole repo for `animate-spin-tape` and `animate-wave-pulse` usage in tsx/ts first to confirm; only the css definitions should match):
- Line 46: `--animate-spin-tape: spin-tape 2s linear infinite;`
- Line 47: `--animate-wave-pulse: wave-pulse 900ms ease-in-out infinite;`
- Lines ~159-165: `@keyframes spin-tape { ... }` and `@keyframes wave-pulse { ... }` blocks.
Do not touch any other token/keyframe.

## C14 — Equalizer bar transition (`components/guest/screens/VoiceRecordingScreen.tsx:~254`)

The 9 decorative equalizer bars use `transition-all duration-300`. Replace with an explicit property list for what actually changes when toggling record state (height via inline style, background-color + height via class): `transition-[height,background-color] duration-300`. Visual result identical; removes the transition-all anti-pattern on continuously animating elements. Do not touch the pulse animation, colors, or progress bar (already scaleX-based).

## Validation (single lane, in order)

1. `npm run typecheck` — PASS
2. `npx vitest run lib/pending-photos.test.ts` — PASS (guard: C11 must not touch budget logic)
3. `npx playwright test e2e/mobile-media-qa.spec.ts` — ALL PASS (generous timeout; counter aria-label and voice screen are covered here)

## Out of scope

- docs/, supabase/migrations/, AGENTS.md
- Any visual/copy/behavior change beyond the exact edits above

## Report

Write `.opencode/handoff/result.md` (overwrite): status, files changed, validation results, deviations, next step.
