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

**Required follow-up:** Resolve duplicate constraint/index names in `docs/db_scheme.md` through an approved source-document change before migrations. This design does not modify that document.

## ADR-003 — Backend-mediated media upload

**Status:** Locked by product requirements  
**Decision:** Browser uploads to the Next.js server-side API; the backend validates and writes to a private Supabase Storage bucket; the backend writes relational metadata to Supabase PostgreSQL.

**Reason:** Centralizes validation, limits, authorization, and persistence reporting.

**Consequence:** Enforce request size/time limits. Compensate object writes when metadata persistence fails. No direct client upload in MVP.

## ADR-004 — Same-origin HttpOnly guest cookie

**Status:** Locked behavior; attributes proposed  
**Decision:** Create GuestSession only on Start. Issue an opaque, high-entropy credential in an HttpOnly cookie, separate from the DB primary key.

**Proposed attributes:** `__Host-guest_session`, `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, no `Domain`. Expiry remains open.

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

**Open:** URL lifetime, key format, lifecycle/retention.

## ADR-008 — Minimal rate limiting

**Status:** Locked requirement; values/provider open  
**Decision:** Rate-limit session creation, photo submission, and voice-note submission at the backend boundary. For a single application and PostgreSQL deployment, a DB-backed implementation is the simplest initial option; use shared external state only if topology requires it.

**Reason:** Protects sensitive endpoints without introducing infrastructure before need.

**Open:** Exact windows, quotas, identity keys, trusted proxy behavior, and provider.

## ADR-009 — No standalone project context document

**Status:** Accepted  
**Decision:** Keep technical context in this design and the root `AGENTS.md`; do not add `docs/PROJECT_CONTEXT.md` while the repository has no implementation.

**Reason:** Avoid documentation-only scaffolding. Add a context map when modules and deployment conventions exist.

## ADR-010 — Supabase Auth for admins

**Status:** Approved; implementation details remain open  
**Decision:** Use Supabase Auth for Admin authentication. Keep GuestSession custom: create it on Start and issue its separate opaque credential in an HttpOnly cookie.

**Reason:** Provides the approved admin identity boundary while preserving the locked guest-session model and avoiding guest accounts.

**Consequence:** Next.js server-side API routes must validate Supabase Auth admin identity and event ownership before admin operations or signed-URL generation.

## ADR-011 — Supabase Storage private bucket

**Status:** Approved  
**Decision:** Use Supabase Storage with a private bucket. Uploads remain backend-mediated; admin media access uses short-lived signed URLs generated only after authorization.

**Reason:** Matches the locked private-media and Browser → Backend API → Object Storage flow without introducing a separate storage provider.
