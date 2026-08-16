# Current Execution State

- Phase: Idle. No active task. All sessions reconciled.
- Status: Working tree clean at `39cec45` (docs sync + UX_FLOW.md). Live DB migration history `0001`–`0005` applied and verified.

## Session summary (2026-08-17 — audit, migration repair, UX flow, doc sync)
- **Pre-QA audit** of guest + admin flows vs canonical docs: found 1 blocking issue (B1: `guest_messages` table missing from the live DB — session usage read, guest-message submit, and the admin timeline all 500) plus 3 non-blocking findings (N1 UI_UX doc drift, N2 admin status label, N3 frame-select closure fragility).
- **B1 resolved:** confirmed `supabase db push` failed on `gen_random_bytes` (SQLSTATE 42883 — pgcrypto lives in the `extensions` schema on Supabase; only migration 0002 was affected). Fixed `0002_guest_session_public_ref.sql` with `SET search_path = public, extensions;` … `RESET search_path;` (0003/0004 have no extension functions; 0005's `gen_random_uuid()` resolves via `pg_catalog`). Pushed via `SUPABASE_DB_URL`: 0002–0005 applied (0002–0004 idempotent replays over pre-existing artifacts — this also repaired the history drift where only `0001` had been recorded).
- **Verified post-push (read-only probes):** history `0001`–`0005`; `guest_messages` columns/constraints/indexes/RLS/grants all correct; no duplicated indexes; `public_ref` 0 NULL/0 duplicates; the app's exact query shapes (`countGuestMessages`, admin `listSubmissions` join) execute cleanly.
- **UX_FLOW.md created** (project root): owner-facing manual QA guide — guest flow A1–A8 (event open, Start, frame selection incl. both no-frame paths, camera/permissions, send, voice note, guest message, session panel/expiry/carry-over, closed-mid-session), admin flow B1–B5 (sign-in, index, create, dashboard, access/QR), plus a 12-row edge-case checklist.
- **Docs synced to reality:** `UI_UX.md` amended (2026-08-17 reconciliation note; §1 scope, §4.2 content/actions, new §4.5 guest-message flow, §5.2 read-only GUEST_MESSAGE tiles, §6 `GUEST_MESSAGE_LIMIT_REACHED` row). Stale state removed: `db_scheme.md` ("pending application" → applied; header 0001–0005), `PRD.md`/`API_CONTRACT.md`/`ARCHITECTURE_DECISIONS.md` (0001–0003 → 0001–0005), `AGENTS.md` §10 (frame selection + guest message + verified live-DB state). Removed CLI scratch `supabase/.temp/`.
- **Committed by owner as `39cec45`** ("docs: sync all canonical docs to migration 0005, add UX_FLOW.md and guest message UI/UX spec") — 8 files, +182/−11.

## Open items for owner
1. ~~Migration 0005 not applied to production Supabase~~ **RESOLVED 2026-08-17** — applied and verified on the APAC project that `.env.local` `DATABASE_URL` points to.
2. `guest_messages` rows are not covered by the 7-day media cleanup (no storage object); text retention is currently indefinite — owner policy decision outstanding.
3. `app/page.tsx` still shows "Foundation scaffold. No features implemented yet." — stale landing copy, out of last session's scope.
4. N2 (admin status label shows only Active/Closed; harmless while ARCHIVED is deferred) and N3 (frame-select closure fragility, non-blocking) remain as noted polish items.

## Pre-existing open items (unchanged)
Send-401 stale-closure note from prior session; frames ~99.8% opaque asset question; R3 prerequisites; deferred owner decisions C1–C5.

## R3 prerequisites (unchanged)
Owner go-ahead; Vercel env vars (NEXT_PUBLIC_*, DATABASE_URL pooler + sslmode=require, SUPABASE_STORAGE_BUCKET, CRON_SECRET, TRUSTED_PROXY=1); deployed smoke incl. ffprobe + cron 401/200.
