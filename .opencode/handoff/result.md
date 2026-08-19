# Task Result: Guest Flow Sepia.id Pattern Implementation

**Status:** COMPLETED
**Date:** 2026-08-20
**Scope:** Transform `components/guest-event-entry.tsx` post-Start flow from scroll layout to fullscreen camera + modal slide-up sheets (UI_UX §4.3/§4.5/§4.6 amendment 2026-08-20; UI_DESIGN §9/§12).

---

## Files Changed

| File | Change |
|---|---|
| `components/guest-event-entry.tsx` | Post-session render replaced: fullscreen `h-dvh` camera layer (compact top bar with event title + guest name, letterboxed 9:16 viewfinder stage, bottom action band with pending strip / Send / voice–shutter–message row / file picker, `env(safe-area-inset-top/bottom)` preserved). Usage panel + session status moved below the camera layer. Voice/message UI moved into new `GuestSheet` modal (role=dialog, `aria-modal`, `aria-labelledby` per active step, focus trap, escape/scrim dismiss blocked while recording or submitting, 250ms ease-out enter / 150ms ease-in exit, body scroll lock, focus restore). Voice state machine, message state machine, payloads, limits untouched. Voice step chains to message step via "Continue to message" (after limit flip) / "Skip to message" (idle) — visual chaining only, submissions independent. |
| `app/globals.css` | Added `guest-sheet-in/out` + `guest-sheet-scrim-in/out` keyframes under `prefers-reduced-motion: no-preference` (UI_DESIGN §12). |
| `e2e/mobile-media-qa.spec.ts` | Added `openVoiceSheet()` helper; `recordAndStop` opens the sheet when the Record button is not already in an open sheet; three voice tests open the sheet before interacting. No assertion semantics changed. |

## Contract-Preservation Fixes Included

- **Session expiry now discards unsent drafts** (UI_UX §4.5/§4.6.4): `handleSessionExpired` closes the sheet, calls `resetVoice()`, and clears message text/state/error. Previously a typed-but-unsent message draft and an unsubmitted voice take survived expiry into a new session.
- **Voice recorder generation guard**: `resetVoice()` bumps `voiceGeneration`; a late `recorder.onstop` from a discarded take can no longer resurrect voice state after expiry/re-record.
- **Shutter disabled until camera permission is `granted`** — previously a no-op tap was possible while the stream was still starting (surfaced by e2e race).

## Validation

- `npm run typecheck` — PASS
- `npx vitest run` — **375/375 PASS (41 files)**
- `npx playwright test e2e/mobile-media-qa.spec.ts` — **18/18 PASS** (frame 3 + media 15)
- `npx playwright test e2e/smoke.spec.ts e2e/qr-qa.spec.ts e2e/print-qa.spec.ts` — **11 passed / 1 skipped / 0 failed** (matches baseline)
- ESLint on changed files: no new issues (pre-existing `no-img-element` + exhaustive-deps warnings only)

## Accessibility Checks Performed

- Focus trap: Tab/Shift+Tab cycle inside sheet; focus moves into sheet on open, restored to trigger on close.
- `aria-modal="true"`, `role="dialog"`, sheet labelled by the active step heading (`voice-sheet-title` / `message-sheet-title`).
- Escape + scrim click + Close button all blocked while `voiceState` is `recording`/`submitting` or message is `submitting` — in-flight takes never silently abandoned.
- Remaining-photo indicator `aria-live="polite"` placed directly under the shutter; all existing `role="status"`/`role="alert"` announcements preserved (recording timer, sync progress, success/error, usage).
- Touch targets: voice/message 48px, shutter 64px, Close/Skip/file-picker ≥44px; focus-visible 3px `--ring` + 2px offset on every new control.
- `env(safe-area-inset-top)` on top bar; `env(safe-area-inset-bottom)` on action band and sheet panel.
- Sheet elevation Level 3 (`--shadow-3`), `--scrim` backdrop; motion tokens per §12; reduced-motion removes transforms.

## Visual / Interaction Notes

