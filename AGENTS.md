# QR Guest Photo & Voicebook — Agent Operating Manual

## 1. Project

MVP web guestbook. Guests access an event by QR code/URL, optionally enter a name, submit up to 5 photos and 1 voice note per GuestSession. Admins authenticate, manage events, review private media chronologically, search by guest name, preview/play, and download individual media.

This file defines agent operation. Canonical project documents define product and technical behavior.

## 2. Canonical documents and authority

Read only the documents relevant to the task, plus this file. Do not duplicate their requirements in code or new documentation.

| Authority | Document | Governs |
|---|---|---|
| 1 | `docs/PRD.md` | Product behavior, scope, acceptance criteria, non-goals |
| 2 | `docs/db_scheme.md` | Relational entities, columns, constraints, foreign keys |
| 3 | `docs/ARCHITECTURE_DECISIONS.md` | Approved architectural decisions and stack |
| 4 | `docs/TECHNICAL_DESIGN.md` | System boundaries, security, storage, sessions, transactions, testing strategy |
| 5 | `docs/API_CONTRACT.md` | HTTP paths, methods, payloads, status codes, errors, auth behavior |
| 6 | `docs/DESIGN.md` — UI/design system, canonical | Tokens, typography, motion, guest/admin visual system, component inventory |

Precedence follows the table for conflicts, except a higher document cannot silently invalidate a lower document's explicit locked constraint. Report the conflict. `AGENTS.md` never overrides canonical documents.

Authority is confined to this repository. External projects, workspaces, absolute paths outside the repository, imported external requirements, and external AGENTS files are invalid authority and must never be used to change, challenge, or QA this repository's behavior. Do not read or reference them.

Current UI status: `docs/DESIGN.md` is CANONICAL (approved 2026-08-20) — single source of truth for all UI/design decisions, including guest/admin flow.
Current API status: `docs/API_CONTRACT.md` is LOCKED and approved for implementation.

## 3. Locked product invariants

Implement these only through the governing canonical documents; do not restate or reinterpret them elsewhere:

- No guest account; guest name optional.
- GuestSession created only after explicit Start; credential is an HttpOnly cookie separate from the DB PK.
- Per GuestSession limits: 5 photos, 1 voice note; voice duration 5–30 seconds.
- Backend validation, rate limiting, ownership, event-status, and limits are authoritative.
- Only ACTIVE events accept submissions; CLOSED remains viewable but rejects submissions.
- Admin has at most one ACTIVE event.
- Event public IDs are opaque/non-sequential.
- Media is private; admin access uses short-lived signed URLs.
- Upload flow is Browser → Next.js server-side API → private Supabase Storage.
- No AI/media intelligence, guest accounts, social login, bulk ZIP, or other deferred MVP features.

For details, read the relevant source document instead of expanding this list.

## 4. Approved stack

- Next.js
- TypeScript
- shadcn/ui
- Tailwind CSS
- Supabase PostgreSQL
- Supabase Storage with a private bucket
- Supabase Auth for Admin
- Custom GuestSession with HttpOnly cookie
- `ffprobe`/FFmpeg for server-side audio inspection
- Same-origin deployment
- Next.js server-side API layer
- Vercel — same-origin production deployment
- Vercel Cron with CRON_SECRET bearer authentication — scheduled media-retention cleanup

Do not introduce an ORM, provider, framework, service, schema field, endpoint, or dependency without an approved design change.

## 5. Setup and commands

Package manager: npm. Node LTS. Install: `npm install`.

| Purpose | Command |
|---|---|
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) |
| Lint | `npm run lint` (ESLint 9; known baseline: 1 pre-existing `any` error in `e2e/print-qa.spec.ts`, warnings only otherwise) |
| Unit/integration tests | `npm test` (`vitest run`) — serialized on purpose: destructive Postgres suites; never run two vitest instances concurrently |
| E2E | `npm run e2e` (Playwright; all suites share one dev server on port 3000 — never run two suites concurrently) |
| Live-DB tests | `npm run test:postgres` (requires live Supabase env) |
| Live E2E | `PLAYWRIGHT_LIVE=1 npm run e2e` (requires live Supabase env) |

