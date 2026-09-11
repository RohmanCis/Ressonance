# Result: Post-event cleanup batch — Admin fixes, backend minor, refactors, dead code

## Status
ALL DONE (4 lanes: A/B/C/D). Validation green. Net −250+ lines.

## Lane A — Admin UI (fix-2)
- `components/admin/admin-dashboard.tsx`: debounced search now uses per-load AbortController (stale-response race fixed); close-event dialog renders its own `closeError` inside DialogContent + closes programmatically only on success (no more DialogClose-swallowed failure); `revokeObjectURL` deferred 1000ms after `click()`.
- NEW `lib/format.ts` (`pad2`, `formatTime`, `formatDuration`, `formatTimer`) — dedup of format helpers in `admin-dashboard.tsx`, `admin-event-index.tsx`, `audio-player.tsx`, `VoiceRecordingScreen.tsx`. Output byte-identical per call site.

## Lane B — Backend/guest minor (fix-1)
- `lib/guest-submission-pipeline.ts`: `pool.connect()` moved inside try (connect failures now logged + 500 envelope; single fix point for photo+voice); canonical exported `rateLimitKey`.
- `app/api/events/[public_id]/session/route.ts`: local `rateLimitKey` duplicate deleted.
- `components/guest-event-entry.tsx`: voice timer anchored to `Date.now()` (wall-clock, stops at real 30s even in throttled background tabs; ticking + `<5s` message semantics preserved).

## Lane C — Refactors (fix-3)
- NEW `lib/multipart-payload.ts` — #7 parameterized payload factory; `photo-payload.ts`/`voice-note-payload.ts` now thin wrappers (public API stable).
- NEW `lib/storage-adapter.ts` — #8 generic storage adapter; `photo-storage.ts`/`voice-note-storage.ts` delegate.
- NEW `lib/submission-compensation.ts` — #9 shared `tryDeleteObject`/`compensateObject` (event-name param).
- NEW `lib/admin-auth.ts` — #10 `requireAdmin` (401) + `requireOwnedEvent` (404/403); replaced boilerplate in all 10 admin routes. Envelopes/status byte-identical.
- #4 `sign-out/route.ts`: `signOut()` result checked — failure → 500 INTERNAL_ERROR + `logApiError("admin_sign_out_failed")`.
- NEW `lib/events-url.ts` — #11 `eventPublicUrl`; `publicUrl` dup deleted from events + access routes.

## Lane D — Dead code (fix-4)
- DELETED `lib/supabase/client.ts` (orphan), `component-catalog.html` (unreferenced).
- Unexported 6 internal-only symbols (`generatePhotoStorageKey`, `generateVoiceNoteStorageKey`, `MULTIPART_OVERHEAD_ALLOWANCE`, `detectImageMime`, `findEventOwnerById`, `getSessionEventId`, `createSignedMediaUrl`).
- Kept: test-asserted symbols + documented owner-locked constants (`SIGNED_URL_TTL_SECONDS`, `RETENTION_DAYS`, `MAX_EVENTS_PER_RUN`, `FFPROBE_TIMEOUT_MS`, `GUEST_SESSION_MAX_AGE_SECONDS`, `PHOTO_MIME_TYPES`, `FRAME_ASPECT_RATIO`) + production-consumed (`computeCoverCrop`, `drawFrameOverlay` in hooks/use-camera.ts).

## Validation
- `npm run typecheck` — PASS.
- `npx vitest run` — 49 files / 380 passed / 4 skipped / 0 failed (no regression; route tests confirm envelopes preserved through requireAdmin refactor).
- `npm run lint` — baseline only: 1 pre-existing `any` (`e2e/print-qa.spec.ts:33`) + 15 warnings. No new findings.
- `git diff --check` — clean.

## Risks / notes
- `signOut()` 500 branch has no dedicated unit test (success/401 covered). Low risk; add if desired.
- Session route now imports `rateLimitKey` from the pipeline (server-only, nodejs runtime, lazy pool — no connect at import). Safe.
- Voice timer: fully-throttled tab can still overshoot by ≤1 throttled tick before the wall-clock check fires; exact-stop would need setTimeout (also throttled). Accepted.
- Not run: e2e suite (recommend before deploy since admin dashboard + guest entry changed).

## Next step
Owner: review diff, commit, deploy.
