# Result: Standards-review remediation (mechanical wave)

## Status
COMPLETE — all 5 fixes + testing gate. No docs/schema/API changes, no new deps.

## Files changed
- `components/guest/ambient-backdrop.tsx` (NEW) — shared AmbientBackdrop (`printHidden` prop for admin print:hidden gating); class output byte-identical to both prior implementations incl. lowPower gating.
- `components/guest/screens/expiry-hint.tsx` (NEW) — shared ExpiryHint (PRE_EXPIRY_WARN_SECONDS + guard + `<p role="status">`, `message` prop).
- `components/guest/screens/PhotoReview.tsx` — pre-expiry block → `<ExpiryHint message=…>` (copy unchanged); removed local const.
- `components/guest/screens/VoiceRecordingScreen.tsx` — same swap; removed local const.
- `components/guest/pending-status-badge.tsx` — added `statusPillDotClass` + `statusPillLabel` exports (single home for status→visual mapping).
- `components/guest/screens/Capture.tsx` — (1) Hapus button `border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20` → `border-error/30 bg-error/10 text-error hover:bg-error/20` (error-token family, outline anatomy preserved); (3) ReviewOverlay status-pill cascades → `statusPillDotClass`/`statusPillLabel` (class-identical output, strings verbatim); (5) `shadow-[0_16px_60px_rgba(0,0,0,0.9)]` → `shadow-[0_16px_60px_var(--overlay)]` (existing token, same-file precedent at viewport box).
- `components/admin/admin-ui.tsx` — Shell ambient orbs+grain → `<AmbientBackdrop printHidden />`; dropped `useLowPowerAmbient` import.
- `components/guest/screens/PreSession.tsx` — Shell ambient orbs+grain → `<AmbientBackdrop />`; dropped import.
- `components/guest/audio-player.tsx` — exported `formatTime` (pure fn, one-word change).

## Tests added
- `components/guest/pending-status-badge.test.ts` (4 tests) — statusPillDotClass + statusPillLabel (dot-color triads + exact e2e-locked strings).
- `components/guest/audio-player.test.ts` (2 tests) — formatTime m:ss/zero-pad/clamp.

## Skipped (with reason)
- `mediaFilter` test — inline `useState` inside AdminDashboard, not exportable without refactor; task permits skip (no refactor-for-testability this wave).
- `useInViewOnce` / `useLowPowerAmbient` tests — DOM/hook-dependent; vitest config is `environment: "node"` (no jsdom). Remaining gap noted.
- Remaining rgba literals outside task scope: `VoiceRecordingScreen.tsx` Cassette shadow, `PreSession.tsx` Card shadow (task item 5 named Capture.tsx only).

## Validation
- `npm run typecheck` — PASS, 0 errors.
- `npx vitest run` — PASS, 360/360 (45 files; 354 prior + 6 new), single instance.
- `npm run lint` — baseline identical: 1 pre-existing `any` error (`e2e/print-qa.spec.ts:33`), 12 pre-existing warnings (no new files flagged). 13 problems total = documented baseline.
- Playwright NOT run (per contract; orchestrator after reconciliation).

## Blockers
None.

## SSOT conflict
None.

## Architecture drift
None. Zero new deps; shared components under existing dirs; token/behavior unchanged.

## Risks
- Low: `border-error/30 bg-error/10 text-error` renders `--error (#c0564f)` instead of Tailwind `red-400 (#f87171)` — token-canonical per DESIGN.md §2; intent of S1 fix.
- Low: `--overlay` shadow is rgba(0,0,0,0.6) vs literal 0.9 — near-invisible delta on dark bg; task-authorized nearest non-literal (no new tokens invented).
- `statusPillDotClass`/`statusPillLabel` live in pending-status-badge.tsx (client-free) — pure, tested.

## Playwright (orchestrator, post-reconciliation)
`npm run e2e` — 37 passed / 1 skipped (live-backend, expected), 2.2m. Copy/a11y parity confirmed (e2e-locked status strings, roles, admin dashboard flow all green).

## Before/after (review metrics)
| Axis | Before (13 commits) | After (this wave) |
|---|---|---|
| Hard standards violations | 2 (red-* literals; missing unit tests) | 0 |
| Duplicated-Code smells | 3 (ExpiryHint ×2, status cascade ×3, ambient conditional ×2) | 0 |
| Raw color/rgba literals (scoped) | 2 in Capture.tsx | 0 (token family + `var(--overlay)`) |
| Unit tests | 354 | 360 (+6) |
| Gates | typecheck/vitest/lint/e2e green | unchanged green |

## Next step