Environment: Supabase credentials and rate-limit/upload caps come from env (see `docs/TECHNICAL_DESIGN.md`); never commit secrets. Chromium for Playwright is installed.

## 6. Code style

- TypeScript strict mode; no `any` in new code.
- Next.js App Router: server-side API under `app/api/**/route.ts`; client components under `components/`.
- Styling: Tailwind CSS v4 with the token variables from docs/DESIGN.md (`--bg-base`, `--text-primary`, `--accent`, …); shadcn/ui primitives; no inline color literals that bypass tokens.
- Accessibility is not optional: focus-visible rings, aria-live/status regions, 44px+ touch targets (48px guest primaries), safe-area insets — per docs/DESIGN.md §2 and §5.
- Comments: sparse, only where a non-obvious invariant or canonical-doc cross-reference must be recorded (see existing `lib/*.ts` docblocks for the pattern).
- Tests: Vitest co-located as `*.test.ts` next to the code under test; route tests live beside routes. Every non-trivial behavior change leaves a focused runnable test.
- E2E specs live in `e2e/` (Playwright).
- Commits: imperative subject line, scope confined to the task contract; never commit secrets, never commit canonical-doc changes outside an approved scope.

## 7. Minimal-context loading

- **Any task:** `AGENTS.md` + governing canonical document.
- **Product/domain task:** `docs/PRD.md` relevant sections; `docs/db_scheme.md` for data impact.
- **Database/migration task:** `docs/db_scheme.md` + relevant `docs/TECHNICAL_DESIGN.md` sections.
- **API/backend task:** `docs/API_CONTRACT.md` + relevant `docs/TECHNICAL_DESIGN.md` and `docs/ARCHITECTURE_DECISIONS.md` sections.
- **UI task:** docs/DESIGN.md for the visual system and flow + relevant PRD/API sections; route visual work to Designer.
- **Cross-cutting/security task:** relevant sections of all affected canonical documents.

Inspect existing code and conventions after loading context. Read the governing document before modifying code. Do not load every document by default.

## 8. Required workflow

1. Orchestrator identifies the governing document, scope, dependencies, and acceptance evidence.
2. Orchestrator delegates bounded reconnaissance, design review, implementation, and testing tasks to the appropriate specialist.
3. Implementation starts only after required canonical documents and decisions are approved.
4. Fixer implements the bounded task without redefining requirements or architecture.
5. Tests verify backend-authoritative behavior, security boundaries, and the task acceptance criteria.
6. Orchestrator reconciles changes, checks drift, runs focused verification, and requests QA before merge when risk warrants it.
7. QA audits invariants, API contracts, RLS/SQL, state transitions, error codes, and regression risk where applicable.

Every agent reports assumptions, files changed, tests/checks run, failures, and unresolved risks through the task handoff mechanism.

## 9. Task coordination harness

The handoff directory has exactly four files:

```text
.opencode/handoff/
├── README.md
├── CURRENT.md
├── task.md
└── result.md
```

Required lifecycle:

1. Orchestrator updates `CURRENT.md` before every task. It represents only the active task.
2. Orchestrator writes `task.md` before delegation. It represents only the current task.
3. Implementing agent reads `task.md` before work.
4. Implementing agent writes `result.md` when the task finishes.
5. `result.md` includes status, files changed, validation, blockers, SSOT conflict, architecture drift, and next step.
6. Orchestrator reads `result.md` before marking the task complete.
7. Orchestrator updates `CURRENT.md` after completion.

Async delegation protocol:

