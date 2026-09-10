# Result: Apply migration 0009 to live Supabase DB

## Status
**BLOCKED** — `db push` refused due to remote-only migration versions 0005/0006.
No files modified in repo (only this result.md written).

## Preconditions
- Remote verified: `git remote -v` → `origin https://github.com/RohmanCis/Ressonance.git` (fetch+push). Matches task contract.
- Read AGENTS.md and `supabase/migrations/0009_drop_guest_messages.sql`.

## Migration file contents (`supabase/migrations/0009_drop_guest_messages.sql`)
```sql
-- Migration 0009: drop guest_messages (feature removed from MVP scope)
--
-- The guest message feature ("pesan & kesan") was removed from the MVP scope
-- on 2026-08-20 (owner decision). Migrations 0005/0006 files were deleted from
-- the repo during that removal; this migration cleans the live schema so the
-- database matches the repo (schema-drift fix).
--
-- The table holds no rows and has no inbound foreign keys, so the drop is
-- safe. The DROP is idempotent: re-running is a no-op.
--
-- Idempotent: safe to re-run.

DROP TABLE IF EXISTS public.guest_messages;
```

## Command 1: `npx supabase db push --linked`
Output (exit non-zero):
```
Initialising login role...
Connecting to remote database...
Remote migration versions not found in local migrations directory.
Make sure your local git repo is up-to-date. If the error persists, try repairing the migration history table:
supabase migration repair --status reverted 0005 0006

And update local migrations to match remote database:
supabase db pull
```
- This is the KNOWN RISK from task.md (remote history has 0005/0006, absent locally).
- No interactive prompt was reached; the command failed at a pre-check.
- Per task step 4: **STOPPED. No `migration repair`, no `db pull`, no history rewrite.**

## Command 2: `npx supabase migration list` (read-only verification)
Output:
```
Initialising login role...
Connecting to remote database...

   Local  | Remote | Time (UTC)
  --------|--------|------------
   `0001` | `0001` | `0001`
   `0002` | `0002` | `0002`
   `0003` | `0003` | `0003`
   `0004` | `0004` | `0004`
   ` `    | `0005` | `0005`
   ` `    | `0006` | `0006`
   `0007` | `0007` | `0007`
   `0008` | `0008` | `0008`
   `0009` | `0009` | `0009`
```

## Verification
- Performed: `npx supabase migration list` (read-only).
- Result: Remote migration history **already records `0009`** (Local and Remote both populated), while `0005`/`0006` are Remote-only.
- Interpretation: `0009` appears already recorded on the remote `supabase_migrations.schema_migrations` table. `db push` cannot proceed anyway because remote-only `0005`/`0006` are absent locally.
- NOT independently confirmed: whether `public.guest_messages` was actually dropped. `migration list` reports history only; the remote `0009` row could not be confirmed to be this exact file, and the table's existence was not queried (would require DB credentials/`db dump`).
- Suggested orchestrator follow-up (do not run without approval): `SELECT to_regclass('public.guest_messages');` against live DB — `NULL` ⇒ table gone (0009 effective); non-null ⇒ table still present.

## Blockers
1. `db push` aborts on remote-only migration versions `0005`/`0006`. Repairing/deleting history is out of scope per task contract.
2. Ambiguity: remote history shows `0009` applied, but actual table state unverified.

## SSOT conflict
None introduced. Note: AGENTS.md §12 states "Migration `0009` repo-only, not yet applied to live DB" — the remote migration history now shows `0009`, which diverges from that statement. Reported, not acted upon.

## Architecture drift
None.

## Next step
Orchestrator decision required: (a) approve `supabase migration repair --status reverted 0005 0006` (or equivalent) to reconcile history, then re-push; and/or (b) confirm actual `guest_messages` table state via a read query before deciding. No further action taken.
