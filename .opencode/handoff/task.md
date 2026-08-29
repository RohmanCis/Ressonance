# Task T038 — Done.tsx camera SVG + layout + keepsake de-chrome

## Objective
Replace the DisposableCameraSVG inline SVG and fix layout proportions in
`components/guest/screens/Done.tsx`. ONLY this file. No other changes.

## Inputs to read first
- `components/guest/screens/Done.tsx` (full)
- `app/globals.css` (keyframes section, for context — no changes needed there)

## FIX-1 — Replace DisposableCameraSVG
Replace the entire `DisposableCameraSVG` function's SVG with the owner-provided SVG below.
JSX rules: camelCase attributes (`strokeWidth`, `strokeOpacity`, `fillOpacity`); NO HTML
comments inside JSX — use `{/* … */}` or drop them; `aria-hidden="true"` stays on the svg;
keep it a decorative token-colored illustration.

Owner SVG (viewBox 0 0 180 110, className `w-full h-auto` — the parent wrapper controls width):
- Body: rect x=8 y=18 w=164 h=84 rx=10, fill var(--bg-elevated), stroke var(--border), strokeWidth 1
- Top strip: rect x=8 y=18 w=164 h=22 rx=10 fill #252527; rect x=8 y=28 w=164 h=12 fill #252527
- Flash: rect x=16 y=24 w=28 h=10 rx=3 fill var(--accent) opacity 0.8
- Shutter button: rect x=130 y=21 w=20 h=8 rx=4 fill #3a3a3f
- Viewfinder: rect x=110 y=24 w=14 h=10 rx=2 fill var(--bg-base) stroke var(--border) strokeWidth 0.5
- Lens outer: circle cx=82 cy=60 r=28 fill var(--bg-base) stroke var(--accent) strokeOpacity 0.3 strokeWidth 1.5
- Lens inner rings: circle r=22 fill #111113 stroke var(--accent) strokeOpacity 0.15 strokeWidth 1;
  circle r=15 fill #0a0a0c stroke var(--accent) strokeOpacity 0.2 strokeWidth 0.5;
  circle r=8 fill var(--bg-surface)
- Lens reflection: circle cx=75 cy=53 r=3 fill var(--accent) opacity 0.1
- Film knob left: circle cx=28 cy=62 r=10 fill #252527 stroke var(--border) strokeWidth 1;
  circle r=5 fill #1a1a1d
- Film knob right: circle cx=145 cy=62 r=10 fill #252527 stroke var(--border) strokeWidth 1;
  circle r=5 fill #1a1a1d
- Film slot: rect x=10 y=98 w=160 h=4 fill var(--bg-base)
(All circles inherit cx=82 cy=60 unless noted.)

Inline hex fills (#252527, #3a3a3f, #111113, #0a0a0c, #1a1a1d) are owner-provided literal
detail colors — use exactly as given, do NOT tokenize.

## FIX-2 — Layout proportions
Camera wrapper div and photo container EXACTLY equal width:
- Camera wrapper: `className="w-[200px]"` (new — SVG is now `w-full h-auto`, parent sets width)
- Photo container: `className="w-[200px] mt-[-2px] overflow-hidden rounded-b-xl"`
  (adds `overflow-hidden rounded-b-xl` per owner spec; note T035 removed overflow-hidden for
  the clip-path reveal — clip-path is unaffected by parent overflow; restore per owner spec)
- Photo img: `className="w-full aspect-[9/16] object-cover"` (drop `w-[200px]` + `rounded-b-lg`
  + shadow — width flows from container, rounding from container)
- Both remain wrapped in the existing `flex flex-col items-center` assembly (no gap).
- Voice chip (Condition B): keep centered; set its width to `w-full` within the 200px
  container? NO — keep `w-[140px]` (chip centered, unchanged) unless it conflicts; report
  the choice.

## FIX-3 — Keepsake card de-chrome
Keepsake section (phase 5): ensure NO heading ("Simpan Kenangan Digital" already removed in
T035). Keep only: button "Simpan ke Galeri Saya" (string verbatim, e2e-safe) + one sublabel
line below it. Card classes → `bg-bg-surface/70 backdrop-blur-sm border-border rounded-2xl p-3`
(replacing `bg-bg-surface ... rounded-xl p-6`); adjust button top margin as needed (`mt-4`
likely drops since heading removal already happened in T035 — keep sensible spacing).
Sublabel text: keep existing "Unduh foto kenangan berbingkai dari acara ini."

## Constraints
- ONLY `components/guest/screens/Done.tsx`. globals.css must NOT change.
- `npx tsc --noEmit` must pass — run it.
- No e2e/vitest. No new dependencies. No copy changes (button string verbatim).
- Keep: thermal-print/settle/slide-up classes, phase timers, z-layering wrapper, ornaments.

## Validation
- tsc PASS.
- Slot alignment reasoning: viewBox 180×110, slot x=10 w=160 at y=98 h=4 → slot bottom at
  viewBox y=102 of 110; photo container mt-[-2px] overlaps container top — verify the math
  still reads flush and note it in result.md.

## Handoff
Write result.md (replace): status, exact changes per fix, tsc result, deviations.
Owner commit message (for orchestrator only, do NOT commit):
`fix(guest): improve camera SVG detail, flush photo alignment, de-chrome keepsake card`
