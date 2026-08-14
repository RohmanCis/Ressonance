# T031 — Result (Admin Event Index)

## Status: COMPLETE (orchestrator-reconciled)

## Canonical amendments (owner-approved 2026-08-15, applied this task)
- `docs/API_CONTRACT.md` — new §5.10 `GET /api/admin/events` (owned events, newest-first, `{events:[Event §4]}`, 401/500; no pagination/filter for MVP).
- `docs/UI_UX.md` — §3 Admin routes: Admin Event Index entry; new §5.5 screen spec (ACTIVE prominent, history accessible, Open, Access/QR on ACTIVE, create action, unauth → sign-in, ACTIVE_EVENT_EXISTS recovery → index).

## Files changed
API lane (fixer):
- `lib/admin-event-repo.ts` — `listAdminEvents(db, adminId)`: owned events, `created_at` DESC, throws on error.
- `app/api/admin/events/route.ts` — GET handler: 401 AUTHENTICATION_REQUIRED / 200 `{events}` / 500 INTERNAL_ERROR; POST untouched.
- `app/api/admin/events/route.test.ts` — 5 GET tests (401, 200 newest-first + ownership + no admin_id/PK leak, empty, 500).
- `test/admin-event-db.ts` — fake extended: `selectError` + `eq().order()` chain.
- `lib/admin-event-repo.test.ts` — 4 repo tests.

UI lane (designer):
- `app/admin/page.tsx` — server cookie-presence gate: no sb auth cookie → redirect `/admin/sign-in`; else render index (API remains authoritative; client redirects on 401).
- `components/admin/admin-event-index.tsx` — NEW: loading/failure-retry/empty/ready; ACTIVE coral card (Open + Access/QR); past-events list with Open; Create new event; 401 → sign-in.
- `components/admin/admin-sign-in.tsx` — real component (was shim); post-sign-in → `/admin`.
- `e2e/admin-index.spec.ts` — NEW: 8 tests (sign-in→index lands, ACTIVE visible, CLOSED visible, Open→dashboard, Access/QR, Create end-to-end, ACTIVE_EVENT_EXISTS recovery→index not sign-in, unauth redirect) + failure-retry/empty-state coverage (16 total incl. variants).

Orchestrator cleanup:
- `components/admin/admin-ui.tsx` — removed dead `AdminSignIn` export (superseded by `admin-sign-in.tsx`; nothing imported it; lint confirmed 0 new).

## Validation (orchestrator-rerun after all merges)
- `npx tsc --noEmit` — PASS
- `npx vitest run` — 266/266 PASS (baseline 258 + 8 new)
- `npm run lint` — baseline only (1 pre-existing error e2e/print-qa.spec.ts:34 + 7 pre-existing warnings); 0 new
- `npx playwright test e2e/admin-index.spec.ts e2e/smoke.spec.ts e2e/qr-qa.spec.ts` — 16 passed / 1 skipped / 0 failed

## SSOT conflict
None. Implemented per newly amended API_CONTRACT §5.10 + UI_UX §5.5. No guest behavior, auth, or existing dashboard routes changed. Prior open doc-drift items (UI_UX §4.2/§4.3 wording, INVALID_JSON, stale open-decision lists) remain open, out of T031 scope.

## Architecture drift
None. One new locked-contract endpoint (approved); no new deps; service-role + ownership-check pattern preserved.

## Remaining risks
- `/admin` gate is cookie-presence hint; expired-cookie session renders index briefly then client redirects on 401 — acceptable, API authoritative.
- Live visual QA of `/admin` with a real authenticated admin (seeded ACTIVE event) still outstanding (pre-existing deferral).
- `window.location.href` navigation (sign-in/create) is full reload — consistent with existing admin pages.

## Next step
Owner review; then R-bundle release hardening (R1 DB-backed session-create rate limit, R2 error logging, R3 deploy+live QA) per approved prioritization. Uncommitted by owner instruction.
