# Current Execution State

- Phase: Guest message feature (Opsi B) — implemented and validated, uncommitted.
- Status: Working tree holds the Opsi B change set (6 new files, 15 amended). HEAD `cd1e38a`.

## Session summary (guest message / pesan & kesan, Opsi B)
- NEW `supabase/migrations/0005_guest_messages.sql`: `guest_messages` table, 1–280 CHECK, one-per-session UNIQUE, FK RESTRICT, index, RLS+REVOKE. Verified live (idempotent re-run, all constraints enforced).
- NEW `lib/guest-message-tx-repo.ts` + `lib/submit-guest-message.ts` (voice-note pattern; reuses `resolveVoiceNoteAuth`; UNIQUE is the race-safe guard; no storage).
- NEW `app/api/events/[public_id]/guest-messages/route.ts` (auth-before-body, rate limit, 4 KB bounded JSON read, 409/422/429/401 mappings).
- Amended: session GET usage + `start-guest-session` body + `UsageState` (+`guest_message_submitted/available`); `admin-media-repo.listSubmissions` (+`GUEST_MESSAGE` w/ `message_text`); guest UI (`GuestMessageAction`, `submitMessage`, usage row); admin UI (`MessageTile`, type label, breakdown).
- Docs amended: `docs/db_scheme.md` (v1.2, table/constraints/indexes/summaries/absence note) and `docs/API_CONTRACT.md` (§6.6, §2, §4, §5.7, §6.1–6.2).
- Validation: `npx tsc --noEmit` PASS (exit 0); `npx vitest run` 362/362 (38 files) PASS — includes new route/unit tests for guest-messages; eslint 0 errors, 9 pre-existing warnings; migration verified against live local Postgres.

## Open items for owner
1. Migration 0005 is NOT yet applied to the production Supabase project — must be applied before deploy.
2. `mime_type: "text/plain"` / `file_size: 0` for GUEST_MESSAGE submissions is an implementation convention (documented in API_CONTRACT §5.7), not an owner-ratified decision.
3. Message rows are not covered by the 7-day media cleanup (they have no storage object); retention for text is currently indefinite.

## Pre-existing open items (unchanged)
`public/frames/wedding-simple.png` handled gracefully; Send-401 stale-closure note from prior session; frames ~99.8% opaque asset question; R3 prerequisites; deferred owner decisions C1–C5.

## R3 prerequisites (unchanged)
Owner go-ahead; Vercel env vars (NEXT_PUBLIC_*, DATABASE_URL pooler + sslmode=require, SUPABASE_STORAGE_BUCKET, CRON_SECRET, TRUSTED_PROXY=1); deployed smoke incl. ffprobe + cron 401/200.
