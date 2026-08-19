# Task: Sequential Guest Flow Refactor + Guest Message UI Removal

## Context

Owner approved unfreezing canonical docs for this task. Guest flow must become sequential full-screen navigation matching Sepia reference UX. Guest message UI removed entirely; backend/schema/API endpoint stays.

## Target flow

PRE_SESSION → FRAME_SELECT → CAPTURE → PHOTO_REVIEW → VOICE → DONE (distinct full-screen states in GuestEventEntry ViewState)

## Screen specs

- CAPTURE: fullscreen camera, frame overlay, shutter, counter "X remaining" bottom-right. Auto-advance to PHOTO_REVIEW when budgetRemaining hits 0. Manual: "Lanjut →" button when pendingPhotos.length > 0.
- PHOTO_REVIEW: header "Foto Anda (N)", subtext "Hapus yang tidak diinginkan sebelum dikirim.", grid with per-photo X delete, primary CTA "Lanjut ke pesan suara" full-width bottom. Photos synced to backend before advancing; syncing state on CTA; block advance until no pending/uploading remains.
- VOICE: full-screen, header "Pesan suara", subtext "Tinggalkan satu pesan suara hingga 30 detik untuk host.", mic icon center, timer "00:00 / MAKS 30 DETIK". After recording: audio playback bar, primary "✓ Kirim semua", secondary text "Rekam ulang", tertiary link "Lewati & kirim foto saja". Voice submit or skip → DONE.
- DONE: full-screen thank-you, event title, brief message, no actions. Session closed from guest perspective.

## Remove from UI (keep in backend/schema/API)

- "Leave a message" + "Add a voice note" buttons in Capture.tsx bottom action band
- guest_message_available check and onOpenSheet("message") in Capture.tsx
- GuestSheet, VoiceNoteAction, GuestMessageAction in VoiceAndMessage.tsx — replace file entirely with full-screen Voice screen
- sheetOpen, sheetStep, sheetClosing state and all sheet handlers in GuestEventEntry

## Files in scope (designer lane)

- components/guest-event-entry.tsx — ViewState gains PHOTO_REVIEW, VOICE, DONE; wire handlers; remove sheet state
- components/guest/screens/Capture.tsx — remove sheet buttons, add "Lanjut →" advance, keep shutter/counter/strip/file-picker
- components/guest/screens/PhotoReview.tsx — CREATE
- components/guest/screens/VoiceAndMessage.tsx — REPLACE with Voice screen
- components/guest/screens/Done.tsx — CREATE

## Files in scope (fixer lane: docs)

- docs/UI_UX.md — amend §1 scope, §3 screen map, §4 sequential screens, remove guest message UI
- docs/PRD.md — guest message UI to non-goals, note API/schema remains
- docs/API_CONTRACT.md — §6.6 marked implemented but not exposed in guest UI

## Do NOT change

API routes, backend logic, hooks (use-camera, pending-photos lib), session/upload endpoints, admin screens, DB schema, tests (only if type error forces).

## Acceptance criteria

- npx vitest run same pass count (375)
- npx tsc --noEmit 0 errors
- ViewState includes PHOTO_REVIEW, VOICE, DONE
- No sheetOpen/sheetStep/sheetClosing in GuestEventEntry
- No guest_message_available in guest screen components
- Capture.tsx has no "Leave a message"/"Add a voice note" sheet triggers
- PhotoReview.tsx blocks advance until photos confirmed or error
- Done.tsx exists with event title + thank-you copy
- All 3 canonical docs updated and consistent

## Report

Write result.md: files changed, vitest result, tsc result, doc sections amended, blockers.