1. After dispatching a background agent, set `CURRENT.md` status to `WAITING_FOR_AGENT` and record the task ID and objective.
2. End the orchestration turn. Do not poll the agent with repeated wait or tool calls.
3. Resume by reading `CURRENT.md` then `result.md`. Inspect the repository only when `result.md` is missing or inconsistent with `task.md`.
4. Confirm the agent reached a terminal state before reconciling.
5. Never dispatch a duplicate task while the previous agent is non-terminal. Retry only after the previous agent is confirmed terminal.

File state is the durable synchronization mechanism. Do not carry large conversational context across waiting periods.

Do not create per-task `STATUS.md`, `HANDOFF.md`, `T001.md`, `result-T001.md`, task directories, or result directories. `task.md` and `result.md` are replaced for each current task. Canonical documents remain the source of truth; do not duplicate PRD, schema, architecture, API, or UI content into handoff files.

Context strategy: load the smallest governing document set defined in §7; reference paths/sections instead of copying content.

Session close protocol — triggered by an explicit session-close instruction (e.g., "I want to close sessions"):

1. Stop new implementation work immediately.
2. Reconcile `CURRENT.md`, `task.md`, and `result.md` with the actual repository state.
3. Record completed work, validation results, blockers, deferred decisions, and the next task or idle state.
4. Verify no stale active-task state remains in any handoff file.
5. Run `git diff --check` and inspect `git status`.
6. Explicitly distinguish this session's changes from pre-existing or unrelated uncommitted work.
7. Never modify canonical documents unless required to reconcile verified repository state.
8. Never commit or push automatically.
9. Provide a concise session-close summary and a proposed Git commit message covering the work completed in the session.

## 10. Conflict and drift handling

- Report any SSOT conflict before implementation. Do not silently choose a resolution.
- Report architecture drift: stack/provider/topology changes, unauthorized endpoints, schema changes, security weakening, or behavior outside the approved contract.
- Stop the affected decision path when a conflict blocks safe implementation.
- Do not modify PRD, schema, architecture, API, or UI canonical documents without explicit scope and approval.
- QA and review may rely only on this repository's canonical documents and this file. External projects, workspaces, absolute paths outside the repository, imported external requirements, and external AGENTS files are invalid authority and must not be used to change, challenge, or QA this repository.
- Do not implement before required design documents are approved. Canonical status: API Contract LOCKED, Database Schema approved cleanup complete, Technical Design LOCKED, Architecture Decisions LOCKED, UI/UX Contract LOCKED, UI Design LOCKED, implementation gate cleared.

## 11. Testing and security gate

Every non-trivial behavior change leaves a runnable focused test or equivalent check. Required coverage, as components land: session creation timing and cookies; event status/ownership; photo concurrency limit; voice-note uniqueness and duration; private media authorization; signed URLs; admin authentication; rate limits; storage failure cleanup; API error consistency.

Never trust frontend limits, localStorage, client MIME/duration, public storage URLs, database PKs as credentials, or client-provided ownership. Never report success before required persistence succeeds. Preserve accessibility and security requirements during UI work.

## 12. Current repository state

**Implementation: complete** (Guest API, Admin API, Guest UI, Admin UI). All UI copy is Bahasa Indonesia (`app/layout.tsx` `lang="id"`); server/API error messages stay English (API contract domain). No known code-vs-docs divergence — all past divergences were ratified into `docs/DESIGN.md`, which is the sole UI/flow reference (docs/UX_FLOW.md deleted by owner decision 2026-09-09).

**Architecture notes for agents:**

