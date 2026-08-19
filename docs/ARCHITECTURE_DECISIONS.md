# Architecture Decisions — QR Guest Photo & Voicebook

Status: LOCKED  
Date: 2026-08-11

## ADR-001 — One same-origin full-stack application

**Status:** Approved  
**Decision:** Use one Next.js application with TypeScript, shadcn/ui, Tailwind CSS, and Next.js server-side API routes, served from one production origin.

**Reason:** Small MVP; same-origin HttpOnly cookies; no production CORS; one deployable unit; simplest local/prod parity.

**Rejected for default:** Separate frontend/backend. Viable, but adds credentialed CORS, cookie-domain/SameSite, CSRF, preflight, and deployment complexity before a demonstrated need.

**Consequence:** UI and API can still be separated into modules. Do not split services prematurely.

## ADR-002 — PostgreSQL relational model

**Status:** Approved  
**Decision:** Use Supabase PostgreSQL. Preserve the schema's UUID, `TIMESTAMPTZ`, partial unique index, checks, and `ON DELETE RESTRICT` rules.

**Reason:** Existing schema is PostgreSQL-specific and already expresses the critical invariants.

**Required follow-up:** Resolve duplicate constraint/index names in `docs/db_scheme.md` through an approved source-document change before migrations. This design does not modify that document. Follow-up complete (2026-08): migrations 0001–0008 applied; no duplicate names.

## ADR-003 — Backend-mediated media upload

**Status:** Locked by product requirements  
**Decision:** Browser uploads to the Next.js server-side API; the backend validates and writes to a private Supabase Storage bucket; the backend writes relational metadata to Supabase PostgreSQL.

**Reason:** Centralizes validation, limits, authorization, and persistence reporting.

**Consequence:** Enforce request size/time limits. Compensate object writes when metadata persistence fails. No direct client upload in MVP.

## ADR-004 — Same-origin HttpOnly guest cookie

**Status:** Locked behavior; attributes implemented as proposed (2026-08).
**Decision:** Create GuestSession only on Start. Issue an opaque, high-entropy credential in an HttpOnly cookie, separate from the DB primary key.

