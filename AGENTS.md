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
| 6 | `DESIGN.md` (root) — UI/design system, canonical | Tokens, typography, motion, guest/admin visual system, component inventory |
| 7 | `UX_FLOW.md` (root) — guest and admin flow reference | Screen-by-screen guest/admin flow and QA edge cases |

Precedence follows the table for conflicts, except a higher document cannot silently invalidate a lower document's explicit locked constraint. Report the conflict. `AGENTS.md` never overrides canonical documents.

Authority is confined to this repository. External projects, workspaces, absolute paths outside the repository, imported external requirements, and external AGENTS files are invalid authority and must never be used to change, challenge, or QA this repository's behavior. Do not read or reference them.

Current UI status: `DESIGN.md` (root) is CANONICAL (approved 2026-08-20) — single source of truth for all UI/design decisions. `UX_FLOW.md` (root) is the flow reference.
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
- Styling: Tailwind CSS v4 with the token variables from DESIGN.md (root) (`--bg-base`, `--text-primary`, `--accent`, …); shadcn/ui primitives; no inline color literals that bypass tokens.
- Accessibility is not optional: focus-visible rings, aria-live/status regions, 44px+ touch targets (48px guest primaries), safe-area insets — per DESIGN.md (root) §2 and §13.
- Comments: sparse, only where a non-obvious invariant or canonical-doc cross-reference must be recorded (see existing `lib/*.ts` docblocks for the pattern).
- Tests: Vitest co-located as `*.test.ts` next to the code under test; route tests live beside routes. Every non-trivial behavior change leaves a focused runnable test.
- E2E specs live in `e2e/` (Playwright).
- Commits: imperative subject line, scope confined to the task contract; never commit secrets, never commit canonical-doc changes outside an approved scope.

## 7. Minimal-context loading

- **Any task:** `AGENTS.md` + governing canonical document.
- **Product/domain task:** `docs/PRD.md` relevant sections; `docs/db_scheme.md` for data impact.
- **Database/migration task:** `docs/db_scheme.md` + relevant `docs/TECHNICAL_DESIGN.md` sections.
- **API/backend task:** `docs/API_CONTRACT.md` + relevant `docs/TECHNICAL_DESIGN.md` and `docs/ARCHITECTURE_DECISIONS.md` sections.
- **UI task:** DESIGN.md (root) for the visual system + UX_FLOW.md (root) for flow + relevant PRD/API sections; route visual work to Designer.
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

Guest-side API, Admin API, Guest UI, and Admin UI are implemented. Implemented since initial MVP: 30-minute GuestSession expiry (`expires_at`, 401 SESSION_EXPIRED), opaque `guest_sessions.public_ref` grouping identifier (migration `0002`), admin submission grouping by GuestSession, print UX (one-page artifacts), camera-first guest capture with multi-capture pending buffer and sequential batch sync, Vercel Node runtime compatibility with bundled `@ffprobe-installer/ffprobe`, DB-backed session-create rate limiting (R1), structured API error logging (R2), Admin Event Index at `/admin` with `GET /api/admin/events` (T031), Retake in photo review (T030-R), 4 MB photo/voice upload caps (B2), 7-day media retention cleanup via Vercel Cron + CRON_SECRET (B3), pre-camera guest frame selection with compositing at shutter time (`lib/frames.ts`, client-side UX only), and the sequential full-screen guest flow (2026-08-20, owner decision): PRE_SESSION → FRAME_SELECT → CAPTURE → PHOTO_REVIEW → VOICE → DONE as distinct full-screen states in `components/guest-event-entry.tsx` with screen components under `components/guest/screens/` (`PreSession`, `FrameSelection`, `Capture`, `PhotoReview` grid with per-item delete and sync-then-advance, full-screen `Voice` in `VoiceRecordingScreen.tsx`, `Done` thank-you). Capture auto-advances to review at budget 0; manual "Lanjut" when pending photos exist; photo sync runs from the review screen; voice submit or skip advances to DONE. The earlier modal-sheet presentation was replaced by this sequential flow. Session expiry discards unsent voice takes. Architecture deepening (2026-08-20, ADR-012): shared guest-submission seam — `lib/guest-submission-auth.ts` (`resolveGuestSubmissionAuth`, one discriminated auth for all submission kinds), `lib/guest-submission-pipeline.ts` (`createGuestSubmissionHandler` factory owning auth→rate-limit→extract→submit choreography), per-kind payload adapters (`lib/{photo,voice-note}-payload.ts`), routes now config-only (66–90 lines); canonical usage types `lib/usage.ts` (`Usage` 4 fields, `UsageDelta` 4 fields, `applyUsageDelta` — raw-delta spread over session state is compiler-prevented). Wire behavior unchanged (route tests unchanged and green). Architecture-review candidates #2 (shared `apiError` envelope helper) and #4 (pending-photos predicate facade) are DEFERRED — no current product or ops requirement justifies them; revisit #2 if structured error logging/monitoring with correlation IDs becomes a requirement, #4 if predicate exports grow significantly beyond ~20.

