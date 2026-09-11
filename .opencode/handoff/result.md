# Result: Guest copy warmth pass (items 1–10) + DESIGN.md spec sync

## Status
ALL DONE. Validation green.

## Changes
- `lib/pending-photos.ts` — `photoErrorMessage()` fully localized to Bahasa Indonesia (8 branches). Orchestrator adjusted 4 fixer strings to owner-exact wording: PHOTO_LIMIT_REACHED "Batas foto sesi ini sudah terpakai.", EVENT_CLOSED "Acara ini sudah selesai. Kiriman baru nggak diterima lagi.", SESSION_* "Sesi kamu sudah nggak berlaku.", default "Foto gagal dikirim. Cek koneksimu, lalu coba lagi."
- `lib/pending-photos.test.ts` — expected strings synced to final wording.
- `components/guest/screens/PhotoReview.tsx` — items 3, 4, 10 (helper, retry guidance, busy line).
- `components/guest/screens/VoiceRecordingScreen.tsx` — items 5, 6, 9 (helper, closed-event, min-duration warning, review helper, status line).
- `components/guest/screens/Done.tsx` — item 8 ("Yang punya acara akan lihat setelah acara selesai.").
- `components/guest-event-entry.tsx` — items 2, 7 (drop server meta-commentary, "Rekam ulang ya.").
- `e2e/mobile-media-qa.spec.ts` — 3 stale selectors synced (fix-1).
- `docs/DESIGN.md` — §5.4/§5.5/§5.6 copy updated to match items 8–10, amendment marker `(Amended 2026-09-12: copy warmth pass — align tone, remove English/formal words)` on 5 lines (lib-1).

## Validation
- `npx tsc --noEmit` — PASS.
- `npx vitest run` — 49 files / 381 passed / 4 skipped / 0 failed.
- ESLint on all touched files — 1 pre-existing warning (no-img-element), 0 errors.
- Not run: e2e (3 selectors changed in mobile-media-qa.spec.ts — run `npm run e2e` before deploy).

## Notes / risks
- Server-side API error messages stay English (API contract domain) — intentional, untouched.
- Key `UNSUPPORTED_MEDIA` (not UNSUPPORTED_FORMAT) — kept, message localized.
- SSOT: docs/DESIGN.md and code now aligned for items 8–10.

## Next step
Owner: review, commit, run e2e before deploy.
