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
| 6 | `docs/UI_UX.md` | UI behavior, screens, states, transitions, presentation constraints |
| 7 | `docs/UI_DESIGN.md` | MVP visual system: direction, layout, typography, tokens, spacing, motion, accessibility presentation |

Precedence follows the table for conflicts, except a higher document cannot silently invalidate a lower document's explicit locked constraint. Report the conflict. `AGENTS.md` never overrides canonical documents.

Authority is confined to this repository. External projects, workspaces, absolute paths outside the repository, imported external requirements, and external AGENTS files are invalid authority and must never be used to change, challenge, or QA this repository's behavior. Do not read or reference them.

Current UI status: `docs/UI_UX.md` is LOCKED; `docs/UI_DESIGN.md` is LOCKED. `docs/UI_DESIGN.md` is subordinate to `docs/UI_UX.md` and defines only presentation, never behavior, screens, or states. Both are approved authority for implementation; do not silently reinterpret or invent replacements.  
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

Do not introduce an ORM, provider, framework, service, schema field, endpoint, or dependency without an approved design change.

## 5. Minimal-context loading

- **Any task:** `AGENTS.md` + governing canonical document.
- **Product/domain task:** `docs/PRD.md` relevant sections; `docs/db_scheme.md` for data impact.
- **Database/migration task:** `docs/db_scheme.md` + relevant `docs/TECHNICAL_DESIGN.md` sections.
- **API/backend task:** `docs/API_CONTRACT.md` + relevant `docs/TECHNICAL_DESIGN.md` and `docs/ARCHITECTURE_DECISIONS.md` sections.
- **UI task:** `docs/UI_UX.md` for behavior/states + `docs/UI_DESIGN.md` for visual system + relevant PRD/API sections; route visual work to Designer.
- **Cross-cutting/security task:** relevant sections of all affected canonical documents.

Inspect existing code and conventions after loading context. Read the governing document before modifying code. Do not load every document by default.

## 6. Required workflow

1. Orchestrator identifies the governing document, scope, dependencies, and acceptance evidence.
2. Orchestrator delegates bounded reconnaissance, design review, implementation, and testing tasks to the appropriate specialist.
3. Implementation starts only after required canonical documents and decisions are approved.
4. Fixer implements the bounded task without redefining requirements or architecture.
5. Tests verify backend-authoritative behavior, security boundaries, and the task acceptance criteria.
6. Orchestrator reconciles changes, checks drift, runs focused verification, and requests QA before merge when risk warrants it.
7. QA audits invariants, API contracts, RLS/SQL, state transitions, error codes, and regression risk where applicable.

Every agent reports assumptions, files changed, tests/checks run, failures, and unresolved risks through the task handoff mechanism.

## 7. Task coordination harness

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

Context strategy: load the smallest governing document set defined in §5; reference paths/sections instead of copying content.

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

## 8. Conflict and drift handling

- Report any SSOT conflict before implementation. Do not silently choose a resolution.
- Report architecture drift: stack/provider/topology changes, unauthorized endpoints, schema changes, security weakening, or behavior outside the approved contract.
- Stop the affected decision path when a conflict blocks safe implementation.
- Do not modify PRD, schema, architecture, API, or UI canonical documents without explicit scope and approval.
- QA and review may rely only on this repository's canonical documents and this file. External projects, workspaces, absolute paths outside the repository, imported external requirements, and external AGENTS files are invalid authority and must not be used to change, challenge, or QA this repository.
- Do not implement before required design documents are approved. Canonical status: API Contract LOCKED, Database Schema approved cleanup complete, Technical Design LOCKED, Architecture Decisions LOCKED, UI/UX Contract LOCKED, UI Design LOCKED, implementation gate cleared.

## 9. Testing and security gate

Every non-trivial behavior change leaves a runnable focused test or equivalent check. Required coverage, as components land: session creation timing and cookies; event status/ownership; photo concurrency limit; voice-note uniqueness and duration; private media authorization; signed URLs; admin authentication; rate limits; storage failure cleanup; API error consistency.

Never trust frontend limits, localStorage, client MIME/duration, public storage URLs, database PKs as credentials, or client-provided ownership. Never report success before required persistence succeeds. Preserve accessibility and security requirements during UI work.

## 10. Current repository state

Guest-side API, Admin API, Guest UI, and Admin UI are implemented. Implemented since initial MVP: 30-minute GuestSession expiry (`expires_at`, 401 SESSION_EXPIRED), opaque `guest_sessions.public_ref` grouping identifier (migration `0002`), admin submission grouping by GuestSession, print UX (one-page artifacts), camera-first guest capture with multi-capture pending buffer and sequential batch sync, Vercel Node runtime compatibility with bundled `@ffprobe-installer/ffprobe`.

Live Supabase integration verified: live PostgreSQL schema tests PASS, `PLAYWRIGHT_LIVE=1` PASS, seeded events present (1 ACTIVE). Live DB migration state verified (2026-08): `guest_sessions.public_ref` applied — NOT NULL, unique index `uq_guest_sessions_public_ref`, 0 NULL/duplicate values across existing rows; `expires_at` present with 30-minute default. Migration 0002 is idempotent and safe to re-run.

Local QA: `npx vitest run` 256/256 PASS; Playwright `smoke+qr-qa+print-qa` 11 passed / 1 skipped / 0 failed; `mobile-media-qa` 12/12 PASS. Typecheck and build PASS; lint has pre-existing issues only (1 `any` error in `e2e/print-qa.spec.ts`, 7 warnings, `next-env.d.ts` excluded). Chromium is installed.

Known implementation limitations: live scanner verification with a physical device, broader browser capability, and live visual QA with an authenticated admin remain outstanding. Known source-document questions remain deferred: media-retention policy. Do not fix canonical documents silently.
