# Task: Standards-review remediation (mechanical wave)

Source: /code-review of `origin/main..HEAD` (13 commits). Standards axis findings S1, S4, S6 + testing gap S3. Spec/doc-reconciliation items are OUT OF SCOPE (separate owner-ratified wave).

## Fixes

1. **Token regression** — `components/guest/screens/Capture.tsx:481`: `border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20` → error-token classes. Match existing pattern in same file/diff (`PhotoReview.tsx:110`, `Capture.tsx:375` use `bg-error` family). No raw hex/red-* literals.
2. **Dedupe: ExpiryHint** — pre-expiry hint block duplicated in `components/guest/screens/PhotoReview.tsx:55–60` and `components/guest/screens/VoiceRecordingScreen.tsx:141–147`. Extract one shared component (guest screens dir), identical anatomy: const + conditional + `<p role="status">`. Behavior/aria/copy unchanged.
3. **Dedupe: status pill** — `Capture.tsx` ReviewOverlay status pill (~425–450) re-implements status→color/label cascades already in `components/guest/pending-status-badge.tsx`. Reuse that component (or its mapping) — no third copy. Visual parity preserved.
4. **Dedupe: AmbientBackdrop** — low-power orb/grain conditional duplicated in `components/admin/admin-ui.tsx` Shell and `components/guest/screens/PreSession.tsx`. Extract shared backdrop component; identical class output (incl. lowPower gating).
5. **rgba literal** — `Capture.tsx` `shadow-[0_16px_60px_rgba(0,0,0,0.9)]` → nearest non-literal (existing token/shadow-scale class). If nothing adequate exists, leave as-is and note it in result — do NOT invent new globals.css tokens.

## Tests (AGENTS.md §6 gate)

Add co-located `*.test.ts` for new pure logic, WITHOUT new dependencies (no @testing-library install; check vitest config for jsdom first — if absent, test only pure exports):
- `mediaFilter` (admin-dashboard) — filter transitions
- `AudioPlayer` time-format/seek math (export or test via existing exports; if not exportable without refactor, note and skip — do not refactor for testability in this wave)
- `useInViewOnce` / `useLowPowerAmbient` — only if testable with existing setup; otherwise note in result.md as remaining gap.

## Constraints

- No `docs/`, `supabase/`, API, schema changes. No new deps. No visual/behavior change — dedupe must be class-identical.
- e2e string assertions must stay green (copy unchanged).
- Validate: `npm run typecheck`, `npx vitest run` (all green incl. new tests), `npm run lint` (baseline: 1 pre-existing `any` error `e2e/print-qa.spec.ts`, warnings pre-existing). Playwright run of `e2e/admin-dashboard.spec.ts` + `e2e/mobile-media-qa.spec.ts` if they exist.
- Write `result.md`: status, files changed, tests added, validation output, anything skipped + why.
