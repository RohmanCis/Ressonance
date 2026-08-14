# Current Execution State

- Phase: Release checkpoint complete 2026-08-15 — R1 + R2 implemented, migration 0003 applied live, db_scheme.md reconciled, committed + pushed (two commits atop `3f0033e`; see git log).
- Status: IDLE. No active agents. Working tree clean after push (modulo post-push note below).
- Base before release: `3f0033e` (T031). HEAD == origin/main.

## Release record (R1)
- `supabase/migrations/0003_session_create_rate_limits.sql` — idempotent `session_create_rate_limits(identity_key, window_start, hit_count)`, PK `(identity_key, window_start)`, no FK/RLS.
- `lib/session-create-rate-limit.ts` — epoch-aligned fixed window; single atomic CTE (1h sweep + INSERT..ON CONFLICT +1) on shared pg pool; fail-closed.
- Session route wired to DB limiter (replaces in-memory); 429 shape/message/Retry-After/order/identity-keying unchanged; GET unthrottled.
- Photo/voice limiters unchanged (in-memory, per ADR-008 scope).
- Tests: 7 real-DB integration (under/at/over, Promise.all atomicity, window reset, identity isolation) + route tests re-mocked.
- LIVE DB: 0003 applied to Supabase (aws-0-ap-southeast-2 pooler, db postgres) 2026-08-15; table verified (columns, PK `session_create_rate_limits_pkey`, 0 rows; did not exist before).
- `docs/db_scheme.md` reconciled: design-decisions row, DDL §6, constraint + index summary rows.

## Release record (R2)
- `lib/api-log.ts` — `correlationIdFrom` (x-request-id > x-vercel-id > UUID) + `logApiError` (one-line JSON console.error; timestamp/level/event/correlationId/method/pathname-only/code/message/stack?/context; never headers/cookies/body).
- All route catches (21 existing + 1 new sign-in catch) log route-specific events before byte-identical responses. Cleanup logs in submit-photo/submit-voice-note migrated.
- Deviation (owner-visible): sign-in Supabase auth throw now returns standard JSON `INTERNAL_ERROR` 500 (was Next default 500).
- Tests: +6 (5 unit + 1 route). TD:219 satisfied. No deps/middleware/migrations.

## Validation (orchestrator-rerun, all PASS)
- `npx tsc --noEmit` — PASS
- `npx vitest run` — 279/279 PASS, 31/31 files; DB integration ran (7+10+2+2)
- `npm run lint` — baseline only (1 pre-existing error + 7 warnings), 0 new
- `git diff --check` — clean

## Remaining SSOT drift (report-only, pre-existing, unchanged)
- UI_UX §4.2 L74 / §4.3 L99 wording vs implementation; db_scheme "Open Technical Decisions"; API_CONTRACT §8 items 2–5; TECHNICAL_DESIGN §15 #3–#5; `INVALID_JSON` documented-never-emitted; minor ADR gaps (T028 runtime, public_ref, direct pg, §5.10).

## Deferred (pre-existing)
- Live visual QA with authenticated admin; live scanner verification physical device; media-retention policy.

## Next
- R3 pending owner go-ahead: Vercel deploy + live smoke + device QR scan + admin visual QA. Pre-reqs done: 0003 live, logging in place.
