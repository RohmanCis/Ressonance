# Result — DESIGN.md §5.2 Canonical Frame Registry Sync

**Status:** COMPLETE
**Date:** 2026-08-21
**Executor:** orchestrator (direct — single-doc bounded edit; delegation overhead exceeded execution)
**Task contract:** `.opencode/handoff/task.md` (Canonical Docs Update — DESIGN.md §5.2 Frame Registry Sync)

## Files Changed
- `DESIGN.md` §5.2 only — two bullets inserted between "Primary action placement" and "Transition" (no other section touched):
  1. **Canonical frame registry (Dynamic Frame Engine, owner-approved 2026-08-21)** — documents exactly three luxury templates plus `none` default: `royal-gold` ("Royal Gold Serif", double-hairline border + corner flourishes + center diamonds, Cormorant Garamond italic 96px gold), `botanical-romance` ("Botanical Romance", organic rails + botanical clusters + berry accents, Pinyon Script 124px ivory), `modern-editorial` ("Modern Editorial", editorial rules + crop marks + monogram + brackets, DM Mono 58px uppercase 16px tracking).
  2. **Dynamic composition model (`FrameTextLayer`)** — assets are 1080×1920 true-alpha PNGs, never baked text; event title interpolates at shutter time from per-template text layers (font role, size, weight, tracking, color, `yRatio` anchor band 0.845–0.875); fonts resolve from next/font variables (`--font-cormorant`, `--font-pinyon`, `--font-dm-mono`); drawing gated on `document.fonts.ready`; output 1080×1920 JPEG q0.92; overlay + text never mirrored.

## Verification (vs implemented code — zero unratified drift)
- All documented facts cross-checked 1:1 against `lib/frames.ts` (registry ids, labels, fonts, sizes, colors, yRatio band), `lib/frame-compositing.ts` (`compositeDynamicFrame`, `resolveFontFamily`, `document.fonts.ready` gating), `hooks/use-camera.ts` (JPEG 0.92, mirror rule), `app/layout.tsx` (font variables). No values invented; no behavior changes.
- Markdown formatting verified — matches §5.2 bullet style; section structure unchanged.
- `npm run typecheck` — PASS, 0 errors (docs-only change; gate re-run per task contract).

## SSOT Conflicts / Architecture Drift
- None. Edit scoped to the owner-approved §5.2 sync; no other canonical doc modified.

## Next Step
- Idle. Outstanding (pre-existing, owner-held): live physical-device visual QA of composited output.
