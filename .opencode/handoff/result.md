# Result: Hard Delete Event (Lane A — Backend)

**Status:** COMPLETE

## Files changed
- `docs/API_CONTRACT.md` — added §5.12 Delete event (after §5.11).
- `lib/admin-delete-event.ts` — NEW. `DeleteEventResult` + `deleteAdminEvent(db, storage, publicId)`.
- `app/api/admin/events/[public_id]/delete/route.ts` — NEW. `DELETE` handler.
- `app/api/admin/events/[public_id]/delete/route.test.ts` — NEW. 8 tests.

## Validation
- `npx tsc --noEmit` — PASS (no output).
- `npx vitest run` (full suite, single instance) — PASS: 49 files, 379 passed, 4 skipped (pre-existing), 0 failed. New delete suite: 8/8.
- e2e not run (per contract).

## Implementation notes
- **Ordering (task step 5):** storage remove FIRST (keys collected from photos/voice_notes rows before deletion), then DB child-first `photos → voice_notes → guest_sessions → events`. Chosen because a storage failure returns `error` with all DB rows intact (retryable, mirrors `lib/media-cleanup.ts`), and missing objects are success. Documented in lib docblock.
- Storage keys sourced from DB rows; never derived from `public_id`.
- No schema/migration/dependency changes; `components/` untouched; not committed.

## Deviations from contract
1. **§5.12 path is `/api/admin/events/{public_id}/delete`**, not `/api/admin/events/{public_id}` as the task.md §1 code block shows. Route file (`.../[public_id]/delete/route.ts`) and Lane B fetch (`/api/admin/events/${publicId}/delete`) both use `/delete`; documented the actual implemented path. Flagged for orchestrator.
2. Lib event load selects `id, status` only (task text said `id, admin_id, status`); `admin_id` is unused in lib — ownership is checked in the route via `findAdminEvent`, matching `close/route.ts`.
3. Contract §5.12 message for ACTIVE: route returns `403 FORBIDDEN` message `"Active event cannot be deleted. Close it first."` per task step 3.

## Blockers
None.

## SSOT conflict / architecture drift
None. No new endpoints beyond the approved feature; contract amendment is the approved scope.
