# Result — Guest photo frame selection (frontend-only)

## Status
DONE. No owner decision required.

## Files changed
- `lib/frames.ts` (new): Frame registry exactly per spec — `Frame` interface, `FRAMES` (none/wedding-floral/wedding-simple/party, all 3/4), `DEFAULT_FRAME_ID="none"`, `loadFrameImage()` resolving `null` on error (photo uploads without frame).
- `components/frame-selector.tsx` (new): pre-camera selection screen. `onSelect(frame)` prop; 2-col grid of FRAMES excluding "none"; 3/4 aspect cards with PNG preview over `bg-muted`; selected = `border-primary` + ring + ✓ badge; CTA `Use [label]` / `Continue without frame`; `Skip — no frame` secondary link only when a real frame is selected; `role="radiogroup"`/`role="radio"`+`aria-checked`; roving tabindex + arrow-key navigation; `bg-primary` CTA, `font-display` heading (UI_DESIGN §5/§8/§13).
- `hooks/use-camera.ts`: `capture(frameImg?: HTMLImageElement | null)` — draws video (front-camera mirroring preserved), then `ctx.setTransform(1,0,0,1,0,0)` **before** `drawImage(frameImg, 0, 0, canvas.width, canvas.height)` (overlay never mirrored), JPEG quality 0.9 → 0.92. Interface + all other logic unchanged.
- `components/guest-event-entry.tsx`: imports (4a); ViewState `| "frame-select"` (4b); `selectedFrame` state + `frameImgRef` (4c); Start 201 handler now `setState("frame-select")` + return (4d); `handleFrameSelect` useCallback — loads frame image, `post-session-loading` → `confirmUsage()` → carry-over merge → clear `carryOverPrompt` (4e); `camera.capture(frameImgRef.current)` (4f); frame-select render block after `!event` guard (4g); `CameraViewfinder frameOverlaySrc` prop + non-mirrored overlay `<img>` after `</video>` (4h).

## Validation
- `npx tsc --noEmit` — PASS (exit 0).
- `npx vitest run` — 35 files, 315/315 PASS (no new tests; spec said none required).
- Lint: 4 new warnings, all from spec-verbatim code (3× `no-img-element` on the spec-mandated `<img>` elements; 1× unused `DEFAULT_FRAME_ID` import required verbatim by spec 4a; 1× `exhaustive-deps` on the spec's own dep array). Pre-existing error (e2e/print-qa.spec.ts:34) unchanged. No errors introduced.
- Live runtime QA (dev server + real Supabase + Chromium):
  - Start → "Choose a frame" grid (3 options, no "No Frame"); select → `aria-checked=true`, ✓ badge, CTA "Use Party", skip link appears.
  - Fake camera + Party frame: viewfinder overlay visible; capture composite verified by pixel analysis (frame paper-white replaces camera blue) and MSE vs reference composite: photo-mirrored+frame-unmirrored = **19.6**, all-mirrored = **240.1** → overlay NOT mirrored on front camera.
  - Skip path: skip link → plain capture (raw camera blue, no frame).
  - End-to-end persistence: composite uploaded via Send → downloaded from Supabase storage → 41 KB framed JPEG (vs 7.5 KB frameless), pixel-verified paper-white corners.
  - Carry-over: session expired (401) → "Unsaved photos…" prompt → "Start and add unsaved photos" → frame selection → after Use frame, carried photo restored ("Send 1 photo", 4 remaining).
  - Camera denied: file-picker fallback renders, uploads work (no composite — allowed by spec).
  - Keyboard: ArrowLeft/Right/Down move + check options inside the radiogroup.

## Blockers
None.

## SSOT conflict
None. Purely presentational client feature; no endpoint, schema, contract, or voice-flow change.

## Architecture drift
None. No new dependency, endpoint, or authority. Frame selection is a UI step only; backend limits/ownership remain authoritative.

## Known limitations / risks
1. **`public/frames/wedding-simple.png` is MISSING** (only party.png + wedding-floral.png exist in the untracked `public/`). The "Wedding Classic" card renders empty-neutral and `loadFrameImage` resolves null → photos upload without frame. Asset must be added before this frame is usable.
2. **Pre-existing bug (not introduced, verified on stashed original)**: on a photo-sync 401, `handleSessionExpired` reads a stale `pendingPhotos` closure (empty) so the carry-over prompt does NOT appear from the Send path; the voice-note 401 path (fresh render) does show it. Carry-over still works end-to-end once reached (verified). Left untouched — out of scope; recommend a follow-up using `pendingPhotosRef` inside `handleSessionExpired`.
3. Frames are ~99.8% opaque full-bleed 1200×1800 PNGs stretched to the sensor aspect (object-fit: cover semantics): on non-3/4 sensors the frame art is effectively what guests see/capture (camera visible only through frame's transparent regions). If partial-alpha overlays are intended, assets need adjusting.
4. `aspectRatio` field is declared but unused by rendering (spec provided it; grid hard-codes 3/4 per requirement).
5. 4 MB upload cap: framed composite grew ~5.5× in QA (7.5 KB → 41 KB) — still far under the cap, but very high-resolution sensors + opaque frames could approach it. Backend cap remains authoritative.

## Next step
Owner: supply `wedding-simple.png`; decide on follow-up fix for the pre-existing Send-401 carry-over closure bug.
