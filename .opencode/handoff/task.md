# T029 — Print UX refinement (Access screen)

## Scope
Implement in `components/admin/admin-access.tsx`. Also update
`e2e/qr-qa.spec.ts` assertions to match the new UI. No other files. No business
logic, API, or canonical-document changes.

## Authority (read before editing)
- `AGENTS.md` §3, §9 (invariants, security/testing gate).
- `docs/UI_UX.md` §5.4 (Event access and QR): copy + print affordances, success/
  failure feedback per action, print in progress/unavailable state.
- `docs/UI_DESIGN.md` line ~155 (Access/QR presentation).
- Existing code conventions: `components/admin/admin-ui.tsx` (Button, Shell,
  Status, Busy, AuthGate, api), `components/admin/admin-dashboard.tsx`
  (`focusRing` constant at line 65; disclosure `aria-expanded`/`aria-controls`
  pattern; PreviewDialog keyboard-trap pattern at lines 357–375).

## Available primitives (do NOT add dependencies)
- From `./admin-ui`: `Button` (`secondary` prop), `Shell`, `Status`, `Busy`,
  `AuthGate`, `api`, `Event`.
- `QRCodeSVG` from `qrcode.react` (supports `bgColor`/`fgColor`).
- `lucide-react` icons (e.g. `Printer`, `ChevronDown`, `ArrowLeft`).
- `focusRing` pattern: `"focus-visible:outline focus-visible:outline-3
  focus-visible:outline-offset-2 focus-visible:outline-ring"`.

## Problems to fix (from manual QA)
1. "Print QR only" and "Print access card" currently render the same DOM.
2. Print output spans 2 pages (root cause: `min-h-screen` on Shell `<main>` AND
   on the artifact, plus `py-16`; no `@page` sizing; shared artifact DOM).
3. Three adjacent action buttons wrap awkwardly on mobile.

## Required changes

### A. Print controls
- Remove the two inline secondary print buttons.
- Add ONE secondary "Print" button. Clicking opens a small accessible menu with:
  - "Print QR only"
  - "Print access card"
- "Copy link" remains the primary action (first in the row).
- Menu a11y: trigger `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`;
  panel `role="menu"`; items `role="menuitem"` with visible text labels.
- Keyboard: focus first item on open; ArrowUp/ArrowDown move focus between items
  (roving tabindex); Escape closes and returns focus to the trigger; Enter/Space
  on an item selects it (closes menu and starts the print flow); click-outside
  closes. Visible focus ring on trigger and items. Reuse the PreviewDialog
  keyboard pattern as a reference.
- Keep the existing "Preparing … for printing…" status line while a variant is
  active.

### B. Print QR only artifact
- A structurally distinct component (e.g. `PrintQrOnly`), rendered ONLY when the
  selected variant is `"qr"`.
- Content, in order: event title (h1); large high-contrast QR (fg `#000000`,
  bg `#ffffff`); public URL (break-words). Nothing else.
- Exactly one printed page.

### C. Print access card artifact
- A structurally distinct component (e.g. `PrintAccessCard`), rendered ONLY when
  the selected variant is `"card"`.
- Content, in order: event title (h1); large high-contrast QR; a short guest
  instruction (e.g. "Scan to share your photos and voice notes."); public URL.
- Must be structurally distinct from the QR-only artifact (separate component,
  different element structure — not one tree with a conditional `<p>`).
- Exactly one printed page.

### D. Print isolation (critical)
- Under `@media print`, ONLY the selected artifact is visible. Hide ALL admin
  chrome: Shell header, back link, headings, the public-URL input, Copy/Print
  controls, the on-screen QR section, status surfaces.
- Reset Shell print geometry: the `<main className="min-h-screen px-4 py-6
  sm:px-8 lg:px-12">` and `main > div { max-width: ... }` must be neutralized in
  print (min-height:0, padding:0, max-width:none) so they cannot push a second
  page.
- Use explicit `@page { size: A4; margin: 12mm; }`.
- Bounded artifact: QR width ~145mm (use a mm-based arbitrary width); NO
  `min-h-screen`/`vh` units anywhere in the print artifact. Center the artifact
  vertically within the page box.
- Prevent accidental second-page overflow: size content to fit the A4 printable
  area and add `overflow: hidden` on the print root in print media to clip stray
  overflow.
- Keep the print flow mechanic: setting the variant triggers the existing
  `useEffect` that calls `window.print()` and resets on `afterprint`. Do NOT
  override `window.print` in the component (tests may override it).
- Selecting one option must not render or print the other artifact (only the
  selected variant is in the DOM).

### E. Responsive screen layout
- Action row holds only "Copy link" (primary) + "Print" (secondary). Clean on
  mobile (375px) and desktop — no awkward wrapping.

## e2e/qr-qa.spec.ts update
- Lines ~50–52 assert "Copy link" + "Print access card" buttons are visible.
  Update to assert "Copy link" visible and the new "Print" button visible (the
  menu items are not inline buttons). Keep the rest of the spec intact.

## Report back
- Files changed.
- Key implementation decisions (menu structure, print CSS approach, artifact
  component names, @page size chosen).
- Assumptions and any unresolved risks.
- You have no bash access; do NOT attempt to run checks. The orchestrator runs
  typecheck, vitest, lint, build, e2e, and the print-preview page-count check.