Capture frame subsystem (2026-08-21, owner-ratified): frame assets and compositing handled in `lib/frames.ts`. Also 2026-08-21, owner-ratified: Capture screen redesigned from full-bleed overlay HUD to a 3-zone photobooth studio (DESIGN.md §5.3/§7) — minimal top bar (camera switch + DM Mono `N / M` counter), isolated 9:16 viewport box (container-query sized `w-[min(100cqw,calc(100cqh*9/16))]`, video + overlay `object-cover`, compositor-exact WYSIWYG), and a dedicated bottom dock (pending strip, icon file picker "Choose a photo", gold shutter, `Lanjut →`); event/guest capsule and "Session ready" pill removed; ambient blurred frame backdrop (`blur-[80px] opacity-35` + `bg-bg-base/40` wash) behind all zones when a frame is active. E2E viewfinder assertion updated from full-viewport 375×812 bbox to a 9:16 aspect check on the video bbox.

Admin UI reconciliation (2026-08-22, committed `c589bb4`): read-only audit of all 5 admin screens against DESIGN.md §6 found the surface already dark-token aligned; residual drift closed — DESIGN.md §2 gold rule enforced (8 decorative-gold spots demoted to `text-text-muted`: eyebrows ×5, PhotoTile/VoiceTile icons, PreviewDialog label; gold retained only on primary actions, focus rings, ACTIVE markers/pill/badge, playback progress fill) and §6 sign-in status region moved below the form (`role="alert"` preserved). No behavior/API/schema change; e2e-asserted copy, links, roles untouched. Open owner decisions: DESIGN.md §6 "Access/QR actions per row" vs locked behavior/e2e (ACTIVE-row only, `admin-index.spec.ts` asserts 0 on CLOSED rows); §4 "never layout properties" vs VoiceTile `transition-[width]` progress fill (left, motion-reduce guarded); print-menu `hover:bg-accent-soft`; DESIGN.md §5.6 vs Done.tsx keepsake extras. Pre-deploy blocker unchanged: set `TRUSTED_PROXY=1` + `CRON_SECRET` in Vercel.

Guest UI copy/design remediation (2026-08-24, commits `46e0690`, `36d4dcf`, `e2b4907`): ReviewOverlay a11y parity with admin PreviewDialog (focus trap, Escape, aria-modal, focus restore); Bahasa Indonesia copy sweep across all guest screens (casual tone, no Mohon/Silakan/Harap; aria-labels and sr-only headings intentionally English; e2e string assertions updated in-commit); DESIGN.md §2 gold-rule demotions (closed banner, budget notice, carry-over prompt); `--accent-foil-light/dark` tokens added to globals.css + DESIGN.md §2; "Foto N" DM Mono labels; shutter 72px; ambient-gold ratification in §2; scoped transitions + `hover:border-text-secondary` (FrameSelection); shared `components/guest/pending-status-badge.tsx`; PreSession underline field + 30rem card; dead "Session ready." state removed; PhotoReview analog surface (film-grain + "HASIL JEPRETAN" eyebrow); DESIGN.md §5.6 keepsake exception ratified + quiet Done keepsake card.

