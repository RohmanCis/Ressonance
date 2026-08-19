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