- Viewfinder keeps the enforced 9:16 surface (WYSIWYG with capture compositing) letterboxed inside the fullscreen dark stage; frame overlay unmirrored above preview; switch-camera button unchanged.
- Below-fold (scroll): photo-limit note, usage panel ("Photos remaining / Voice note / Message"), session status line — all texts unchanged so existing e2e anchors hold.
- `ponytail:` on extremely tall/narrow stages `max-w-full` can clamp the 9:16 ratio; upgrade path is container-query sizing if that layout ever matters.
- Known pre-existing (unchanged): front-camera preview mirroring not applied to the live `<video>` (capture mirrors per §4.4); no capture flash overlay (§11 mentions flash feedback; was absent before).

## Blockers / SSOT Conflicts

None. Docs were already amended (2026-08-20) permitting this presentation; no canonical document modified in this task.

## Architecture Drift

None. Zero API/endpoint/payload changes; no new dependencies; sheet is hand-rolled within the existing component.

## Next Step

QA review of the sheet interaction on a physical device (touch, safe areas, screen reader) and owner sign-off; live visual QA with real camera/mic remains outstanding per repo state.

---

# Task Result: Sequential Guest Flow Refactor (2026-08-20, second task)

## UI Lane

**Status:** COMPLETED
**Scope:** Sequential full-screen guest flow PRE_SESSION → FRAME_SELECT → CAPTURE → PHOTO_REVIEW → VOICE → DONE; guest message UI removed; modal sheet pattern removed. No `docs/`, API, hooks, backend, or test files touched.

### Files Changed

| File | Change |
|---|---|
| `components/guest-event-entry.tsx` | ViewState gains `photo-review`, `voice`, `done`. Removed `sheetOpen`/`sheetStep`/`sheetClosing`/`sheetCloseTimer`, all message state (`messageText`/`messageState`/`messageError`, `MESSAGE_MAX_LENGTH`, `handleMessageChange`, `submitMessage`), and sheet handlers. `confirmUsage()` now returns `Promise<boolean>` and never sets view state (callers advance); failure path still proceeds (previous no-dead-end behavior). `handleFrameSelect` advances to `post-session` only when usage confirmed. Voice submit success → `confirmUsage()` → `done`. New `handleReviewNext()`: syncs pending photos, advances to `voice` only when every remaining item is `confirmed`. New `handleVoiceSkip()`: discards unsent take (`resetVoice`) → `done`. Auto-advance effect: `post-session` + ≥1 pending + `localBudgetRemaining === 0` → `photo-review`. Camera lifecycle effect: stream starts only on capture screen, stops on leaving it (restart works after expiry because start condition accepts `permission === "granted"` with no stream). Expiry timer now runs across `post-session`/`photo-review`/`voice`. Session-expiry handler drops sheet cleanup, keeps discard/carry-over contract. |
| `components/guest/screens/Capture.tsx` | Removed "Add a voice note"/"Leave a message" buttons, `onOpenSheet`, `guest_message_available` usage row, Send/sync UI (sync moved to review), unused `frameImgRef` prop/`PHOTO_LIMIT`/`SESSION_MAX_SECONDS`. Added "Lanjut →" primary advance button (visible when `pendingPhotos.length > 0 \|\| budgetRemaining === 0`; disabled when closed) and moved the remaining counter to bottom-right of the shutter row (`aria-live="polite"` kept). Shutter/counter/pending strip/file-picker/review overlay unchanged. Heading auto-focus on mount. |
| `components/guest/screens/PhotoReview.tsx` | NEW. Header "Foto Anda (N)" + subtext, 3-col grid with per-photo X delete (disabled per `canDeletePhoto`), status badges, per-item retry for `error`, error-count alert, closed notice. CTA "Lanjut ke pesan suara" full-width bottom ("Mengirim foto…" while syncing). CTA disabled while syncing, while errors remain with nothing pending, or while a closed event holds unsent items — advance impossible until all remaining items are `confirmed`. Heading auto-focus. |
| `components/guest/screens/VoiceAndMessage.tsx` | REPLACED. Export now `Voice`; no GuestSheet/VoiceNoteAction/GuestMessageAction, no message step. Full-screen: header "Pesan suara" + subtext, center mic/stop button (lucide `Mic`/`Square`, 96px touch target) with timer "MM:SS / MAKS 30 DETIK" (`aria-live`), recording pulse indicator, review state with `<audio controls>` playback bar. Actions: primary "✓ Kirim semua", secondary "Rekam ulang", tertiary "Lewati & kirim foto saja" (hidden while recording/submitting). Limit/closed/unsupported states render notices and disable submission actions. All §4.5 behavior (5–30s, auto-stop at 30, permission states, re-record replaces unsent take, backend-authoritative duration, expiry handling) preserved — handlers in entry unchanged. Heading auto-focus. |
| `components/guest/screens/Done.tsx` | NEW. Full-screen thank-you: success check (`bg-success`/`text-success-foreground`), "Terima kasih!", event title, brief receipt message, no actions. Heading auto-focus. |
| `app/globals.css` | Removed now-unused `guest-sheet-*` keyframes (sheet pattern deleted). No token changes. |

