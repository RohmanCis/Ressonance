# Task: Execute M2 + M6 (M4 No-Op) — Guest Flow UI

**Agent:** designer (des-1, reused — you built the owner-decision preview)
**Type:** implementation. Owner approved all three After sides.

## M4 — verify only (no code change)

Re-confirm `components/guest/screens/VoiceRecordingScreen.tsx` stop button
already uses `bg-error` + `Square` icon while recording (it did at dispatch
time, line ~186). Record confirmation in result.md. No edit unless broken.

## M2 — 48px icon buttons

Per the approved After in `owner-decisions-preview.html`:
- `components/guest/screens/Capture.tsx`: "Ganti kamera" and "Pilih foto"
  icon buttons `h-11 w-11` → `h-12 w-12`; icon stroke 20px → 22px if the
  current icon is `h-5 w-5` → `h-[22px] w-[22px]` (or nearest token-safe
  size per DESIGN.md).
- Review-overlay corner buttons (retry-strip delete chip in `Capture.tsx`,
  delete/retake corners in `PhotoReview.tsx`): they use invisible 44px hit
  areas (`h-11 w-11`) with small visual chips — bump hit areas to `h-12 w-12`
  ONLY if it doesn't break the overlay positioning/visual chip geometry you
  mocked; otherwise keep 44px (they already meet the §2 minimum) and note it.
- Timer pill in Capture dock (`h-10 min-w-10`): leave as-is (display, not a
  control) unless it visually collides with the enlarged neighbors — adjust
  only for optical balance, per your preview.

## M6 — screen transitions in `guest-event-entry.tsx`

Implement the approved After: sequential full-screen state changes get a
fade/slide transition per docs/DESIGN.md §4:
- 350ms (`--motion-slow`), ease-out, transform+opacity ONLY.
- Outgoing: `opacity→0, translateY(-8px)` ease-in; incoming:
  `opacity 0→1, translateY(12px→0)` ease-out.
- `prefers-reduced-motion`: zero duration (DESIGN.md §4 verbatim rule —
  same global block pattern used elsewhere in the app).
- Focus management: after transition, ensure focus lands on the new screen's
  primary control / heading as it does today (no focus trap, no regression to
  keyboard-nav e2e in `e2e/mobile-media-qa.spec.ts`).
- Keep it minimal: a small transition wrapper or per-screen enter animation
  in `guest-event-entry.tsx` — no new dependencies, no framer-motion.
- Respect existing reduced-motion handling and `duration-fast` tokens where
  DESIGN.md §4 already dictates specific values; §4 wins over the preview if
  they differ.

## Constraints

- Files in scope: `components/guest-event-entry.tsx`,
  `components/guest/screens/Capture.tsx`,
  `components/guest/screens/PhotoReview.tsx`,
  `components/guest/screens/VoiceRecordingScreen.tsx` (M4 verify only).
- Do NOT touch: `docs/`, `supabase/`, `AGENTS.md`, e2e specs (if an e2e
  assertion breaks because of a size change, STOP and report instead of
  editing the spec).
- No new dependencies. TypeScript strict, no `any`.

## Validation (run before reporting)

- `npm run typecheck`
- `npx vitest run` (full suite, serialized)
- If feasible: `npx playwright test e2e/mobile-media-qa.spec.ts` — the
  keyboard-nav and locator assertions are the regression risk for M2/M6.

## Reporting

Write `result.md`: status, files changed, validation output, M4 confirmation,
any e2e assertion conflicts, next step.
