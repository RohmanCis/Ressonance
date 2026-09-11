# Current Task Status

**Status:** IDLE — production live, no active task.

## Project state
- **Production:** https://ressonance-one.vercel.app
- **Live DB:** migrations `0001`–`0004`, `0007`–`0009` applied (0005/0006 remote history `reverted`). Service-role DELETE privileges on all 4 tables verified `true` 2026-09-11.
- **Last audit:** 2026-09-11 (pre-event, 3-lane explorer/librarian/qa + orchestrator verification) — see `result.md`.
- **Last validated:** typecheck PASS; vitest 49 files / 379 passed / 4 skipped / 0 failed; full e2e vs production 38 tests PASS.

## Open blockers (fix sebelum event 12 Sep 2026)
- **B1:** Voice upload deadlock saat network failure — `components/guest-event-entry.tsx:568` `request.onerror` early-return on `status === 0` tanpa set error state; UI stuck "submitting". Fix: hapus early-return, set `review-error`.
- **B2:** 429 retry otomatis tanpa batas — `components/guest-event-entry.tsx:373-378` (`i--; continue` indefinite); UI locked + retry storm. Fix: cap retry 3× → error + retry manual.

## Owner decisions needed
- **D1:** Serialisasi upload per-event (event-row `FOR UPDATE` lock dipegang selama Storage upload, `lib/photo-tx-repo.ts:59` + `lib/submit-photo.ts:132`, idem voice) — opsi (a) refactor upload-before-tx atau (b) accept-and-monitor.
- **D2:** Migration 0010 — pin `GRANT DELETE ON events, guest_sessions TO service_role` (additive, zero-risk, direkomendasikan).
- **D3:** Doc reconciliation batch — PRD +FR delete event; db_scheme hapus stale notes; API_CONTRACT §8.8 → `0001–0009`; ARCHIVED-deletable clarification §5.12.
- **D4:** FrameSelection default = frame pertama, bukan `none` — verifikasi intentional vs drift (DESIGN.md §5.2).

## Deferred (post-event)
- UI/UX polish: touch targets (Lanjut 44px vs 48px; admin filter 40px), motion violations, color literals bypass tokens, EN aria-labels admin-access.
- Admin: debounced search tanpa abort controller, close-dialog error tersembunyi (`DialogClose` wrap), `revokeObjectURL()` terlalu cepat.
- Backend minor: `signOut()` result tidak dicek, `pool.connect()` di luar try, voice 30s timer rentan throttle.
- Refactor: photo/voice payload adapter duplikat, storage adapter duplikat, admin auth boilerplate ×10 → `requireAdmin()`, helper duplikat.
- Dead code: `lib/supabase/client.ts` orphan, `component-catalog.html` stale, export-only-for-test symbols (~10).
