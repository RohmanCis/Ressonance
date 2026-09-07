# Result: Amend §3 Typography Weight & Delete Orphaned Frame Assets

**Status:** complete

## Files changed
- `docs/DESIGN.md` (§3 scale table only)
- `public/frames/royal-gold.png` — deleted
- `public/frames/botanical-romance.png` — deleted
- `public/frames/modern-editorial.png` — deleted

## Changes applied
1. DESIGN.md §3 4xl row: "Cormorant Garamond 600" → "Cormorant Garamond
   500, `font-medium`; amended 2026-09-07, aligns with
   PreSession/FrameSelection implementation". Closes the §3-vs-code
   weight inconsistency (item 9 from docs audit). Note: Done screen
   h1 remains `font-semibold` (600) — doc now names 500 as the
   standard; minor residual inconsistency on Done, owner-accepted.
2. Orphaned PNGs removed. `public/frames/` now contains only
   `flower.png` and `wedding-crimson.png` — the two active frames.
3. Reference check: repo-wide grep for
   `royal-gold.png|botanical-romance.png|modern-editorial.png` →
   zero matches (code, docs, e2e).

## Validation
- `npx tsc --noEmit` → exit 0 (typecheck PASS).
- `git status`: this task's footprint = `M docs/DESIGN.md` + 3 `D`
  PNGs. Other dirty files are this session's earlier tasks (guest
  screens, frames.ts + tests, e2e, handoff, types, pre-existing
  .gitignore) — unchanged by this task.

## Blockers
None.

## SSOT conflicts
None. §3 now matches implementation.

## Next step
None. Task complete.
