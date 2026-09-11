# Task: Post-event cleanup batch — 4 streams

Split into lanes to avoid write-scope conflicts. Fixers report in their final message; orchestrator writes result.md (do NOT write result.md yourself).

Global constraints: TypeScript strict, no `any`, no new deps, no canonical-doc changes, keep e2e selectors/aria stable, guest/admin copy unchanged (Bahasa Indonesia register), no API contract changes (behavior-preserving refactors only). Validation per fixer: `npm run typecheck` ONLY (vitest is serialized/destructive — orchestrator runs it once at the end).

## Lane A — Admin UI fixes (components/admin/**)
1. `components/admin/admin-dashboard.tsx:532-537` debounced search: add AbortController per `load()`, abort previous fetch on new query/cleanup (fixes stale-response race).
2. `admin-dashboard.tsx:639-668` close-event dialog: error state set by `close()` is never rendered AND confirm button is `DialogClose`-wrapped so the dialog closes even on failure. Render the error inside DialogContent (match the delete dialog's pattern at ~686) and stop wrapping confirm in DialogClose — close programmatically only on success.
3. `admin-dashboard.tsx:110-142` `useDownload.start`: `revokeObjectURL` fires synchronously after `a.click()`. Defer revoke (setTimeout 0 or a few seconds).
4. Format-helper dedup (#11, component side only): `formatTime` (components/guest/audio-player.tsx:6-9), `formatTimer` (components/guest/screens/VoiceRecordingScreen.tsx:23-25), `fmtDuration`/`pad2` (admin-dashboard.tsx:26,38), `pad2`/`fmtFull` (admin-event-index.tsx:10-14). Create ONE small shared formatter module (e.g. `lib/format.ts`) and import everywhere. Keep each call site's exact output format unchanged (m:ss variants may differ per site — parameterize, don't merge semantics).

## Lane B — Backend/guest minor
1. `lib/guest-submission-pipeline.ts:125-127`: move `pool.connect()` inside the try so connect failures hit `logApiError` (single fix point for photo+voice routes).
2. `components/guest-event-entry.tsx:486-498` voice timer: setInterval 1Hz throttles in background tabs → recording can overshoot 30s. Anchor to `Date.now()` at record start; stop at real 30s elapsed (timestamp check; keep the existing UI ticking behavior + `voiceSecondsRef` semantics + the <5s review message logic).
3. rateLimitKey dedup: identical fn in `app/api/events/[public_id]/session/route.ts:35-40` and `lib/guest-submission-pipeline.ts:97-102`. Keep the one in pipeline (or move next to `rateLimitIdentity` in its lib home) and import in the session route; delete the duplicate.

## Lane C — Refactors
1. #7 payload adapters: `lib/photo-payload.ts` vs `lib/voice-note-payload.ts` byte-identical except field name/config/messages → one parameterized factory. Keep public API of each module stable (same exported function names) so routes stay unchanged.
2. #8 storage adapters: `lib/photo-storage.ts` vs `lib/voice-note-storage.ts` identical except MIME → single factory + thin type-safe wrappers.
3. #9 `tryDelete`/`compensate` dup in `lib/submit-photo.ts:78-98` vs `lib/submit-voice-note.ts:89-109` → shared helper, event-name param (`photo_cleanup_failed` vs `voice_note_cleanup_failed`).
4. #10 + #4: create `lib/admin-auth.ts` with `requireAdmin()` (supabase.auth.getUser → 401 AUTHENTICATION_REQUIRED envelope) and an owned-event helper (findAdminEvent + admin_id check → 403 FORBIDDEN). Replace the boilerplate in all 10 admin routes (list in exp-1 map). In `app/api/admin/auth/sign-out/route.ts` also check `signOut()` result (return 500 INTERNAL_ERROR + log on failure instead of unconditional 200).
5. #11 publicUrl dup: `app/api/admin/events/route.ts:19-21` + `app/api/admin/events/[public_id]/access/route.ts:13-15` → move to lib (e.g. lib/admin-auth.ts or a tiny lib/events-url.ts), import at both sites.

## Lane D — Dead code (runs AFTER Lane C; do not touch lib/submit-photo.ts / lib/submit-voice-note.ts — Lane C owns them)
1. Delete `lib/supabase/client.ts` (orphan, confirmed).
2. Delete `component-catalog.html` (repo root, unreferenced, confirmed).
3. Export-only-for-test symbols (~23 found): unexport only where clean (function/const used solely by its co-located test). For documented contract constants (e.g. `SIGNED_URL_TTL_SECONDS`, `RETENTION_DAYS`, `FFPROBE_TIMEOUT_MS`, `GUEST_SESSION_MAX_AGE_SECONDS`) keep the export if the constant is a documented owner-locked value — unexporting pure noise is not worth churn. Use judgment; list every decision in the report.
