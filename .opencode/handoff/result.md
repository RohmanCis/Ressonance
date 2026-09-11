# Result: UI/UX polish batch — 6 polish points + 2 minor

## Status
ALL DONE (3 lanes: design-1, fix-1, fix-2). Validation green.

## Lane design-1 — @designer: 6 polish points
Files: `Capture.tsx`, `VoiceRecordingScreen.tsx`, `PreSession.tsx`, `PhotoReview.tsx`, `admin-access.tsx`, `admin-dashboard.tsx`, `e2e/qr-qa.spec.ts`, `e2e/print-qa.spec.ts`.
1. Touch targets: Capture "Lanjut →" `h-11`→`h-12` (48px, spacer height matched); admin filter segments `min-h-10`→`min-h-11` (44px).
2. Motion (§4 transform+opacity only): bare/`transition-[…]` on interactive elements narrowed to `transition-transform`/`transition-opacity` (Capture 151/200/235/258/272/486/495/505, Voice 215/332/349, PhotoReview 62/197/242/252, PreSession 203/275); equalizer bar height/bg transitions + form-field `transition-colors` + skip-link `transition-colors` removed (instant); ratified `animate-pulse` (recording/skeletons) kept; `prefers-reduced-motion` untouched.
3. Color literals: Capture shutter gradient → `--accent-foil-dark`/`--accent-foil-light` (canonical gold-foil pair, §2); admin destructive buttons `red-*` → `--error` tokens (3 sites).
4. Voice success: confirmed-state block `border-accent/30`→`border-success/30`, icon `text-accent`→`text-success`; amber recording styling untouched.
5. Headings: Voice + PhotoReview `text-2xl sm:text-3xl` → `text-3xl` flat (§3/§5); PreSession event-title 4xl/5xl untouched (per §5.1).
6. aria-labels: admin-access "Kode QR akses acara" / "Kode QR cetak akses acara"; e2e selectors synced (`qr-qa.spec.ts:26,69,85`, `print-qa.spec.ts:46,47`) — no other e2e changes.

## Lane fix-1 — @fixer: signOut 500 branch test
- `app/api/admin/auth/sign-out/route.test.ts`: +1 test — `signOut` error → 500 + INTERNAL_ERROR envelope + call-count assert. Success/401 already covered. Mock extended with settable `signOutError`. No route bug found.

## Lane fix-2 — @fixer: capture error feedback
- `components/guest-event-entry.tsx`: `handleCapture` no longer swallows failures — throw/null-blob → `captureError` state, 3s auto-dismiss, cleared on next success; timer cleaned up on unmount.
- `components/guest/screens/Capture.tsx`: `captureError` prop → `role="alert"` banner in header zone (matches closed/pre-expiry anatomy, `--error` tokens): "Gagal jepret foto, coba lagi." Design-1 styling untouched.

## Validation
- `npm run typecheck` — PASS.
- `npm run lint` — baseline only: 1 pre-existing `any` (`e2e/print-qa.spec.ts:33`) + 15 warnings. No new findings.
- `npx vitest run` — 49 files / 381 passed (+1 signOut test) / 4 skipped / 0 failed.
- Not run: e2e (aria-label selectors changed in 2 specs — recommend `npm run e2e` before deploy).

## Risks / notes
- `FrameSelection.tsx:218` still has a non-compliant transition (`transform,opacity,border-color,box-shadow,background-color`) — was outside this batch's write scope; flagged by designer. Candidate for a follow-up 1-line fix.
- Voice equalizer bar height changes now instant (was transitioned) — visual feel slightly snappier; compliant with §4.
- `hover:brightness-105` (filter) on gold CTAs kept — repo-wide incl. ratified redesigns.

## Next step
Owner: review diff, commit, run e2e before deploy.
