# Task

T042 — E2E diagnostic + fix. Owner reports many e2e failures after
`839e871`/`b9b00ae`/`fae60ba`/`dc12c73`. Redesign planned afterward (separate
task) — e2e must be green first.

## Scope

1. Run `npm run e2e` (one pass, alone — no concurrent suites).
2. Triage failures: functional-broken vs copy-obsolete.
3. Fix functional breaks directly (likely suspects: server-side auth gate
   redirect/timing, code-split lazy-mount timing, start() double-submit guard
   eating e2e clicks). Copy-obsolete failures caused by planned redesign:
   leave, record.
4. Re-run affected suites to green.

## Constraints

- No UI/copy redesign in this task.
- No doc edits unless a canonical conflict surfaces (report instead).
- Single e2e lane at a time.

## Validation

`npm run e2e` green (or only known copy-obsolete skips recorded).
