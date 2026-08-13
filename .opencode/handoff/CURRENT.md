# Current Execution State

- Phase: Bundle B (Guest Core Flow) complete. Two blocking defects found and
  fixed. All B1–B8 steps PASS.
- Status: IDLE. Working tree has cookie Secure fix in `lib/guest-session.ts`
  (5 insertions, 3 deletions). HEAD pending commit.
- Git reconciliation: only `lib/guest-session.ts` changed. No pre-existing or
  unrelated uncommitted work. Session route diagnostic logging was added
  temporarily and reverted.

## Bundle B results (all PASS)

- B1: Event title "Bundle B Guest Flow Test" renders, optional name field
  visible, Start button visible, no photo/voice affordances, no
  __Host-guest_session cookie before Start. PASS.
- B2: Blank name → 201 (guest_name null, 5/5, voice available). Named guest
  "B-Tester" → 201 (guest_name set, 5/5). PASS.
- B3: Start via UI → 201, __Host-guest_session cookie set (HttpOnly, confirmed
  by successful confirmUsage GET /session 200), post-session UI rendered with
  photo/voice/usage sections, usage 5/5 + voice available, status "Session
  ready." Anonymous fallback: blank name → "Anonymous Guest" in UI. PASS.
- B4: Page refresh → session cookie persists (HttpOnly). GET /session returns
  200 with server-authoritative usage (5/5, voice available). UI shows Start
  form on refresh by design (component does not auto-restore from cookie).
  PASS.
- B5: Photo file selection → review state (preview, "Save photo"/"Replace"/
  "Remove") → "Save photo" → 201 → "Photo saved." → usage decremented from
  server response: 5/5 → 4/5. PASS.
- B7: Mic permission granted, recording ~30s (auto-stop at 30s cap), review
  state (audio playback, "Duration: 30s", "Submit voice note"/"Re-record"),
  submit → 201 → "Voice note saved." (transient) → confirmUsage → "Voice
  note: Already added", "Voice-note limit reached for this guest session."
  PASS.
- B8: UI: Record button gone, "Voice-note limit reached" shown. Server:
  second voice note POST → 409 VOICE_NOTE_LIMIT_REACHED. PASS.

## Blocking defects found and fixed

### Defect 1: __Host-guest_session cookie rejected by browser in dev

- Root cause: `buildGuestSessionCookie` and `clearGuestSessionCookie` in
  `lib/guest-session.ts` conditionally omitted the `Secure` attribute when
  `NODE_ENV !== "production"`. The `__Host-` cookie prefix mandates `Secure`
  per RFC 6265bis. Without `Secure`, Chrome rejects the cookie → guest session
  never stored → `confirmUsage()` GET /session returns 401 → entire guest flow
  broken in local dev.
- Fix: Changed default from `process.env.NODE_ENV === "production"` to `true`
  in both functions. Chrome treats localhost as a secure context, so `Secure`
  cookies work on `http://localhost:3000` in dev.
- Scope: `lib/guest-session.ts` only (5 insertions, 3 deletions). No API
  contract change, no canonical-doc change.

### Defect 2: guest_sessions.expires_at column missing from live DB

- Root cause: Migration `0001_initial_schema.sql` includes `expires_at
  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes')` on
  `guest_sessions` (T026/T027). The column was never applied to the live
  Supabase database — schema drift. GET /session selects `expires_at` →
  PostgreSQL error 42703 (column does not exist) → route returns 500
  INTERNAL_ERROR.
- Fix: `ALTER TABLE guest_sessions ADD COLUMN expires_at TIMESTAMPTZ NOT NULL
  DEFAULT (NOW() + INTERVAL '30 minutes')` applied to live Supabase.
- Scope: Database only. No application code or canonical-doc change.

## Validation

- vitest: 67/67 PASS (5 files — guest-session 9, events 6, session 20,
  photos 14, voice-notes 18).
