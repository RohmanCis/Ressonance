# Task: Admin ambient + access/index/dashboard redesign — 5 commits

Baseline: PreSession.tsx Shell function (READ-ONLY — never modify guest files). Scope: components/admin/** only (+ globals.css ONLY if utilities missing). No docs/, no backend/API/migration, no npm runs (npx tsc --noEmit allowed as sole check). TypeScript strict.

Read AGENTS.md, DESIGN.md, then all listed files IN FULL before editing. Several spec items overlap prior remediation (commits f501bf8–f7bc6e5) — verify current state first, apply only what's missing, don't regress.

## COMMIT 1 — Shared background system
FIX-1 Shell (admin-ui.tsx): match PreSession Shell exactly — main `relative flex min-h-dvh flex-col overflow-hidden bg-bg-base text-text-primary px-5 sm:px-8 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]`; Layer 1 `pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-accent/20 blur-[100px] animate-ambient-1`; Layer 2 `pointer-events-none absolute -bottom-24 -left-24 h-[420px] w-[420px] rounded-full bg-accent/15 blur-[110px] animate-ambient-2`; Layer 3 `pointer-events-none absolute inset-0 film-grain`; Layer 4 `relative z-10 w-full` content wrapper. All admin pages via this Shell. Verify `animate-ambient-1/2`, `film-grain` exist in globals.css (audit says they do — reference only, add only if missing).

## COMMIT 2 — Typography
FIX-2 AdminPageShell h1 += `leading-tight tracking-tight`; eyebrow `text-xs font-medium tracking-[0.04em] text-text-muted` sentence case. Sign-in double eyebrow: drop Shell's, keep page's.
FIX-3 Intro copy → `text-sm text-text-secondary leading-relaxed` (admin-sign-in, admin-ui, admin-access).
FIX-4 Field labels → `text-xs font-medium text-text-secondary` (VERIFY: largely done in f501bf8 — sweep for stragglers only).
FIX-5 URL value (admin-access) → `font-mono tabular-nums text-sm text-text-muted`.

## COMMIT 3 — admin-access.tsx no-scroll redesign (390×844)
FIX-6: remove `lg:grid`; single surface card `rounded-2xl border-border bg-bg-surface/85 backdrop-blur-xl p-5`: Row 1 QR centered max 160px (bgColor #FFFFFF fgColor #000000); Row 2 URL `font-mono text-xs text-text-muted truncate w-full border-b border-border pb-1` read-only pointer-events-none select-all; Row 3 actions: Copy link `gold-foil-btn flex-1 h-12 rounded-xl` + Print QR secondary `flex-1 h-12 rounded-lg border-border bg-bg-surface` — single button, no dropdown/menu/chevron. Print: `window.print()` direct; print-only section (`hidden print:block`) with ONLY QRCodeSVG 80mm×80mm, `@page { margin: 0 }`, QR fills page — no title/URL/font. REMOVE all PrintVariant logic, printOptions, dropdown, ChevronDown/Printer menu icons. Remove Back-to-event link. Keep "Scan with a phone camera…" helper as `text-xs text-text-muted` below QR. Copied status: inline `text-xs text-text-muted text-center` below action row, auto-clear 2s.

## COMMIT 4 — admin-event-index.tsx hairline rows
FIX-7: remove per-row boxed anatomy. Container `divide-y divide-border`; rows `flex items-center justify-between py-4 px-0 gap-3`; left: title `font-display text-lg font-semibold text-text-primary` + date `font-mono text-xs text-text-muted`; right: Open / Access-QR as quiet text buttons `text-xs font-medium text-text-secondary hover:text-text-primary underline-offset-4 hover:underline`. ACTIVE row (Opsi 2): `bg-bg-surface/40` wash with `-mx-4 px-4 rounded-xl` keeping hairlines flush, `border-l-2 border-l-accent`, status = dot `h-2 w-2 rounded-full bg-accent inline-block` + label `text-xs text-text-muted ml-1.5`. CLOSED rows: no bg, no dot, label `text-xs text-text-muted`. Empty state: one line `text-sm text-text-muted text-center py-8`. Create CTA: gold-foil-btn or quiet top-right link — whichever fits no-scroll mobile.
⚠ COPY DECISION (orchestrator): spec says labels "Aktif"/"Selesai" but admin surface is English and e2e asserts "Closed" — use **"Active" / "Closed"** English, flag deviation in result.md for owner.

## COMMIT 5 — Dashboard refinements
FIX-8: GuestGroup → `divide-y divide-border` (remove per-group box if present); PhotoTile `rounded-lg` (verify — done in 5248bd4); PreviewDialog `rounded-2xl shadow-2xl` (verify shadow); VoiceTile progress → scaleX (outer `relative w-full h-1 bg-border rounded-full overflow-hidden`, inner `absolute inset-y-0 left-0 w-full h-full bg-accent rounded-full origin-left transition-transform duration-[var(--motion-base)]` + `style={{ transform: scaleX(progress) }}`) — verify done in 1c4e799, don't regress; error rows `bg-error/10` → `bg-bg-elevated/90` + `text-error` only (verify done); empty state quiet line (verify done); TimelineSkeleton += `animate-pulse`.
FIX-9: sweep both files — any `hover:bg-accent-soft` on non-primary → `hover:bg-bg-elevated`; confirm no orphan print-menu code after FIX-6.

## E2E assertions
UI text/structure changes break specs. Update assertions in same commit (precedent: f7bc6e5): admin-index.spec.ts (row anatomy, "Closed", Access/QR link name — KEEP accessible name "Access / QR"), any admin-access/dashboard spec touching print menu or removed elements. Do NOT run Playwright (no npm constraint) — orchestrator runs gates after.

## Report (result.md + final message)
Files changed per commit, critique summary, verification per commit, deviations/decisions needing owner input (esp. Active/Closed language, print-artifact mm sizing), e2e specs touched.
