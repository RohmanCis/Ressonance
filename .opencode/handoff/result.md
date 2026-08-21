# Result: Admin UI reconciliation vs DESIGN.md §6 (lane adm-des-1)

Status: DONE. Gold-rule drift fixed, sign-in status region moved below the form, typecheck clean, e2e/admin-index.spec.ts 9/9 PASS.

## Files changed

- `components/admin/admin-ui.tsx` — create-event eyebrow gold → muted
- `components/admin/admin-sign-in.tsx` — eyebrow gold → muted; error Status moved below form
- `components/admin/admin-event-index.tsx` — "Event index" eyebrow gold → muted
- `components/admin/admin-dashboard.tsx` — "Event desk" eyebrow, PhotoTile ImageIcon, VoiceTile Mic, PreviewDialog header mono label: gold → muted
- `components/admin/admin-access.tsx` — "Share access" eyebrow gold → muted

`admin-create-event.tsx` untouched (re-export only; implementation in admin-ui.tsx).

## Deltas implemented vs skipped

1. **Gold rule** — IMPLEMENTED. All decorative gold text/icons → `text-text-muted`
   (tracking/weight/case unchanged). 8 spots, listed in audit table below.
2. **Sign-in status below form** — IMPLEMENTED. `{error && <Status error/>}` moved
   out of the `<form>` to directly after it (same `max-w-md` column). `role="alert"`
   and instant appearance preserved (Status internals untouched). Verified live:
   alert top 595px ≥ form bottom 579px at 375×812 with mocked 401.
3. **Density/hierarchy polish** — SKIPPED. Rows/headers already read as dense
   (p-4 rows, xs timestamps, single-line groups); any further tightening risked
   e2e-visible structure for no measurable gain. "When in doubt, leave as-is."
4. **Motion audit** — VERIFIED, no changes. All transitions use `duration-fast`/
   `duration-base` tokens; spinners `motion-reduce:animate-none`; dialog
   fade/scale `motion-reduce:transition-none` (kept per contract).
   One noted deviation (left as-is, reported): VoiceTile progress fill uses
   `transition-[width]` — §4 says "never layout properties", but it is
   functional playback feedback at 4Hz, motion-reduce guarded, and removing it
   would change feel beyond polish scope.

## Gold-rule audit table (element → verdict)

| Element | Before | Verdict |
|---|---|---|
| Shell eyebrow ("Event desk" etc.) | text-text-muted | already compliant |
| Sign-in "Admin access" eyebrow | text-accent | FIXED → text-text-muted |
| Create-event "New event" eyebrow | text-accent | FIXED → text-text-muted |
| Index "Event index" eyebrow | text-accent | FIXED → text-text-muted |
| Access "Share access" eyebrow | text-accent | FIXED → text-text-muted |
| Dashboard "Event desk" eyebrow (aside) | text-accent | FIXED → text-text-muted |
| PhotoTile ImageIcon | text-accent | FIXED → text-text-muted |
| VoiceTile Mic icon | text-accent | FIXED → text-text-muted |
| PreviewDialog header mono label | text-accent | FIXED → text-text-muted |
| Primary buttons / linkGold (bg-accent) | gold | KEEP — primary action (§2) |
| ACTIVE left-edge marker (border-l-accent) | gold | KEEP — active state (§2/§6) |
| Index "Active" pill (bg-accent) | gold | KEEP — active state |
| Dashboard ACTIVE badge (accent-soft/accent) | gold | KEEP — active state |
| VoiceTile progress fill (bg-accent) | gold | KEEP — active playback state (contract-confirmed) |
| All focus rings (outline-accent) | gold | KEEP — §2 explicitly allows |
| Print menu hover:bg-accent-soft | soft gold wash | LEFT — not in audit deltas; subtle hover token, no e2e/design gain in changing; flagged |

## Validation

- `npm run typecheck` — clean.
- `npx playwright test e2e/admin-index.spec.ts` — **9/9 PASS** (1.9m, serial,
  fresh playwright-spawned dev server; stale pre-existing dev-server process
  on :3000 killed first). No other suite run concurrently.
- Visual self-check (Chromium, route-mocked):
  - 375×812 sign-in: error alert renders below form (alertTop 595 ≥ formBottom
    579), gold Sign in button remains single primary action.
  - Event index at 375px and 1280px: no horizontal overflow
    (scrollWidth === innerWidth both), ACTIVE card marker + Closed rows intact,
    no Access/QR on CLOSED row (unchanged code path, e2e line 80 asserts 0).

## SSOT conflict / drift

- Known owner conflict (per contract, not acted on): DESIGN.md §6 says
  Open/Access-QR "per row" but locked e2e restricts Access/QR to ACTIVE.
  Behavior preserved; reported separately by orchestrator.
- Minor §4 deviation noted above (progress-bar width transition) — left as-is.

## Assumptions

- `text-text-muted` chosen over `text-text-secondary` for all demoted elements
  (matches existing compliant eyebrows, e.g. Shell header and "Submissions"
  label — consistency beats introducing a second muted tone).
- Create-event Status regions stay inside the form — contract scoped the
  below-form move to sign-in only (§6 text mentions the status region in the
  sign-in bullet).

## Next step

None blocking. Optional follow-ups for orchestrator: print-menu
`hover:bg-accent-soft` verdict; progress-bar `transition-[width]` vs §4.

---

## Orchestrator reconciliation (2026-08-22)

- Diff audited against contract: className token swaps + sign-in Status JSX move only; roles, aria-labels, hrefs, e2e-asserted copy, min-h-11 targets, focus rings intact. A11y/interaction review folded into orchestrator diff review (change surface too small to warrant a separate lane).
- Regression gates (post-designer, no code changed since designer's e2e run):
  - `npm run typecheck` PASS.
  - `npx vitest run` 354/354 (43 files) PASS.
  - `npm run build` PASS.
  - `npx playwright test e2e/admin-index.spec.ts` 9/9 PASS (designer-run evidence reused; zero code delta since).
  - Lint: 1 pre-existing `any` error (`e2e/print-qa.spec.ts`) + 12 warnings, ALL on code identical to HEAD (verified: `admin-dashboard.tsx:553` exhaustive-deps hook untouched by this task). AGENTS.md baseline says 11 warnings — tally drift, not task-introduced. Report to owner; AGENTS.md not edited.
- Visual QA: designer live verification accepted (375×812 sign-in alert-below-form geometry; 375/1280 no horizontal overflow; ACTIVE/CLOSED structure unchanged).
- Conflicts carried (owner decisions, unchanged): (1) DESIGN.md §6 "Access/QR per row" vs locked behavior/e2e (ACTIVE-only) — behavior preserved; (2) DESIGN.md §5.6 vs Done.tsx keepsake extras (prior session); (3) §4 vs progress-bar `transition-[width]` (left, functional, motion-reduce guarded); (4) print-menu `hover:bg-accent-soft` soft-gold hover (left).
- No commit/push (boundary). Task COMPLETE.