**Proposed attributes:** `__Host-guest_session`, `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, no `Domain`, `Max-Age=1800` (30-minute session lifetime; `expires_at` on `guest_sessions` is the authoritative check).

**Storage safeguard:** store a SHA-256 digest of the cookie token in `guest_sessions.session_token`; hash incoming cookie values before lookup. This preserves the separate credential/PK rule and limits damage from a database read.

**Reason:** Prevents script access and avoids treating a database identity as a bearer credential.

## ADR-005 — Database-authoritative limits

**Status:** Locked behavior  
**Decision:** Serialize photo acceptance per GuestSession in a PostgreSQL transaction; count and insert under a row/session lock. Use `UNIQUE(guest_session_id)` for the voice-note race guard. Map constraint violations to business errors.

**Reason:** Frontend counts and pre-check queries cannot enforce limits under concurrency.

## ADR-006 — Synchronous server-side audio inspection

**Status:** Approved  
**Decision:** Inspect uploaded audio synchronously in the Next.js server-side API with `ffprobe`/FFmpeg before object/metadata acceptance.

**Reason:** Backend must be authoritative for actual duration; synchronous inspection avoids an accepted-but-invalid intermediate state.

**Tradeoff:** Adds runtime/tooling and CPU cost. Keep file limits bounded. Revisit asynchronous processing only if measured performance requires it.

## ADR-007 — Private storage plus signed URLs

**Status:** Approved / locked behavior  
**Decision:** Store binaries in a private Supabase Storage bucket. The Next.js server-side API verifies Supabase Auth admin authentication and event ownership, then returns a short-lived Supabase signed URL. The backend does not proxy normal media delivery.

**Reason:** Preserves privacy while avoiding unnecessary backend bandwidth.

**Resolved:** storage key format implemented (Technical Design §6); retention resolved 2026-08-15 (owner) — 7 days after CLOSED, cron cleanup (API Contract §7.1). **Resolved 2026-08-15 (owner):** signed URL lifetime ratified at 900 seconds (15 minutes), as implemented.

## ADR-008 — Minimal rate limiting

**Status:** Locked requirement; topology resolved 2026-08-15 (owner); exact values remain env-configurable
**Decision:** Rate-limit session creation, photo submission, and voice-note submission at the backend boundary. Session creation uses the DB-backed fixed-window limiter (migration 0003) — authoritative across instances. Photo and voice-note submission use per-instance in-memory fixed-window limiters.

**Reason:** Protects sensitive endpoints without introducing infrastructure before need.

**Owner acceptance (2026-08-15):** On Vercel serverless, the photo/voice in-memory limiters are per-instance only (defense-in-depth, not cross-instance authoritative). Accepted as an MVP limitation for this release; DB-backed limiting is NOT extended to photo/voice.

**Resolved (2026-08-15):** identity keys and trusted-proxy behavior implemented (client IP; forwarded headers trusted only behind a trusted proxy); windows/quotas are env-configurable defaults.

## ADR-009 — No standalone project context document

**Status:** Accepted  
**Decision:** Keep technical context in this design and the root `AGENTS.md`; do not add `docs/PROJECT_CONTEXT.md` while the repository has no implementation.

**Reason:** Avoid documentation-only scaffolding. Add a context map when modules and deployment conventions exist. 2026-08: the repository is now implemented; the decision is retained.

## ADR-010 — Supabase Auth for admins

**Status:** Approved; implemented.
**Decision:** Use Supabase Auth for Admin authentication. Keep GuestSession custom: create it on Start and issue its separate opaque credential in an HttpOnly cookie.

**Reason:** Provides the approved admin identity boundary while preserving the locked guest-session model and avoiding guest accounts.

**Consequence:** Next.js server-side API routes must validate Supabase Auth admin identity and event ownership before admin operations or signed-URL generation.

## ADR-011 — Supabase Storage private bucket

**Status:** Approved  
**Decision:** Use Supabase Storage with a private bucket. Uploads remain backend-mediated; admin media access uses short-lived signed URLs generated only after authorization.

**Reason:** Matches the locked private-media and Browser → Backend API → Object Storage flow without introducing a separate storage provider.

## ADR-012 — Shared guest-submission seam and canonical usage types

**Status:** Approved; implemented 2026-08-20  
**Decision:** All guest-submission routes (photos, voice-notes, guest-messages) share one auth module and one route pipeline factory; the client uses one canonical usage type pair.

- `lib/guest-submission-auth.ts` — `resolveGuestSubmissionAuth(repo, input)` returns a discriminated result: `ok` (sessionId, eventId, eventStatus) or one of `not_found` / `event_closed` / `session_required` / `session_invalid` / `session_expired`. Replaces the previously duplicated per-module resolvers (`resolvePhotoAuth`, `resolveVoiceNoteAuth`).
- `lib/guest-submission-pipeline.ts` — `createGuestSubmissionHandler(config)` builds the POST route handler. The factory owns the shared choreography: content-type guard → auth → rate limit → payload extraction → submission → 201/4xx/5xx mapping, including Set-Cookie clears on invalid/expired sessions, `Retry-After` on 429, and structured error logging. Each route supplies only its delta: payload adapter (`lib/{photo,voice-note,guest-message}-payload.ts`), submit adapter, rate-limit config, and error map.
- `lib/usage.ts` — canonical usage types: `Usage` (6 fields, GET session shape, API Contract §4), `UsageDelta` (4 fields, photo/voice 201 shape, API Contract §6.4/§6.5), and `applyUsageDelta` merge. Client code merges deltas through this function only; spreading a raw delta over full session state is prevented at compile time.

**Reason:** The three routes duplicated byte-identical auth resolvers and verbatim pipeline choreography; the client had drifted usage shapes (silent `guest_message_*` clobber risk). Both duplications passed the deletion test — concentrating them removed real duplication without changing wire behavior (route tests unchanged and green).

**Consequence:** A future submission kind implements a payload adapter, submit adapter, and error map — no new pipeline or auth code. Wire format, error codes, and API Contract are unchanged by this decision.
