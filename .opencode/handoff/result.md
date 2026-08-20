# Result: Phase 3 — Admin UI Dark-Token Restyle (P3)

## Status

COMPLETE. All 5 validation gates passed, serially, in order.

## Files changed (admin only, className/markup-level restyle)

- `components/admin/admin-ui.tsx` — Shell (bg-bg-base page, hairline header, gold focus), Status (error → `border-error/40 bg-error/10`, success → `border-success/40 bg-success/10`; legacy `--success-surface`/`destructive` removed), Busy (bg-bg-surface), AuthGate (quiet bordered "Return to sign-in"), Button (primary = `bg-accent text-on-accent` + `hover:brightness-105`; secondary = quiet `border-border bg-bg-surface` + `hover:bg-bg-elevated`; `duration-fast`), AdminCreateEvent (dark card/field anatomy).
- `components/admin/admin-sign-in.tsx` — narrow centered bg-bg-surface card, labelled fields on bg-bg-base inputs, single gold "Sign in", status below form unchanged.
- `components/admin/admin-event-index.tsx` — dense rows on bg-bg-surface; ACTIVE row prominent via gold left-edge marker (`border-l-2 border-l-accent`) + gold "Active" pill; DM Mono (`font-mono tabular-nums`) created/closed dates; "Create new event" (and empty-state "Create event") is the single gold action; row Open / Access / QR actions quiet.
- `components/admin/admin-dashboard.tsx` — 18rem lg context rail + timeline (structure unchanged); Cormorant 3xl event title; status pill gold-soft for ACTIVE, quiet for Closed; "Close event" is the view's single gold action (Search now secondary); group names moved from Cormorant to DM Sans semibold (§6: no Cormorant beyond page/event titles); item-count pill quiet + DM Mono; all timestamps/durations/"N of M" counters DM Mono tabular-nums; photo tiles on bg-bg-surface with DM Mono timestamps; voice notes as bordered playback rows (quiet play button, gold progress fill); skeletons on bg-bg-elevated (static, per §4); preview dialog on bg-bg-elevated + bg-overlay scrim; error surfaces on `border-error/40 bg-error/10`.
- `components/admin/admin-access.tsx` — same field anatomy on bg-bg-surface; "Copy link" gold (single primary), Print trigger quiet; print menu on bg-bg-elevated with `hover:bg-accent-soft` items; QR block bounded (`border-border bg-bg-elevated p-3`) with white quiet zone preserved via `bgColor="#FFFFFF"`/`includeMargin` on QRCodeSVG for scannability on dark (no Tailwind color literals); read-only URL field DM Mono on bg-bg-elevated. Print artifacts untouched (white paper, e2e-verified).

## Validation (serial, one lane)

1. `npx tsc --noEmit` — PASS (no output).
2. `npx vitest run` — PASS, 344/344 (43 files).
3. `npx playwright test --workers=1` — PASS, 39 passed / 1 skipped (live-backend skip) / 0 failed (3.3m).
4. `npm run lint` — baseline only: 1 pre-existing `any` error in `e2e/print-qa.spec.ts` + pre-existing img-element/unused-var/exhaustive-deps warnings in guest files and `lib/usage.test.ts`. Zero new issues from admin files.
5. `npm run build` — PASS.

## Copy changes (grounded wording, per task contract)

- Shell defaults: "Memory table"/"Event archive" → "Admin"/"Event desk".
- Sign-in: Shell props title "Admin"; inner eyebrow "A clear archive for a day worth keeping" → "Admin access". ("Open your event desk." h1 kept.)
- Create event h1: "Start a fresh page in the archive." → "Create a new event."
- Access h1: "Put the doorway on the table." → "Share event access."
- Index empty state body: "open its page in the archive" → "start collecting photos and voice notes."
- All e2e-protected strings (labels, buttons, regions, headings, error/status messages) verbatim — untouched.

## A11y / tokens / motion

- Focus rings: `focus-visible:outline-2 outline-offset-2 outline-accent` (gold) everywhere, matching guest convention.
- aria roles/live regions, 44px+ targets, tabular-nums preserved.
- No inline color literals (QR white lives in QRCodeSVG props, consistent with existing print artifacts).
- Motion: only `duration-fast` hover/focus transitions; dialog entrance uses existing `duration-base` (was duration-200, tokenized, behavior-identical).

## Deviations

None.

## Unresolved risks

- Live visual QA with an authenticated admin against the seeded Supabase event remains outstanding (pre-existing limitation, unchanged).
