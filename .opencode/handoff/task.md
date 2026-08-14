# T031 — Task: Admin Event Index UI (Phase 2)

Read `.opencode/handoff/result.md` (API lane, complete) + `docs/UI_UX.md` §5.5 (new, owner-approved) + `docs/UI_DESIGN.md` (admin shell §10, tokens, spacing, motion) before work.

## Goal
`/admin` = authenticated Admin Event Index. API exists: `GET /api/admin/events` → `{ events: [ {public_id,title,status,created_at,closed_at} ] }`, newest-first, owned only. 401 AUTHENTICATION_REQUIRED when unauthenticated.

## Required behavior (UI_UX §5.5)
- Unauthenticated `/admin` → redirect `/admin/sign-in`.
- Authenticated: list admin's events; ACTIVE visually prominent; CLOSED/history accessible.
- Per event: Open action → `/admin/events/{public_id}` (existing dashboard, unchanged).
- ACTIVE event: Access/QR action → `/admin/events/{public_id}/access` (existing page, unchanged).
- Create new event action → `/admin/events/new` (existing page, unchanged).
- Empty state: no events → point to creation.
- States: loading; ready; empty; unauth redirect; network/unexpected failure with deliberate retry.
- After successful sign-in → land on `/admin` (update existing sign-in transition if it points elsewhere).
- `ACTIVE_EVENT_EXISTS` recovery must resolve to the index (no forced re-sign-in). Note: `components/admin/admin-create-event.tsx` already links "Find existing event" → `/admin`; once `/admin` is the real index this resolves naturally — verify, don't hack.

## Implementation notes
- `app/admin/page.tsx` currently `redirect("/admin/sign-in")`. Replace: server-side auth check (follow existing admin page auth pattern — inspect `app/admin/events/new/page.tsx` or `components/admin/admin-ui.tsx` AuthGate usage), then render new client component (e.g. `components/admin/admin-event-index.tsx`) that fetches `GET /api/admin/events` and renders.
- Reuse existing design system primitives from `components/admin/admin-ui.tsx` (Shell, Status, Button) + shadcn/ui; follow UI_DESIGN tokens: admin heading 24/32 650, controls 44px, visible labels, tabular figures for timestamps, max-width 90rem, coral primary for ACTIVE prominence, quiet memory-table direction.
- Accessibility: keyboard reachable actions, focus-visible rings consistent with existing admin pages, status announced, semantic list/headings.
- Responsive: desktop-friendly, usable on small screens (per UI_UX §2).
- Copy: grounded, normal wording (existing admin pages' tone: "Start a fresh page in the archive." etc.). Keep consistent.

## Files allowed
`app/admin/page.tsx`, new `components/admin/admin-event-index.tsx`, `components/admin/admin-sign-in.tsx` (only if post-sign-in target needs updating), `components/admin/admin-create-event.tsx` (only if recovery link needs fixing), new e2e spec(s). Nothing else; no API/canonical/guest changes.

## e2e tests (required)
Inspect `e2e/` for existing admin auth pattern (how specs sign in / seed events; mirror it — see smoke + qr-qa specs). Add spec covering: sign-in → lands on index; ACTIVE event visible + prominent; CLOSED event visible; Open navigates to dashboard; Access/QR navigates for ACTIVE; Create navigates + creation succeeds end-to-end if existing specs allow; ACTIVE_EVENT_EXISTS recovery link → index, NOT sign-in; unauthenticated /admin → sign-in.

## Validation (run, report)
`npx tsc --noEmit`; `npx vitest run` (266 baseline, all green); `npm run lint` (0 new — baseline 1 pre-existing error e2e/print-qa.spec.ts:34 + 7 warnings); `npx playwright test <your spec>` (+ confirm existing smoke/qr-qa still pass: `npx playwright test e2e/smoke.spec.ts e2e/qr-qa.spec.ts` — adjust paths to actual files found).

## On finish
Rewrite `.opencode/handoff/result.md`: status, files changed, validation, SSOT conflict check, next step. Report assumptions.
