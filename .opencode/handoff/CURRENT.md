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
- Next: address REQUIRED-BEFORE-DEPLOY items when deployment target is chosen;
  or resume media-retention policy decision. No implementation started.