- Guest flow: sequential full-screen states in `components/guest-event-entry.tsx` (PRE_SESSION → FRAME_SELECT → CAPTURE → PHOTO_REVIEW → VOICE → DONE), screens in `components/guest/screens/`.
- Submission seam (ADR-012): `lib/guest-submission-auth.ts` + `lib/guest-submission-pipeline.ts` + per-kind payload adapters (factory: `lib/multipart-payload.ts`); routes are config-only.
- Shared server helpers: `lib/admin-auth.ts` (`requireAdmin`/`requireOwnedEvent` — all admin routes), `lib/storage-adapter.ts`, `lib/submission-compensation.ts`, `lib/events-url.ts`, `lib/format.ts`.
- Frame selection/compositing is client-side UX only (`lib/frames.ts`); frame registry carries 4 templates + none; frame-asset failure falls back unframed and clears `selectedFrame`.
- Admin surfaces: sign-in, event index, dashboard, access/QR — `components/admin/`.
- Capture screen: 3-zone photobooth studio (docs/DESIGN.md §5.3) with container-query 9:16 viewport; review overlay uses shadcn/Radix Dialog (owns focus trap/restore).
- Signed media URLs are fetched fresh per preview/download, never cached client-side; TTL 900s is owner-locked.
- Voice recording timer is wall-clock anchored (`Date.now()`), immune to background-tab `setInterval` throttle.

**Known-fragile pattern:** `admin-ui.tsx` gates the ACTIVE_EVENT_EXISTS recovery link off `error.toLowerCase().includes("udah ada")` — re-check on any copy change.

**Database:** migrations `0001`–`0004`, `0007`–`0010` in repo and applied to live DB (`0005`/`0006` remote history `reverted`; `0009` dropped `guest_messages`; `0010` pins service-role DELETE grants). All migrations idempotent. `supabase db push` works normally.

**Production:** https://ressonance-one.vercel.app — production `DATABASE_URL` uses `sslmode=no-verify` (pg 8.x maps `require` to `verify-full` and rejects Supavisor's certificate chain; documented in `.env.example`). Local dev (5432, no sslmode) unaffected.

**Outstanding (deferred):**
- Watch item: intermittent dev-server e2e flake (Next.js `clientReferenceManifest` invariant / stuck "Mengecek akses"; 2 occurrences 2026-09-12) — not a code bug; reruns green. Mitigate with fresh `.next` + dev-server restart; if it recurs, run e2e against a production build.

**Last validated (2026-09-12, commit `d41208d`):** typecheck PASS; vitest 49 files / 381 passed / 4 skipped / 0 failed; lint baseline only (1 pre-existing `any` in `e2e/print-qa.spec.ts` + warnings); e2e full suite 37 passed / 1 skipped (live-backend) / 0 failed. Final commit of the day `ade6e42` (1-line class change, tsc PASS) landed after the e2e run.

**Polish batch (2026-09-12):** touch targets (guest primary 48px, admin filter 44px), motion narrowed to transform/opacity (§4; FrameSelection tile transition fixed in `ade6e42`), color literals → tokens (shutter gold-foil pair `--accent-foil-*`, admin `--error`), voice success → `--success`, guest headings 3xl flat, admin-access aria-labels Bahasa Indonesia (e2e selectors synced), signOut 500-branch test, capture failure feedback (transient `role="alert"` banner).

**Copy warmth pass (2026-09-12, commit `d41208d`):** all guest-facing copy Bahasa Indonesia incl. `photoErrorMessage()` (was full-English, test synced); formal/English words removed (e.g. "Host", "secara personal", "Silakan"); docs/DESIGN.md §5.4–§5.6 spec copy aligned via amendment markers (owner-approved items 8–10). `e2e/mobile-media-qa.spec.ts` selectors synced.

**Standing owner decisions:** (2026-08-15) Supabase managed backups only; structured logs + Vercel logs only (no Sentry/OTel); no guest-facing retention messaging; APAC Supabase region; signed URL TTL 900s; ARCHIVED post-MVP. (2026-08-29) Done-screen loading `role="status"` dropped — screen-reader users out of scope for that decorative screen. (2026-09-11) upload serialization per-event accept-and-monitor via Vercel logs; API-level sign-in rate limiting not implemented — acceptable for single-admin MVP.

Detailed per-task history lives in `git log`, not this file.
