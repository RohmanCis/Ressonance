# Result — Guest message feature (Pesan & Kesan), Opsi B

## Status
DONE. No blocking owner decision required; three advisories recorded below.

## Files changed
### New
- `supabase/migrations/0005_guest_messages.sql` — `guest_messages` table (UUID PK, `guest_session_id` FK RESTRICT, `message_text` TEXT NOT NULL CHECK `char_length 1–280`, `created_at`), `uq_guest_messages_one_per_session` UNIQUE, `idx_guest_messages_guest_session_id`, plus the 0001-pattern RLS/REVOKE boundary. Idempotent (`IF NOT EXISTS`).
- `lib/guest-message-tx-repo.ts` — transaction repo on direct pg: BEGIN → event-row lock (revalidate ACTIVE) → UX pre-check → insert (maps 23505/`uq_guest_messages_one_per_session` → `GuestMessageUniqueViolationError`) → photo count + voice-note existence → COMMIT. Rollback on begin failure; no per-session lock (UNIQUE is the guard, TD §9).
- `lib/submit-guest-message.ts` — orchestration + `validateGuestMessageText` (present/string/1–280 after trim). Reuses `resolveVoiceNoteAuth` for auth (not duplicated). No storage, no compensation.
- `app/api/events/[public_id]/guest-messages/route.ts` — POST; content-type → auth → rate limit (FixedWindowRateLimiter, env `GUEST_MESSAGE_RATE_LIMIT_MAX`/`_WINDOW_SECONDS`) → 4 KB bounded body read → validate → transaction. Full error mapping (400/401×3/404/409/422×2/429/500).
- `lib/guest-message-tx-repo.test.ts`, `lib/submit-guest-message.test.ts`, `app/api/events/[public_id]/guest-messages/route.test.ts` — new suites.

### Amended
- `app/api/events/[public_id]/session/route.ts` — usage repo + `countGuestMessages`.
- `lib/get-session-usage.ts` — usage body + `guest_message_submitted/available`.
- `lib/start-guest-session.ts` — fresh-session body carries both new fields (false/true).
- `lib/pending-photos.ts` — `UsageState` extended (SessionData derives from it).
- `lib/admin-media-repo.ts` — `listSubmissions` unions `guest_messages`; `MediaType` + `message_text?`.
- `components/guest-event-entry.tsx` — message state, `handleMessageChange`, `submitMessage`, local `GuestMessageAction` (textarea rows=3 maxLength=280, counter, disabled rules, error surface), post-session section, usage-panel row.
- `components/admin/admin-ui.tsx` — `Submission` type + `GUEST_MESSAGE`/`message_text`.
- `components/admin/admin-dashboard.tsx` — `MessageTile` (read-only blockquote), type label, breakdown, group render.
- `docs/db_scheme.md` (v1.2) + `docs/API_CONTRACT.md` (§6.6 new; §2, §4, §5.7, §6.1, §6.2 amended; amendment marker added).
- Tests updated: session route, start-guest-session, get-session-usage, admin submissions, `test/admin-media-db.ts`.

## Validation
- `npx tsc --noEmit` — PASS (exit 0).
- `npx vitest run` — 38 files, **362/362 PASS** (was 315; +47 new tests).
- eslint on touched files — 0 errors, 9 warnings all pre-existing (img-element / exhaustive-deps / unused import).
- Migration verified against live local Postgres: applied twice (idempotent), columns/constraints/indexes/RLS confirmed; UNIQUE one-per-session, CHECK on "" and 281 chars, FK RESTRICT all enforced.

## Blockers
None.

## SSOT conflict
None blocking. Two additive conventions required by the task and now documented: session usage shape gains two fields (API_CONTRACT §4/§6.1); GUEST_MESSAGE submissions carry `message_text` with `mime_type: "text/plain"`, `file_size: 0`, `duration_seconds: null` (§5.7).

## Architecture drift
None. No new dependency, no ORM, no new auth surface, voice-note flow untouched.

## Advisories / next step
1. **Migration 0005 must be applied to production Supabase before deploy.**
2. `mime_type`/`file_size` convention for GUEST_MESSAGE is documented but not owner-ratified.
3. `guest_messages` rows are not covered by the 7-day media cleanup (no storage object); text retention is currently indefinite — owner may want a policy decision.
Next: owner review + apply migration + optional browser QA, then commit.
