# Task: Guest photo frame selection (frontend-only)

Boundaries: read AGENTS.md first. Do NOT touch app/api/**, supabase/**, docs/**, lib/ files other than new lib/frames.ts, admin components, voice-note flow, third-party deps. No commit/push.

## Changes
1. `lib/frames.ts` (NEW): Frame interface {id,label,src,aspectRatio}, FRAMES registry (none, wedding-floral, wedding-simple, party), DEFAULT_FRAME_ID="none", loadFrameImage() resolving null on error (graceful: photo uploads without frame).
2. `components/frame-selector.tsx` (NEW): props {onSelect(frame)}. 2-col grid of FRAMES excluding "none"; 3/4 aspect card previewing PNG over neutral bg; selected = border-primary ring + checkmark badge; primary CTA "Use [label]" / "Continue without frame"; secondary skip link "Skip — no frame" only when a real frame is selected; "No Frame" never in grid; role=radiogroup / role=radio + aria-checked; bg-primary CTA, font-display heading (UI_DESIGN tokens).
3. `hooks/use-camera.ts`: capture(frameImg?: HTMLImageElement | null) — draw video (keep front-camera mirroring), then ctx.setTransform(1,0,0,1,0,0) BEFORE drawing frame over full canvas, then toBlob JPEG 0.92. All other logic identical.
4. `components/guest-event-entry.tsx`: imports (4a); ViewState +"frame-select" between "unexpected" and "post-session-loading" (4b); selectedFrame state + frameImgRef (4c); Start 201 handler → setState("frame-select") and RETURN (carry-over moves out of start()) (4d); handleFrameSelect callback loading frame image then post-session-loading → confirmUsage → carry-over merge → clear carryOverPrompt (4e); camera.capture(frameImgRef.current) (4f); frame-select render block after !event guard, before post-session render (4g); CameraViewfinder frameOverlaySrc prop + non-mirrored overlay <img> after </video> (4h).

## Acceptance
Start → Frame Selection → camera w/ overlay; capture composites frame (visible in PendingStrip); skip → plain photo; "No Frame" absent from grid; overlay NOT mirrored on front camera; permission-denied fallback intact; voice flow untouched; carry-over still works; tsc --noEmit no new errors; vitest all existing pass.

## Validation
npx tsc --noEmit; npx vitest run.
