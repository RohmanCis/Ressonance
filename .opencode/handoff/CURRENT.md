# Current Task Status

**Status:** IDLE — T045 complete 2026-08-29 (uncommitted, working tree).

## T045 changes (fix batch, owner-approved)

- `components/guest/screens/Capture.tsx` — shutter double-fire guard (ref
  lock, 500ms release).
- `components/guest/screens/FrameSelection.tsx` — both scrollIntoView call
  sites honor `prefers-reduced-motion: reduce` (`behavior: "auto"`).
- `lib/admin-event-repo.ts` — `isConstraintViolation` requires PG code
  `23505` AND constraint name in message/details/hint; tests updated
  (+5 tests: route negative case + repo describe).
- Guest error-color unified to `--error` on neutral blocks (admin §2 parity):
  `PreSession.tsx` (Status title), `VoiceRecordingScreen.tsx` ×4,
  `PhotoReview.tsx` ×2. DESIGN.md §5.1 synced (error-text color qualifier).
- Closed as no-change: signed-URL clock drift (URLs always fetched fresh,
  never cached; TTL 900s owner-locked); Capture focus-restore (Radix Dialog
  owns trap+restore); Done loading role="status" (DROPPED by owner —
  out of scope).

Validation: typecheck PASS (combined state); vitest 46 files / 379 PASS
(Lane A, includes 5 new); Lane B color-only, no test imports. Not committed,
not pushed.

## Outstanding

- Commit + push T045 (and 6 unpushed commits dc12c73..f029479) — owner call.
- Case-sensitive guest_name search (deferred LOW, owner decision pending).
- API-level sign-in rate limiting (deferred LOW, owner decision pending).
- PHOTO_LIMIT dedup (deferred LOW, owner decision pending).
- Live-DB ILIKE re-verification at next `npm run test:postgres` window.
- Pre-deploy blockers: `TRUSTED_PROXY=1` + `CRON_SECRET` in Vercel.
- Owner visual QA: ~7px gap below camera SVG slot.
