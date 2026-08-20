# Task: Phase 3 — Admin UI Dark-Token Restyle (DESIGN.md §6, P3)

## Authority

- `DESIGN.md` (root) — CANONICAL. §2 tokens, §3 typography, §4 motion, §6 admin flow govern this task. Read it first.
- `UX_FLOW.md` (root) — §Admin Flow: behavior/states reference (unchanged).
- Backend, API, `app/api/**`, `supabase/**`, `docs/**`, guest components — LOCKED, do not touch.
- Phase 1/2 already landed: dark tokens + Tailwind v4 utilities live in `app/globals.css` `@theme inline` (`bg-bg-base`, `bg-bg-surface`, `bg-bg-elevated`, `text-text-primary/secondary/muted`, `bg-accent`, `text-on-accent`, `bg-accent-soft`, `border-border`, `bg-overlay`, `text-error`, `text-success`, `font-display`=Cormorant, `font-mono`=DM Mono, `duration-fast/base/slow`). Reference guest usage: `components/guest/screens/*.tsx`.

## Objective

Restyle the admin UI on the dark tokens per DESIGN.md §6 + §7 (P3 rows). BEHAVIOR AND STATES UNCHANGED — visual only. DESIGN.md §6 rules:

- `--bg-base` page, `--bg-surface` cards, `--border` hairlines
- Gold reserved for the single primary action per view; everything else quiet
- Functional, data-dense: NO Cormorant beyond page/event titles; no decorative imagery; no motion beyond standard focus/hover tokens
- Sign-in: narrow centered `--bg-surface` card, labelled fields, single gold sign-in button, status below form
- Event Index: dense rows (title, status pill, DM Mono created date); ACTIVE prominent via gold left-edge marker; Open + Access/QR actions per row; create-new action
- Dashboard: Cormorant 3xl event title header (status, close + access/QR actions); guest-name search above newest-first timeline; `lg`: 18rem context rail + timeline; submission groups by guest session; photo tiles on `--bg-surface` with DM Mono timestamps; voice notes as bordered playback rows (play/pause, duration, progress, download); skeletons/empty/error surfaces restyled
- Creation / Access-QR: same field anatomy on `--bg-surface`; QR block bounded, copy/print actions

## Files in scope (admin only)

- `components/admin/admin-ui.tsx` (Shell, Status, Busy, AuthGate, Button, AdminCreateEvent) — note: `Status` uses legacy `--success-surface`/`destructive` vars; move to `text-error`/`border-error`-family token classes; `Button` primary = gold fill + `text-on-accent`, secondary = quiet `--bg-surface` + border; Shell default copy "Memory table"/"Event archive" → grounded plain wording that fits the dark analog-film system (no "archive/memory-table" light-theme flavor) — keep it functional
- `components/admin/admin-sign-in.tsx` (67 lines)
- `components/admin/admin-event-index.tsx` (144 lines)
- `components/admin/admin-dashboard.tsx` (658 lines — the big one; restyle only, do not refactor logic)
- `components/admin/admin-access.tsx` (238 lines)
- `components/admin/admin-create-event.tsx` (1-line re-export — no change needed)

## Hard constraints

1. **e2e selector stability:** `e2e/admin-index.spec.ts` and `e2e/smoke.spec.ts` rely on these accessible names/labels — DO NOT change them: "Email", "Password", "Sign in" (button), "Your events." (heading), "Active event" (region), "Past events" (region), "Active"/"Closed" (exact text), "Open" (link), "Access / QR" (link), "Create new event" (link), "Event title" (label), "Create event" (button), "Retry" (button), "The event list could not be loaded. Retry safely.", "No events yet" (heading), "Create event" (link, href /admin/events/new), "Find existing event" (link), "An active event already exists. Open it instead.", "Return to sign-in". Error/status message strings stay verbatim.
2. No new files, no component splits, no logic refactors — className/markup-level restyle only (structural JSX tweaks allowed where DESIGN.md §6 requires, e.g. gold left-edge marker on ACTIVE row, DM Mono dates).
3. A11y preserved: focus-visible gold rings, aria-live/status roles, 44px+ targets, tabular-nums on DM Mono numerals.
4. No inline color literals except `#0d0d0f`-on-gold which is already tokenized as `text-on-accent`.
5. Motion: none beyond `duration-fast` hover/focus (§6: no motion beyond standard tokens).

## Validation (run serially, in this exact order — one lane at a time)

1. `npx tsc --noEmit` — must pass
2. `npx vitest run` — 344/344
3. `npx playwright test --workers=1` — all pass (CRITICAL: `--workers=1`; 4-worker runs produce false failures from dev-server contention)
4. `npm run lint` — no new errors/warnings beyond baseline (1 pre-existing `any` in `e2e/print-qa.spec.ts` + img-element/unused-var warnings)
5. `npm run build` — pass

If any gate fails: fix and re-run that gate and everything after it. Do not skip steps. Do not write `result.md` until all 5 gates have actual results.

## Report

Write `.opencode/handoff/result.md`: status, files changed, per-gate validation results, copy changes made (Shell defaults etc.), deviations (should be none), unresolved risks.
