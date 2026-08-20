# Task: Remove Guest Message Feature from Codebase

## Context

Owner decision: guest message feature ("pesan & kesan") was removed from MVP UI scope on 2026-08-20, but backend implementation, migrations, types, and tests remain. This creates maintenance burden and confusion. Complete removal required.

## Scope

Remove all guest_message artifacts:

### 1. Migrations (DO NOT RUN — documentation cleanup only)
- **DELETE**: `supabase/migrations/0005_guest_messages.sql` (table creation)
- **DELETE**: `supabase/migrations/0006_guest_messages_service_role_grant.sql` (grants)
- **EDIT**: `supabase/migrations/0007_service_role_grants.sql` — remove lines 46 (`GRANT SELECT, DELETE ON guest_messages TO service_role;`) and related comments (lines 7, 23, 25)

Note: Live DB already has migrations 0001–0008 applied. Do NOT create a new drop-table migration or modify applied migrations beyond file cleanup. Schema drift acceptable — live DB keeps the unused table, repo reflects MVP scope.

### 2. Backend Code
- **DELETE**: `lib/guest-message-payload.ts`
- **DELETE**: `lib/guest-message-payload.test.ts`
- **DELETE**: `lib/guest-message-tx-repo.ts`
- **DELETE**: `app/api/events/[public_id]/guest-messages/route.ts` (if exists)

### 3. Types — Remove `guest_message_submitted` and `guest_message_available`
- **EDIT**: `lib/usage.ts` — `Usage` type drops 2 fields; `UsageDelta` unchanged (already omits them per comment); `applyUsageDelta` drops preservation logic
- **EDIT**: `lib/get-session-usage.ts` — remove `guest_message_submitted` and `guest_message_available` from return object
- **EDIT**: `components/guest-event-entry.tsx` — remove 2 fields from session state type, `confirmUsage()` validator, and `setSession()` call

### 4. Tests — Remove all `guest_message_*` mock fields
- **EDIT**: `lib/usage.test.ts` — remove 2 fields from `requiredUsageKeys` array and test case
- **EDIT**: `lib/get-session-usage.test.ts` — remove assertions and mock data
- **EDIT**: `e2e/mobile-media-qa.spec.ts` — remove fields from all mock usage responses (11 occurrences)
- **EDIT**: `test/admin-media-db.ts` — remove `guest_messages?: FakeGuestMessageRow[]` optional field and its clone in `clone()`

### 5. Admin UI
- **EDIT**: `components/admin/admin-dashboard.tsx` — delete `GuestMessageTile` component and JSX comment (line 300: "Read-only guest message tile…")

### 6. Canonical Docs
- **EDIT**: `docs/db_scheme.md` — remove guest_messages table definition, constraints, indices, amendment notes
- **EDIT**: `docs/API_CONTRACT.md` — remove §6.6 "Submit guest message" section, rate-limit references, usage field docs
- **EDIT**: `docs/UI_UX.md` — remove amendment text referencing guest message removal
- **EDIT**: `docs/ARCHITECTURE_DECISIONS.md` — remove guest-message references from ADR-012 shared-submission-seam decision
- **EDIT**: `AGENTS.md` §12 — remove guest-message feature description from "Current repository state"

## Out of Scope

- Do NOT drop the `guest_messages` table from live Supabase DB
- Do NOT modify applied migrations beyond file cleanup
- Do NOT change `docs/PRD.md` (product scope, not implementation state)
- Do NOT touch photo/voice-note submission logic (only remove guest-message-specific code)

## Acceptance

- `npm run typecheck` — PASS
- `npx vitest run` — all pass (expected reduction: −3 test files, test count drops by ~10–15)
- `npm run lint` — no new issues beyond pre-existing baseline
- Grep `guest.?message` returns ONLY:
  - PRD references (if any — product history)
  - This task.md and result.md
- All removed files confirmed deleted via `git status`

## Report Format

Write `result.md`:
- Status: PASS/BLOCKED
- Files deleted (count + paths)
- Files edited (count + paths, 1-line summary per file)
- Validation: typecheck/vitest/lint exit codes
- Grep check: `guest.?message` match count after cleanup
- Issues: schema drift acceptable? any SSOT conflicts? any blockers?
