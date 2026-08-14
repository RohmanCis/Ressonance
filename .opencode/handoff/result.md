# T029 — Result

## Status
Complete. Scope held: only `components/admin/admin-access.tsx` and `e2e/qr-qa.spec.ts` touched. No dependencies added. No business logic, API, or canonical-document changes. T030 not started.

## Files changed
- `components/admin/admin-access.tsx` — rewritten print UX.
- `e2e/qr-qa.spec.ts` — lines ~50–52 now assert "Copy link" + "Print" (exact) buttons; rest of spec untouched.

## Key decisions
- **Menu structure**: single secondary-style trigger (`aria-haspopup="menu"`, `aria-expanded`, `aria-controls="print-menu"`, Printer + ChevronDown icons). Panel `role="menu"` (absolute, right-0, popover surface) with two `<button role="menuitem">` items ("Print QR only", "Print access card"). Roving `tabIndex` via `activeItem` state; `useEffect` focuses the active item; ArrowUp/ArrowDown wrap; Escape closes and refocuses trigger; Enter/Space select natively (items are buttons); Tab closes; `pointerdown` outside the wrapper closes. Trigger ArrowDown/ArrowUp opens the menu (first/last item). Trigger disabled while `printVariant !== null` (print-in-progress/unavailable hint). Visible `focusRing` (same constant as admin-dashboard) on trigger and items.
- **Trigger element**: native `<button>` with classes mirroring `admin-ui` secondary `Button` — `admin-ui`'s `Button` does not forward refs, and the trigger needs a ref for focus return. Copy link still uses the `Button` primitive.
- **Print CSS approach**: page-scoped `<style>` (existing ponytail pattern): `@page { size: A4; margin: 12mm; }`; `@media print { header { display:none } main { min-height:0 !important; padding:0 !important } main > div { max-width:none !important } }` (`!important` needed to beat Tailwind utility specificity on Shell's `<main>`/inner div). Screen wrapper keeps `print:hidden`; print root is `hidden print:block print:overflow-hidden`. Only the selected variant renders in the DOM.
- **Artifact components**: `PrintQrOnly` (bare centered stack: h1 → QR → URL) and `PrintAccessCard` (bordered `<section>` frame: h1 → QR → guest instruction → URL). Structurally distinct trees. QR `w-[145mm]`, fg `#000000`, bg `#FFFFFF`. Both use `h-[260mm]` flex-centered column — mm-based (no `vh`/`min-h-screen`), 260mm < 273mm A4 printable height (297 − 2×12mm), so one page with slack; content measured ≈180mm (qr) / ≈223mm (card), both clipped by `overflow:hidden` as backstop.
- **@page size**: A4, 12mm margins (as specified).
- Print flow mechanic unchanged: variant state → existing `useEffect` → `requestAnimationFrame(() => window.print())` → `afterprint` resets. `window.print` not overridden. "Preparing … for printing…" status line retained.

## Assumptions
- Trigger ArrowUp/ArrowDown opens the menu (standard menu-button pattern) — additive, not required but harmless.
- Card artifact uses `border-black` for high print contrast (token-independent).
- 260mm artifact height chosen over exact 273mm to leave rounding slack against a second page.
- URL uses `break-words` per task spec (was `break-all`).

## Unresolved risks
- Home/End keys not implemented (menu has 2 items; add if menu grows).
- Print page-count and menu keyboard behavior not machine-verified here — no bash access; orchestrator runs typecheck, vitest, lint, build, e2e, and the print-preview page-count check.
- `React.KeyboardEvent` type referenced without React import — same pattern as `admin-dashboard.tsx` line 357; expected to typecheck identically.
