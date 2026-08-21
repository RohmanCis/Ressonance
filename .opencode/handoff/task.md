# Task: Admin UI reconciliation vs DESIGN.md §6 (lane adm-des-1 — design inspection + implementation)

Read AGENTS.md constraints. This is a RECONCILIATION/POLISH pass on the existing dark-token Admin UI, NOT a redesign. Preserve all behavior, API usage, routes, copy semantics, aria/labels, and e2e assertions.

## Authority
- DESIGN.md (root) §2 (gold rule), §3 (typography), §4 (motion), §6 (Admin Flow), §7.
- UX_FLOW.md Admin Flow section.
- AGENTS.md §6 code style (tokens only, no inline color literals, a11y non-negotiable).

## Files in scope (write)
- components/admin/admin-ui.tsx
- components/admin/admin-sign-in.tsx
- components/admin/admin-event-index.tsx
- components/admin/admin-dashboard.tsx
- components/admin/admin-create-event.tsx (re-export; implementation lives in admin-ui.tsx)
- components/admin/admin-access.tsx

Do NOT touch: app/api/**, docs/**, e2e/**, lib/**, guest components, globals.css (unless a token utility class is missing — prefer existing utilities).

## Audit deltas to address (orchestrator pre-audit; validate with your own design judgment, then implement)
1. GOLD RULE (§2: gold ONLY on primary actions, focus rings, active/confirmed states) — currently drifted:
   - Gold eyebrows (`text-accent` uppercase section labels) on every admin screen. Replace with `text-text-muted` or `text-text-secondary` (keep tracking).
   - Dashboard PhotoTile `ImageIcon text-accent` and VoiceTile `Mic text-accent` → `text-text-muted` (or secondary).
   - PreviewDialog header `text-accent` mono label → muted/secondary.
   - Keep gold: primary buttons, ACTIVE status pill/left-edge marker, dashboard ACTIVE status badge, focus rings, progress bar fill (active state — acceptable, confirm).
2. SIGN-IN (§6 "status region below the form"): error `Status` currently renders inside the form above the button. Move status region below the form while keeping `role="alert"` and instant appearance (§4). Keep gold full-width sign-in button as the single primary action.
3. Density/hierarchy polish per §6 "dense rows": Event Index past-events rows and dashboard guest-group headers may be tightened ONLY if it does not change text content, link hrefs, roles, or e2e-visible structure. When in doubt, leave as-is.
4. Motion (§6: "no motion beyond the standard focus/hover tokens"): verify no non-standard animations in admin components; keep existing spinners and dialog fade/scale as-is (functional, already motion-reduce guarded).

## Hard constraints
- Do NOT add Access/QR links to CLOSED event rows. Known owner conflict: DESIGN.md §6 says "per row" but locked e2e (e2e/admin-index.spec.ts) and current behavior restrict Access/QR to the ACTIVE event. Preserve existing behavior. This is reported to the owner separately.
- Do not rename/repurpose: "Your events.", "Create new event", "Open", "Access / QR", "Sign in", "Create event", "Find existing event", "No events yet" — e2e asserts these.
- Preserve all aria-labels, roles, min-h-11 (44px) targets, focus-visible rings, DM Mono (`font-mono tabular-nums`) timestamps.
- No new dependencies, no new components, no copy rewrites beyond what deltas above require.

## Validation (before writing result.md)
- `npm run typecheck` clean.
- `npx playwright test e2e/admin-index.spec.ts` green (19... use full file, serial mode).
- Visual self-check: layout/spacing coherent at 375px and 1280px.

## result.md
Report: status, files changed, deltas implemented vs skipped (with reason), gold-rule audit table (element → verdict), validation output, any SSOT conflict or drift found.
