# Current Task Status

**Status:** IDLE
**Last updated:** 2026-08-20

---

## Last Session (schema drift fix — guest_messages dropped live)

Guest message feature was already removed from code (prior session). This session fixed the remaining schema drift: `guest_messages` table dropped from live Supabase DB.

### Completed

1. **Repo cleanup (earlier this session):** untracked `supabase/.temp/*` + `e2e/*.png`; fixed `.gitignore` (added `supabase/.temp/`, `e2e/*.png`); deleted dev logs + build cache.
2. **Live DB test-event cleanup (approved):** deleted 7 CLOSED test events + all related rows (guest_sessions 36, photos 32, voice_notes 8, guest_messages via FK). DB + storage now consistent (0 events, bucket only `.emptyFolderPlaceholder`).
3. **Schema drift fix (approved):** created `supabase/migrations/0009_drop_guest_messages.sql`; applied live via direct pg (transactional: DROP TABLE IF EXISTS public.guest_messages + INSERT into `supabase_migrations.schema_migrations` version `0009`). Table confirmed gone, history now 0001–0009.

### Validation

- Live verification script (pg via DATABASE_URL): `table_exists_after: false`, migration `0009` recorded.
- No code/doc change needed — repo already clean of guest_message references (grep 0 matches).

### Known Outstanding (unchanged)

- Physical-device QA, live admin visual QA — owner confirmed done.
- `smoke.spec.ts` live-backend test — deferred until after owner completes local UI/UX polish.
- Architecture-review candidates #2 (shared `apiError` envelope) and #4 (pending-photos predicate facade) — discussion pending.
- Uncommitted work in repo: `.gitignore` edit + deletions (0005/0006 migration files, supabase/.temp/*, e2e/*.png) + new 0009 file. Next: commit separately (repo cleanup vs migration).

## Next Actions

None — idle. Pending: commit pending repo changes; discuss architecture-review candidates #2/#4 with owner.
