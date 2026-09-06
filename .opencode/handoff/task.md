# Task — Doc audit + dead code scan (reports only, two parallel read-only lanes)

Orchestrator-owned task. Two background lanes run in parallel:

- Lane A (#librarian): docs/ + AGENTS.md + .opencode/handoff audit →
  proposed-change report (file | line | change type | reason).
- Lane B (#explorer): components/, app/api/, lib/, hooks/ dead-code scan →
  report only, no edits.

No file modifications in this phase. A follow-up #fixer lane executes both
reports in one commit after both lanes return terminal.

## Constraints (for the fixer lane, recorded here)

- No logic/behavior changes, no API/DB changes. Docs may be edited to match
  code (code wins on conflict) — owner-approved scope.
- Gates: `npx tsc --noEmit` pass; `npx vitest run` pass (384/384).
- Commit message: `chore: doc sync, dead code cleanup, handoff reconcile`
