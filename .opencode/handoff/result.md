# Result: 6-Step Voice Refactor (Panel → Screen)

## Status
COMPLETE

## Files Changed
- `components/guest-event-entry.tsx` — 601 lines (ViewState + `"voice-note"`, removed `voicePanelOpen`/`closeVoicePanel`/panel-close effect, transitions → voice-note → done, render swap)
- `components/guest/screens/Capture.tsx` — 451 lines (removed `onOpenVoicePanel` prop + mic trigger button + `Mic` import; camera-only)
- `components/guest/screens/PhotoReview.tsx` — 160 lines (CTA "Kirim" → "Kirim & Lanjut", docblock)
- `components/guest/screens/VoiceRecordingScreen.tsx` — 206 lines (NEW, refactored from AudioRecorderPanel: full-screen `<main>`, eyebrow + Cormorant "Tinggalkan Pesan Suara", gold mic h-20 w-20, DM Mono `00:00 / 00:30`, pulse-free "Recording", review w/ `<audio controls>` + Duration + <5s warning "Pesan terlalu singkat — minimal 5 detik", "Rekam Ulang" secondary, "Kirim Pesan Suara" gold CTA, "Lewati — Kirim Foto Saja" skip; heading focus on mount; no `onClose`)
- `components/guest/screens/AudioRecorderPanel.tsx` — DELETED
- `e2e/mobile-media-qa.spec.ts` — 754 lines (updated to 6-step flow; see E2E Impact)

## Validation Results
1. Typecheck: PASS
2. Vitest: PASS 344/344 (43 files)
3. Build: PASS
4. E2E: PASS — 39 passed / 1 skipped (pre-existing live-backend skip in smoke) / 0 failed. All 16 mobile-media-qa specs pass against the new flow, including auto-stop at 30s, re-record, upload-error retention, and the POST-201 session-refetch regression.
5. Lint: baseline — 1 pre-existing `any` error in `e2e/print-qa.spec.ts` + 11 warnings, all pre-existing categories (no-img-element, unused vars, exhaustive-deps). Zero lint entries reference changed/new files.

## Camera Cleanup
`camera.stop()` fires from the existing camera-lifecycle effect in `guest-event-entry.tsx` whenever `state !== "post-session"` (deps `[state]`). VOICE_NOTE is reachable only via PHOTO_REVIEW (`handleReviewNext` / deferred-advance effect), so the MediaStream tracks are already released one full screen earlier — before `VoiceRecordingScreen` ever mounts. `use-camera.stop()` stops all tracks (hooks/use-camera.ts:43). No leaks; no code change needed.

## E2E Impact
`e2e/mobile-media-qa.spec.ts` updated (required — the mic trigger button and panel dialog no longer exist):
- `openVoicePanel()` helper replaced by `captureOnePhoto()` + `advanceToVoiceScreen()` (capture → Lanjut → review → "Kirim & Lanjut" → voice screen heading "Tinggalkan Pesan Suara").
- `syncReviewToDone` → `syncReviewToVoice`; review CTA now lands on VOICE_NOTE, not DONE.
- Selector updates: "Kirim" → "Kirim & Lanjut"; "✓ Kirim semua" → "Kirim Pesan Suara"; "Rekam ulang" → "Rekam Ulang"; "Lewati & kirim foto saja" → "Lewati — Kirim Foto Saja"; timer `/MAKS 30 DETIK/` → `/\/ 00:30/`; panel-dialog assertions → voice-screen heading assertions.
- Test 1 (photo flow) and test 11 (batch sync) now finish via voice-screen skip (photos-only finish still valid).
- Test 9 (session usage) semantics updated: the pending photo is now synced on the review screen before voice (was: never synced, panel path was terminal). Asserts photos=1 + voice=1.
- Unchanged selectors preserved: "Record voice note", "Stop recording", "Recording" (exact), `audio[aria-label="Voice note playback"]`, "Duration:", "Take photos", "Lanjut →", "Foto Anda (N)".
- No other spec files affected (smoke/qr-qa/print-qa don't traverse the guest submission flow).

## Deviations
- `SESSION_STATES` (expiry-hint timer) left as `["post-session", "photo-review"]` — the seconds-left hint is rendered only on Capture; no consumer on VOICE_NOTE. Server-side `expires_at` remains authoritative.
- Review-state <5s warning uses the task-specified Indonesian copy "Pesan terlalu singkat — minimal 5 detik"; the parent-set `voiceMessage` ("Too short…") still renders in review state per existing handler logic (unchanged, per Hard Constraint #3).

## Unresolved Risks
None. Voice handler logic (MediaRecorder lifecycle, duration validation, upload API) untouched; only presentation and transition timing changed.
