# Result — Pre-QA audit, migration 0002 fix + push (0002–0005), UX_FLOW.md, doc reconciliation

## Status
DONE. Blocker B1 found and resolved; Phase 2 (UX_FLOW.md) generated; canonical docs reconciled with the live DB and codebase. Working tree clean at `39cec45`.

## Files changed
### New
- `UX_FLOW.md` — owner-facing manual QA guide: guest flow (event entry states, Start, frame selection with both no-frame paths, camera + overlay, pending strip/review/retake/delete, batch send, voice note, guest message, session panel/expiry/carry-over, closed-mid-session), admin flow (sign-in, event index, create, dashboard timeline, access/QR + print variants), edge-case checklist.

### Amended
- `supabase/migrations/0002_guest_session_public_ref.sql` — `SET search_path = public, extensions;` before the `gen_random_bytes` backfill + `RESET search_path;` after (fixes SQLSTATE 42883 on Supabase, where pgcrypto installs in `extensions`; keeps plain-Postgres layouts working). Comment explains the failure mode.
- `docs/UI_UX.md` — 2026-08-17 reconciliation amendment: scope (§1), post-Start content/actions (§4.2), new §4.5 guest-message flow, dashboard GUEST_MESSAGE display (§5.2), `GUEST_MESSAGE_LIMIT_REACHED` error row (§6).
- `docs/db_scheme.md` — applied-state section rewritten: migrations 0001–0005 verified, `guest_messages` constraints/RLS confirmed, 0002 search_path note; header updated.
- `docs/PRD.md`, `docs/API_CONTRACT.md`, `docs/ARCHITECTURE_DECISIONS.md` — "migrations 0001–0003 applied" → 0001–0005.
- `AGENTS.md` §10 — implemented list gains frame selection + guest message; live-DB paragraph records verified 0001–0005 state.

### Removed
- `supabase/.temp/` (untracked CLI scratch left by `db push`).

## Validation
- Pre-push read-only probe: migration history, pgcrypto schema/function resolution, per-migration applied-state — pinpointed 0002 as the sole offender.
- `npx supabase db push --dry-run` then real push: 0002–0005 applied cleanly.
- Post-push read-only verification: history `0001`–`0005`; `guest_messages` columns (all NOT NULL), PK/FK-RESTRICT/CHECK 1–280/UNIQUE one-per-session, 3 indexes, RLS enabled, zero PUBLIC/anon/authenticated grants; `guest_sessions` index set unchanged (no duplicates); `public_ref` 0 NULL/0 duplicates; app query shapes (`countGuestMessages`, admin `listSubmissions` join) execute.
- Doc verification: grep for `pending application|0001–0003|0001–0004` across docs + AGENTS.md → zero hits; every DB-state claim matches probed reality.
- No TS/JS code paths touched (docs + one SQL migration file), so vitest/typecheck not re-run; the edited SQL was validated by successful live application.

## Blockers
None remaining. B1 (live DB missing `guest_messages`; guest flow dead-end + admin timeline 500) resolved by the push above.

## SSOT conflict
None. UI_UX.md amendment documents already-contracted behavior (API Contract §6.6 amendment, higher authority) rather than redefining it; db_scheme/API/PRD/ADR edits only replace stale state claims with verified live state.

## Architecture drift
None. No new dependency, endpoint, schema field, or provider. Migration 0002 edit is a namespacing fix inside an existing migration, consistent with `db_scheme.md` §"Design Decisions".

## Next step
Owner manual QA on localhost using `UX_FLOW.md`; decide text-message retention policy (guest_messages vs 7-day media cleanup); R3 production deploy when ready.
