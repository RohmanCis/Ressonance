# Current Task Status

**Status:** IDLE — T043/T044 complete 2026-08-29 (commit follows).

## Session summary

- T043 Indonesian UI sweep: all user-facing copy (guest + admin, visible +
  aria-labels + sr-only + placeholders) → Bahasa Indonesia, guest-page casual
  tone. `lang="id"`. e2e specs ×5, perf harness, component-catalog.html synced
  in-commit; stale catalog Done #15 → thermal-print; sign-in #25 re-rendered.
  Server/API error messages remain English (contract domain).
- T044 admin sign-in redesign (designer lane): asymmetric editorial split,
  copy "Akses admin"/"Kelola acaramu."/"Buat acara, bagikan akses, dan lihat
  semua kiriman."/"Masuk"/"Sebentar, ya…". Auth behavior untouched.
- DESIGN.md §5.3/§5.5/§6 synced; UX_FLOW.md synced; AGENTS.md §12 recorded.
- Fix found during e2e: `error.toLowerCase().includes("udah ada")` gates the
  ACTIVE_EVENT_EXISTS recovery link (was case-sensitive, broke vs "Udah ada").
- Validation: typecheck PASS; vitest 46 files / 374 PASS; build PASS (after
  killing a dev server that corrupted .next); e2e full 37 passed / 1 skipped.
- Known-fragile: client logic keying off message substrings — re-check
  `admin-ui.tsx` link gating on future copy changes.

## Outstanding (unchanged)

- Fix 6 LOW: Done loading `role="status"`; shutter double-fire guard;
  Capture focus-restore re-verify.
- Fix 7 deferred LOW (owner): signed-URL clock drift, isConstraintViolation
  hardening, unguarded smooth scrollIntoView, guest/admin error-color.
- Live-DB ILIKE re-verification at next `npm run test:postgres` window.
- Pre-deploy blockers: `TRUSTED_PROXY=1` + `CRON_SECRET` in Vercel.
- Owner visual QA: ~7px gap below camera SVG slot.