### Validation

- `npx tsc --noEmit` — **0 errors** (final code)
- `npx vitest run` — **375/375 PASS (41 files)** (final code)
- ESLint on 5 changed files — 0 errors; 4 `no-img-element` warnings (same class as pre-existing baseline; blob/data-URL previews)
- Playwright **not run** (per task: optional, no concurrent suites). KNOWN BREAKAGE: `e2e/mobile-media-qa.spec.ts` references the removed sheet flow (`Add a voice note` button/dialog, `openVoiceSheet`); voice-path tests will fail until the spec is updated to the sequential flow. Left untouched per "tests only if a type error forces it" — no type error did.

### Accessibility

- Focus moves to each screen's heading on mount (`tabIndex={-1}` + focus effect) on every full-screen transition; visible focus indicators unchanged (`outline-3 --ring`).
- Live regions preserved: remaining counter, recording timer/status, sync status, error alerts (`role="status"`/`role="alert"`).
- Touch targets: CTA 48px, mic 96px, shutter 64px, tertiary links ≥44px; safe-area insets on every screen top/bottom.
- All new UI uses existing tokens (`--shadow-1/2`, `--scrim`, success/destructive/warning/recording pairs, radius); no new dependencies (lucide-react was already approved/installed).

### Assumptions

1. Skip link is offered in voice idle state too (spec lists it post-recording; "Skip also advances to DONE" read as available whenever a take is not in flight).
2. PHOTO_REVIEW has no back-to-capture path per spec; deleting photos there frees budget but recapture is not offered (docs lane to contract this).
3. Manual "Lanjut →" also shows when budget is 0 with only server-confirmed photos (returning-guest edge) so the flow never dead-ends; auto-advance still requires ≥1 local pending item.
4. `confirmUsage` keeps validating the six-field usage shape including `guest_message_*` (API contract intact; criterion applied to screen components only).
5. Capture's per-thumbnail review overlay (retake/delete) retained — §4.4 state 5; not mentioned in the removal list.

### Blockers / SSOT Conflicts

None in-lane. Coordination note for docs lane: UI_UX §4.3/§4.5 amendments (2026-08-20) still describe the modal-sheet presentation; the sequential screens above supersede them.

### Architecture Drift

None. Zero API/payload/hook/schema changes; sync still sequential single-photo POSTs; voice still XHR with progress.

### Next Step

Docs fixer amends UI_UX/PRD/API_CONTRACT; then update `e2e/mobile-media-qa.spec.ts` voice-path selectors to the sequential screens and run Playwright; physical-device QA of the new flow.

---

## Docs Lane

**Status:** COMPLETED - canonical doc amendments for sequential full-screen guest flow + guest message UI removal.

**Files changed (docs lane only):**

