# T005 Result

## Status
PASS — implementation complete. `npm test`, `npm run typecheck`, `npm run lint` all pass.

## Files changed
- `lib/guest-session.ts`: Added `clearGuestSessionCookie()` (HttpOnly, SameSite=Lax, Path=/, Max-Age=0, Secure in prod). `Max-Age=0` is standard cookie deletion, not session-expiry policy.
- `lib/resolve-guest-session.ts` (new): Reusable pure cookie→session resolver. `SessionByTokenRepo` injected; hashes token before DB lookup; returns `missing|invalid|not_found|wrong_event|ok`. No expiry logic.
- `lib/get-session-usage.ts` (new): Pure `GET /session` orchestration. `UsageRepo` injected; event-first 404, cookie resolution via `resolveGuestSession`, maps to `not_found|session_required|session_invalid|ok`, builds Guest usage shape with photo/voice counts. CLOSED stays readable.
- `app/api/events/[public_id]/session/route.ts`: Added `GET` handler. Service-role client, `UsageRepo` with events/guest_sessions/photos/voice_notes queries, flat Guest usage body on 200, `404 NOT_FOUND`, `401 SESSION_REQUIRED` (no clear), `401 SESSION_INVALID` + `Set-Cookie` clear.
- `lib/resolve-guest-session.test.ts` (new): 5 tests (missing/invalid/not_found/wrong_event/ok).
- `lib/get-session-usage.test.ts` (new): 6 tests (404, session_required, mismatched/unknown → session_invalid, usage shape + counts, CLOSED readable + voice state).
- `app/api/events/[public_id]/session/route.test.ts`: Extended mock (events with title, guest_sessions lookup by token, photos/voice_notes exact counts) + 8 GET tests (200 shape, voice/name state, 401 SESSION_REQUIRED no-clear, 401 SESSION_INVALID clears cookie for malformed/unknown/mismatched, 404 unknown event, CLOSED readable, no token/PK/storage exposure).

## Validation
- `npm test`: PASS — 67 tests, 8 files passed (route.test.ts now 19, incl. 9 live DB integration tests; skip when no Postgres).
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- Route GET tests: 8/8 passed. Posted cookie isolate-check and no-leak verified.
- No rate limiting added to GET (creation-only per contract §3); no expiry invented; no upload work.

## Blockers
None.

## SSOT conflict
None. Behavior matches `docs/API_CONTRACT.md` §3 (guest auth, cookie clear on invalid), §4 (Guest usage shape), §6.3 (GET session/usage errors incl. no EVENT_CLOSED for read-only; CLOSED readable).

## Architecture drift
None. Stack/architecture unchanged; new helpers are pure, DB-injected, follow T004 `startGuestSession` convention. Server-only boundary preserved.

## Next step
T006 (photo submission) can reuse `resolveGuestSession` and `UsageRepo`-style injection. No canonical changes required.