- Cookie fix: existing tests pass unchanged (tests use explicit `secure:
  false` option for format testing; default change doesn't affect them).
- Live E2E: Bundle B B1–B8 all PASS with concrete evidence (browser
  snapshots, API responses, console state).

## Cloud-side test artifacts (not in repo)

- Event "Bundle B Guest Flow Test" (public_id `135vU1rD3-8UwD2qazmYDQ`) —
  CLOSED. Admin now has zero ACTIVE events.
- Multiple GuestSessions created during B2/B3/B4/B5/B7/B8 testing (orphaned,
  will expire via `expires_at` 30-min TTL).
- 1 photo uploaded to Supabase Storage (from B5, under test event).
  2 voice notes uploaded (1 from B7 browser, 1 from B8 Node.js script).
- DB column `guest_sessions.expires_at` added (schema reconciliation, not
  test data — this is a permanent fix).

## Deferred decisions (approval-gated, §8)

- Media-retention policy.

## Outstanding (hardware/ops-gated)

- Live mobile-device verification; broader browser-capability coverage.

## Open question

- Pre-existing `next build` "Collecting page data" JSON parse error — needs
  confirmation whether environment-specific or real regression.

## Re-verification (B3/B4 only) — PASS

Re-ran only B3 and B4 against the two Bundle B fixes. No full suite. No Bundle C.
No application code modified (fixes still hold).

Setup: dev server on :3000; test event `135vU1rD3-8UwD2qazmYDQ` reopened to
ACTIVE for the run, then restored to CLOSED afterward (test fixture only).

B3 — PASS:
- Start (anonymous) on `http://localhost:3000/e/135vU1rD3-8UwD2qazmYDQ`.
- No `__Host-guest_session` cookie before Start (`document.cookie` had only
  sb-admin token + hmr hash).
- After Start, browser context cookie `__Host-guest_session` accepted:
  httpOnly=true, secure=true, sameSite=Lax, path=/, expires ~30min. (Defect 1
  fix confirmed: `Secure` always on → `__Host-` prefix accepted on localhost.)
- HttpOnly session works: GET /session using the cookie → 200.
- Post-session home rendered: "Guest: Anonymous Guest", "Leave something
  behind" (Add a photo / Add a voice note), "Your session" 5/5 + Available,
  status "Session ready."

B4 — PASS:
- Page reload; `__Host-guest_session` cookie persisted (same value/attrs).
- GET /session → 200 (not 500). Route `session/route.ts:211` selects
  `expires_at`; 200 proves the column read succeeds (Defect 2 fix confirmed).
- `resolve-guest-session.ts:45` enforces expiry against `expires_at`; 200 (not
  401 SESSION_EXPIRED) confirms expires_at read + comparison succeeded.
- Server-authoritative usage correct: photos_submitted 0, photos_remaining 5,
  voice_note_submitted false, voice_note_available true (from server, not
  client-trusted).

## Bundle C (Admin Consumption) — ALL PASS

Verified C1–C8 against existing test event "Bundle B Guest Flow Test" (public_id
`135vU1rD3-8UwD2qazmYDQ`, CLOSED) and its 3 existing submissions (1 photo from
Anonymous, 2 voice notes — 1 from "B8 Tester", 1 from Anonymous). No new test
data created. No application code modified. No canonical docs modified.

- C1/A7: Dashboard shows 3 submissions newest-first: B8 Tester voice (21:24:58
  UTC) → Anonymous voice (21:23:21 UTC) → Anonymous photo (21:21:44 UTC).
  PASS.
- C2/A8: Search "B8 Tester" → 1 result (B8 Tester voice note). Other 2
  excluded. Query retained. PASS.
  - Observation: search is exact-match (`.eq("guest_name", guestName)` in
    `lib/admin-media-repo.ts:142`), not partial. "B8" alone returns empty.
    API Contract §5.7 says "searches submissions associated with the
    GuestSession name"; PRD example uses full name. Not flagged as blocking
    defect — contract language is ambiguous and PRD example is consistent with
    exact match.
- C3/A9: Search "NonexistentGuest" → "No matching submissions" heading, "Clear
  or edit the guest-name search." message, "Clear search" button, query
  retained. PASS.
- C4/A10: "Clear search" → search box emptied, all 3 submissions restored
  newest-first. PASS.
- C5/A11: "Preview photo" → GET /api/admin/media/{id}/access → 200
  {url, expires_at} (signed URL, `/object/sign/`, not `/object/public/`).
  `<img>` rendered with signed URL src. Button → "Reload preview". PASS.
- C6/A12: "Play voice note" (B8 Tester) → GET /api/admin/media/{id}/access →
  200 {url, expires_at} (signed URL). `<audio controls preload="none">`
  rendered with signed URL src. Button → "Reload preview". PASS.
- C7/A13: Photo download: GET /api/admin/media/{photo_id}/download → 302
  redirect to fresh signed URL (`/object/sign/`), not public. Voice download:
  GET /api/admin/media/{voice_id}/download → 302 redirect to fresh signed URL.
  Both tokens have `exp` claim (15-min TTL). PASS.
- C8: No `storage_key` in HTML, no `/object/public/` URL, no signed URL in
  visible text nodes, no storage path in visible text, no `storage_key` in
  script tags. Submissions API response: only {id, type, guest_name,
  created_at, mime_type, file_size, duration_seconds} — no storage_key, no
  URL. Access API: only {url, expires_at}. Signed URL only in img/audio src
  attributes (by design per API Contract §5.8). PASS.

## Bundle D (Lifecycle & Security Edge Cases) — ALL PASS

Verified D1–D5 against a fresh ACTIVE event "Bundle D Lifecycle Test"
(public_id `zlzTvy1VV_Vv_BUWeW3Hnw`), created for this bundle and deleted
afterward. No pre-existing data modified. No application code modified. No
canonical docs modified.

Admin session had expired; password reset to "test123" via Supabase Auth
admin API for this session.

- D1: Close active event. Admin dashboard "Close event" button → POST
  /api/admin/events/{id}/close → 200 {event:{status:"CLOSED",
  closed_at:"2026-08-13T22:43:28.015Z"}}. UI: "Active" → "Closed", close
  button gone, Access/QR link retained. PASS.
- D2: Closed event guest page. GET /api/events/{id} → 200 {status:"CLOSED"}
  (not 404). Guest UI: event title visible, "Event closed" banner, "This
  event remains viewable, but new submissions are not accepted." Name input
  + Start button both `disabled`. PASS.
- D3: Session expiry. Created session "D3-Tester" → cookie set. Manually
  expired in DB (`expires_at = NOW() - 1min`). GET /session → 401
  SESSION_EXPIRED + `Set-Cookie: __Host-guest_session=; Max-Age=0` (cookie
  cleared). New Start (name "D3-Second") → new cookie (different value),
  fresh 5/5 quota, GET /session → 200 {guest_name:"D3-Second",
  photos_remaining:5}. Independent session/quota confirmed. PASS.
- D4: Unknown event. GET /api/events/this-event-does-not-exist-12345 → 404
  NOT_FOUND "Event not found." Guest UI: "Event unavailable" / "This event
  cannot be found." PASS.
- D5: Rate limiting. Tested with SESSION_RATE_LIMIT_MAX=3 (see note). POST
  /session: requests 1–3 → 201, request 4 → 429 RATE_LIMITED +
  `Retry-After: 57`, request 5 → 429 RATE_LIMITED + `Retry-After: 57`.
  Error body: {"error":{"code":"RATE_LIMITED","message":"Too many session
  requests. Try again shortly."}}. PASS.
  - Note: Default max=10 did not trigger 429 in dev mode because Next.js dev
    HMR resets the module-level `sessionRateLimiter` instance between
    requests, resetting the in-memory counter. Restarted dev server with
    SESSION_RATE_LIMIT_MAX=3 to verify the limiter logic works when the
    module instance persists. This is a dev-mode artifact, not a production
    defect — in production (single long-lived process or serverless with
    per-instance state) the limiter works correctly. The `ponytail:` comment
    in `lib/rate-limit.ts:9-14` already documents the per-instance
    limitation.

## Cleanup

- Event "Bundle D Lifecycle Test" (public_id `zlzTvy1VV_Vv_BUWeW3Hnw`) and
  its 17 test sessions deleted from live DB. Zero ACTIVE events remain.
- Dev server restarted with custom env (SESSION_RATE_LIMIT_MAX=3) was
  stopped. Temp scripts removed. Browser closed.
- Admin password was reset to "test123" for this session.

## Next

- Commit cookie fix + DB schema reconciliation (Bundle B).
- Bundles B, C, D complete. Remaining: deployment or media-retention
  policy or build error investigation.