- `docs/UI_UX.md`
  - Section 1 scope: sequential full-screen submission flow (photos -> optional voice note -> thank-you/done); no guest text message in guest or admin experience.
  - Section 3 screen map: guest entry flow lists sequential states (capture -> photo review -> voice -> done).
  - Section 4.3 capture screen: counter "X remaining"; auto-advance to photo review when local budget reaches zero; manual "Lanjut" advance when pending photos exist; voice-note and guest-message entry removed from this screen; fullscreen camera layer language kept; modal-sheet presentation language removed.
  - NEW section 4.4 photo review screen: photo grid, per-item delete, sync-then-advance (photos uploaded to backend before advancing; advance blocked while `pending`/`uploading` items remain; error items resolvable via retry/delete).
  - Section 4.5 photo flow (renumbered from 4.4): sync triggered from photo-review screen; "Send action" references removed; sync-then-advance cross-referenced.
  - Section 4.6 voice-note flow (renumbered from 4.5): full-screen sequential state after photo review; all voice contract behavior preserved (5-30s, auto-stop, permission states, re-record, backend-authoritative duration, expiry); submit or skip -> done; skip link "Lewati & kirim foto saja" submits only photos; sheet presentation language removed.
  - NEW section 4.7 done screen: thank-you, event title, no further actions, session closed from guest perspective.
  - Section 6 error table: `GUEST_MESSAGE_LIMIT_REACHED` row already absent from working copy - verified, nothing removed.
  - Amendment header consolidated into single 2026-08-20 note: sequential flow + guest message UI removal; endpoint/schema/migration remain; re-enable = UI_UX + API_CONTRACT amendment only.
  - Cross-references updated for renumbering (4.2, 4.3, 4.5, 4.6, 4.7).
- `docs/PRD.md`
  - Dated amendment note near top status block (2026-08-20 owner decision: guest message UI removed from MVP; sequential full-screen flow contracted in UI_UX section 4).
  - Section 2 non-goals: guest text message ("pesan & kesan") removed from MVP UI scope; API endpoint, schema, and migration remain, not exposed in guest UI.
  - Section 5.2 guest flow steps 6-7: sequential flow (replaces "Guest chooses an action" wording).
  - Sections 1 / 3 verified: no guest-message mention present - nothing to remove.
- `docs/API_CONTRACT.md`
  - Section 6.6: added UI-scope note - endpoint implemented but NOT exposed in guest UI as of 2026-08-20 (MVP UI scope decision); API/schema unchanged.
  - Header 2026-08-20 amendment verified present and consistent - kept as-is.

**Verification:** `git diff --check` clean for the three amended docs (remaining trailing-whitespace warnings are in `.opencode/handoff/CURRENT.md`, orchestrator-owned). No code, tests, `docs/UI_DESIGN.md`, or `docs/db_scheme.md` touched.

**Inconsistencies found:**
- `docs/UI_DESIGN.md` section 9 line 163 still cites "UI_UX 4.4" for the 9:16 capture geometry - that number is now the photo-review screen (geometry lives in UI_UX 4.5). Out of docs-lane scope.
- `docs/UI_DESIGN.md` section 9 line 145 still contracts the voice-note modal slide-up sheet - superseded by the full-screen sequential voice state (UI_UX 4.6). Designer lane should align.
- UI_UX guest-message flow section and the `GUEST_MESSAGE_LIMIT_REACHED` error row were already absent from the working copy (prior 2026-08-20 amendment pass removed them) - nothing to delete; verified via grep.

**Blockers:** None. **Architecture drift:** None - backend behavior, schema, and admin experience untouched.

**Next step:** designer lane aligns `docs/UI_DESIGN.md` section 9 (sheet -> full-screen voice; 4.4 cross-ref) and implements code per task spec; orchestrator reconciles.

---

# Task Result: Architecture Deepening #3 — Usage Type Unification (2026-08-20)

**Status:** COMPLETED
**Scope:** `lib/usage.ts` (Usage / UsageDelta / applyUsageDelta); delete `UsageState`; repoint importers; photo-sync 201 handler merges via `applyUsageDelta` so `guest_message_*` can no longer be clobbered to `undefined`. No wire-format change, no canonical docs, no API routes, no e2e changes.

## Files Changed

