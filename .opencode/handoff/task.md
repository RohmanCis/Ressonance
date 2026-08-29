# Task

T041 — Execute fixes 1–5 from CURRENT.md priority list (previous session,
2026-08-29). All bounded, single-file-area changes. No canonical-doc edits, no
schema changes, no new endpoints.

## Scope

All fixes in `components/guest-event-entry.tsx` unless noted. Line refs from
CURRENT.md may have drifted ±few lines — locate by symbol, not line.

1. **HIGH — mic + voice-timer leak on unmount** (~:495–501): the unmount
   cleanup must also call `stopVoiceTimer()` and `finishRecording()` so an
   in-flight recording/timer doesn't leak past unmount. One-line addition to
   existing cleanup effect.
2. **MEDIUM — syncPhotos double-invocation race** (~:315–391): add a ref mutex
   (`syncingRef`) so concurrent invocations are no-ops. Preserve existing
   behavior on success/failure paths — do not swallow the first call's result.
3. **MEDIUM — start() double-submit guard** (~:137–139): stale `state` closure
   allows double submit; guard with a ref (not state) so the guard is
   synchronous and closure-safe.
4. **MEDIUM — handleCapture try/catch** (~:253–268): wrap unguarded
   `video.play()` rejection path; plus `use-camera.ts` `capture()` (~:128–143):
   early-return teardown when `srcObject` is null (avoid throwing on dead
   stream).
5. **MEDIUM — object-URL leaks**: `onDeclineCarryOver` (~:515–518) and
   `handleSessionExpired` (~:235) must revoke pending photo object URLs before
   clearing state; `submitVoice` (~:448–463) abort via AbortController on
   unmount/expiry where practical.

## Constraints

- No visual/UI changes; behavior-only hardening.
- TypeScript strict, no `any`.
- No changes to `docs/`, `supabase/migrations/`, `AGENTS.md`, DESIGN.md.
- Keep diffs minimal — no refactors beyond the five fixes.

## Validation

- `npm run typecheck`
- `npx vitest run` (full suite; serialized — run alone)
- Focused test where practical for fix #1 (per CURRENT.md).
- Do NOT run e2e.

## Deliverable

Write `result.md`: status, files changed, tests run, failures, risks. No commit
(orchestrator commits).