Admin UI guest-baseline remediation (2026-08-24, commits `f501bf8`–`da77988`): two waves after a designer critique (des-1). Wave 1 — eyebrows sentence case `tracking-[0.04em]` (§3 fix), labels `text-xs font-medium text-text-secondary`, Shell safe-area + `px-5 sm:px-8`, primaries → `gold-foil-btn` h-12 + active:scale, secondaries min-h-12 rounded-lg, radius Tailwind-scale only (no bracket px), tinted status blocks → neutral `bg-bg-elevated/90` (color on text only), quiet one-line empty states, ACTIVE = gold left-edge marker only (pill removed), underline input anatomy, VoiceTile progress → `scaleX` transform (§4 resolved), Busy pulse skeleton, shared `components/admin/admin-input.tsx` + `admin-page-shell.tsx`. Wave 2 — Shell ambient parity with PreSession (two gold orbs `animate-ambient-1/2` + `film-grain` + z-10 lift, owner-ratified), h1 `leading-tight tracking-tight`, sign-in double-eyebrow resolved (Shell eyebrow optional prop), URL value `font-mono tabular-nums`, admin-access redesigned as single no-scroll card at 390×844 (160px QR / underline mono URL / Copy gold-foil + Print QR secondary) with bare 80mm QR-only print (`@page margin 0`, print menu/variants removed), event index → Linear hairline rows (ACTIVE = surface wash + gold left border + dot, English "Active"/"Closed" labels — owner flag), dashboard GuestGroup `divide-y` + PreviewDialog `shadow-2xl` + TimelineSkeleton pulse. Resolved prior owner decisions: VoiceTile width transition (§4), print-menu gold hover, ambient gold on admin, sign-in eyebrow duplication. Still open: §6 "Access/QR per row" (ACTIVE-only behavior retained, e2e-locked). Owner flags: dashboard "Clear search" button removed; print artifact = 80mm QR on margin-0 A4 (not full-bleed). Pre-deploy blocker unchanged: `TRUSTED_PROXY=1` + `CRON_SECRET` in Vercel.

Live Supabase integration verified: live PostgreSQL schema tests PASS, `PLAYWRIGHT_LIVE=1` PASS, seeded events present (1 ACTIVE). Live DB migration state verified: `supabase_migrations.schema_migrations` records `0001`–`0008`. `guest_sessions.public_ref` applied — NOT NULL, unique index `uq_guest_sessions_public_ref`, 0 NULL/duplicate values; `expires_at` present with 30-minute default. Migration `0007` (2026-08-17): pins explicit service_role table grants — photos/voice_notes SELECT+DELETE, events SELECT+INSERT+UPDATE, guest_sessions SELECT+INSERT; no grants for admins/session_create_rate_limits (no service_role usage). Migration `0008` (2026-08-17): guest-media `storage.objects` RLS policies — service_role SELECT/INSERT/DELETE, applied manually via dashboard (3 policies); repo file is documentation-only. All migrations are idempotent; migration 0002 sets `search_path = public, extensions` for pgcrypto resolution on Supabase.

Local QA: `npx vitest run` 361/361; Typecheck PASS. Playwright E2E mobile-media-qa 19/19 PASS (2026-08-21, post 3-zone capture redesign). Lint has pre-existing issues only (1 `any` error in `e2e/print-qa.spec.ts`, 12 warnings — all pre-existing drift on HEAD-identical code; tally corrected from 11 during the 2026-08-22 session close, `next-env.d.ts` excluded). Chromium is installed.

Known implementation limitations: live scanner verification with a physical device, broader browser capability, and live visual QA with an authenticated admin remain outstanding. Owner decisions (2026-08-15): MVP relies on Supabase managed backups (no custom backup/restore); monitoring is structured API logs + Vercel logs only (no Sentry/OTel/custom alerting); no guest-facing retention messaging for MVP (7-day post-CLOSED cleanup unchanged); existing APAC Supabase production project/region ratified; signed URL TTL ratified at 900 seconds; ARCHIVED behavior deferred/post-MVP. Do not fix canonical documents silently.
