# Result: Remove Guest Message Feature from Codebase

## Status: PASS

## Files deleted (10)

- `supabase/migrations/0005_guest_messages.sql`
- `supabase/migrations/0006_guest_messages_service_role_grant.sql`
- `lib/guest-message-payload.ts`
- `lib/guest-message-payload.test.ts`
- `lib/guest-message-tx-repo.ts`
- `lib/guest-message-tx-repo.test.ts`
- `lib/submit-guest-message.ts`
- `lib/submit-guest-message.test.ts`
- `app/api/events/[public_id]/guest-messages/route.ts`
- `app/api/events/[public_id]/guest-messages/route.test.ts`

Note: task.md listed 7 files; grep inventory found 3 more guest-message-only files (`submit-guest-message.ts`, `submit-guest-message.test.ts`, `guest-message-tx-repo.test.ts`) and the `guest-messages` route test — all deleted. All confirmed via `git status` (10 `D` entries).

## Files edited (26)

- `supabase/migrations/0007_service_role_grants.sql`: removed guest_messages grant + related comment lines
- `lib/usage.ts`: `Usage` drops 2 guest_message fields; docblock updated; `applyUsageDelta` simplified (raw spread now safe, 4-field types)
- `lib/usage.test.ts`: removed 2 fields from `_usageFields`; removed preservation test case (was the only difference between `Usage` and `UsageDelta`)
- `lib/get-session-usage.ts`: removed `countGuestMessages` from `UsageRepo`, message count fetch, 2 response fields
- `lib/get-session-usage.test.ts`: removed mock `countGuestMessages`, guest-message state test, 2 expected fields
- `lib/start-guest-session.ts`: `SessionBody` + success body drop 2 fields
- `lib/start-guest-session.test.ts`: expected body drops 2 fields
- `components/guest-event-entry.tsx`: `confirmUsage()` body type, validator, and `setSession()` drop the 2 fields
- `components/admin/admin-ui.tsx`: `Submission` type drops `GUEST_MESSAGE` + `message_text`
- `components/admin/admin-dashboard.tsx`: deleted `MessageTile` + JSX comment; removed `MessageSquare` import, messages filter/breakdown/render, `typeLabel`/`downloadFileName` GUEST_MESSAGE branches
- `app/api/events/[public_id]/session/route.ts`: removed `countGuestMessages` repo method
- `app/api/events/[public_id]/session/route.test.ts`: removed `guestMessagesBySession`, table branch, seed opt, guest-message state test, 2 expected fields in 2 bodies
- `app/api/admin/events/[public_id]/submissions/route.test.ts`: removed `guest_messages` seed + expected `GUEST_MESSAGE` entry
- `lib/admin-media-repo.ts`: `MediaType` drops `GUEST_MESSAGE`; removed `message_text` field, message query/results loop, doc refs
- `lib/rate-limit.ts`: removed `loadGuestMessageRateLimitConfig` (only consumer was deleted route)
- `lib/guest-submission-auth.ts`: docblock — removed "guest-messages" from endpoint list
- `lib/guest-submission-pipeline.ts`: docblock — "three routes" → "both routes"
- `test/admin-media-db.ts`: removed `FakeGuestMessageRow`, `guest_messages` state field, tables entry
- `e2e/mobile-media-qa.spec.ts`: all 11 mock usage bodies + 4 comment refs drop the 2 fields; comments updated 6→4 fields
- `docs/db_scheme.md`: removed amendment note, decision-row, DDL block, 2 constraint rows, 2 index rows, "not in schema" guest_messages mention, live-DB verification text; renumbered DDL section 6/7 → 6; dropped 0006/0007 guest_messages grant descriptions
- `docs/API_CONTRACT.md`: removed §6.6 section, amendment note, 409 `GUEST_MESSAGE_LIMIT_REACHED`, rate-limit sentence, usage-shape fields (3 examples), §6.3 amendment sentence, submission-type paragraph + §5.7 GUEST_MESSAGE text
- `docs/UI_UX.md`: amendment text simplified to sequential-flow-only; removed "pesan & kesan" scope sentence; removed guest-message mention in §4.3 presentation note
- `docs/ARCHITECTURE_DECISIONS.md`: ADR-012 decision/listing/reason — two routes, `Usage` 4 fields, no guest-message payload adapter
- `docs/UI_DESIGN.md`: §Voice screen — replaced "no guest-message step" sentence (unlisted in task but required by grep acceptance)
- `AGENTS.md`: §12 — removed feature sentence; `lib/{photo,voice-note,guest-message}-payload.ts` → `{photo,voice-note}`; `Usage` 6→4 fields; QA line updated 395/47 → 344/43; removed migration 0006 grant description

## Validation

- `npm run typecheck` — PASS (exit 0)
- `npx vitest run` — PASS: 43 files, 344 tests (was 47 files / 395; −4 test files, −51 tests)
- `npm run lint` — unchanged from pre-existing baseline: 1 error (`e2e/print-qa.spec.ts:34` `any`) + 11 warnings, identical before/after (verified via `git stash` comparison)

## Grep check

`rg -i "guest[_\s\-]?message"` (excluding node_modules/.git/.opencode): **0 matches**.
Including `.opencode`: only `task.md` (22) and `CURRENT.md` (2) — CURRENT.md refs will be cleared when orchestrator updates it post-reconciliation. PRD has zero `guest.?message` matches (its history text uses "pesan & kesan").

## Issues / blockers

- **Schema drift (accepted per task):** live Supabase retains `guest_messages` table + migration history 0001–0008; repo no longer documents or references it. Migrations 0005/0006 files removed from repo only — not re-run live.
- **Task scope drift:** task.md listed 7 deletions / specific edit files; actual inventory (grep) required 10 deletions and 2 unlisted edit targets (`start-guest-session.ts/.test.ts` and `guest-submission-auth/pipeline.ts` were listed implicitly as consumers; `admin-media-repo.ts`, `admin-ui.tsx`, `rate-limit.ts`, session route+test, submissions route.test, `UI_DESIGN.md` were not). All cleaned to meet the acceptance grep. No SSOT conflict encountered.
- **No blockers.** E2E Playwright run not performed (not in task validation scope); `e2e/mobile-media-qa.spec.ts` mock edits are shape-only and covered by typecheck.

## Next step

Orchestrator: reconcile — update `CURRENT.md` to remove its 2 guest-message refs, review diff, run Playwright if desired before merge.
