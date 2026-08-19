# Current Task Status

**Status:** SESSION_CLOSED
**Last updated:** 2026-08-20

---

## Session Summary: Architecture review → deepening #1 + #3 → docs → close

### Completed Work

1. **Architecture review** (read-only recon ×3 lanes, HTML report in %TEMP%): 6 candidates identified; #1 and #3 selected for implementation.
2. **#3 Usage type unification** (fix-1): `lib/usage.ts` (`Usage` 6 fields, `UsageDelta` 4 fields, `applyUsageDelta`); `UsageState` deleted from `lib/pending-photos.ts`; photo-sync 201 handler merges via `applyUsageDelta` — `guest_message_*` clobber compiler-prevented. vitest 378/378.
3. **#1 GuestSubmissionAuth + pipeline** (fix-2): `lib/guest-submission-auth.ts`, `lib/guest-submission-pipeline.ts` (`createGuestSubmissionHandler`), payload adapters `lib/{photo,voice-note,guest-message}-payload.ts`; routes now 66–90 lines config-only; `resolvePhotoAuth`/`resolveVoiceNoteAuth` deleted; named rate-limit configs in `lib/rate-limit.ts`. Wire behavior unchanged (route tests untouched, green). vitest 395/395.
4. **Docs** (orchestrator): ADR-012 added to `docs/ARCHITECTURE_DECISIONS.md`; `AGENTS.md` §12 updated (deepening summary, DEFERRED #2/#4 note, test counts 395/395).
5. **Deferred**: candidate #2 (apiError helper) and #4 (pending-photos facade) — no current requirement; revisit triggers recorded in AGENTS.md §12.

### Validation

- `npx tsc --noEmit`: 0 errors
- `npx vitest run`: 395/395 (47 files) PASS

### Known Outstanding

- `e2e/mobile-media-qa.spec.ts` voice-path tests target removed sheet flow — pre-existing, unchanged this session
- Physical-device QA, live admin visual QA — pre-existing

## Next Actions

None — session closed. Commit + push per owner instruction.
