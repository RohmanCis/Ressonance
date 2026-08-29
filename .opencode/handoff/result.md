# Result — Remove event-title text stamp from captured photos

## Status
COMPLETE

## Files changed
- `lib/frames.ts`
- `lib/frames.test.ts`
- `DESIGN.md` (root, §5.2 only — owner-approved canonical sync)
- `.opencode/handoff/result.md`

## Exact changes

### lib/frames.ts
- Header docblock: "plus optional dynamic text layers rendered onto the 1080×1920 canvas at shutter time" removed; asset-standard paragraph now states text stamp removed (owner decision 2026-08-29) — frames carry decorative artwork only.
- `royal-gold`, `botanical-romance`, `modern-editorial`, `flower`: per-frame `textLayers` configs (Cormorant italic 96, Pinyon 124, DM Mono 58, Pinyon 118) deleted → `textLayers: []`.
- `wedding-crimson`: comment updated — baked typography asset (2026-08-21); like every frame registers no dynamic text layers (owner decision 2026-08-29). `textLayers: []` unchanged.
- KEPT: `FrameTextLayer` type export (frame-compositing.ts + use-camera.ts import it; machinery unused by registry), `DEFAULT_FRAME_ID`, ids/labels/srcs, `loadFrameImage`, `FRAME_OUTPUT`, `FRAME_ASPECT_RATIO`.

### lib/frames.test.ts
- `BAKED_TEXT_FRAMES` set + comment deleted.
- Test "gives every dynamic template an event-title text layer with a valid schema" → "registers no text layers on any frame (owner decision 2026-08-29: no event-title stamp on captured photos)" — asserts `frame.textLayers` toEqual `[]` for all real frames.
- Test "assigns the three approved display fonts one distinct role" DELETED (no layers to assert).
- Registry-invariant tests (aspect, key set, unique ids/'none' default, asset paths) unchanged. 6 tests total.

### DESIGN.md (§5.2 only)
- Registry items 1–3, 5: "event title in …" clauses removed; artwork descriptions kept.
- Item 4 `wedding-crimson`: reworded — baked typography; like every frame registers no dynamic text layers; no title stamp (owner decision 2026-08-29).
- "Dynamic composition model" paragraph: text-layer interpolation description (font roles, sizes, yRatio band, `document.fonts.ready` gating) struck; kept 1080×1920 PNG true-alpha transparent photo area, no baked text (sole exception wedding-crimson), no frame registers dynamic event-title layer (2026-08-29), fixed 1080×1920 JPEG quality 0.92, overlay never mirrored — only photo mirrors for front camera.
- No other sections touched.

## Validation
- `npx tsc --noEmit` — PASS.
- `npx vitest run lib/frames.test.ts` — PASS, 6/6 (1 file).
- Full suite NOT run (task constraint).
- Grep `eventTitle|event title|event-title` in lib/frames.ts: 4 matches, all legitimate — L34 `text: "eventTitle"` (the kept type's union literal), L27 type docblock ("the only dynamic token today is the event title"), L12/L83 my new comments. Zero registry text-layer usage.

## Deviations
- None. FrameTextLayer docblock left as-is (accurately describes the retained machinery/capability; no registry frame uses it).
- Note: compositing machinery (`lib/frame-compositing.ts`, `use-camera.ts`) untouched — harmless with empty layers, per task.

## Owner commit message (not committed)
None provided for this task.
