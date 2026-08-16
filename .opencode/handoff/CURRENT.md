# Current Execution State

- Phase: IDLE. Frame-selection task complete and validated; awaiting owner review.
- Status: DONE (see result.md). No commit/push performed.

## Session summary (guest photo frame selection)
- NEW `lib/frames.ts`: frame registry + graceful `loadFrameImage`.
- NEW `components/frame-selector.tsx`: pre-camera frame picker (radiogroup a11y, roving tabindex, skip link, no "No Frame" in grid).
- `hooks/use-camera.ts`: `capture(frameImg?)` — transform reset before overlay draw; JPEG 0.92.
- `components/guest-event-entry.tsx`: `frame-select` ViewState; Start 201 → frame selection; `handleFrameSelect` (confirmUsage → carry-over); `frameOverlaySrc` on CameraViewfinder.
- Validation: tsc PASS; vitest 315/315; lint +4 warnings (all spec-verbatim code) / 0 new errors; live Chromium QA against real Supabase — composite verified in-browser (MSE 19.6 vs 240.1 mirror discriminator) and in persisted storage (framed 41 KB vs frameless 7.5 KB, pixel-verified); skip, carry-over, camera-denied fallback, keyboard a11y all verified.

## Open items for owner
1. `public/frames/wedding-simple.png` missing — registry entry ships, degrades gracefully (no frame).
2. PRE-EXISTING (verified on original code, untouched): Send-401 path's `handleSessionExpired` stale-closure swallows the carry-over prompt; voice-note 401 path shows it. Recommend follow-up fix via `pendingPhotosRef`.
3. Frames are ~99.8% opaque full-bleed; on non-3/4 sensors the frame dominates the composite. Asset question, not code.

## R3 prerequisites (unchanged)
Owner go-ahead; Vercel env vars (NEXT_PUBLIC_*, DATABASE_URL pooler + sslmode=require, SUPABASE_STORAGE_BUCKET, CRON_SECRET, TRUSTED_PROXY=1); deployed smoke incl. ffprobe + cron 401/200.

## Deferred owner decisions (unchanged)
C1 exact-match guest-name search; C2 create-success URL/QR state; C3 access/QR error states; C4 admin sign-in throttling; C5 cron throughput/maxDuration.
