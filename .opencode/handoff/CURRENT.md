# Current Execution State

- Phase: IDLE. Session closed 2026-08-15 — B1–B3 committed and pushed.
- Status: R3 not started (owner gate). Vercel Cron auth verified from official docs; no code changes needed.
- HEAD: see `git log -1` (B1–B3 commit) == origin/main. Tree clean.

## Session summary
- B1 build fix, B2 upload caps 4 MB + decision records, B3 7-day retention cron cleanup — all validated (tsc/build/vitest 297/lint baseline/diff-check) and pushed.
- Vercel Cron: Bearer CRON_SECRET confirmed; GET confirmed; `0 3 * * *` valid daily UTC; fail-closed matches documented pattern.

## R3 prerequisites (next session)
1. Owner go-ahead for R3.
2. Vercel project: env vars — NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL, DATABASE_URL (Supavisor pooler 6543), SUPABASE_STORAGE_BUCKET, CRON_SECRET (long random ≥16 chars).
3. Verify private bucket exists/private; ffprobe executes on deployed runtime; live smoke (guest photo/voice, admin review, QR, cron endpoint 401/200).
4. Owner-open SSOT items remain: API_CONTRACT §8 items 1,3,4,5,6,8; TD §15 #1,#4,#5; db_scheme open decisions; PRD backup strategy.
