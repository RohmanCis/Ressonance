# T041 Result

**Status:** COMPLETE

## Files changed

- `components/guest-event-entry.tsx` (+49): fixes 1–5 (see below)
- `hooks/use-camera.ts` (+8): fix 4b (capture teardown on dead stream)

## Fixes

1. **Mic/voice-timer unmount leak** — unmount cleanup now calls `finishRecording()` + `stopVoiceTimer()` and aborts in-flight voice XHR. (Also `eslint-disable-next-line react-hooks/exhaustive-deps` added — cleanup references render-scoped functions with `[]` deps.)
2. **syncPhotos race** — new `syncingRef` mutex; checked at entry, set before `setSyncing(true)`, cleared on the session-error early return and the normal completion path. Success/failure behavior unchanged.
3. **start() double-submit** — `startingRef` guard (synchronous, closure-safe), set after the state guard passes, cleared on success return, end-of-try, and catch.
4. **handleCapture / capture teardown** — `handleCapture` wraps `camera.capture()` in try/catch (fail soft). `use-camera.ts` `capture()` wraps `video.play()`; on rejection nulls `video.srcObject` and returns null instead of throwing.
5. **Object-URL leaks** — `handleSessionExpired` revokes confirmed-photo URLs before `setPendingPhotos([])`; `onDeclineCarryOver` revokes all expired-photo URLs; `submitVoice` XHR tracked in `voiceXhrRef`, aborted on unmount + session expiry, `request.status === 0` guard prevents post-abort state clobber (e.g. expiry message overwritten by review-error).

## Validation

- `npm run typecheck` — PASS
- `npx vitest run` (alone, serialized) — PASS, 46 files / 374 tests
- Focused test for fix #1 — SKIPPED: vitest environment is `node`, no jsdom/@testing-library in repo; adding a renderer dependency is out of scope. No existing guest-event-entry test harness.
- E2E — not run (per contract)

## Failures

None.

## Risks

- Fix #1/#5 unmount cleanup not covered by an automated test (see above); behavior verified by code review only.
- `syncingRef`/`startingRef` are manual ref guards — a missed reset on a future early-return path would wedge the guard. Both exit paths currently covered.
- XHR abort relies on `status === 0` convention (per XHR spec abort fires error/abort, not load).
- Note: repo test count is 374 (AGENTS.md baseline recorded 373) — one extra test exists upstream of this task; all pass.

## Next step

Orchestrator: reconcile + commit. Librarian lane (DESIGN.md §5.6) separate; not touched here.
