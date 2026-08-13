# Current Execution State

- Phase: Production / Deployment Readiness Audit complete. No active implementation task.
- Status: IDLE. Working tree clean; HEAD = origin/main = d7babb1.
- Git reconciliation (corrects prior stale claim): T026+T027 ARE committed at
  `d7babb1` ("feat(T026/T027): implement 30-minute GuestSession expiration policy")
  and pushed. Prior CURRENT.md said "uncommitted" — that was stale; the
  session-close snapshot predated the actual commit. Working tree is clean and
  in sync with origin. No pre-existing/unrelated uncommitted work.
- Completed (prior, committed): T026 (canonical-doc expiration reconciliation),
  T027 (expiration implementation, QA APPROVE), T025 (coverage), T023 (voice
  upload fix), T021 (QR), T020 (live PG + Playwright), MVP guest+admin flows.
- Completed this session: Production / Deployment Readiness Audit (read-only,
  no implementation, no canonical-doc changes). Findings recorded below.
- Validation baseline (re-verified this session):
  - vitest 242/242 PASS (27 files)
  - typecheck PASS (exit 0)
  - next build PASS (exit 0)
  - lint 0 errors / 5 warnings
  - e2e deterministic smoke (warm server) 3 passed / 1 skipped / 0 failed
  - git clean; HEAD = origin/main = d7babb1
- Audit summary (full detail in conversation; classifications):
  - READY: build, nodejs runtime, env fail-fast validation, __Host- HttpOnly
    cookie (Secure/SameSite=Lax/Path=/no-Domain/Max-Age=1800), same-origin QR
    URL, Supabase Auth per-route getUser, pg tx/lock pattern (pgbouncer-safe),
    private bucket + 15-min signed URLs (no storage-key leak), service-role
    `server-only` boundary, RLS enabled on all tables w/ revoked grants.
  - REQUIRED BEFORE DEPLOY (ops/config, NOT code blockers):
    1. ffprobe/FFmpeg binary on server PATH (voice duration validation depends).
    2. TLS/HTTPS at origin (`__Host-` + Secure cookie require it).
    3. NEXT_PUBLIC_APP_URL set to production origin.
    4. TRUSTED_PROXY decision: default OFF = global rate-limit bucket (10/60s
       shared by ALL guests). Set =1 behind a proxy that sanitizes X-Forwarded-For.
    5. Single-instance topology OR shared rate-limit store (in-memory limiter
       not shared across instances).
    6. Supabase project provisioned: apply migration 0001, create private
       bucket, configure Auth.
    7. Seed strategy: live e2e + deployed smoke need seeded events
       ("smoke-test-event", "QA Media Event") + admin auth for full suite.
  - OPTIONAL (hardening, no behavior change): `output: "standalone"` for
    containerized deploys; `server-only` import in lib/config.ts; regenerate
    types/supabase.ts (placeholder w/ stale TODO); resolve 5 lint warnings;
    middleware admin gate (currently per-route); raise Playwright webServer
    timeout for cold full-suite runs.
  - BLOCKER: none (code-level). No SSOT conflict, no architecture drift.
- Deferred decisions (approval-gated, §8): media-retention policy.
- Outstanding (hardware/ops-gated): live mobile-device verification; broader
  browser-capability coverage.
- Deployment Preparation Planning (Vercel phase) complete. Recon reconciled.
  No hard BLOCKER. Vercel is the only deployment target this phase.
- Vercel compatibility (6 items, verified against actual codebase + Vercel docs):
  - VERIFIED COMPATIBLE: Node.js runtime (all 13 routes already `runtime="nodejs"`),
    __Host- cookie (Vercel HTTPS passthrough), signed URLs (standard crypto).
  - CONDITIONAL (config/decision, not architecture change):
    (a) ffprobe — must bundle static Linux x64 binary via
        `outputFileTracingIncludes` in next.config.ts. No apt-get at runtime.
        ~70MB fits 250MB uncompressed limit. Code reads `FFPROBE_PATH ?? "ffprobe"`.
    (b) In-memory rate limiter — per-instance under Vercel auto-scaling; not
        cross-instance authoritative. ADR-008 allows shared store only if
        topology requires; Vercel multi-instance is that topology. MVP can ship
        with per-instance + Vercel WAF as outer guard if explicitly accepted.
    (c) Supabase direct `pg` — use Supavisor transaction-mode pooler (port 6543)
        for serverless; `pg` Pool (lib/db.ts) lazy singleton, no `prepare:false`
        yet, no named prepared statements (pooler-compatible).
- No code-level BLOCKER. No SSOT conflict, no architecture drift. ADR-006
  (ffprobe) satisfiable via bundled binary. ADR-008 (rate limit) satisfiable
  via per-instance + WAF or accepted limitation.
- Vercel deployment decisions APPROVED + verified against locked architecture.
  No SSOT conflict. No architecture drift. No canonical-doc changes. No deps added.
  Decisions:
  1. Hosting = Vercel. NO CONFLICT (ADR-001, TD §4, TD §15.1 open decision).
  2. Rate limiting = per-instance in-memory, no shared store. REPORTABLE TENSION
     (not a locked-constraint violation): ADR-008 guidance suggests shared store
     for multi-instance; Vercel is multi-instance; user accepts per-instance as
     known MVP limitation. ADR-008 locked requirement = "rate limiting exists at
     backend boundary" — per-instance satisfies it. PRD §14/FR-047 = "basic rate
     limiting required" — satisfied. Must document as known limitation in code
     comment / deployment notes, NOT canonical docs.
  3. TRUSTED_PROXY = OFF. NO CONFLICT (ADR-008 Open, API_CONTRACT §572 Open).
     Functional note: OFF = global bucket (10/60s default) shared by all guests.
     Over-restrictive for multi-guest events. Mitigable by raising
     SESSION_RATE_LIMIT_MAX or enabling TRUSTED_PROXY=1 later.
  4. Supabase = existing APAC project/region. NO CONFLICT (TD §15.1 open).
- T028 Vercel Runtime Compatibility COMPLETE. All 6 changes implemented +
  verified. Not committed. Working tree has uncommitted T028 changes.
- T028 changes:
  1. next.config.ts: outputFileTracingIncludes + serverExternalPackages.
  2. package.json: +@ffprobe-installer/ffprobe@^2.1.2 (dependencies).
  3. voice-notes route: FFPROBE_PATH ?? ffprobeInstaller.path fallback.
  4. lib/db.ts: Supavisor compat documented (no prepare:false needed — pg 8.x
     uses unnamed statements, Supavisor-safe).
  5. lib/rate-limit.ts: Vercel per-instance limitation documented.
  6. .env.example: Supavisor pooler + bundled ffprobe guidance.
- T028 deviations (3, all verified correct against source):
  - prepare:false reverted (not valid pg 8.x, unnecessary for unnamed stmts).
  - serverExternalPackages added (required for next build).
  - FFPROBE_PATH commented out in .env.example (bundled binary = default).
- T028 verification (all PASS): typecheck exit 0, test 242/242 (27 files),
  build exit 0, lint 0 errors/5 warnings, ffprobe binary resolves + exists.
- Status: IDLE. Uncommitted T028 changes on working tree.
- Next: commit T028 (if requested). Next deployment tasks (separate, not
  started): Supabase provisioning runbook (migration 0001, private bucket,
  Auth), seed/smoke strategy, Vercel env/secret manifest.
  Or resume media-retention policy decision.
