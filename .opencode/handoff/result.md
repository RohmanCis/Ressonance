# Result: Tech debt C11–C14 — cosmetic cleanups, zero design change

Status: COMPLETE

## Changes

- `components/guest/screens/Capture.tsx:163` (C11): `aria-label` on the photo counter changed from `Sisa {budgetRemaining} dari {totalBudget} foto` → `Foto {budgetRemaining} dari {totalBudget}`, mirroring the visual order (FOTO prefix). `aria-live="polite"`, visual markup, `canAdvance`, and `localBudgetRemaining` untouched.
- `app/globals.css` (C13): removed `--animate-spin-tape` (was line 46) and `--animate-wave-pulse` (was line 47) theme tokens, plus their `@keyframes spin-tape` / `@keyframes wave-pulse` blocks (were lines 158-168). Grep-verified unused in ts/tsx source (only matches were globals.css itself and the static artifact `component-catalog.html`). No other token/keyframe touched.
- `components/guest/screens/VoiceRecordingScreen.tsx:254` (C14): equalizer-bar class `transition-all duration-300` → `transition-[height,background-color] duration-300`. Pulse animation, colors, progress bar untouched.
- C12: verified NO-OP. `app/globals.css` `--font-mono` already resolves to DM Mono (`var(--font-dm-mono), DM Mono, ...`), so `font-mono` classes render DM Mono already. No change made.

## Validation (single lane, in order)

1. `npm run typecheck` — PASS
2. `npx vitest run lib/pending-photos.test.ts` — PASS (23/23)
3. `npx playwright test e2e/mobile-media-qa.spec.ts` — PASS (19/19, 4.5m) — includes counter usage + voice screen coverage

## Deviations

None. Out-of-scope files (docs/, supabase/migrations/, AGENTS.md) untouched.

## Next step

None required from this task. Budget logic and all other debt items per task scope left as-is.
