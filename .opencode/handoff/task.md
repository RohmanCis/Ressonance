# TASK: Canonical Docs Update — DESIGN.md §5.2 Frame Registry Sync

## 1. Context & Objective
- **Governing Docs**: AGENTS.md §10 (Canonical Doc Modification Gate), DESIGN.md §5.2.
- **Objective**: Synchronize DESIGN.md §5.2 with the implemented Dynamic Frame Engine and its 3 canonical templates.

## 2. Scope of Work
- Update `DESIGN.md §5.2` to explicitly document the 3 luxury frame templates:
  1. `royal-gold` ("Royal Gold Serif") — Classic double-hairline border + corner flourishes (Cormorant Garamond).
  2. `botanical-romance` ("Botanical Romance") — Organic floral silhouette (Pinyon Script).
  3. `modern-editorial` ("Modern Editorial") — High-fashion minimalist brackets (DM Mono tracked).
- Document the `FrameTextLayer` dynamic composition model (event title interpolation at runtime).

## 3. Validation Gate
- Verify Markdown formatting and ensure zero unratified drift.
- Run `npm run typecheck` to confirm no regressions.
- Update `.opencode/handoff/result.md` upon completion.