| File | Change |
|---|---|
| `lib/usage.ts` (NEW) | `Usage` (6 fields), `UsageDelta` (4 fields), `applyUsageDelta(usage, delta) => { ...usage, ...delta }`. Docblock cross-refs API Contract §4/§6.4/§6.5 + invariant: deltas never carry `guest_message_*`; merge must not clobber them. |
| `lib/usage.test.ts` (NEW) | 3 Vitest tests: merge preserves `guest_message_*`; overrides the 4 delta fields; input object not mutated. Plus compile-time field-overlap assertions (`UsageDelta` fields ⊆ `Usage` fields). |
| `lib/pending-photos.ts` | Deleted `UsageState` interface (was lines 25–32). Nothing else changed. |
| `components/guest-event-entry.tsx` | Import `applyUsageDelta, type Usage, type UsageDelta` from `@/lib/usage`; dropped `UsageState` import. `SessionData = Usage & { guest_name: string | null }`. Photo-sync 201 branch: `body` typed `{ usage?: UsageDelta; error?: { code?: string } }`; `setSession((prev) => prev && body.usage ? applyUsageDelta(prev, body.usage) : prev)` — raw spread of a delta over session state is now impossible. |
| `components/guest/screens/Capture.tsx` | `SessionData = Usage & { guest_name: string | null }`; import from `@/lib/usage` instead of `UsageState` from `@/lib/pending-photos`. |
| `components/guest/screens/VoiceAndMessage.tsx` | Same repoint: `Usage` from `@/lib/usage`. |
| `lib/get-session-usage.ts` | `UsageBody` now `extends Usage` (adds `event` + `guest_name`); duplicated 6 usage fields removed. No route/test churn (task #6 reuse, verified: `UsageBody` consumers unaffected). |

## Validation

- `npx tsc --noEmit` — **0 errors** (output: clean)
- `npx vitest run` — **378/378 PASS (42 files)** — baseline 375/41 + 3 new `lib/usage.test.ts` tests. stderr noise is expected malformed-JSON/log-fixture output from existing tests, not failures.

## Notes / Deviations

- Voice-submit 201 path: does NOT spread a delta — it re-hydrates via `confirmUsage()` (full 6-field GET §4). Task #5 said apply merge "if it currently spreads usage"; it doesn't, so left unchanged. No clobber risk exists there.
- `pending-photos.test.ts` never referenced `UsageState` — untouched.
- LSP stale-cache diagnostics on `guest-event-entry.tsx` (pre-refactor line refs) ignored per task note; file on disk is 573 lines and tsc is authoritative.

## Blockers / SSOT Conflicts

None. No canonical documents, migrations, routes, or e2e specs modified.

## Next Step

Update `e2e/mobile-media-qa.spec.ts` voice-path selectors to sequential screens (outstanding from prior task); then Playwright.

---

# Task Result: Architecture Deepening #1 — GuestSubmissionAuth + Shared Guest-Submission Pipeline (2026-08-20)

**Status:** COMPLETED
**Scope:** Unify guest-submission auth (`resolveGuestSubmissionAuth`), a shared route pipeline factory (`createGuestSubmissionHandler`), per-kind payload-extraction adapters, and thin factory-based routes. Duplication deleted: byte-identical `resolvePhotoAuth`/`resolveVoiceNoteAuth`, per-route auth→HTTP mapping, rate-limit setup, logging, status-code selection. Wire behavior identical (acceptance #6 verified by unchanged route tests).

## Files Changed

**New (10):**

| File | Lines | Change |
|---|---|---|
| `lib/guest-submission-auth.ts` | ~60 | `GuestSubmissionRepo`, `GuestSubmissionAuthResult` (6 kinds: not_found / event_closed / session_required / session_invalid / session_expired / ok), `resolveGuestSubmissionAuth(repo, input)` — same semantics as the two deleted resolvers, one implementation. |
| `lib/guest-submission-auth.test.ts` | ~100 | 7 tests: all 6 branches (ok + 5 failure kinds) + wrong-event-vs-unknown both → session_invalid, fake repo fixture. |
| `lib/guest-submission-pipeline.ts` | ~170 | `createGuestSubmissionHandler<T>` factory + `ExtractResult`/`SubmissionResult`/`SubmitContext`/`SubmissionError` types. Choreography: content-type guard → pool-client auth (exact pre-existing SQL) → rate limit (after auth, QA-3) → extract → submit → 201. Preserves Set-Cookie clears (invalid/expired), Retry-After on 429, catch-all 500 + logApiError, client.release in finally. |
| `lib/guest-submission-pipeline.test.ts` | ~215 | 10 tests: 5 auth-kind→HTTP mappings (404/422/401×3), extract failure 4xx, submit success 201 + usage, submit failure with fields, 429 + Retry-After, 500 + logApiError. Typed fakes; mocked pg pool. |
| `lib/photo-payload.ts` | ~110 | `guardPhotoPayload` (pre-auth content-type) + `extractPhotoPayload` (content-length guard → bounded body → `photo` field bytes). Lifted from old photos route lines 88–208. |
| `lib/photo-payload.test.ts` | ~90 | 6 tests: guard reject/pass, extraction, missing field, body-cap FILE_TOO_LARGE, near-limit envelope. |
| `lib/voice-note-payload.ts` | ~110 | `guardVoiceNotePayload` + `extractVoiceNotePayload` (`voice_note` field). ffprobe stays in submitVoiceNote (task forbade changing submit internals; deviation from sketch noted below). |
| `lib/voice-note-payload.test.ts` | ~80 | 5 tests: guard, extraction, missing field, body-cap 422. |
| `lib/guest-message-payload.ts` | ~110 | `guardGuestMessagePayload` (JSON content-type) + `extractGuestMessagePayload` (4 KB bounded read → parse/shape → raw `messageText`). Text validation stays in submitGuestMessage. |
| `lib/guest-message-payload.test.ts` | ~90 | 7 tests: guard, extraction, malformed JSON, over-cap, non-object JSON, empty body. |

**Modified (11):**

| File | Change |
|---|---|
| `app/api/events/[public_id]/photos/route.ts` | 263 → 71 lines. Factory call: `guard`/`extract` adapters, submit adapter (submitPhoto deps: txRepo/storage/config — `sessionRepo` dep removed), `photoErrorMap` (6 kinds → status/code/message), rate-limit config imported from `lib/rate-limit`. |
| `app/api/events/[public_id]/voice-notes/route.ts` | 280 → 90 lines. Same pattern; `voiceErrorMap` (8 kinds); ffprobe inspector constructed in the submit adapter. |
| `app/api/events/[public_id]/guest-messages/route.ts` | 247 → 66 lines. Same pattern; `messageErrorMap` (4 kinds); invalid_input carries `fields`. |
| `lib/submit-photo.ts` | Deleted `resolvePhotoAuth`, `PhotoAuthResult`, `PhotoSession` interface. `SubmitPhotoDeps.sessionRepo` removed (dead field — submitPhoto never read it). `submitPhoto` body unchanged. Docblock updated. |
| `lib/submit-voice-note.ts` | Same: deleted `resolveVoiceNoteAuth`, `VoiceNoteAuthResult`, `VoiceNoteSession`; `SubmitVoiceNoteDeps.sessionRepo` removed. Body unchanged. |
| `lib/submit-guest-message.ts` | Docblock only (reused `resolveVoiceNoteAuth` mention → `resolveGuestSubmissionAuth`). No code change. |
| `lib/submit-photo.test.ts` | 359 → ~250: auth describe (7 tests) moved to `guest-submission-auth.test.ts`; `makeSessionRepo`/`depsOf.sessionRepo` removed. |
| `lib/submit-voice-note.test.ts` | 430 → ~315: same (auth describe moved; `makeSessionRepo`/`depsOf.sessionRepo` removed). |
| `lib/submit-guest-message.test.ts` | 378 → ~260: auth describe + `makeSessionRepo` removed. |
| `lib/submit-photo.concurrency.test.ts` | Auth repointed: `resolvePhotoAuth`/`PhotoSession` → `resolveGuestSubmissionAuth`/`GuestSubmissionRepo`; `sessionRepo` dropped from submitPhoto deps. |
| `lib/submit-voice-note.concurrency.test.ts` | Same repoint. |
| `lib/rate-limit.ts` | Added `loadPhotoRateLimitConfig` / `loadVoiceNoteRateLimitConfig` / `loadGuestMessageRateLimitConfig` named exports via shared `loadEnvRateLimit(prefix, env)` helper; existing `loadRateLimitConfig` (session) now delegates to it. Deletes the three duplicated per-route loaders. Behavior identical (same env names + defaults; `lib/rate-limit.test.ts` 9/9 unchanged). |

**Unchanged:** all 3 route test files (`photos`/`voice-notes`/`guest-messages` `route.test.ts`) — pass as-is, proving wire behavior identical.

## Validation

- `npx tsc --noEmit` — **PASS, 0 errors** (final run after rate-limit centralization)
- `npx vitest run` — **395/395 PASS (47 files)** = 378 baseline − 18 auth tests moved out of submit suites + 35 new (7 auth + 10 pipeline + 6 photo-payload + 5 voice-payload + 7 guest-message-payload). Re-run after rate-limit centralization: 395/395 PASS (47 files); focused 9-file suite (route + payload + auth + pipeline + rate-limit) 93/93. stderr noise = expected malformed-JSON/log-fixture output.

## Blockers

None.

## SSOT Conflicts / Deviations from task.md sketch

Sketch assumed raw-SQL auth (`token_digest` column, pool.query) and different wire kinds (403 WRONG_EVENT, 409 EVENT_NOT_ACTIVE, INVALID_SESSION). Those contradict the locked API Contract and the real schema — `guest_sessions` column is `session_token` (holds the SHA-256 digest), current routes return 404/422 EVENT_CLOSED/401 SESSION_INVALID/SESSION_EXPIRED with Set-Cookie clears. Acceptance #6 (behavior unchanged) + route tests pin the real contract. Deviations:

1. **Auth seam kept repo-injected** (via pool client inside the factory), not `pool.query` — preserves exact SQL and the mocked-pool test pattern; also no `token_digest` column exists.
2. **Auth kinds/mappings preserved** (6 kinds incl. not_found→404, event_closed→422, SESSION_INVALID/SESSION_EXPIRED→401 + cookie clear). Sketch's 5 kinds would have changed wire format.
3. **Rate limit after auth, not before** (QA-3; test "does not consume the rate limit for an unauthorized request" pins it). Sketch had rate-limit first.
4. **Content-type guard runs pre-auth** (test "400 for non-multipart without cookie" pins it) via a `guard` config field; sketch had it inside post-auth extract.
5. **Guest-message payload is JSON, not multipart** — sketch said multipart.
6. **ffprobe not moved into voice payload adapter** — stays in `submitVoiceNote` (task forbids changing submit internals; route test mocks `@/lib/audio-inspector` which the route adapter still constructs).
7. **`logApiError` uses the real `{event, request, code, error}` signature**; mapped 4xx/409/502 errors not logged (matches current routes; only catch-all 500 + request_body_parse_failed log).
8. **`sessionRepo` removed from Submit*Deps** (was never read by submitPhoto/submitVoiceNote) — small signature change beyond "keep submitPhoto unchanged", required so route adapters don't pass dead weight; tx/compensation choreography untouched.
9. **Named rate-limit config exports in `lib/rate-limit.ts`** — added (task.md file list) as `loadPhotoRateLimitConfig` / `loadVoiceNoteRateLimitConfig` / `loadGuestMessageRateLimitConfig` over a shared `loadEnvRateLimit(prefix, env)` helper; session `loadRateLimitConfig` delegates to it. Three per-route loaders deleted; same env names + defaults.
10. Routes are 66–90 lines, not ≤15 — the sketch's line target assumed the factory absorbed storage/config/inspector wiring, which the Do-Not-Change list (tx-repo/storage adapters, submit internals) prevents; even the sketch's own Part D example route is ~30 lines. Routes are now config-only (error map + submit adapter), zero pipeline choreography.

## Next Step

QA: confirm pipeline auth/rate-limit ordering against API_CONTRACT §3/§6 one more time; then e2e/mobile-media-qa voice-path update (outstanding).