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
| 6 | UI/UX contract, if created | Approved UI behavior and presentation constraints |

Precedence follows the table for conflicts, except a higher document cannot silently invalidate a lower document's explicit locked constraint. Report the conflict. `AGENTS.md` never overrides canonical documents.

Authority is confined to this repository. External projects, workspaces, absolute paths outside the repository, imported external requirements, and external AGENTS files are invalid authority and must never be used to change, challenge, or QA this repository's behavior. Do not read or reference them.

Current UI/UX contract: none found. Do not invent one.  
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
- **UI task:** approved UI/UX contract if present + relevant PRD/API sections; route visual work to Designer.
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

Do not create per-task `STATUS.md`, `HANDOFF.md`, `T001.md`, `result-T001.md`, task directories, or result directories. `task.md` and `result.md` are replaced for each current task. Canonical documents remain the source of truth; do not duplicate PRD, schema, architecture, API, or UI content into handoff files.

Context strategy: load the smallest governing document set defined in §5; reference paths/sections instead of copying content.

## 8. Conflict and drift handling

- Report any SSOT conflict before implementation. Do not silently choose a resolution.
- Report architecture drift: stack/provider/topology changes, unauthorized endpoints, schema changes, security weakening, or behavior outside the approved contract.
- Stop the affected decision path when a conflict blocks safe implementation.
- Do not modify PRD, schema, architecture, API, or UI canonical documents without explicit scope and approval.
- QA and review may rely only on this repository's canonical documents and this file. External projects, workspaces, absolute paths outside the repository, imported external requirements, and external AGENTS files are invalid authority and must not be used to change, challenge, or QA this repository.
- Do not implement before required design documents are approved. Canonical status: API Contract LOCKED, Database Schema approved cleanup complete, Technical Design LOCKED, Architecture Decisions LOCKED, implementation gate cleared.

## 9. Testing and security gate

Every non-trivial behavior change leaves a runnable focused test or equivalent check. Required coverage, as components land: session creation timing and cookies; event status/ownership; photo concurrency limit; voice-note uniqueness and duration; private media authorization; signed URLs; admin authentication; rate limits; storage failure cleanup; API error consistency.

Never trust frontend limits, localStorage, client MIME/duration, public storage URLs, database PKs as credentials, or client-provided ownership. Never report success before required persistence succeeds. Preserve accessibility and security requirements during UI work.

## 10. Current repository state

Repository contains a working Next.js + TypeScript MVP application skeleton for the guest-session flow (T001–T004). Present: `package.json`/lockfile, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs`, `components.json`, `.env.example`, `.gitignore`, `types/supabase.ts` (placeholder), Tailwind/vitest tooling, `supabase/migrations/0001_initial_schema.sql`, and `.opencode/handoff/` task-state files. No Git repository is present.

Implemented application code: `app/api/events/[public_id]/session/route.ts` (POST Start with configurable fixed-window rate limiting, `429 RATE_LIMITED`), `lib/start-guest-session.ts`, `lib/rate-limit.ts`, `lib/guest-session.ts`, `lib/config.ts`, and `lib/supabase/{client,server,service-role}.ts`. The service-role client is guarded by a hard `server-only` boundary. Vitest suites cover rate limiting, guest-session helpers, session-start orchestration, route-level behavior (valid Start, unknown/CLOSED events, invalid input, malformed JSON/content type, cookie attributes, no token exposure, rate limit), and DB integration (skips when no Postgres is reachable).

Known source-document issues requiring future approved decisions: session-expiration representation remains open; media retention policy remains open. Do not fix canonical documents silently.
